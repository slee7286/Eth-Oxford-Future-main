// script/server.js
/**
 * @title Oracle HTTP Server
 * @notice REST API for price quotes and trigger attestations
 */

const express = require('express');
const cors = require('cors');
const OracleService = require('./OracleService');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize oracle
const oracle = new OracleService({
    privateKey: process.env.ORACLE_PRIVATE_KEY,
    chainId: parseInt(process.env.CHAIN_ID || '114'),
    staleThresholdSec: 300,
    outlierThresholdPpm: 50000,
    minSources: 3
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        signer: oracle.wallet.address,
        timestamp: Math.floor(Date.now() / 1000)
    });
});

// Get current price
app.get('/price/:stablecoin', async (req, res) => {
    try {
        const { stablecoin } = req.params;
        const price = await oracle.fetchAggregatedPrice(stablecoin.toUpperCase());
        
        res.json({
            success: true,
            data: price
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// NEW: Live FLR/USD index via OracleService
// FLR spot price (for UI conversion only)
app.get('/index/flr-usd', async (req, res) => {
  try {
    const spot = await oracle.getFlrUsdSpot();
    res.json({
      ok: true,
      data: spot,
    });
  } catch (e) {
    console.error("FLR spot error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// Get protection quote (probability + signature)
app.post('/quote/protection', async (req, res) => {
  try {
    const { stablecoin, marketAddress, barrierPpm, horizonSec } = req.body;

    const quote = await oracle.getProtectionQuote(
      stablecoin,
      marketAddress,
      Number(barrierPpm),
      Number(horizonSec)
    );

    res.json({ success: true, data: quote });
  } catch (e) {
    console.error("Protection quote error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get trigger attestation
app.post('/attestation/trigger', async (req, res) => {
    try {
        const {
            stablecoin,
            marketAddress,
            barrierPpm,
            windowSec,
            startTime,
            endTime
        } = req.body;
        
        if (!stablecoin || !marketAddress || !barrierPpm || !windowSec || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        const attestation = await oracle.getTriggerAttestation(
            stablecoin.toUpperCase(),
            marketAddress,
            parseInt(barrierPpm),
            parseInt(windowSec),
            parseInt(startTime),
            parseInt(endTime)
        );
        
        res.json({
            success: true,
            data: attestation
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Price feed update endpoint (for scheduled updates)
app.post('/update/price/:stablecoin', async (req, res) => {
    try {
        const { stablecoin } = req.params;
        const price = await oracle.fetchAggregatedPrice(stablecoin.toUpperCase());
        
        res.json({
            success: true,
            message: 'Price updated',
            data: price
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
const PORT = process.env.ORACLE_PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🔮 Oracle Server running on port ${PORT}`);
    console.log(`📡 Signer address: ${oracle.wallet.address}`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`   GET  /health`);
    console.log(`   GET  /price/:stablecoin`);
    console.log(`   GET  /index/flr-usd`);
    console.log(`   POST /quote/protection`);
    console.log(`   POST /attestation/trigger`);
    console.log(`   POST /update/price/:stablecoin`);
    console.log(`\n💡 Add this signer to your market:`);
    console.log(`   ORACLE_SIGNER=${oracle.wallet.address}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down oracle server...');
    process.exit(0);
});

module.exports = app;
