import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CartesianGrid,Legend,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis } from "recharts";
import type { Coin,CoinHistoric } from "../services/supabase/SupabaseCoinService";
import { SupabaseCoinService } from "../services/supabase/SupabaseCoinService";
export function DrawerCoinChart({selectedCoin,onClose,revision}:{
  selectedCoin:Coin|null;onClose:()=>void;revision:number
}){
  const [interval,setInterval]=useState("15m");
  const [data,setData]=useState<CoinHistoric[]>([]);
  const [error,setError]=useState<string|null>(null);
  const symbol=selectedCoin?.id;
  useEffect(()=>{
    if(!symbol)return;
    let active=true;
    void SupabaseCoinService.getHistory(symbol,interval).then(rows=>{
      if(active){setData(rows);setError(null);}
    }).catch((reason:unknown)=>{
      if(active)setError(reason instanceof Error?reason.message:String(reason));
    });
    return ()=>{active=false;};
  },[symbol,interval,revision]);
  if(!selectedCoin)return null;
  return createPortal(<div role="dialog" aria-modal="true" aria-label={`Gráfico ${selectedCoin.id}`}
    className="fixed inset-0 z-50 flex justify-end bg-black/70">
    <div className="w-full max-w-3xl h-full overflow-y-auto bg-gray-800 p-5">
      <div className="flex justify-between items-center gap-3 mb-5">
        <h2 className="font-semibold text-xl">{selectedCoin.id}</h2>
        <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-gray-700">Fechar</button>
      </div>
      <label className="block mb-5">Intervalo
        <select value={interval} onChange={event=>{setData([]);setInterval(event.target.value);}}
          className="block mt-2 rounded bg-gray-700 p-2">
          {["5m","15m","1h"].map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {error&&<p role="alert" className="text-red-300 mb-4">{error}</p>}
      {data.length?<CoinChart data={data}/>:<p className="text-gray-400">Sem dados históricos disponíveis.</p>}
    </div>
  </div>,document.body);
}
export function CoinChart({data}:{data:CoinHistoric[]}){
  return <ResponsiveContainer width="100%" height={400}>
    <LineChart data={data} margin={{top:10,right:25,left:5,bottom:5}}>
      <CartesianGrid strokeDasharray="3 3"/>
      <XAxis dataKey="timestamp" tickFormatter={v=>new Date(v).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}/>
      <YAxis domain={["auto","auto"]}/>
      <Tooltip labelFormatter={v=>new Date(String(v)).toLocaleString("pt-BR")}/>
      <Legend/>
      <Line type="monotone" dataKey="closePrice" name="Fechamento" stroke="#8884d8" dot={false}/>
      <Line type="monotone" dataKey="emaValue" name="EMA21" stroke="#82ca9d" dot={false}/>
    </LineChart>
  </ResponsiveContainer>;
}
