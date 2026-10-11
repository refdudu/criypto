# Criypto v3

Monitor de divergências baseado em candles fechados da Binance. **Não executa ordens nem afirma probabilidades de lucro.**

## Instalação segura

1. **Antes de implantar o novo backend**, execute `app/migrations/001_market_engine_v3.sql` no SQL Editor do projeto Supabase correto e revise o resultado. A migração não apaga dados e aborta se existirem candles duplicados para `symbol,interval,timestamp`. Não foi executada automaticamente pelo commit.
2. Backend: configurar `app/.env` com `SUPABASE_CLIENT_ID` (URL) e `SUPABASE_CLIENT_SECRET` (**chave backend com permissão service_role**, nunca exposta no navegador). Opcionalmente: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `API_PORT`, `DYNAMIC_SYMBOLS=false`, `BINANCE_REST_URL`, `LUCA_WEBHOOK_URL` e `WEBHOOK_SITE`.
3. Frontend: configurar `VITE_SUPABASE_CLIENT_ID` e `VITE_SUPABASE_CLIENT_SECRET`. Esta última deve conter exclusivamente uma chave **publishable/anon**, pois `VITE_*` é pública. Habilitar RLS de leitura somente para as tabelas necessárias. Nunca usar uma chave de backend no browser.
4. Em `app/`: `npm install && npm test && npm run build && npm start`. Em `web/`: `npm install && npm run lint && npm run build`. Docker Compose: `app/docker-compose.yml`.

## Implementação

- RSI14 Wilder, EMA21, ATR14 e RVOL20 possuem estado **incremental**. Uma janela de 200 candles não reinicia a suavização. A inicialização carrega até 1000 candles, recupera o estado numérico persistido quando o candle-âncora existe e reconcilia os mais recentes.
- Eventos fechados `x=true`; repetidos ou fora de ordem não alteram estado. Lacunas pequenas são buscadas por REST; lacunas maiores provocam nova inicialização. Série inicial descontínua ou obsoleta é rejeitada.
- Pivôs confirmados (2 velas antes/depois), divergências regulares e confirmação somente por fechamento. Parâmetros em `strategy.ts` são hipóteses, não filtros comprovadamente rentáveis.
- `persist_market_batch` realiza em uma transação SQL a escrita de candles, resumo, indicador incremental e evento de confirmação. A tabela `signal_events` é um **outbox durável**. Cada destino tem marcação de entrega independente. Um destinatário deve deduplicar `eventId` após falhas entre HTTP e confirmação no banco. Execute **apenas uma instância do dispatcher** por projeto até implementar claim transacional multiworker.
- O payload usa `id` e `symbol` com o **par Binance**, sem atribuir IDs externos não verificados.
- A seleção inicial monitora até 20 mercados USDT mais líquidos (volume 24h mínimo de 1 milhão). Ela **não é** uma seleção de top gainers. Intervalos: 5m, 15m e 1h; alertas confirmados em 15m e 1h.
- O dashboard esconde estados obsoletos, apresenta RSI por intervalo, diferencia sobrecompra/sobrevenda e atualiza por Realtime com fallback de 60 s.

## Backtest e limitações

O backtest é puro, usa a mesma série incremental de indicadores e a mesma estratégia do monitor. Entrada na abertura seguinte, custos configuráveis, stop conservador quando alvo e stop ocorrem no mesmo candle, preenchimento pelo preço de abertura em gaps e ausência de operações simultâneas por símbolo. Sinais de baixa são **simulações hipotéticas** e não implicam venda a descoberto disponível no mercado spot.

**Pendente fora do GitHub:** aplicar/verificar a migração no banco real, auditar permissões RLS/credenciais, executar integração ao vivo e validar a performance da estratégia com histórico representativo fora da amostra. A migração é um pré-requisito de implantação do backend v3. Não há modelo probabilístico calibrado, estratégia 4h ou negociação automática. A disponibilidade de versões idênticas de dependências requer commitar lockfiles gerados por gerenciador de pacotes autorizado.
