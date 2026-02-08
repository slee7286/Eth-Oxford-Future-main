# Depeg Protection - Complete Deployment Guide

## 📋 Prerequisites

- Node.js v16+ installed
- MetaMask with Coston2 FLR tokens
- VS Code or terminal
- Basic knowledge of Hardhat

## 🚀 Full Deployment (30 minutes)

### Step 1: Setup Project (5 min)

```bash
# Navigate to depeg protection folder
cd depeg-protection

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

**Edit `.env`:**
```bash
PRIVATE_KEY=your_metamask_private_key_without_0x
CHAIN_ID=114
```

### Step 2: Get Testnet Tokens (2 min)

1. Add Coston2 to MetaMask:
   - Network: Flare Coston2
   - RPC: https://coston2-api.flare.network/ext/C/rpc
   - Chain ID: 114
   - Symbol: C2FLR

2. Get free tokens:
   - Visit: https://faucet.flare.network/coston2
   - Paste your address
   - Get 100 C2FLR

### Step 3: Generate Oracle Wallet (1 min)

```bash
node oracle/generate-wallet.js
```

**Output:**
```
🔐 Generating Oracle Wallet...

✅ Wallet Generated:

Address: 0x1234...abcd
Private Key: 0xabcd1234...

⚠️  IMPORTANT: Keep the private key secret!
```

**Add to `.env`:**
```bash
ORACLE_PRIVATE_KEY=0xabcd1234...
ORACLE_SIGNER=0x1234...abcd
```

### Step 4: Compile Contracts (2 min)

```bash
npx hardhat compile
```

**Expected output:**
```
Compiled 2 Solidity files successfully
```

### Step 5: Deploy Factory (2 min)

```bash
npx hardhat run scripts/deploy-factory.js --network coston2
```

**Output:**
```
🚀 Deploying Depeg Protection Factory...

👤 Deployer: 0xYourAddress
💰 Balance: 100.0 C2FLR

📝 Deploying DepegProtectionFactory...
✅ Factory deployed to: 0xFactoryAddress

💡 Add to .env:
   FACTORY_ADDRESS=0xFactoryAddress
```

**Add to `.env`:**
```bash
FACTORY_ADDRESS=0xFactoryAddress
```

### Step 6: Start Oracle Server (3 min)

**Terminal 1:**
```bash
node oracle/server.js
```

**Output:**
```
🔮 Oracle Server running on port 3000
📡 Signer address: 0x1234...abcd

📋 Available endpoints:
   GET  /health
   GET  /price/:stablecoin
   POST /quote/protection
   POST /attestation/trigger
   POST /update/price/:stablecoin
```

**Test oracle:**

**Terminal 2:**
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "signer": "0x1234...abcd",
  "timestamp": 1707261234
}
```

### Step 7: Create Market (3 min)

```bash
FEED=USDC-USD BARRIER_PPM=997000 WINDOW_SEC=900 HORIZON_SEC=604800 ORACLE_SIGNER=0x4199... npx hardhat run scripts/create-market.js --network coston2
```

**Output:**
```
🏭 Creating Depeg Protection Market

Factory: 0xFactoryAddress
Oracle Signer: 0x1234...abcd

Market Parameters:
  Feed: USDC-USD
  Barrier: 0.997000 (997000 ppm)
  Window: 900 seconds (15 minutes)
  Horizon: 604800 seconds (7 days)
  Lambda Range: 5% - 20%
  Reserve Factor: 70%

⏳ Creating market...
✅ Confirmed in block: 12345

🎯 Market Created:
  Index: 0
  Address: 0xMarketAddress
```

**Add to `.env`:**
```bash
MARKET_ADDRESS=0xMarketAddress
```

### Step 8: Add Liquidity (2 min)

```bash
MARKET_ADDRESS=0x... AMOUNT=10 npx hardhat run scripts/add-liquidity.js --network coston2

```

**Output:**
```
💰 Adding Liquidity to Depeg Protection Market

Market: 0xMarketAddress
LP: 0xYourAddress

📊 Current Market State:
  Total Liquidity: 0 C2FLR
  Outstanding Exposure: 0 C2FLR
  Utilization: 0.00 %
  Current Lambda: 5.00 %

💰 Adding Liquidity:
  Amount: 100 C2FLR

✅ Confirmed in block: 12346

📊 Updated State:
  Total Liquidity: 100 C2FLR
  Your LP Balance: 100 C2FLR
```

### Step 9: Buy Protection (3 min)

```bash
MARKET_ADDRESS=0xMarketAddress NOTIONAL=5 STABLECOIN=USDC ORACLE_URL=http://localhost:3000 npx hardhat run scripts/buy-protection.js --network coston2
```

**Output:**
```
🛡️  Buying Depeg Protection

Market: 0xMarketAddress
Buyer: 0xYourAddress

📋 Market Configuration:
  Feed ID: 0xabcd...
  Barrier: 0.985000
  Horizon: 7 days

💼 Protection Details:
  Notional: 10 C2FLR

🔮 Fetching quote from oracle...
  Oracle: http://localhost:3000
  Stablecoin: USDC

📊 Oracle Quote:
  Probability: 150 bps (1.50%)
  Current Price: 0.999800
  Distance to Barrier: 1.48 %
  Volatility: 0.80 %

💵 Premium Calculation:
  Base Premium: 0.1575 C2FLR
  Current Lambda: 5.00 %
  Utilization: 0.00 %

✅ Confirmed in block: 12347

🎉 Protection Purchased!
  Policy ID: 1
  Notional: 10 C2FLR
  Premium Paid: 0.1575 C2FLR
  Expiry: 2026-02-14T12:00:00.000Z
```

### Step 10: Monitor & Claim (if triggered)

**Check if triggered:**

```bash
# Oracle checks continuously
# If USDC drops below 0.985 for 15+ minutes, trigger activates
```

**Claim payout:**

```bash
MARKET_ADDRESS=0xMarketAddress \
POLICY_ID=1 \
STABLECOIN=USDC \
ORACLE_URL=http://localhost:3000 \
  npx hardhat run scripts/claim.js --network coston2
```

---

## 🎯 Quick Reference

### Common Commands

```bash
# Deploy factory
npm run deploy:factory

# Create market
npm run create:market -- --feed USDC-USD --barrier 985000

# Start oracle
npm run oracle

# Add liquidity
npm run add:liquidity

# Buy protection
npm run buy:protection

# Claim
npm run claim

# List markets
npm run list:markets
```

### Environment Variables

```bash
# Required
PRIVATE_KEY=...
ORACLE_PRIVATE_KEY=...
ORACLE_SIGNER=...
FACTORY_ADDRESS=...
MARKET_ADDRESS=...

# Optional
NOTIONAL=10
AMOUNT=100
STABLECOIN=USDC
ORACLE_URL=http://localhost:3000
```

---

## 📊 Testing Scenarios

### Scenario 1: Happy Path (No Depeg)

1. Buy 10 C2FLR protection
2. Wait 7 days
3. USDC stays above 0.985
4. Policy expires, no payout
5. Premium (0.15 C2FLR) goes to LP pool

**LP Profit:** 0.15 C2FLR

### Scenario 2: Depeg Event

1. Buy 10 C2FLR protection
2. Day 3: USDC drops to 0.982
3. Stays below 0.985 for 20 minutes
4. Trigger activated
5. Claim 10 C2FLR payout

**Net Profit:** 10 - 0.15 = 9.85 C2FLR

### Scenario 3: False Alarm

1. Buy 10 C2FLR protection
2. Day 5: USDC drops to 0.983
3. Stays below 0.985 for only 10 minutes
4. Recovers to 0.999
5. No trigger (< 15 minute window)
6. Policy expires, no payout

---

## 🔧 Troubleshooting

### Error: "No contract at address"

**Solution:**
- Check `FACTORY_ADDRESS` in `.env`
- Verify you're on correct network
- Re-deploy if needed

### Error: "Oracle not responding"

**Solution:**
```bash
# Check oracle is running
curl http://localhost:3000/health

# Restart oracle
cd oracle
node server.js
```

### Error: "Insufficient sources"

**Solution:**
- Oracle needs 3+ price sources
- Check internet connection
- Wait and retry

### Error: "Capacity exceeded"

**Solution:**
- Add more liquidity: `AMOUNT=200 npm run add:liquidity`
- Or wait for existing policies to expire
- Or use different market

### Error: "Quote is stale"

**Solution:**
- Get fresh quote immediately before buying
- Reduce network latency
- Increase `MAX_PRICE_AGE` in market config

---

## 📈 Production Checklist

Before mainnet deployment:

- [ ] Audit smart contracts
- [ ] Test oracle with real data
- [ ] Set appropriate parameters:
  - [ ] Barrier threshold
  - [ ] Window duration
  - [ ] Lambda range
  - [ ] Reserve factor
- [ ] Secure oracle private key
- [ ] Setup monitoring/alerts
- [ ] Test emergency procedures
- [ ] Document LP terms
- [ ] Legal review

---

## 🆘 Support

**Issues:**
- Check logs in oracle server
- View transactions on explorer
- Verify contract state with `list-markets.js`

**Explorer:**
- https://coston2-explorer.flare.network

**Faucet:**
- https://faucet.flare.network/coston2

**Documentation:**
- Flare FDC: https://dev.flare.network/fdc
- This README: ../README.md

---

**You're all set! Start protecting against depegs! 🛡️**
