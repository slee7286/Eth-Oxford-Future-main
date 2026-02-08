"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, IPriceLine } from 'lightweight-charts';
import { getCandles } from '@/lib/store';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Maximize2, Settings, Layers, Loader2, Wifi, WifiOff } from 'lucide-react';

interface TradingChartProps {
  strikePrice?: number;
  settlementPrice?: number;
  isSettled?: boolean;
  timeframe: number;
  onTimeframeChange: (tf: number) => void;
}

export function TradingChart({ strikePrice, settlementPrice, isSettled, timeframe, onTimeframeChange }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [mounted, setMounted] = useState(false);
  const [hasData, setHasData] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Initialize chart
  useEffect(() => {
    if (!mounted || !chartContainerRef.current) return;

    const handleResize = () => {
      chartRef.current?.applyOptions({ width: chartContainerRef.current?.clientWidth });
    };

    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#9CA3AF',
        fontSize: 10,
        fontFamily: 'Source Code Pro',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { labelBackgroundColor: '#FFB830', color: 'rgba(255, 184, 48, 0.4)', style: 2 },
        horzLine: { labelBackgroundColor: '#FFB830', color: 'rgba(255, 184, 48, 0.4)', style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    candlestickSeriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chartRef.current?.remove(); };
  }, [mounted]);

  // Update data on interval
  useEffect(() => {
    const updateData = () => {
      if (!candlestickSeriesRef.current) return;
      const data = getCandles(timeframe);

      if (data.length > 0) {
        candlestickSeriesRef.current.setData(data as CandlestickData[]);
        setHasData(true);
      } else {
        setHasData(false);
      }

      // Update price lines
      priceLinesRef.current.forEach(line => candlestickSeriesRef.current?.removePriceLine(line));
      priceLinesRef.current = [];

      if (strikePrice && data.length > 0) {
        priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
          price: strikePrice, color: '#FFB830', lineWidth: 1, lineStyle: 1,
          axisLabelVisible: true, title: 'STRIKE',
        }));
      }

      if (isSettled && settlementPrice && data.length > 0) {
        priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
          price: settlementPrice, color: '#10B981', lineWidth: 1, lineStyle: 0,
          axisLabelVisible: true, title: 'SETTLEMENT',
        }));
      }
    };

    updateData();
    const interval = setInterval(updateData, 3000);
    return () => clearInterval(interval);
  }, [timeframe, strikePrice, settlementPrice, isSettled]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="h-9 border-b border-white/5 bg-white/[0.01] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <Tabs value={timeframe.toString()} onValueChange={v => onTimeframeChange(parseInt(v))}>
            <TabsList className="bg-transparent h-7 p-0 gap-3">
              {['1', '5', '15', '60'].map((tf) => (
                <TabsTrigger key={tf} value={tf}
                  className="text-[10px] h-6 px-0 min-w-0 rounded-none bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary transition-all font-bold uppercase tracking-tighter">
                  {tf}M
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-4 text-muted-foreground">
            <BarChart3 className="w-3.5 h-3.5 cursor-pointer hover:text-white transition-colors" />
            <Layers className="w-3.5 h-3.5 cursor-pointer hover:text-white transition-colors" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Settings className="w-3.5 h-3.5 text-muted-foreground cursor-pointer hover:text-white" />
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground cursor-pointer hover:text-white" />
        </div>
      </div>

      <div className="flex-1 relative group bg-black/40">
        {!hasData && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-white">Connecting to FTSO Feed</p>
              <p className="text-[10px] text-muted-foreground">Awaiting gas price data from Flare oracle...</p>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-sm border border-white/5 flex items-center gap-2 shadow-2xl">
            {hasData ? (
              <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-[10px] font-bold tracking-widest text-white uppercase">Live FTSO Feed</span></>
            ) : (
              <><WifiOff className="w-3 h-3 text-red-400" /><span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Waiting for data...</span></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
