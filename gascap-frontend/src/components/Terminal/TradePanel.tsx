"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { parseUnits, Contract } from 'ethers';
import { CONFIG, ABI } from '@/lib/config';
import { Wallet, ShieldAlert, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

interface TradePanelProps {
  address: string | null;
  provider: any | null;
  refresh: () => void;
  disabled?: boolean;
  currentPrice?: bigint;
}

export function TradePanel({ address, provider, refresh, disabled, currentPrice }: TradePanelProps) {
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [qty, setQty] = useState('100');
  const [collateral, setCollateral] = useState('0.5');
  const [leverage, setLeverage] = useState(1);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const price = currentPrice ? Number(currentPrice) : 0;
  const marginRequired = parseFloat(collateral) || 0;
  const liqPrice = price > 0
    ? side === "LONG"
      ? price * (1 - 1/Math.max(leverage, 1) + 0.05)
      : price * (1 + 1/Math.max(leverage, 1) - 0.05)
    : 0;

  const handleTrade = async () => {
    if (!address || !provider) {
      toast({ title: "Wallet not connected", description: "Please connect MetaMask first.", variant: "destructive" });
      return;
    }

    if (!qty || parseInt(qty) <= 0) {
      toast({ title: "Invalid quantity", description: "Enter a valid position size.", variant: "destructive" });
      return;
    }

    if (!collateral || parseFloat(collateral) <= 0) {
      toast({ title: "Invalid collateral", description: "Enter collateral amount in C2FLR.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const contract = new Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);
      const quantity = BigInt(qty);
      const value = parseUnits(collateral, 'ether');
      const marginMode = 0; // ISOLATED

      // Step 1: Check if user is registered, auto-register if not
      try {
        const profile = await contract.getUserProfile(address);
        if (!profile[0]) {
          toast({ title: "Registering...", description: "First trade — registering your account." });
          const regTx = await contract.registerUser("trader", "");
          await regTx.wait();
          toast({ title: "Registered!", description: "Account registered. Opening position..." });
        }
      } catch {
        // If getUserProfile fails, try registering anyway
        try {
          const regTx = await contract.registerUser("trader", "");
          await regTx.wait();
        } catch {
          // Already registered or other issue — continue to trade
        }
      }

      // Step 2: Open the position with quantity, leverage, marginMode
      const tx = side === "LONG"
        ? await contract.mintLong(quantity, BigInt(leverage), marginMode, { value })
        : await contract.mintShort(quantity, BigInt(leverage), marginMode, { value });

      toast({ title: "Transaction Submitted", description: `Opening ${side} position...` });
      await tx.wait();
      toast({ title: "Position Opened!", description: `${side} ${qty} contracts @ ${leverage}x with ${collateral} C2FLR collateral.` });
      refresh();
    } catch (err: any) {
      const message = err?.reason || err?.message || "Unknown error";
      toast({ title: "Transaction Failed", description: message.slice(0, 200), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 py-4 px-3 bg-[#080808]">
      {/* FTSO Feed Status */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20 font-bold uppercase">
          Futures
        </Badge>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", price > 0 ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
          <span className={cn("text-[9px] font-bold uppercase tracking-wider", price > 0 ? "text-emerald-400" : "text-red-400")}>
            {price > 0 ? "FTSO Live" : "No Feed"}
          </span>
        </div>
      </div>

      {/* Long/Short Toggle */}
      <Tabs value={side} onValueChange={(v) => setSide(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-10 bg-white/5 p-1 rounded-sm">
          <TabsTrigger value="LONG" className="rounded-sm font-black text-[10px] uppercase tracking-wider data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            Long (Hedge Spike)
          </TabsTrigger>
          <TabsTrigger value="SHORT" className="rounded-sm font-black text-[10px] uppercase tracking-wider data-[state=active]:bg-rose-600 data-[state=active]:text-white">
            Short Gas
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Quantity Input */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Quantity (Contracts)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground/50" /></TooltipTrigger>
                  <TooltipContent>Number of gas futures contracts to open.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="relative">
            <Input type="number" value={qty} onChange={e => setQty(e.target.value)}
              className="bg-white/5 border-white/5 text-white font-code h-11 rounded-sm focus:ring-0 focus:border-white/20 text-sm pr-16" placeholder="0" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold uppercase pointer-events-none">GCAP</span>
          </div>
        </div>

        {/* Collateral Input */}
        <div className="space-y-2">
          <div className="flex justify-between px-0.5">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Collateral (C2FLR)</Label>
          </div>
          <div className="relative">
            <Input type="number" value={collateral} onChange={e => setCollateral(e.target.value)}
              className="bg-white/5 border-white/5 text-white font-code h-11 rounded-sm focus:ring-0 focus:border-white/20 text-sm pr-16" placeholder="0.0" step="0.1" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold uppercase pointer-events-none">C2FLR</span>
          </div>
        </div>

        {/* Leverage Slider */}
        <div className="space-y-3 pt-2">
          <div className="flex justify-between px-0.5">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Leverage</Label>
            <Badge variant="secondary" className="font-code text-[11px] h-5 bg-white/10">{leverage}x</Badge>
          </div>
          <Slider value={[leverage]} onValueChange={(v) => setLeverage(v[0])} max={20} min={1} step={1} className="h-1" />
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-sm p-4 space-y-3">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Collateral</span>
          <span className="text-white font-code">{marginRequired.toFixed(4)} C2FLR</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Leverage</span>
          <span className="text-white font-code">{leverage}x</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Current Gas Price</span>
          <span className="text-white font-code">{price > 0 ? price.toFixed(2) : '---'} GWEI</span>
        </div>
        {liqPrice > 0 && (
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Est. Liquidation</span>
            <span className="text-orange-500 font-code font-bold">{liqPrice.toFixed(2)} GWEI</span>
          </div>
        )}
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Contract</span>
          <a
            href={`${CONFIG.EXPLORER_URL}/address/${CONFIG.CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 font-code text-[10px] hover:underline"
          >
            {CONFIG.CONTRACT_ADDRESS.slice(0, 6)}...{CONFIG.CONTRACT_ADDRESS.slice(-4)}
          </a>
        </div>
      </div>

      {/* Execute Button */}
      <Button
        className={cn("w-full font-black h-14 uppercase tracking-[0.2em] rounded-sm text-xs transition-all active:scale-[0.98] shadow-lg",
          side === "LONG"
            ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
            : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20"
        )}
        disabled={loading || disabled || !address}
        onClick={handleTrade}
      >
        {!address
          ? "CONNECT WALLET"
          : loading
            ? "PENDING..."
            : side === "LONG"
              ? `Open Long ${leverage}x`
              : `Open Short ${leverage}x`
        }
      </Button>

      {/* Risk Disclosure */}
      <div className="mt-auto pt-4 border-t border-white/5 flex items-start gap-3 text-[9px] text-muted-foreground leading-relaxed italic">
        <ShieldAlert className="w-4 h-4 shrink-0 text-orange-500/50" />
        <p>GasCap Futures settle based on FTSO oracle prices. Powered by Flare Network. Testnet only.</p>
      </div>
    </div>
  );
}
