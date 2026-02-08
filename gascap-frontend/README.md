# GasCap Futures — Crypto Gas Risk Exchange

## What Changed (Backend → Frontend Connection)

### 1. Contract Address Updated
- **Old**: `0xe94D9C7a256aD5F05Cd55628fFA6D867c1D800aA`  
- **New**: `0x88a64b320F6e5360D43d07E586f8eC8B5Cf1d768` (from SiheonLee's deployment)

### 2. ABI Expanded
Added all contract functions from the Solidity backend:
- `registerUser(string)` — user registration
- `openCustomPosition(bool, uint256, uint8, uint8, uint8)` — advanced positions with leverage/margin
- All events: `FuturesMinted`, `UserRegistered`, `LiquidityAdded`, `ContractSettled`, `PayoutClaimed`

### 3. Blockchain Connection (`src/lib/blockchain.ts`)
- **Auto-connect**: Wallet reconnects automatically if previously connected
- **Chain switching**: Auto-prompts to switch to Coston2 (chain 114)
- **Error handling**: Uses `Promise.allSettled` so one failed call doesn't crash the app
- **Connection status**: Surfaces `connectionError` to the UI so you know if the contract isn't responding
- **Event fetching**: Reads `FuturesMinted` events for the trade feed

### 4. Frontend ↔ Contract Function Mapping

| UI Action | Contract Function | Page |
|-----------|------------------|------|
| Connect Wallet | MetaMask → Coston2 | Header |
| Open Long | `mintLong(qty) payable` | Trade Panel |
| Open Short | `mintShort(qty) payable` | Trade Panel |
| Add Liquidity | `addLiquidity() payable` | /liquidity |
| Remove Liquidity | `removeLiquidity(amount)` | /liquidity |
| Settle Contract | `settleContract()` | /settle |
| Claim Payout | `claimPayout()` | Activity Panel |

### 5. Live Data Flow
```
FTSO Oracle → getCurrentGasPrice() → saveTick() → Candlestick Chart
                                    → Header (Live Price)
                                    → Orderbook (simulated around FTSO price)
                                    → Trade Panel (current price display)
```

## Quick Start

```bash
npm install
npm run dev
# Opens on http://localhost:9002
```

## Network: Flare Coston2 Testnet
- **Chain ID**: 114
- **RPC**: https://coston2-api.flare.network/ext/C/rpc
- **Explorer**: https://coston2-explorer.flare.network
- **Faucet**: https://faucet.flare.network/coston2

## Project Structure
```
src/
├── app/
│   ├── page.tsx          # Main trading terminal
│   ├── liquidity/        # LP deposit/withdraw
│   └── settle/           # Contract settlement
├── components/Terminal/
│   ├── Header.tsx        # Nav + live FTSO price + wallet
│   ├── TradingChart.tsx  # Candlestick chart (lightweight-charts)
│   ├── TradePanel.tsx    # Long/Short execution panel
│   ├── ActivityPanel.tsx # Positions + contract info
│   └── MarketData.tsx    # Orderbook + trade feed
└── lib/
    ├── config.ts         # Contract address + ABI
    ├── blockchain.ts     # Wallet + contract hooks
    └── store.ts          # FTSO tick persistence + OHLC
```
