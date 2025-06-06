// server.js - Complete Imou Backend Proxy Server
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:8080', 'https://your-domain.com'],
    credentials: true
}));
app.use(express.json());

// Environment variables for security
const IMOU_APP_ID = process.env.IMOU_APP_ID;
const IMOU_APP_SECRET = process.env.IMOU_APP_SECRET;

// Utility function to generate Imou API signature
function generateSign(params, appSecret) {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHash('md5').update(paramString + appSecret).digest('hex').toUpperCase();
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Imou Backend Proxy Server is running'
    });
});

// Get Imou Access Token
app.post('/api/imou/token', async (req, res) => {
    try {
        console.log('🔑 Requesting Imou access token...');
        
        if (!IMOU_APP_ID || !IMOU_APP_SECRET) {
            return res.status(500).json({
                error: 'Missing Imou credentials in environment variables'
            });
        }

        const timestamp = Date.now();
        const nonce = Math.random().toString(36).substring(7);
        
        const systemParams = {
            ver: '1.0',
            appId: IMOU_APP_ID,
            time: timestamp,
            nonce: nonce
        };

        // Generate signature
        const sign = generateSign(systemParams, IMOU_APP_SECRET);
        systemParams.sign = sign;

        const requestBody = {
            system: systemParams
        };

        console.log('📤 Sending request to Imou API...');
        
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://openapi.imou.com/openapi/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ImouDeskTracker/1.0'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📨 Imou API response:', data.code, data.msg);

        if (data.code === '200' && data.result) {
            console.log('✅ Access token obtained successfully');
            res.json({
                success: true,
                token: data.result.accessToken,
                expireTime: data.result.expireTime
            });
        } else {
            console.error('❌ Imou API error:', data.msg);
            res.status(400).json({
                success: false,
                error: data.msg || 'Failed to get access token',
                code: data.code
            });
        }

    } catch (error) {
        console.error('💥 Token request failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Live Stream URL
app.post('/api/imou/stream', async (req, res) => {
    try {
        const { deviceId, token } = req.body;
        
        if (!deviceId || !token) {
            return res.status(400).json({
                success: false,
                error: 'Missing deviceId or token'
            });
        }

        console.log(`🎥 Requesting live stream for device: ${deviceId}`);

        const timestamp = Date.now();
        const nonce = Math.random().toString(36).substring(7);

        const requestBody = {
            system: {
                accessToken: token,
                ver: '1.0',
                time: timestamp,
                nonce: nonce
            },
            params: {
                deviceId: deviceId,
                streamId: 0,
                protocol: 'hls'  // Use HLS for better browser compatibility
            }
        };

        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://openapi.imou.com/openapi/getLiveStreamApi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ImouDeskTracker/1.0'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📨 Stream API response:', data.code, data.msg);

        if (data.code === '200' && data.result) {
            const streamUrl = data.result.liveStreamInfo?.url || data.result.url;
            console.log('✅ Live stream URL obtained');
            
            res.json({
                success: true,
                streamUrl: streamUrl,
                streamInfo: data.result
            });
        } else {
            console.error('❌ Stream API error:', data.msg);
            res.status(400).json({
                success: false,
                error: data.msg || 'Failed to get stream URL',
                code: data.code
            });
        }

    } catch (error) {
        console.error('💥 Stream request failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Device List (helpful for finding device IDs)
app.post('/api/imou/devices', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Missing token'
            });
        }

        console.log('📱 Requesting device list...');

        const timestamp = Date.now();
        const nonce = Math.random().toString(36).substring(7);

        const requestBody = {
            system: {
                accessToken: token,
                ver: '1.0',
                time: timestamp,
                nonce: nonce
            },
            params: {}
        };

        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://openapi.imou.com/openapi/deviceList', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ImouDeskTracker/1.0'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.code === '200' && data.result) {
            console.log(`✅ Found ${data.result.devices?.length || 0} devices`);
            res.json({
                success: true,
                devices: data.result.devices || []
            });
        } else {
            res.status(400).json({
                success: false,
                error: data.msg || 'Failed to get device list',
                code: data.code
            });
        }

    } catch (error) {
        console.error('💥 Device list request failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('💥 Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /health',
            'POST /api/imou/token',
            'POST /api/imou/stream',
            'POST /api/imou/devices'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Imou Backend Proxy Server running on port ${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/health`);
    console.log(`🔧 Make sure to set IMOU_APP_ID and IMOU_APP_SECRET in .env file`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 Received SIGINT, shutting down gracefully');
    process.exit(0);
});