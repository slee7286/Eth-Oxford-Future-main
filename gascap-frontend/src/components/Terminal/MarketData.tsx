"use client";

import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContractData } from '@/lib/blockchain';
import { cn } from '@/lib/utils';
import { Activity, ExternalLink, TrendingUp, TrendingDown, Clock, Droplets, Users, Target } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { formatUnits } from 'ethers';

interface MarketDataProps {
  currentPrice?: bigint;
  contractState?: {
    strikePriceGwei: bigint;
    expiryTimestamp: bigint;
    isSettled: boolean;
    settlementPriceGwei: bigint;
    totalLiquidityWei: bigint;
    participantCount: bigint;
  } | null;
}

export function MarketData({ currentPrice, contractState }: MarketDataProps) {
  const [tab, setTab] = useState("MARKET");
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const { recentTrades } = useContractData(null);

  useEffect(() => { setMounted(true); }, []);

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const price = currentPrice ? Number(currentPrice) : 0;
  const strike = contractState ? Number(contractState.strikePriceGwei) : 0;
  const expiry = contractState ? Number(contractState.expiryTimestamp) : 0;
  const remaining = expiry - now;
  const isExpired = remaining <= 0;
  const liquidity = contractState ? Number(formatUnits(contractState.totalLiquidityWei, 18)) : 0;
  const participants = contractState ? Number(contractState.participantCount) : 0;

  const getCountdown = () => {
    if (isExpired) return "EXPIRED";
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Price vs strike analysis
  const priceDiff = price > 0 && strike > 0 ? price - strike : 0;
  const priceDiffPct = strike > 0 ? ((priceDiff / strike) * 100) : 0;
  const isAboveStrike = priceDiff > 0;

  if (!mounted) return <div className="h-full bg-[#080808]" />;

  return (
    <div className="h-full flex flex-col bg-[#080808]">
      <div className="h-10 border-b border-white/5 flex items-center px-3 bg-white/[0.01]">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="bg-transparent h-8 p-0 gap-4">
            {["MARKET", "TRADES"].map((t) => (
              <TabsTrigger key={t} value={t}
                className="text-[10px] h-full px-0 min-w-0 rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary transition-all font-bold uppercase tracking-widest">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden p-3">
        {tab === "MARKET" ? (
          <div className="flex flex-col h-full font-code text-[11px] space-y-3 overflow-y-auto">
            {/* FTSO Index Price */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-3">
              <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-emerald-500" />
                FTSO Gas Index (Live)
              </div>
              <div className="flex items-end justify-between">
                <span className={cn("text-2xl font-bold leading-none", price > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                  {price > 0 ? price.toFixed(2) : '---'}
                </span>
                {price > 0 && (
                  <div className={cn("flex items-center gap-1 text-[10px] font-bold", isAboveStrike ? "text-emerald-400" : "text-rose-400")}>
                    {isAboveStrike ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(2)} ({priceDiffPct > 0 ? '+' : ''}{priceDiffPct.toFixed(1)}%)
                  </div>
                )}
              </div>
              <div className="text-[9px] text-muted-foreground mt-1">BTC(50%) + ETH(30%) + FLR(20%) weighted index</div>
            </div>

            {/* Strike & Settlement */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-2.5">
                <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1 mb-1">
                  <Target className="w-3 h-3 text-amber-500" />
                  Strike
                </div>
                <span className="text-white font-bold text-sm">{strike > 0 ? strike : '---'}</span>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-2.5">
                <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1 mb-1">
                  <Clock className={cn("w-3 h-3", isExpired ? "text-red-400" : "text-blue-400")} />
                  Expiry
                </div>
                <span className={cn("font-bold text-sm", contractState?.isSettled ? "text-emerald-400" : isExpired ? "text-red-400" : "text-orange-400")}>
                  {contractState?.isSettled ? "SETTLED" : getCountdown()}
                </span>
              </div>
            </div>

            {/* Liquidity & Participants */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-2.5">
                <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1 mb-1">
                  <Droplets className="w-3 h-3 text-cyan-400" />
                  Pool
                </div>
                <span className="text-white font-bold text-sm">{liquidity.toFixed(4)}</span>
                <span className="text-[9px] text-muted-foreground ml-1">C2FLR</span>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-2.5">
                <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1 mb-1">
                  <Users className="w-3 h-3 text-purple-400" />
                  Traders
                </div>
                <span className="text-white font-bold text-sm">{participants}</span>
              </div>
            </div>

            {/* Settlement Outlook */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-3">
              <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-2">Settlement Outlook</div>
              {contractState?.isSettled ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settlement Price</span>
                    <span className="text-emerald-400 font-bold">{Number(contractState.settlementPriceGwei)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Outcome</span>
                    <span className={cn("font-bold", Number(contractState.settlementPriceGwei) > strike ? "text-emerald-400" : "text-rose-400")}>
                      {Number(contractState.settlementPriceGwei) > strike ? "LONGS WIN" : "SHORTS WIN"}
                    </span>
                  </div>
                </div>
              ) : price > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">If settled now</span>
                    <span className={cn("font-bold", isAboveStrike ? "text-emerald-400" : "text-rose-400")}>
                      {isAboveStrike ? "LONGS win" : "SHORTS win"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Distance to strike</span>
                    <span className="text-white font-bold">{Math.abs(priceDiff).toFixed(2)} ({Math.abs(priceDiffPct).toFixed(1)}%)</span>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground/50 italic">Awaiting FTSO feed...</span>
              )}
            </div>

            {/* Contract Link */}
            <div className="flex items-center justify-between text-[9px] pt-1 border-t border-white/[0.05]">
              <span className="text-muted-foreground">Contract</span>
              <a href={`${CONFIG.EXPLORER_URL}/address/${CONFIG.CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:underline flex items-center gap-1">
                {CONFIG.CONTRACT_ADDRESS.slice(0, 8)}...{CONFIG.CONTRACT_ADDRESS.slice(-6)}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col font-code text-[10px] space-y-1 overflow-y-auto">
            {recentTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-20 italic">
                <Activity className="w-8 h-8 mb-2" />
                No On-Chain Trades Yet
              </div>
            ) : (
              recentTrades.map((trade) => (
                <div key={trade.txHash} className="flex flex-col border-b border-white/[0.03] py-2 px-1 hover:bg-white/[0.02]">
                  <div className="flex justify-between items-center mb-1">
                    <span className={cn("font-bold", trade.isLong ? "text-emerald-500" : "text-rose-500")}>
                      {trade.isLong ? "LONG" : "SHORT"}
                    </span>
                    <span className="text-white/80">{trade.quantity.toString()} @ {trade.leverage.toString()}x</span>
                  </div>
                  <div className="flex justify-between items-center opacity-40 text-[9px]">
                    <span>{trade.trader.slice(0, 6)}...{trade.trader.slice(-4)}</span>
                    <span>{new Date(trade.timestamp * 1000).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[8px] opacity-30 mt-0.5">
                    <a href={`${CONFIG.EXPLORER_URL}/tx/${trade.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-0.5">
                      tx: {trade.txHash.slice(0, 6)}...{trade.txHash.slice(-4)}
                      <ExternalLink className="w-2 h-2" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
