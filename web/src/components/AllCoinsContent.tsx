import type { Dispatch,SetStateAction } from "react";
import type { Coin } from "../services/supabase/SupabaseCoinService";
export function AllCoinsContent({coins,setSelectedCoin}:{coins:Coin[];
  setSelectedCoin:Dispatch<SetStateAction<Coin|null>>}){
  return <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
    {coins.map(coin=><button type="button" key={coin.id} onClick={()=>setSelectedCoin(coin)}
      className="p-4 rounded bg-gray-800 text-left hover:bg-gray-700">
      <strong>{coin.id}</strong>
      <p className="text-gray-300 text-sm">{new Intl.NumberFormat("en-US",
        {style:"currency",currency:"USD",maximumFractionDigits:6}).format(coin.closePrice)}</p>
      {coin.intervals.map(x=><div key={x.interval} className="text-xs mt-2 flex justify-between gap-3">
        <span>{x.interval}</span><span>RSI: {x.rsiValue?.toFixed(2)??"—"}</span>
        <span>{new Date(x.timestamp).toLocaleString("pt-BR")}</span>
      </div>)}
    </button>)}
    {!coins.length&&<p className="text-gray-400">Nenhuma moeda disponível.</p>}
  </div>;
}
