"use client";

import { useState } from 'react';
import { Header } from '@/components/Terminal/Header';
import { useWallet, useContractData } from '@/lib/blockchain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Contract, parseUnits, formatUnits } from 'ethers';
import { CONFIG, ABI } from '@/lib/config';
import NextLink from 'next/link';
import { ChevronLeft, Droplets } from 'lucide-react';

export default function LiquidityPage() {
  const { address, provider, connect } = useWallet();
  const { contractState, currentGasPrice, userLiquidity, refresh } = useContractData(address);
  const [addAmount, setAddAmount] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAction = async (isAdd: boolean) => {
    if (!address || !provider) return;
    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const contract = new Contract(CONFIG.CONTRACT_ADDRESS, ABI, signer);

      let tx;
      if (isAdd) {
        // addLiquidity() is payable - send C2FLR as value
        tx = await contract.addLiquidity({ value: parseUnits(addAmount, 'ether') });
      } else {
        // removeLiquidity(amount) takes the withdrawal amount
        tx = await contract.removeLiquidity(parseUnits(removeAmount, 'ether'));
      }

      await tx.wait();
      toast({ title: `Liquidity ${isAdd ? 'Added' : 'Removed'} Successfully` });
      if (isAdd) setAddAmount(''); else setRemoveAmount('');
      refresh();
    } catch (err: any) {
      toast({ title: "Transaction Failed", description: err?.reason || err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Liquidity Pool</h2>
              <p className="text-sm text-muted-foreground">Provide C2FLR liquidity to fund gas futures settlements.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-panel border rounded-lg p-6 space-y-2">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Global Pool</span>
              <div className="text-3xl font-code font-bold text-white">
                {contractState ? (Number(contractState.totalLiquidityWei) / 1e18).toFixed(4) : '0.00'} <span className="text-sm text-muted-foreground">C2FLR</span>
              </div>
            </div>
            <div className="bg-panel border rounded-lg p-6 space-y-2 border-primary/30">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Your Stake</span>
              <div className="text-3xl font-code font-bold text-primary">
                {formatUnits(userLiquidity, 18)} <span className="text-sm text-muted-foreground">C2FLR</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="trading-panel">
              <div className="trading-panel-header"><span>Add Liquidity</span></div>
              <div className="bg-panel2 p-4 border-t border-white/5 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Amount (C2FLR)</Label>
                  <Input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                    className="bg-black/20 border-white/10 font-code text-white" placeholder="0.0" />
                </div>
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                  disabled={loading || !address || contractState?.isSettled || !addAmount}
                  onClick={() => handleAction(true)}>
                  {loading ? "PROCESSING..." : "DEPOSIT C2FLR"}
                </Button>
              </div>
            </div>

            <div className="trading-panel">
              <div className="trading-panel-header"><span>Remove Liquidity</span></div>
              <div className="bg-panel2 p-4 border-t border-white/5 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Amount (C2FLR)</Label>
                  <Input type="number" value={removeAmount} onChange={e => setRemoveAmount(e.target.value)}
                    className="bg-black/20 border-white/10 font-code text-white" placeholder="0.0" />
                </div>
                <Button variant="outline" className="w-full border-white/10 bg-white/5 font-bold text-white hover:bg-white/10"
                  disabled={loading || !address || userLiquidity === 0n || contractState?.isSettled || !removeAmount}
                  onClick={() => handleAction(false)}>
                  {loading ? "PROCESSING..." : "WITHDRAW C2FLR"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
