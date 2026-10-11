-- Apply in Supabase SQL editor BEFORE deploying the v3 backend. Non-destructive; abort on duplicate candle keys.
begin;
alter table public.market_data add column if not exists volume numeric;
alter table public.market_data add column if not exists atr_value numeric;
alter table public.market_data add column if not exists relative_volume numeric;
alter table public.indicator_states add column if not exists calc_state jsonb;
alter table public.indicator_states add column if not exists market_timestamp timestamptz;

do $$
begin
  if exists(select 1 from public.market_data group by symbol,interval,"timestamp" having count(*)>1) then
    raise exception 'Duplicate market_data (symbol,interval,timestamp): reconcile historical duplicates before applying migration';
  end if;
end $$;
create unique index if not exists market_data_symbol_interval_timestamp_uq
  on public.market_data(symbol,interval,"timestamp");

create table if not exists public.signal_events (
  event_id text primary key,
  symbol text not null,
  interval text not null,
  direction text not null check (direction in ('BULLISH','BEARISH')),
  occurred_at timestamptz not null,
  payload jsonb not null,
  delivered_targets text[] not null default '{}',
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists signal_events_pending_idx
  on public.signal_events(completed,occurred_at) where completed=false;
alter table public.signal_events enable row level security;
revoke all on public.signal_events from public, anon, authenticated;
grant select,insert,update on public.signal_events to service_role;

-- A single DB transaction publishes candles, indicator state and confirmed signals together.
create or replace function public.persist_market_batch(p_candles jsonb,p_state jsonb,p_event jsonb default null)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare recent jsonb;
begin
  if jsonb_typeof(p_candles)<>'array' or jsonb_array_length(p_candles)=0 then
    raise exception 'Expected nonempty candle array';
  end if;
  if p_state->>'symbol' is null or p_state->>'interval' is null or p_state->>'market_timestamp' is null then
    raise exception 'Incomplete indicator state';
  end if;
  if exists(select 1 from jsonb_array_elements(p_candles) c
    where c->>'symbol' is distinct from p_state->>'symbol'
      or c->>'interval' is distinct from p_state->>'interval') then
    raise exception 'Mixed symbol/interval in batch';
  end if;
  select c into recent from jsonb_array_elements(p_candles) c
    order by (c->>'timestamp')::timestamptz desc limit 1;
  if (recent->>'timestamp')::timestamptz is distinct from (p_state->>'market_timestamp')::timestamptz then
    raise exception 'Snapshot does not match newest candle';
  end if;
  insert into public.market_data(symbol,interval,"timestamp",open_price,high_price,low_price,close_price,volume,ema_value,rsi_value,atr_value,relative_volume)
  select c->>'symbol',c->>'interval',(c->>'timestamp')::timestamptz,
    (c->>'open_price')::numeric,(c->>'high_price')::numeric,(c->>'low_price')::numeric,(c->>'close_price')::numeric,
    (c->>'volume')::numeric,(c->>'ema_value')::numeric,(c->>'rsi_value')::numeric,
    (c->>'atr_value')::numeric,(c->>'relative_volume')::numeric
  from jsonb_array_elements(p_candles) c
  on conflict (symbol,interval,"timestamp") do update set
    open_price=excluded.open_price,high_price=excluded.high_price,low_price=excluded.low_price,
    close_price=excluded.close_price,volume=coalesce(excluded.volume,market_data.volume),
    ema_value=excluded.ema_value,rsi_value=excluded.rsi_value,atr_value=excluded.atr_value,
    relative_volume=excluded.relative_volume;

  insert into public.indicator_states(symbol,interval,last_high_price,last_high_rsi,last_high_timestamp,
    last_low_price,last_low_rsi,last_low_timestamp,armed_divergence_type,armed_confirmation_price,
    armed_at_timestamp,calc_state,market_timestamp,updated_at)
  values(p_state->>'symbol',p_state->>'interval',(p_state->>'last_high_price')::numeric,
    (p_state->>'last_high_rsi')::numeric,(p_state->>'last_high_timestamp')::timestamptz,
    (p_state->>'last_low_price')::numeric,(p_state->>'last_low_rsi')::numeric,(p_state->>'last_low_timestamp')::timestamptz,
    p_state->>'armed_divergence_type',(p_state->>'armed_confirmation_price')::numeric,
    (p_state->>'armed_at_timestamp')::timestamptz,p_state->'calc_state',
    (p_state->>'market_timestamp')::timestamptz,now())
  on conflict (symbol,interval) do update set
    last_high_price=excluded.last_high_price,last_high_rsi=excluded.last_high_rsi,
    last_high_timestamp=excluded.last_high_timestamp,last_low_price=excluded.last_low_price,
    last_low_rsi=excluded.last_low_rsi,last_low_timestamp=excluded.last_low_timestamp,
    armed_divergence_type=excluded.armed_divergence_type,armed_confirmation_price=excluded.armed_confirmation_price,
    armed_at_timestamp=excluded.armed_at_timestamp,calc_state=excluded.calc_state,
    market_timestamp=excluded.market_timestamp,updated_at=now()
  where indicator_states.market_timestamp is null or indicator_states.market_timestamp<=excluded.market_timestamp;

  if p_state->>'interval'='5m' then
    insert into public.symbols(symbol,last_timestamp,last_open_price,last_high_price,last_low_price,last_close_price,last_ema_value,last_rsi_value)
    values(recent->>'symbol',(recent->>'timestamp')::timestamptz,
      (recent->>'open_price')::numeric,(recent->>'high_price')::numeric,(recent->>'low_price')::numeric,
      (recent->>'close_price')::numeric,(recent->>'ema_value')::numeric,(recent->>'rsi_value')::numeric)
    on conflict (symbol) do update set last_timestamp=excluded.last_timestamp,
      last_open_price=excluded.last_open_price,last_high_price=excluded.last_high_price,
      last_low_price=excluded.last_low_price,last_close_price=excluded.last_close_price,
      last_ema_value=excluded.last_ema_value,last_rsi_value=excluded.last_rsi_value
    where symbols.last_timestamp is null or symbols.last_timestamp<=excluded.last_timestamp;
  end if;
  if p_event is not null then
    insert into public.signal_events(event_id,symbol,interval,direction,occurred_at,payload)
    values(p_event->>'event_id',p_state->>'symbol',p_state->>'interval',
      p_event->>'direction',(p_event->>'occurred_at')::timestamptz,p_event->'payload')
    on conflict(event_id) do nothing;
  end if;
end $$;
revoke all on function public.persist_market_batch(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_market_batch(jsonb,jsonb,jsonb) to service_role;
commit;
