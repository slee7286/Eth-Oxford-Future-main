"use client";

import { useEffect, useState } from 'react';
import { Header } from '@/components/Terminal/Header';
import { TradingChart } from '@/components/Terminal/TradingChart';
import { TradePanel } from '@/components/Terminal/TradePanel';
import { ActivityPanel } from '@/components/Terminal/ActivityPanel';
import { MarketData } from '@/components/Terminal/MarketData';
import { useWallet, useContractData } from '@/lib/blockchain';
import { saveTick, seedIfNeeded } from '@/lib/store';

export default function TerminalPage() {
  const { address, provider, connect } = useWallet();
  const { contractState, currentGasPrice, userPosition, connectionError, refresh } = useContractData(address);
  const [timeframe, setTimeframe] = useState(1);

  // Bridge live FTSO data from contract to chart history
  useEffect(() => {
    if (currentGasPrice && currentGasPrice.price > 0n) {
      const price = Number(currentGasPrice.price);
      const time = Number(currentGasPrice.timestamp);
      // Seed chart with initial history on first real price
      seedIfNeeded(price, time);
      saveTick({ price, time });
    }
  }, [currentGasPrice]);

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-foreground font-body overflow-hidden">
      <Header
        address={address}
        gasPrice={currentGasPrice}
        state={contractState}
        onConnect={connect}
        connectionError={connectionError}
      />

      <main className="flex-1 flex min-h-0 overflow-hidden border-t border-white/5">
        {/* Left: Chart + Positions */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">
          <div className="flex-[3] flex flex-col min-h-0 bg-black/20">
            <div className="flex-1 relative">
              <TradingChart
                strikePrice={contractState ? Number(contractState.strikePriceGwei) : undefined}
                settlementPrice={contractState ? Number(contractState.settlementPriceGwei) : undefined}
                isSettled={contractState?.isSettled}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
              />
            </div>
          </div>

          <div className="flex-[2] border-t border-white/5 min-h-0">
            <ActivityPanel
              position={userPosition}
              address={address}
              contractState={contractState}
              provider={provider}
              refresh={refresh}
              currentPrice={currentGasPrice?.price}
            />
          </div>
        </div>

        {/* Right: Market Data + Trade Panel */}
        <div className="w-[320px] flex flex-col shrink-0">
          <div className="flex-1 border-b border-white/5 overflow-hidden">
            <MarketData currentPrice={currentGasPrice?.price} contractState={contractState} />
          </div>

          <div className="flex-1 overflow-y-auto bg-black/40">
            <TradePanel
              address={address}
              provider={provider}
              refresh={refresh}
              disabled={contractState?.isSettled || !address}
              currentPrice={currentGasPrice?.price}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
