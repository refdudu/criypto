// ./interfaces.ts

export interface HistoricalKlineData {
  emaValue: number | null;
  rsiValue: number | null;
  closePrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  timestamp: string; // ISO String
}

export interface SymbolTimeframeIndicatorState {
  klineHistory: HistoricalKlineData[];

  previousAverageGain: number | null;
  previousAverageLoss: number | null;
  rsiValue: number | null;
  emaValue: number | null;

  lastHigh: { price: number; rsi: number; timestamp: number } | null;
  lastLow: { price: number; rsi: number; timestamp: number } | null;

  armedDivergence: {
    type: "BULLISH" | "BEARISH";
    confirmationPrice: number;
    armedAtTimestamp: number;
  } | null;
}
export enum ObserveSymbolStatusEnum {
  "observing" = 1,
  "not_observing" = 2,
  "error" = 3,
}
export interface BinancePrevDayResponse {
  eventType: string | "24hrTicker";
  eventTime: number;
  symbol: string;
  priceChange: string;
  percentChange: string;
  averagePrice: string;
  prevClose: string;
  close: string;
  closeQty: string;
  bestBid: string;
  bestBidQty: string;
  bestAsk: string;
  bestAskQty: string;
  open: string;
  high: string;
  low: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstTradeId: number;
  lastTradeId: number;
  numTrades: number;
}
export interface BinanceDailyStat {
  symbol: string;
  priceChangePercent: string;
  quoteVolume: string;
}

export interface KlineTick {
  t: number; // Timestamp de início da vela
  T: number; // Timestamp de fechamento da vela
  s: string; // Símbolo do par (ex: BTCUSDT) - Dentro de klineData.k
  i: string; // Intervalo da vela (ex: 1m, 5m, 1h) - Dentro de klineData.k
  f: number; // ID da primeira trade na vela
  L: number; // ID da última trade na vela
  o: string; // Preço de abertura
  c: string; // Preço de fechamento
  h: string; // Preço mais alto
  l: string; // Preço mais baixo
  v: string; // Volume da moeda base
  n: number; // Número de trades
  x: boolean; // Vela fechada?
  q: string; // Volume da moeda de cotação
  V: string; // Volume de compra da moeda base
  Q: string; // Volume de compra da moeda de cotação
  B: string; // Ignorar
}

export interface KlineEvent {
  e: string; // Tipo do evento (ex: 'kline')
  E: number; // Timestamp do evento
  s: string; // Símbolo do par (ex: BTCUSDT) - Símbolo principal do evento
  k: KlineTick; // O objeto da vela
}

// Estado dos indicadores (EMA, RSI) para cada símbolo EM UM TIMEFRAME ESPECÍFICO
export interface SymbolTimeframeIndicatorState {
  closePrices: number[];
  previousAverageGain: number | null;
  previousAverageLoss: number | null;
  rsiValue: number | null;
  emaHistory: number[];
  // --- NOVOS CAMPOS PARA DIVERGÊNCIA ---
  lastHighPrice: number | null; // Último preço de topo quando RSI > 70
  lastHighRsi: number | null; // Último valor de RSI de topo > 70
  lastLowPrice: number | null; // Último preço de fundo quando RSI < 30
  lastLowRsi: number | null; // Último valor de RSI de fundo < 30
}
// Estado geral da estratégia para um SÍMBOLO
export interface SymbolOverallStrategyState {
  majorRallyActive: boolean;
  rallyReferencePrice: number | null;
  rallyPeakPriceSinceActive: number | null;
  rallyDetectedOnTimeframe: string | null;
  rallyPeakPriceSincePrimed: number | null;
  isPrimedFor5mEntry: boolean | null;
  oversoldTriggerUsedForTimeframe: {
    [timeframe: string]: boolean;
  };
}
