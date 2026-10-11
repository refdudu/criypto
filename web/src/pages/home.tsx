import { useState } from "react";
import { AlertRSIContent } from "../components/AlertRSIContent";
import { AllCoinsContent } from "../components/AllCoinsContent";
import { useCoinContext } from "../contexts/useCoinContext";
import type { IndicatorState } from "../services/supabase/SupabaseCoinService";

type Tab = "signals" | "coins" | "alerts";
const when = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
function Signals({ rows }: { rows: IndicatorState[] }) {
  const age=(interval:string)=>({"5m":900000,"15m":2700000,"1h":10800000} as Record<string,number>)[interval]??3600000;
  const stale=rows.filter(r=>!Number.isFinite(Date.parse(r.updated_at))||Date.now()-Date.parse(r.updated_at)>age(r.interval));
  const recent=rows.filter(r=>!stale.includes(r));
  const armed=recent.filter(r=>r.armed_divergence_type!=null&&r.armed_at_timestamp!=null);
  const others=recent.filter(r=>!r.armed_divergence_type||!r.armed_at_timestamp);
  const render = (items: IndicatorState[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
      {items.map(row => (
        <article key={row.symbol + row.interval} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <div className="flex justify-between gap-2 items-center">
            <strong>{row.symbol} · {row.interval}</strong>
            {row.armed_divergence_type && <span className={row.armed_divergence_type === "BULLISH" ?
              "text-green-400" : "text-red-400"}>{row.armed_divergence_type === "BULLISH" ? "Alta" : "Baixa"}</span>}
          </div>
          <p className="text-sm text-gray-300 mt-2">RSI topo: {row.last_high_rsi?.toFixed(2) ?? "—"} · fundo: {row.last_low_rsi?.toFixed(2) ?? "—"}</p>
          {row.armed_divergence_type && <p className="text-sm mt-2">Confirmação: {row.armed_confirmation_price ?? "—"}</p>}
          <p className="text-xs text-gray-400 mt-3">{when(row.armed_at_timestamp ?? row.updated_at)}</p>
        </article>
      ))}
    </div>
  );
  return <>
    <h2 className="text-lg font-semibold mb-3">Divergências armadas ({armed.length})</h2>
    {armed.length ? render(armed) : <p className="text-gray-400 mb-8">Nenhum sinal armado.</p>}
    <h2 className="text-lg font-semibold mb-3">Outros indicadores ({others.length})</h2>
    {render(others)}
    {stale.length>0&&<p className="text-sm text-gray-400">Registros antigos ocultados: {stale.length}. Não são sinais atuais.</p>}
  </>;
}
export function HomePage() {
  const { coins, rsiHistoric, indicatorStates, setSelectedCoin, error, loading, refresh } = useCoinContext();
  const [tab, setTab] = useState<Tab>("signals");
  return <main className="max-w-7xl mx-auto p-5">
    <header className="flex flex-wrap gap-4 justify-between items-center mb-6">
      <div><h1 className="text-2xl font-semibold">Criypto</h1>
        <p className="text-sm text-gray-400">Monitor de mercado · sinais não são ordens ou probabilidades de lucro</p></div>
      <button onClick={refresh} type="button" className="rounded border border-gray-600 px-3 py-2">Atualizar</button>
    </header>
    {error && <p role="alert" className="mb-4 border border-red-500 rounded p-3 text-red-300">Erro de dados: {error}</p>}
    {loading && <p className="mb-4 text-gray-400">Carregando dados…</p>}
    <nav aria-label="Visualizações" className="flex gap-2 mb-6">
      {([["signals", "Sinais"], ["coins", "Moedas"], ["alerts", "Histórico RSI"]] as const).map(([value, label]) =>
        <button type="button" key={value} onClick={() => setTab(value)}
          aria-current={tab === value ? "page" : undefined}
          className={`rounded px-4 py-2 ${tab === value ? "bg-gray-600" : "bg-gray-800 hover:bg-gray-700"}`}>{label}</button>)}
    </nav>
    {tab === "signals" && <Signals rows={indicatorStates} />}
    {tab === "coins" && <AllCoinsContent coins={coins} setSelectedCoin={setSelectedCoin} />}
    {tab === "alerts" && <AlertRSIContent rsiHistoric={rsiHistoric} />}
  </main>;
}
