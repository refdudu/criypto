export interface HistoricalKlineData {
  timestamp: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume?: number;
  emaValue: number | null;
  rsiValue: number | null;
  atrValue?: number | null;
  relativeVolume?: number | null;
}

export interface Pivot {
  price: number;
  rsi: number;
  timestamp: number;
}

export interface ArmedDivergence {
  type: "BULLISH" | "BEARISH";
  confirmationPrice: number;
  invalidationPrice: number;
  armedAtTimestamp: number;
  secondPivotTimestamp: number;
}

export interface SymbolTimeframeIndicatorState {
  klineHistory: HistoricalKlineData[];
  rsiValue: number | null;
  emaValue: number | null;
  atrValue: number | null;
  relativeVolume: number | null;
  lastHigh: Pivot | null;
  lastLow: Pivot | null;
  armedDivergence: ArmedDivergence | null;
}

export interface BinanceDailyStat {
  symbol: string;
  priceChangePercent: string;
  quoteVolume: string;
}

export interface KlineTick {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  x: boolean;
}
export interface KlineEvent {
  E: number;
  s: string;
  k: KlineTick;
}
