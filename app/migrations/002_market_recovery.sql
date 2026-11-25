-- Apply after 001 and before deploying the recovery worker. Stop old writers first.
begin;
create or replace function public.persist_market_recovery_batch(
  p_candles jsonb,p_state jsonb,p_expected_timestamp timestamptz,p_events jsonb
) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_ts timestamptz; next_ts timestamptz; e jsonb; policy text;
begin
  if p_state->>'symbol' is null or p_state->>'interval' is null or p_state->>'market_timestamp' is null
    or jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'Invalid recovery batch';
  end if;
  -- Serialize cooperating workers even if the indicator row does not exist yet.
  perform pg_advisory_xact_lock(hashtextextended((p_state->>'symbol')||':'||(p_state->>'interval'),0));
  select market_timestamp into current_ts from public.indicator_states
    where symbol=p_state->>'symbol' and interval=p_state->>'interval' for update;
  if current_ts is distinct from p_expected_timestamp then
    raise exception 'Checkpoint changed; reload before writing' using errcode='40001';
  end if;
  next_ts := (p_state->>'market_timestamp')::timestamptz;
  if current_ts is not null and (next_ts<=current_ts or exists(
    select 1 from jsonb_array_elements(p_candles) c where (c->>'timestamp')::timestamptz<=current_ts
  )) then
    raise exception 'Recovery batch must advance checkpoint';
  end if;
  -- The existing RPC checks batch identity/newest timestamp and writes candles and indicator state.
  perform public.persist_market_batch(p_candles,p_state,null);
  for e in select value from jsonb_array_elements(p_events) loop
    policy := e->'payload'->>'deliveryPolicy';
    if policy is null or policy not in ('notify','historical','disabled_interval')
      or e->'payload'->>'symbol' is distinct from p_state->>'symbol'
      or e->'payload'->>'interval' is distinct from p_state->>'interval'
      or e->'payload'->>'eventId' is distinct from e->>'event_id'
      or not exists(select 1 from jsonb_array_elements(p_candles) c
        where (c->>'timestamp')::timestamptz=(e->'payload'->>'candleOpenTime')::timestamptz)
    then raise exception 'Invalid signal in recovery batch'; end if;
    insert into public.signal_events(event_id,symbol,interval,direction,occurred_at,payload,completed)
      values(e->>'event_id',p_state->>'symbol',p_state->>'interval',e->>'direction',
        (e->>'occurred_at')::timestamptz,e->'payload',policy<>'notify')
      on conflict(event_id) do nothing;
  end loop;
end $$;
revoke all on function public.persist_market_recovery_batch(jsonb,jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.persist_market_recovery_batch(jsonb,jsonb,timestamptz,jsonb) to service_role;
commit;
