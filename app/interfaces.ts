export interface KlineTick {
  t: number;      // Timestamp de início da vela
  T: number;      // Timestamp de fechamento da vela
  s: string;      // Símbolo do par (ex: BTCUSDT)
  i: string;      // Intervalo da vela (ex: 1m, 5m, 1h)
  f: number;      // ID da primeira trade na vela
  L: number;      // ID da última trade na vela
  o: string;      // Preço de abertura
  c: string;      // Preço de fechamento
  h: string;      // Preço mais alto
  l: string;      // Preço mais baixo
  v: string;      // Volume da moeda base (ex: BTC em BTCUSDT)
  n: number;      // Número de trades na vela
  x: boolean;     // Esta vela está fechada? (true se sim, false se ainda aberta)
  q: string;      // Volume da moeda de cotação (ex: USDT em BTCUSDT)
  V: string;      // Volume de compra da moeda base
  Q: string;      // Volume de compra da moeda de cotação
  B: string;      // Campo a ser ignorado (geralmente não utilizado)
}

// Interface para o evento de kline completo que recebemos do WebSocket
export interface KlineEvent {
  e: string;      // Tipo do evento (ex: 'kline')
  E: number;      // Timestamp do evento
  s: string;      // Símbolo do par
  k: KlineTick;   // O objeto da vela em si
}
