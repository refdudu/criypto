import { useMemo } from "react";
import type { CoinHistoric } from "../services/supabase/SupabaseCoinService";
export const AlertRSIContent=({rsiHistoric}:{rsiHistoric:CoinHistoric[]})=>{
  const {low,high}=useMemo(()=>({
    low:rsiHistoric.filter(x=>x.rsiValue!=null&&x.rsiValue<30),
    high:rsiHistoric.filter(x=>x.rsiValue!=null&&x.rsiValue>70)
  }),[rsiHistoric]);
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <Group title={`Sobrevenda (RSI < 30) · ${low.length}`} values={low} color="border-red-500"/>
    <Group title={`Sobrecompra (RSI > 70) · ${high.length}`} values={high} color="border-green-500"/>
  </div>;
};
function Group({title,values,color}:{title:string;values:CoinHistoric[];color:string}){
  return <section><h2 className="font-semibold mb-3">{title}</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {values.map(x=><article key={`${x.timestamp}_${x.coinId}_${x.interval}`}
        className={`rounded border-l-4 ${color} bg-gray-800 p-3`}>
        <strong>{x.coinId} · {x.interval}</strong>
        <p>RSI: {x.rsiValue?.toFixed(2)} · EMA: {x.emaValue?.toFixed(5)??"—"}</p>
        <p className="text-sm text-gray-300">Fechamento: {x.closePrice}</p>
        <time className="text-xs text-gray-400">{new Date(x.timestamp).toLocaleString("pt-BR")}</time>
      </article>)}
    </div>
    {!values.length&&<p className="text-gray-400">Nenhum registro.</p>}
  </section>;
}
