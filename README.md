# Criypto

Monitor de mercado **sem execução de ordens**. Obtém candles fechados da Binance; calcula RSI(14) de Wilder, EMA(21), ATR(14) e RVOL(20); identifica divergências entre dois pivôs confirmados (2 candles à esquerda e 2 à direita); confirma pela quebra da estrutura no fechamento. Indicadores e estratégia são reconstruídos a partir de até 200 candles em ordem cronológica. O RSI no caso 0/0 é, por convenção, 50. Os parâmetros de estratégia são hipóteses e não representam probabilidade de lucro.

## Serviços

- `app/`: backend Node.js, Express e Binance WebSocket. Seleciona no início até 20 mercados USDT por volume de 24h (mínimo de 1 milhão de USDT). Fallback: BTCUSDT, ETHUSDT. Intervalos: 5m, 15m e 1h.
- `web/`: dashboard React. Consulta Supabase diretamente; atualiza pelos eventos Realtime e possui polling a cada 60 s como fallback.
- `app/src/backtest.ts`: ferramenta pura para replay de estratégia. Usa entrada na abertura da vela seguinte, custos configuráveis e hipótese conservadora quando alvo e stop ocorrem na mesma vela. **Não existe estatística de acerto validada para este projeto.**

## Preparação

Configure `app/.env` com `SUPABASE_CLIENT_ID` (URL), `SUPABASE_CLIENT_SECRET` (chave com permissões de backend), e opcionalmente `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `API_PORT`, `DYNAMIC_SYMBOLS=false`, `LUCA_WEBHOOK_URL`, `WEBHOOK_SITE`, `BINANCE_REST_URL`. Não registre nem publique chaves privadas. O backend lê candles públicos por REST na inicialização e recupera lacunas durante reconexões.

Configure `web/.env` com `VITE_SUPABASE_CLIENT_ID` e `VITE_SUPABASE_CLIENT_SECRET`. **A segunda variável deve conter exclusivamente a chave publishable/anon, nunca service_role ou secret key**: valores `VITE_` são visíveis ao navegador. Habilite RLS com apenas a leitura pública necessária em `symbols`, `market_data` e `indicator_states`. A configuração real das políticas e publicações do Supabase não está versionada neste repositório; confira antes de publicar.

O banco existente deve conter `market_data` (`symbol`, `interval`, `timestamp`, `open_price`, `high_price`, `low_price`, `close_price`, `ema_value`, `rsi_value`), `symbols` (campos `last_*`, conflito em `symbol`) e `indicator_states` (conflito em `symbol,interval`, campos de pivô, divergência e `updated_at`). Não há migração destrutiva automática.

Instale dependências em cada pasta com `npm install`. No backend use `npm test`, `npm run build`, `npm start`. No frontend use `npm run lint` e `npm run build`. Docker Compose está em `app/docker-compose.yml`.

## Garantias e limitações

- Somente candles com `x=true` são processados. Duplicatas e eventos fora de ordem são ignorados; pequenas lacunas são recuperadas via REST. A recuperação de lacunas não dispara webhooks históricos.
- O estado estratégico é reconstruído por replay de 200 candles. Os primeiros candles funcionam como warm-up; mercados com dados insuficientes são ignorados. Inicialização e replay usam a mesma janela, não estados suavizados inconsistentes armazenados separadamente.
- Sinais confirmados em 15m e 1h podem emitir webhook. `eventId` identifica o evento, mas **a entrega é tentativa limitada**, em fila volátil. Destinatários devem tolerar duplicatas e configurar deduplicação. Falhas definitivas são registradas nos logs. Não há fila durável nem execução financeira.
- ATR e RVOL são métricas de contexto; nenhuma pontuação é tratada como chance de acerto. Seleção de símbolos é feita na inicialização, não continuamente. A estratégia ainda requer backtesting fora da amostra, avaliação de custos, risco e calibração antes de uso financeiro real.
