"use client";

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, Zap, Activity, ShieldCheck, Clock, Droplets, Gavel, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import NextLink from 'next/link';
import type { ContractState } from '@/lib/blockchain';

interface HeaderProps {
  address: string | null;
  gasPrice: { price: bigint; timestamp: bigint } | null;
  state: ContractState | null;
  onConnect: () => void;
  connectionError?: string | null;
}

export function Header({ address, gasPrice, state, onConnect, connectionError }: HeaderProps) {
  const markPrice = gasPrice ? Number(gasPrice.price) : 0;
  const strikePrice = state ? Number(state.strikePriceGwei) : 0;
  const isExpired = state ? Number(state.expiryTimestamp) <= Math.floor(Date.now() / 1000) : false;

  const getExpiryCountdown = () => {
    if (!state) return '--:--:--';
    const now = Math.floor(Date.now() / 1000);
    const remaining = Number(state.expiryTimestamp) - now;
    if (remaining <= 0) return 'EXPIRED';
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getExpiryDate = () => {
    if (!state) return '';
    const d = new Date(Number(state.expiryTimestamp) * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
  };

  return (
    <header className="h-16 bg-[#0a0a0a]/90 border-b border-white/5 flex items-center px-4 justify-between shrink-0 z-50 backdrop-blur-md sticky top-0">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3 pr-6 border-r border-white/10">
          <div className="p-2 bg-gradient-to-tr from-orange-500 to-red-600 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.4)]">
            <Zap size={20} className="text-white fill-white/20" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-lg tracking-tight text-white leading-none uppercase">GASCAP</h1>
              <Badge className="text-[7px] h-3.5 px-1 bg-amber-500/15 text-amber-400 border-amber-500/20 font-black uppercase tracking-wider">Futures</Badge>
            </div>
            <span className="text-[10px] text-primary font-bold uppercase tracking-widest leading-none mt-1">Gas Futures Exchange</span>
          </div>
        </div>

        <div className="hidden xl:flex items-center gap-10 font-code">
          {/* Live Gas Price from FTSO */}
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1 mb-0.5">
              <Activity size={10} className={markPrice > 0 ? "text-emerald-500" : "text-red-500"} />
              {markPrice > 0 ? "FTSO Gas Index" : "Awaiting FTSO Feed"}
            </span>
            <span className={`text-lg font-bold leading-none ${markPrice > 0 ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-muted-foreground'}`}>
              {markPrice > 0 ? markPrice.toFixed(2) : '---'} <span className="text-[10px] text-emerald-600 font-normal uppercase">Gwei</span>
            </span>
          </div>

          {/* Strike Price from Contract */}
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5">Strike Price</span>
            <span className="text-white font-medium text-sm leading-none">
              {strikePrice > 0 ? strikePrice.toString() : '---'} <span className="text-[10px] text-muted-foreground uppercase">Gwei</span>
            </span>
          </div>

          {/* Liquidity Pool */}
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5">Pool Liquidity</span>
            <span className="text-white font-medium text-sm leading-none">
              {state ? (Number(state.totalLiquidityWei) / 1e18).toFixed(4) : '---'} <span className="text-[10px] text-muted-foreground uppercase">C2FLR</span>
            </span>
          </div>

          {/* Expiry Countdown + Date */}
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground font-bold uppercase mb-0.5 flex items-center gap-1">
              <Clock size={10} /> {state?.isSettled ? 'Settled' : 'Expiry'}
            </span>
            <div className="flex items-center gap-2 text-xs font-bold leading-none">
              <span className={state?.isSettled ? "text-emerald-400" : isExpired ? "text-red-400" : "text-orange-400"}>
                {state?.isSettled ? 'SETTLED' : getExpiryCountdown()}
              </span>
            </div>
            {state && !state.isSettled && (
              <span className="text-[8px] text-muted-foreground/50 mt-0.5">{getExpiryDate()}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {connectionError && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <AlertCircle className="w-4 h-4 text-red-400 animate-pulse" />
              </TooltipTrigger>
              <TooltipContent className="bg-red-900/90 border-red-500/30 text-red-100 text-[10px] max-w-[250px]">
                {connectionError}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <nav className="hidden lg:flex items-center gap-4 mr-6">
          <NextLink href="/liquidity" className="text-[10px] font-bold text-muted-foreground hover:text-primary flex items-center gap-1 uppercase tracking-wider transition-colors">
            <Droplets className="w-3.5 h-3.5" /> Pool
          </NextLink>
          <NextLink href="/settle" className="text-[10px] font-bold text-muted-foreground hover:text-primary flex items-center gap-1 uppercase tracking-wider transition-colors">
            <Gavel className="w-3.5 h-3.5" /> Settle
          </NextLink>
        </nav>

        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] text-blue-400 font-bold uppercase tracking-tight">
          <ShieldCheck className="w-3.5 h-3.5" /> Coston2
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onConnect}
          className="border-white/10 bg-white/5 hover:bg-white/10 font-code text-[11px] h-9 px-4 gap-2 rounded-sm transition-all"
        >
          {address ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              {address.slice(0, 4)}...{address.slice(-4)}
            </>
          ) : (
            <><Wallet className="w-4 h-4" /> CONNECT</>
          )}
        </Button>
      </div>
    </header>
  );
}
