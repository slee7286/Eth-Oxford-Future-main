"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';
import { CONFIG, ABI } from './config';

// ═══════════════════════════════════════════════════════════════
// WALLET CONNECTION HOOK
// Connects MetaMask, switches to Coston2, tracks account changes
// ═══════════════════════════════════════════════════════════════
export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert("Please install MetaMask to use this application.");
      return;
    }

    try {
      const p = new BrowserProvider(window.ethereum);
      await p.send("eth_requestAccounts", []);
      const network = await p.getNetwork();

      // Switch to Coston2 if not already on it
      if (Number(network.chainId) !== CONFIG.CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + CONFIG.CHAIN_ID.toString(16) }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x' + CONFIG.CHAIN_ID.toString(16),
                chainName: 'Flare Coston2 Testnet',
                nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
                rpcUrls: [CONFIG.RPC_URL],
                blockExplorerUrls: [CONFIG.EXPLORER_URL],
              }],
            });
          }
        }
        // Re-create provider after chain switch
        const updatedProvider = new BrowserProvider(window.ethereum);
        const updatedAccounts = await updatedProvider.send("eth_requestAccounts", []);
        const updatedNetwork = await updatedProvider.getNetwork();
        setAddress(updatedAccounts[0]);
        setProvider(updatedProvider);
        setChainId(Number(updatedNetwork.chainId));
      } else {
        const accounts = await p.send("eth_requestAccounts", []);
        setAddress(accounts[0]);
        setProvider(p);
        setChainId(Number(network.chainId));
      }
    } catch (err) {
      console.error("Wallet connection failed", err);
    }
  }, []);

  // Listen for account and chain changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccounts = (accounts: string[]) => setAddress(accounts[0] || null);
      const handleChain = () => window.location.reload();

      window.ethereum.on('accountsChanged', handleAccounts);
      window.ethereum.on('chainChanged', handleChain);

      // Auto-connect if already connected
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          connect();
        }
      }).catch(() => {});

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccounts);
        window.ethereum.removeListener('chainChanged', handleChain);
      };
    }
  }, [connect]);

  return { address, provider, chainId, connect };
}

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════
export type ContractState = {
  strikePriceGwei: bigint;
  expiryTimestamp: bigint;
  isSettled: boolean;
  settlementPriceGwei: bigint;
  totalLiquidityWei: bigint;
  participantCount: bigint;
};

export type UserPosition = {
  exists: boolean;
  isLong: boolean;
  quantity: bigint;
  collateralWei: bigint;
  leverage: bigint;
  marginMode: number;
  entryType: number;
  entryPrice: bigint;
  openTimestamp: bigint;
  isActive: boolean;
  isClaimed: boolean;
  notionalValue: bigint;
  margin: bigint;
};

export type OnChainTrade = {
  trader: string;
  isLong: boolean;
  quantity: bigint;
  collateral: bigint;
  leverage: bigint;
  timestamp: number;
  txHash: string;
};

// ═══════════════════════════════════════════════════════════════
// CONTRACT DATA HOOK
// Polls the on-chain contract for state, gas price, positions,
// liquidity, and recent trade events
// ═══════════════════════════════════════════════════════════════
export function useContractData(address: string | null) {
  const [contractState, setContractState] = useState<ContractState | null>(null);
  const [currentGasPrice, setCurrentGasPrice] = useState<{ price: bigint; timestamp: bigint } | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [userLiquidity, setUserLiquidity] = useState<bigint>(0n);
  const [recentTrades, setRecentTrades] = useState<OnChainTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const lastFetchedBlock = useRef<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const rpcProvider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
      const contract = new Contract(CONFIG.CONTRACT_ADDRESS, ABI, rpcProvider);

      // ── Fetch contract state and gas price in parallel ──
      const [stateResult, gasResult] = await Promise.allSettled([
        contract.getContractState(),
        contract.getCurrentGasPrice()
      ]);

      if (stateResult.status === 'fulfilled' && stateResult.value) {
        const v = stateResult.value;
        setContractState({
          strikePriceGwei: BigInt(v[0]),
          expiryTimestamp: BigInt(v[1]),
          isSettled: v[2],
          settlementPriceGwei: BigInt(v[3]),
          totalLiquidityWei: BigInt(v[4]),
          participantCount: BigInt(v[5])
        });
        setConnectionError(null);
      } else if (stateResult.status === 'rejected') {
        console.warn("getContractState failed:", stateResult.reason?.message);
        setConnectionError("Contract not responding. Check if correct address is deployed.");
      }

      if (gasResult.status === 'fulfilled' && gasResult.value) {
        // Contract now returns plain gwei (20-80 range) directly
        const rawPrice = BigInt(gasResult.value[0]);
        setCurrentGasPrice({
          price: rawPrice,
          timestamp: BigInt(gasResult.value[1])
        });
      }

      // ── Fetch recent trade events ──
      try {
        const currentBlock = await rpcProvider.getBlockNumber();
        if (lastFetchedBlock.current === 0) {
          lastFetchedBlock.current = Math.max(0, currentBlock - 5000);
        }

        const filter = contract.filters.FuturesMinted();
        const logs = await contract.queryFilter(filter, lastFetchedBlock.current, currentBlock);

        if (logs.length > 0) {
          const newTrades: OnChainTrade[] = await Promise.all(
            logs.slice(-20).map(async (log: any) => {
              const block = await log.getBlock();
              return {
                trader: log.args[0],
                isLong: log.args[1],
                quantity: BigInt(log.args[2]),
                collateral: BigInt(log.args[3]),
                leverage: BigInt(log.args[4]),
                timestamp: block.timestamp,
                txHash: log.transactionHash
              };
            })
          );

          setRecentTrades(prev => {
            const combined = [...newTrades, ...prev];
            return combined
              .filter((v, i, a) => a.findIndex(t => t.txHash === v.txHash) === i)
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 50);
          });
          lastFetchedBlock.current = currentBlock;
        }
      } catch (err) {
        console.warn("Event fetch failed (non-critical):", err);
      }

      // ── Fetch user-specific data if wallet connected ──
      if (address) {
        const [posResult, liqResult] = await Promise.allSettled([
          contract.getPosition(address),
          contract.liquidityProvided(address)
        ]);

        if (posResult.status === 'fulfilled' && posResult.value) {
          const p = posResult.value;
          setUserPosition({
            exists: p[0],
            isLong: p[1],
            quantity: BigInt(p[2]),
            collateralWei: BigInt(p[3]),
            leverage: BigInt(p[4]),
            marginMode: Number(p[5]),
            entryType: Number(p[6]),
            entryPrice: BigInt(p[7]),
            openTimestamp: BigInt(p[8]),
            isActive: p[9],
            isClaimed: p[10],
            notionalValue: BigInt(p[11]),
            margin: BigInt(p[12])
          });
        }

        if (liqResult.status === 'fulfilled') {
          setUserLiquidity(BigInt(liqResult.value));
        }
      }
    } catch (err: any) {
      console.warn("Contract fetch error:", err?.message);
      setConnectionError(err?.message || "Failed to connect to contract");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, CONFIG.POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    contractState,
    currentGasPrice,
    userPosition,
    userLiquidity,
    recentTrades,
    loading,
    connectionError,
    refresh: fetchData
  };
}
