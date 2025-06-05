// ./interfaces.ts

export interface KlineTick {
  t: number;    // Timestamp de início da vela
  T: number;    // Timestamp de fechamento da vela
  s: string;    // Símbolo do par (ex: BTCUSDT) - Dentro de klineData.k
  i: string;    // Intervalo da vela (ex: 1m, 5m, 1h) - Dentro de klineData.k
  f: number;    // ID da primeira trade na vela
  L: number;    // ID da última trade na vela
  o: string;    // Preço de abertura
  c: string;    // Preço de fechamento
  h: string;    // Preço mais alto
  l: string;    // Preço mais baixo
  v: string;    // Volume da moeda base
  n: number;    // Número de trades
  x: boolean;   // Vela fechada?
  q: string;    // Volume da moeda de cotação
  V: string;    // Volume de compra da moeda base
  Q: string;    // Volume de compra da moeda de cotação
  B: string;    // Ignorar
}

export interface KlineEvent {
  e: string;    // Tipo do evento (ex: 'kline')
  E: number;    // Timestamp do evento
  s: string;    // Símbolo do par (ex: BTCUSDT) - Símbolo principal do evento
  k: KlineTick; // O objeto da vela
}

// Estado dos indicadores (EMA, RSI) para cada símbolo EM UM TIMEFRAME ESPECÍFICO
export interface SymbolTimeframeIndicatorState {
  allClosePriceHistoryForRSI: number[];
  previousAverageGain: number | null;
  previousAverageLoss: number | null;
  rsiValue: number | null;
  emaHistory: number[];
  closedKlineCountForEMA: number;
}

// Estado geral da estratégia para um SÍMBOLO
export interface SymbolOverallStrategyState {
  isPrimedFor5mEntry: boolean;
  rallyReferencePrice: number | null;
  rallyPeakPriceSincePrimed: number | null;
  // Adicionado para saber qual timeframe detectou o rally, para logging
  rallyDetectedOnTimeframe: string | null;
}