"use client";

import { useState } from 'react';
import { Header } from '@/components/Terminal/Header';
import { useWallet, useContractData } from '@/lib/blockchain';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Contract } from 'ethers';
import { CONFIG, ABI } from '@/lib/config';
import NextLink from 'next/link';
import { ChevronLeft, Gavel, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export default function SettlePage() {
  const { address, provider, connect } = useWallet();
  const { contractState, currentGasPrice, refresh } = useContractData(address);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSettle = async () => {
    if (!address || !provider) return;
    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const contract = new Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.settleContract();
      await tx.wait();
      toast({ title: "Contract Settled", description: "Settlement price locked from FTSO oracle." });
      refresh();
    } catch (err: any) {
      toast({ title: "Settlement Failed", description: err?.reason || err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isExpired = contractState ? Number(contractState.expiryTimestamp) <= Math.floor(Date.now() / 1000) : false;
  const canSettle = isExpired && !contractState?.isSettled;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header address={address} gasPrice={currentGasPrice} state={contractState} onConnect={connect} />

      <main className="flex-1 overflow-auto p-6 flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-6">
          <NextLink href="/" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> Back to Terminal
          </NextLink>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <Gavel className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Settlement Hub</h2>
              <p className="text-sm text-muted-foreground">Trigger contract settlement once the expiry is reached.</p>
            </div>
          </div>

          <div className="bg-panel border rounded-xl overflow-hidden shadow-2xl">
            <div className="p-8 space-y-8">
              <div className="flex flex-col items-center text-center space-y-4">
                {contractState?.isSettled ? (
                  <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                ) : isExpired ? (
                  <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center animate-pulse">
                    <AlertTriangle className="w-10 h-10" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center">
                    <Clock className="w-10 h-10" />
                  </div>
                )}

                <div className="space-y-1 text-white">
                  <h3 className="text-xl font-bold uppercase tracking-tight">
                    {contractState?.isSettled ? "Contract Settled" : isExpired ? "Ready for Settlement" : "Contract Active"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {contractState?.isSettled
                      ? `Settled at ${contractState.settlementPriceGwei.toString()} gwei. Traders can now claim payouts.`
                      : isExpired
                        ? "The contract has expired. Anyone can trigger settlement."
                        : "Trading continues until the expiry timestamp."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px bg-white/5 border border-white/5 rounded-lg overflow-hidden">
                <div className="bg-black/40 p-4 flex flex-col items-center">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Strike Price</span>
                  <span className="text-lg font-code text-white">{contractState?.strikePriceGwei.toString() || '---'} GWEI</span>
                </div>
                <div className="bg-black/40 p-4 flex flex-col items-center">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Expiry</span>
                  <span className="text-lg font-code text-white">
                    {contractState ? new Date(Number(contractState.expiryTimestamp) * 1000).toLocaleString() : '---'}
                  </span>
                </div>
              </div>

              {contractState?.isSettled && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">Settlement Price</span>
                  <div className="text-2xl font-code font-bold text-emerald-400">{contractState.settlementPriceGwei.toString()} GWEI</div>
                </div>
              )}

              <Button
                className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={!canSettle || loading || !address}
                onClick={handleSettle}
              >
                {loading ? "SETTLING..." : contractState?.isSettled ? "SETTLEMENT COMPLETE" : !isExpired ? "NOT YET EXPIRED" : "SETTLE CONTRACT"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
