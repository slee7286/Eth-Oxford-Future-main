# Parametric Stablecoin Depeg Protection

**High-Impact Cross-Chain Derivative using FDC (Flare Data Connector)**

A complete decentralized insurance system for stablecoin depeg events with oracle-attested pricing and triggers.

## 🎯 Overview

This system provides **parametric depeg protection** for stablecoins using:
- **Multi-source pricing** from CEXs (Coinbase, Kraken, Binance) and DEXs (Uniswap, Sushiswap)
- **FDC attestations** for probability quotes and trigger verification
- **Risk-based pricing** with dynamic utilization curves
- **LP pools** for decentralized underwriting
- **Binary payouts** on continuous below-barrier events

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Flare Coston2 Network                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐      ┌──────────────────────┐         │
│  │ Factory Contract│─────▶│   Market Contracts   │         │
│  └─────────────────┘      │  (per stablecoin)    │         │
│                            │ • USDC-USD           │         │
│                            │ • USDT-USD           │         │
│                            │ • DAI-USD            │         │
│                            └──────────────────────┘         │
│                                      ▲                       │
│                                      │ FDC Attestations     │
│                                      │                       │
└──────────────────────────────────────┼───────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  Oracle Service  │
                              ├─────────────────┤
                              │ Multi-Source     │
                              │ Price Aggregator │
                              ├─────────────────┤
                              │ • CEX APIs       │
                              │   - Coinbase     │
                              │   - Kraken       │
                              │   - Binance      │
                              │                  │
                              │ • DEX Data       │
                              │   - Uniswap V3   │
                              │   - Sushiswap    │
                              │   - Pancakeswap  │
                              └──────────────────┘
```

## 📦 Components

### 1. Smart Contracts

**DepegProtectionFactory.sol**
- Deploys individual protection markets
- Registry of all markets
- Governance functions

**DepegProtectionMarket.sol**
- LP pool management
- Protection purchase with oracle quotes
- Trigger-based claims
- Dynamic risk pricing

### 2. Oracle Service

**OracleService.js**
- Fetches prices from multiple sources
- Aggregates with outlier removal
- Calculates depeg probabilities
- Signs FDC attestations

**server.js**
- HTTP REST API
- Price quotes endpoint
- Protection quotes endpoint
- Trigger attestation endpoint

### 3. Hardhat Scripts

- `deploy-factory.js` - Deploy factory
- `create-market.js` - Create protection market
- `add-liquidity.js` - Add LP capital
- `buy-protection.js` - Purchase protection
- `claim.js` - Claim payouts
- `remove-liquidity.js` - Withdraw LP capital
- `list-markets.js` - View all markets

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your keys
```

### Step 1: Deploy Factory

```bash
npx hardhat run scripts/deploy-factory.js --network coston2
```

Save the factory address to `.env`:
```
FACTORY_ADDRESS=0xYourFactoryAddress
```

### Step 2: Start Oracle

```bash
# Generate oracle wallet
node oracle/generate-wallet.js

# Add oracle private key to .env
ORACLE_PRIVATE_KEY=0x...

# Start oracle server
cd oracle
node server.js
```

Oracle will run on `http://localhost:3000`

Save oracle signer address to `.env`:
```
ORACLE_SIGNER=0xOracleSignerAddress
```

### Step 3: Create Market

```bash
# Create USDC depeg protection market
FACTORY_ADDRESS=0x... \
ORACLE_SIGNER=0x... \
  npx hardhat run scripts/create-market.js --network coston2 \
  --feed USDC-USD \
  --barrier 985000 \
  --window 900 \
  --horizon 604800
```

Parameters:
- `--barrier 985000` = 0.985 trigger (1.5% below peg)
- `--window 900` = 15 minutes continuous depeg
- `--horizon 604800` = 7 day protection period

Save market address:
```
MARKET_ADDRESS=0xYourMarketAddress
```

### Step 4: Add Liquidity

```bash
# Add 100 C2FLR to LP pool
MARKET_ADDRESS=0x... AMOUNT=100 \
  npx hardhat run scripts/add-liquidity.js --network coston2
```

### Step 5: Buy Protection

```bash
# Buy 10 C2FLR notional protection
MARKET_ADDRESS=0x... \
NOTIONAL=10 \
STABLECOIN=USDC \
ORACLE_URL=http://localhost:3000 \
  npx hardhat run scripts/buy-protection.js --network coston2
```

### Step 6: Monitor & Claim

If depeg event occurs:

```bash
# Claim payout
MARKET_ADDRESS=0x... \
POLICY_ID=1 \
STABLECOIN=USDC \
ORACLE_URL=http://localhost:3000 \
  npx hardhat run scripts/claim.js --network coston2
```

## 🔮 Oracle API

### GET /health

Check oracle status

```bash
curl http://localhost:3000/health
```

### GET /price/:stablecoin

Get current aggregated price

```bash
curl http://localhost:3000/price/USDC
```

Response:
```json
{
  "success": true,
  "data": {
    "price": 0.9998,
    "pricePpm": 999800,
    "timestamp": 1707261234,
    "sources": 3,
    "minPrice": 0.9997,
    "maxPrice": 0.9999,
    "stdDev": 0.0001
  }
}
```

### POST /quote/protection

Get protection quote with signature

```bash
curl -X POST http://localhost:3000/quote/protection \
  -H "Content-Type: application/json" \
  -d '{
    "stablecoin": "USDC",
    "marketAddress": "0x...",
    "barrierPpm": "985000",
    "horizonSec": "604800"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "pBps": 150,
    "probability": 0.015,
    "currentPpm": 999800,
    "barrierPpm": 985000,
    "distance": 0.0148,
    "volatility": 0.008,
    "horizonDays": 7,
    "issuedAt": 1707261234,
    "signature": "0x...",
    "signer": "0x..."
  }
}
```

### POST /attestation/trigger

Get trigger attestation for claims

```bash
curl -X POST http://localhost:3000/attestation/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "stablecoin": "USDC",
    "marketAddress": "0x...",
    "barrierPpm": "985000",
    "windowSec": "900",
    "startTime": 1707000000,
    "endTime": 1707604800
  }'
```

## 📊 How It Works

### 1. Price Aggregation

Oracle fetches prices from multiple sources:

**CEX Sources** (30-50% weight each):
- Coinbase API: `/v2/prices/{pair}/spot`
- Kraken API: `/0/public/Ticker`
- Binance API: `/api/v3/ticker/price`

**DEX Sources** (5-10% weight each):
- Uniswap V3 TWAPs (The Graph)
- Sushiswap pools
- Pancakeswap (BSC)

**Aggregation Process:**
1. Fetch all sources in parallel
2. Remove stale data (>5 min old)
3. Calculate median
4. Remove outliers (>5% from median)
5. Calculate weighted average
6. Store in history for volatility

### 2. Probability Estimation

Uses historical volatility to estimate depeg probability:

```
P(depeg) = N((barrier - current) / (current * σ * √t))
```

Where:
- N = Normal CDF
- σ = Historical volatility (annualized)
- t = Horizon in years

### 3. Premium Calculation

```
Premium = Notional × P(depeg) × (1 + λ)
```

Where λ (lambda) = risk loading based on utilization:

```
λ = λ_min + (λ_max - λ_min) × Utilization
Utilization = Outstanding Exposure / Total Liquidity
```

Example:
- Notional: 10 C2FLR
- P(depeg): 2% (200 bps)
- λ: 5% (500 bps) at 0% utilization
- Premium = 10 × 0.02 × 1.05 = **0.21 C2FLR**

### 4. Trigger Detection

Oracle monitors price history for continuous depeg:

```
Triggered if:
  price < barrier for continuous window_sec
```

Example:
- Barrier: 0.985
- Window: 900 seconds (15 minutes)
- Triggered: Price stayed at 0.983 for 18 minutes ✓

### 5. Claiming

Buyer provides:
1. Policy ID
2. Trigger attestation (signed by oracle)
3. Event window proof

Contract verifies:
1. Signature from authorized oracle
2. Event overlaps policy period
3. Duration ≥ required window
4. Policy not already claimed

Payout = Full notional amount

## 🔐 Security Features

### Oracle Attestations

All critical operations require FDC signatures:

**Probability Quote:**
```
digest = keccak256(
  "FDC:PROB_V1",
  marketAddress,
  chainId,
  feedId,
  horizonSec,
  pBps,
  issuedAt
)
signature = ECDSA.sign(digest, oraclePrivateKey)
```

**Trigger Attestation:**
```
digest = keccak256(
  "FDC:TRIGGER_V1",
  marketAddress,
  chainId,
  feedId,
  barrierPpm,
  windowSec,
  eventStart,
  eventEnd,
  triggered,
  issuedAt
)
signature = ECDSA.sign(digest, oraclePrivateKey)
```

### Capacity Management

LP pools protected by reserve factor:

```
Max Exposure = Total Liquidity × Reserve Factor
Default: 70% reserve factor
```

Can't buy protection if:
```
New Exposure > Max Exposure
```

### Signature Verification

Contract verifies:
- ECDSA signature recovery
- Signer matches authorized oracle
- Timestamp within max age
- Digest matches expected format

## 📈 Market Parameters

### Configurable per Market:

| Parameter | Description | Example |
|-----------|-------------|---------|
| Feed | Stablecoin symbol | USDC-USD |
| Barrier | Depeg threshold (ppm) | 985000 (0.985) |
| Window | Continuous depeg time | 900s (15 min) |
| Horizon | Protection period | 604800s (7 days) |
| Lambda Min | Min risk loading | 500 bps (5%) |
| Lambda Max | Max risk loading | 2000 bps (20%) |
| Reserve Factor | Capacity limit | 7000 bps (70%) |
| Max Price Age | Quote staleness | 300s (5 min) |

### Example Markets:

**Conservative** (USDC):
- Barrier: 0.985 (1.5% depeg)
- Window: 15 minutes
- Horizon: 7 days
- Lambda: 5-20%

**Aggressive** (DAI):
- Barrier: 0.970 (3% depeg)
- Window: 30 minutes
- Horizon: 30 days
- Lambda: 10-30%

## 💡 Use Cases

### 1. DeFi Treasury Protection

Protocol holds $1M USDC, worried about depeg:

```bash
# Buy $100k protection for 7 days
NOTIONAL=100000 npx hardhat run scripts/buy-protection.js
```

If USDC depegs below 0.985 for 15+ minutes:
- Receives $100k payout
- Net exposure protected

### 2. Liquidity Provider Hedging

LP providing $500k USDC/USDT liquidity:

```bash
# Hedge impermanent loss from depeg
NOTIONAL=250000 npx hardhat run scripts/buy-protection.js
```

### 3. Institutional Coverage

Fund managing stablecoin positions:

```bash
# Monthly rolling protection
for month in {1..12}; do
  NOTIONAL=1000000 HORIZON=2592000 \
    npx hardhat run scripts/buy-protection.js
done
```

## 🔧 Advanced Configuration

### Environment Variables

```bash
# Network
PRIVATE_KEY=...
CHAIN_ID=114

# Contracts
FACTORY_ADDRESS=0x...
MARKET_ADDRESS=0x...

# Oracle
ORACLE_PRIVATE_KEY=...
ORACLE_SIGNER=0x...
ORACLE_URL=http://localhost:3000
ORACLE_PORT=3000

# Market Parameters
FEED=USDC-USD
BARRIER_PPM=985000
WINDOW_SEC=900
HORIZON_SEC=604800
LAMBDA_MIN_BPS=500
LAMBDA_MAX_BPS=2000
RESERVE_BPS=7000
MAX_PRICE_AGE=300

# Trading
NOTIONAL=10
STABLECOIN=USDC
POLICY_ID=1
AMOUNT=100
```

### Oracle Configuration

Customize price sources in `oracle/OracleService.js`:

```javascript
this.sources = {
    cex: {
        coinbase: { enabled: true, weight: 30 },
        kraken: { enabled: true, weight: 25 },
        binance: { enabled: true, weight: 25 }
    },
    dex: {
        ethereum: {
            uniswap: { enabled: true, weight: 10 },
            sushiswap: { enabled: true, weight: 5 }
        }
    }
};
```

## 📚 Additional Scripts

### List All Markets

```bash
npx hardhat run scripts/list-markets.js --network coston2
```

### Remove Liquidity

```bash
MARKET_ADDRESS=0x... AMOUNT=50 \
  npx hardhat run scripts/remove-liquidity.js --network coston2
```

### View Market State

```bash
npx hardhat run scripts/market-info.js --network coston2
```

### Generate Oracle Wallet

```bash
node oracle/generate-wallet.js
```

## 🐛 Troubleshooting

### Oracle not responding

```bash
# Check oracle is running
curl http://localhost:3000/health

# Restart oracle
cd oracle && node server.js
```

### Quote is stale

Oracle quotes expire after `maxPriceAgeSec` (default 300s).
Get fresh quote immediately before buying.

### Insufficient sources

Oracle requires minimum 3 successful price sources.
Check CEX APIs are accessible.

### Capacity exceeded

LP pool is full. Either:
1. Wait for existing policies to expire
2. Add more liquidity
3. Use different market

## 📖 Resources

- [Flare FDC Docs](https://dev.flare.network/fdc)
- [FTSO Overview](https://dev.flare.network/ftso)
- [Coston2 Explorer](https://coston2-explorer.flare.network)
- [Coston2 Faucet](https://faucet.flare.network/coston2)

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create feature branch
3. Add tests
4. Submit PR

## 📄 License

MIT License - see LICENSE file

---

**Built with Flare Data Connector (FDC) for trustless cross-chain derivatives** 🔥
