// oracle/OracleService.js
/**
 * @title Depeg Protection Oracle Service (Index + DEX TWAP)
 * @notice Aggregates stablecoin pricing from multiple sources and signs FDC index/trigger attestations
 *
 * Data Sources:
 * - Web2 CEXs: Coinbase, Kraken, Binance (fiat pairs)
 * - Web3 DEXs: Uniswap v3 (Ethereum), Pancake v3 (BSC) via on-chain TWAP (observe)
 * - Normalizes to USD parity (USDC/USDT/DAI/BUSD treated as $1), weights by liquidity
 *
 * Risk pricing removed: no probabilities/EVT/premiums. Market makers quote spreads off-chain.
 */

const { ethers } = require('ethers');
const axios = require('axios');

// Minimal ABIs
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const UNIV3_POOL_ABI = [
  "function observe(uint32[] secondsAgos) external view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

class OracleService {
  constructor(config) {
    this.privateKey = config.privateKey;
    this.wallet = new ethers.Wallet(this.privateKey);
    this.chainId = config.chainId || 114; // Coston2

    // RPC providers for chains used by DEX sources
    this.rpc = {
      ethereum: new ethers.JsonRpcProvider(config.rpc?.ethereum),
      bsc: new ethers.JsonRpcProvider(config.rpc?.bsc),
    };

    // DEX pool mapping per stablecoin (must be provided in config)
    // Example:
    // config.dexPools = {
    //   ethereum: {
    //     uniswapV3: {
    //       USDT: { pool: "0x...USDT/USDC pool", base: "USDC", windowSec: 900 },
    //       DAI:  { pool: "0x...DAI/USDC pool",  base: "USDC", windowSec: 900 },
    //     }
    //   },
    //   bsc: {
    //     pancakeV3: {
    //       USDT: { pool: "0x...USDT/BUSD pool", base: "BUSD", windowSec: 900 }
    //     }
    //   }
    // };
    this.dexPools = config.dexPools || {};

    // Pricing sources configuration (weights sum ~ 100)
    this.sources = {
        cex: {
            coinbase: {
            enabled: true,
            weights: {
                USDC: 23.3,
                USDT: 0
            },
            timeout: 5000,
            },
            kraken: {
            enabled: true,
            weights: {
                USDC: 13.9,
                USDT: 17.98  // scaled up proportionally for USDT
            },
            timeout: 5000,
            },
            binance: {
            enabled: true,
            weights: {
                USDC: 34.1,
                USDT: 44.72  // scaled up proportionally for USDT
            },
            timeout: 5000,
            },
        },
        dex: {
            ethereum: {
            uniswap: {
                enabled: true,
                weights: {
                USDC: 19.5,
                USDT: 25.59  // scaled proportionally for USDT
                },
                timeout: 10000,
            },
            },
            bsc: {
            pancakeswap: {
                enabled: true,
                weights: {
                USDC: 5.4,
                USDT: 7.08  // scaled proportionally for USDT
                },
                timeout: 10000,
            },
            },
        },
        };

    // Quality gates
    this.staleThresholdSec = config.staleThresholdSec || 120;      // index max age constraint (for consumers)
    this.minSources = config.minSources || 3;

    // History for triggers/window checks
    this.priceHistory = new Map(); // symbol -> [{timestamp, price}]
    this.maxHistoryDays = 90;

    console.log(`Oracle initialized: ${this.wallet.address}`);
  }

  // ========== PRICE AGGREGATION ==========

  async fetchAggregatedPrice(stablecoin, quoteCurrency = "USD") {
    // Handle combined feed for USDC+USDT
    if (stablecoin === "USDC+USDT") {
      console.log(`\n📊 Fetching combined prices for USDC+USDT-${quoteCurrency}...`);

      // Fetch prices for USDC and USDT separately
      const [priceUSDC, priceUSDT] = await Promise.all([
        this.fetchAggregatedPrice("USDC", quoteCurrency),
        this.fetchAggregatedPrice("USDT", quoteCurrency)
      ]);

      // Combine prices by simple average
      const combinedPrice = (priceUSDC.price + priceUSDT.price) / 2;

      // Combine min, max, stdDev conservatively
      const combinedMin = Math.min(priceUSDC.minPrice, priceUSDT.minPrice);
      const combinedMax = Math.max(priceUSDC.maxPrice, priceUSDT.maxPrice);
      const combinedStdDev = (priceUSDC.stdDev + priceUSDT.stdDev) / 2;

      // Combine sources count and details with tagging
      const combinedSources = priceUSDC.sources + priceUSDT.sources;
      const combinedDetails = [
        ...priceUSDC.details.map(d => ({ ...d, source: `USDC-${d.source}` })),
        ...priceUSDT.details.map(d => ({ ...d, source: `USDT-${d.source}` }))
      ];

      console.log(`✅ Combined price: $${combinedPrice.toFixed(6)} from ${combinedSources} sources`);

      // Return combined price object in the same format
      return {
        price: combinedPrice,
        pricePpm: Math.round(combinedPrice * 1_000_000),
        timestamp: Math.floor(Date.now() / 1000),
        sources: combinedSources,
        minPrice: combinedMin,
        maxPrice: combinedMax,
        stdDev: combinedStdDev,
        details: combinedDetails,
      };
    }

    // Default: existing logic for single stablecoin feeds
    const symbol = `${stablecoin}-${quoteCurrency}`;
    console.log(`\n📊 Fetching prices for ${symbol}...`);

    const results = await Promise.allSettled([
      ...this.fetchCEXPrices(stablecoin, quoteCurrency),
      ...this.fetchDEXPrices(stablecoin, quoteCurrency),
    ]);

    const successful = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    const effectiveMinSources = stablecoin === "FLR" ? 1 : this.minSources;

    if (successful.length < effectiveMinSources) {
      throw new Error(`Insufficient sources: ${successful.length}/${effectiveMinSources}`);
    }

    console.log(`✅ Retrieved ${successful.length} prices`);

    // No outlier removal – use all successful sources
    const agg = this.calculateWeightedAverage(successful);

    // Push into history (used for trigger/window checks)
    this.updatePriceHistory(symbol, agg.price);

    return {
      price: agg.price,
      pricePpm: Math.round(agg.price * 1_000_000),
      timestamp: Math.floor(Date.now() / 1000),
      sources: successful.length,
      minPrice: Math.min(...successful.map(p => p.price)),
      maxPrice: Math.max(...successful.map(p => p.price)),
      details: successful,
    };
  }

  // ========== CEX PRICE FETCHERS ==========

  fetchCEXPrices(asset) {
    // Stablecoin feeds (USDC / USDT)
    if (asset === "USDC" || asset === "USDT") {
      return [
        this.fetchCoinbasePrice(asset),
        this.fetchKrakenPrice(asset),
        this.fetchBinancePrice(asset),
      ];
    }

    // Unknown asset: no CEX prices
    return [];
  }


  async fetchCoinbasePrice(stablecoin) {
    if (stablecoin !== 'USDC') return null;

    try {
        const url = `https://api.coinbase.com/v2/prices/USDC-USD/spot`;
        const { data } = await axios.get(url, { timeout: 3000 });
        return {
        source: 'coinbase',
        price: parseFloat(data.data.amount),
        weight: 1.0,
        timestamp: Math.floor(Date.now() / 1000)
        };
    } catch {
        return null;
    }
    }

  async fetchKrakenPrice(stablecoin) {
    const map = {
        USDT: 'USDTUSD',
        USDC: 'USDCUSD'
    };

    const pair = map[stablecoin];
    if (!pair) return null;

    try {
        const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
        const { data } = await axios.get(url, { timeout: 3000 });
        const key = Object.keys(data.result)[0];
        return {
        source: 'kraken',
        price: parseFloat(data.result[key].c[0]),
        weight: 1.0,
        timestamp: Math.floor(Date.now() / 1000)
        };
    } catch {
        return null;
    }
    }

  async fetchBinancePrice(stablecoin) {
    const pairMap = {
        USDT: 'USDTUSD',
        USDC: 'USDCUSD'
    };

    const symbol = pairMap[stablecoin];
    if (!symbol) return null;

    try {
        const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
        const { data } = await axios.get(url, { timeout: 3000 });

        const price = stablecoin === 'USDT'
        ? data.price           // USDT priced in USDC
        : 1 / data.price;      // invert USDC/USDT

        return {
        source: 'binance',
        price: parseFloat(price),
        weight: 1.0,
        timestamp: Math.floor(Date.now() / 1000)
        };
    } catch {
        return null;
    }
    }

    // ===== FLR CEX FETCHERS (live data) =====

  async fetchFlrFromCoinGecko() {
    try {
      // CoinGecko id for Flare: "flare-networks"
      const url = `https://api.coingecko.com/api/v3/simple/price`;
      const { data } = await axios.get(url, {
        timeout: 5000,
        params: {
          ids: 'flare-networks',
          vs_currencies: 'usd',
        },
      });

      const price = data?.['flare-networks']?.usd;
      if (!Number.isFinite(price) || price <= 0) throw new Error("Bad FLR price");

      console.log(`  CoinGecko FLR/USD: $${price.toFixed(6)}`);

      return {
        source: 'coingecko_flr_usd',
        price,
        weight: 1.0,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (e) {
      console.warn(`  CoinGecko FLR/USD failed: ${e.message}`);
      return null;
    }
  }

  // ===== Simple FLR spot price (utility only, no FDC index) =====

  async getFlrUsdSpot() {
    const res = await this.fetchFlrFromCoinGecko();
    if (!res || !Number.isFinite(res.price) || res.price <= 0) {
      throw new Error("Unable to fetch FLR/USD spot price");
    }
    return {
      price: res.price,                          // numeric USD per FLR
      pricePpm: Math.round(res.price * 1_000_000),
      timestamp: res.timestamp,
      source: res.source,
    };
  }

  // ========== DEX PRICE FETCHERS (Uniswap v3 / Pancake v3 TWAP) ==========

  fetchDEXPrices(stablecoin /*, quote */) {
    const nowTs = Math.floor(Date.now() / 1000);
    const promises = [];

    // Uniswap v3 on Ethereum
    if (this.sources.dex.ethereum.uniswap.enabled) {
      const c = this.dexPools?.ethereum?.uniswapV3?.[stablecoin];
      if (c && this.rpc.ethereum) {
        const p = (async () => {
          try {
            const price = await this.fetchUniv3TwapPrice(
              this.rpc.ethereum,
              c.pool,
              c.windowSec,
              stablecoin,
              c.base
            );
            if (price && isFinite(price)) {
              console.log(`  Uniswap v3 TWAP (${stablecoin}/${c.base}): $${price.toFixed(6)}`);
              return {
                source: 'uniswap_v3',
                price,
                weight: this.sources.dex.ethereum.uniswap.weights?.[stablecoin] ??
                        this.sources.dex.ethereum.uniswap.weight ?? 1.0,
                timestamp: nowTs,
              };
            }
            return null;
          } catch (e) {
            console.warn(`  Uniswap v3 TWAP failed: ${e.message}`);
            return null;
          }
        })();
        promises.push(p);
      }
    }

    // Pancake v3 on BSC
    if (this.sources.dex.bsc.pancakeswap.enabled) {
      const c = this.dexPools?.bsc?.pancakeV3?.[stablecoin];
      if (c && this.rpc.bsc) {
        const p = (async () => {
          try {
            const price = await this.fetchUniv3TwapPrice(
              this.rpc.bsc,
              c.pool,
              c.windowSec,
              stablecoin,
              c.base
            );
            if (price && isFinite(price)) {
              console.log(`  Pancake v3 TWAP (${stablecoin}/${c.base}): $${price.toFixed(6)}`);
              return {
                source: 'pancake_v3',
                price,
                weight: this.sources.dex.bsc.pancakeswap.weights?.[stablecoin] ??
                        this.sources.dex.bsc.pancakeswap.weight ?? 1.0,
                timestamp: nowTs,
              };
            }
            return null;
          } catch (e) {
            console.warn(`  Pancake v3 TWAP failed: ${e.message}`);
            return null;
          }
        })();
        promises.push(p);
      }
    }

    return promises;
  }

  // Uniswap/Pancake v3 TWAP via observe(secondsAgos)
  async fetchUniv3TwapPrice(provider, poolAddr, windowSec, stableSymbol, baseSymbol) {
    const pool = new ethers.Contract(poolAddr, UNIV3_POOL_ABI, provider);
    const [token0, token1] = await Promise.all([pool.token0(), pool.token1()]);
    const t0 = new ethers.Contract(token0, ERC20_ABI, provider);
    const t1 = new ethers.Contract(token1, ERC20_ABI, provider);
    const [d0, d1, s0, s1] = await Promise.all([t0.decimals(), t1.decimals(), t0.symbol(), t1.symbol()]);

    // Observe cumulative ticks at [window, 0]
    const secondsAgos = [windowSec, 0];
    const res = await pool.observe(secondsAgos);
    const tickCum = res[0]; // int56[]
    const avgTick = Number((tickCum[1] - tickCum[0]) / BigInt(windowSec));

    // price1Per0 = 1.0001^avgTick * 10^(dec0 - dec1)  (token1 per token0)
    const ratio = Math.pow(1.0001, avgTick);
    const scale = Math.pow(10, d0 - d1);
    const price1Per0 = ratio * scale;

    // We want USD price of the stablecoin. If base is USDC/USDT/DAI/BUSD (~$1), treat it as USD.
    // Determine orientation: which side is the stablecoin symbol?
    let priceUSD;
    if (s0.toUpperCase() === stableSymbol.toUpperCase() && s1.toUpperCase() === baseSymbol.toUpperCase()) {
      // token0 = stable, token1 = base(USD) ⇒ price1Per0 is USD per 1 stable
      priceUSD = price1Per0;
    } else if (s1.toUpperCase() === stableSymbol.toUpperCase() && s0.toUpperCase() === baseSymbol.toUpperCase()) {
      // token1 = stable, token0 = base ⇒ stable per USD; invert to USD per 1 stable
      priceUSD = 1 / price1Per0;
    } else {
      throw new Error(`Pool tokens mismatch: ${s0}/${s1} expected ${stableSymbol}/${baseSymbol}`);
    }

    return priceUSD;
  }

  // ========== AGGREGATION ==========


  calculateWeightedAverage(prices) {
    const totalWeight = prices.reduce((sum, p) => sum + p.weight, 0);
    const weightedSum = prices.reduce((sum, p) => sum + (p.price * p.weight), 0);
    return { price: weightedSum / totalWeight, totalWeight };
  }

  // ========== TRIGGER DETECTION (parametric window) ==========

  async checkTrigger(stablecoin, barrierPpm, windowSec, startTime, endTime) {
    const symbol = `${stablecoin}-USD`;
    const history = this.priceHistory.get(symbol) || [];
    const relevant = history.filter(h => h.timestamp >= startTime && h.timestamp <= endTime);

    if (relevant.length === 0) {
      return { triggered: false, eventStart: 0, eventEnd: 0, duration: 0 };
    }

    let longest = { start: 0, end: 0, duration: 0 };
    let run = null;

    for (const point of relevant) {
      const pricePpm = Math.round(point.price * 1_000_000);
      if (pricePpm < barrierPpm) {
        if (!run) run = { start: point.timestamp, end: point.timestamp };
        else run.end = point.timestamp;
      } else if (run) {
        const dur = run.end - run.start;
        if (dur > longest.duration) longest = {...run, duration: dur };
        run = null;
      }
    }

    if (run) {
      const dur = run.end - run.start;
      if (dur > longest.duration) longest = {...run, duration: dur };
    }

    const triggered = longest.duration >= windowSec;
    console.log(`\n🔍 Trigger Check: barrier=${(barrierPpm/1_000_000).toFixed(6)} | window=${windowSec}s | longest=${longest.duration}s | triggered=${triggered}`);

    return { triggered, eventStart: longest.start, eventEnd: longest.end, duration: longest.duration };
  }

  // ========== SIGNING (FDC attestations) ==========

  // Sign index update (for mark/settlement feeds)
  async signIndexUpdate(marketAddress, feedId, pricePpm, timestamp) {
    // Digest: "FDC:INDEX_V1", market, chainId, feedId, pricePpm, timestamp
    const preimage = ethers.solidityPackedKeccak256(
      ['string','address','uint256','bytes32','uint256','uint256'],
      ['FDC:INDEX_V1', marketAddress, this.chainId, feedId, pricePpm, timestamp]
    );
    const signature = await this.wallet.signMessage(ethers.getBytes(preimage));
    console.log(`\n🔐 Signed Index Update: pricePpm=${pricePpm} ts=${new Date(timestamp*1000).toISOString()}`);
    return { pricePpm, timestamp, signature, signer: this.wallet.address };
  }

  async signTriggerAttestation(marketAddress, feedId, barrierPpm, windowSec, eventStart, eventEnd, triggered) {
    const issuedAt = Math.floor(Date.now() / 1000) - 10;
    const triggeredU8 = triggered ? 1 : 0;
    const preimage = ethers.solidityPackedKeccak256(
      ['string','address','uint256','bytes32','uint256','uint256','uint256','uint256','uint8','uint256'],
      ['FDC:TRIGGER_V1', marketAddress, this.chainId, feedId, barrierPpm, windowSec, eventStart, eventEnd, triggeredU8, issuedAt]
    );
    const signature = await this.wallet.signMessage(ethers.getBytes(preimage));
    console.log(`\n🔐 Signed Trigger Attestation: triggered=${triggered} event=${eventStart}→${eventEnd}`);
    return { eventStart, eventEnd, triggered: triggeredU8, issuedAt, signature, signer: this.wallet.address };
  }

  // ========== HISTORY MGMT ==========

  updatePriceHistory(symbol, price) {
    if (!this.priceHistory.has(symbol)) this.priceHistory.set(symbol, []);
    const history = this.priceHistory.get(symbol);
    const timestamp = Math.floor(Date.now() / 1000);
    history.push({ timestamp, price });
    const cutoff = timestamp - (this.maxHistoryDays * 24 * 60 * 60);
    const filtered = history.filter(h => h.timestamp >= cutoff);
    this.priceHistory.set(symbol, filtered);
  }

  // ========== API ENDPOINTS ==========

  // Get current index price and signed update for a market (use for marking/settlement)
  async getPriceQuote(stablecoin, marketAddress) {
    const price = await this.fetchAggregatedPrice(stablecoin);
    const feedId = ethers.keccak256(ethers.toUtf8Bytes(`${stablecoin}-USD`));
    const idxSig = await this.signIndexUpdate(marketAddress, feedId, price.pricePpm, price.timestamp);
    return {...price, feedId, marketAddress,...idxSig };
  }

  // Get trigger attestation (for parametric claims)
  async getTriggerAttestation(stablecoin, marketAddress, barrierPpm, windowSec, startTime, endTime) {
    const feedId = ethers.keccak256(ethers.toUtf8Bytes(`${stablecoin}-USD`));
    const trigger = await this.checkTrigger(stablecoin, barrierPpm, windowSec, startTime, endTime);
    const att = await this.signTriggerAttestation(
      marketAddress, feedId, barrierPpm, windowSec,
      trigger.eventStart, trigger.eventEnd, trigger.triggered
    );
    return {...trigger,...att };
  }

    /**
   * Synthetic protection quote for demo:
   * - Uses live stablecoin index (stablecoin-USD)
   * - Derives a simple probability pBps from distance to barrier and horizon
   * - Signs it with FDC:PROB_V1 so DepegProtectionMarket can verify it
   */
  async getProtectionQuote(stablecoin, marketAddress, barrierPpm, horizonSec) {
    // 1) Get current index price for the stablecoin (USDC, USDT, USDC+USDT)
    const index = await this.fetchAggregatedPrice(stablecoin, "USD");
    const currentPrice = index.price;
    const currentPpm = index.pricePpm;
    const timestamp = index.timestamp;

    // 2) Distance to barrier (for UI only)
    const barrier = barrierPpm / 1_000_000;
    const distance = (currentPrice - barrier) / barrier; // e.g. 0.015 = 1.5%

    // 3) Simple probability model (demo only)
    let pBps;
    const absDistance = Math.abs(distance);

    if (absDistance < 0.001) {
      pBps = 500;        // very close to barrier
    } else if (absDistance < 0.005) {
      pBps = 250;
    } else if (absDistance < 0.01) {
      pBps = 150;
    } else {
      pBps = 50;
    }

    const baseHorizonDays = 7;
    const horizonDays = horizonSec / 86400;
    pBps = Math.round(pBps * Math.min(horizonDays / baseHorizonDays, 2)); // cap at 2x

    if (pBps < 10) pBps = 10;
    if (pBps > 1000) pBps = 1000;

    const probability = pBps / 10_000; // 0–1

    // 4) Sign PROB attestation, matching DepegProtectionMarket._probDigest
    const issuedAt = Math.floor(Date.now() / 1000) - 10;
    const feedId = ethers.keccak256(ethers.toUtf8Bytes(`${stablecoin}-USD`));

    const preimage = ethers.solidityPackedKeccak256(
      ["string","address","uint256","bytes32","uint256","uint256","uint256"],
      ["FDC:PROB_V1", marketAddress, this.chainId, feedId, horizonSec, pBps, issuedAt]
    );
    const signature = await this.wallet.signMessage(ethers.getBytes(preimage));

    return {
      pBps,
      probability,
      currentPpm,
      distance,
      volatility: 0,  // placeholder
      issuedAt,
      signature,
      feedId,
      marketAddress,
      signer: this.wallet.address,
      indexStats: {
        price: currentPrice,
        minPrice: index.minPrice,
        maxPrice: index.maxPrice,
        sources: index.sources,
        timestamp,
      },
    };
  }
}



module.exports = OracleService;