import { useCallback, useEffect, useRef, useState } from "react";
import { SupabaseCoinService, type Coin, type CoinHistoric, type IndicatorState } from "../services/supabase/SupabaseCoinService";
import { DrawerCoinChart } from "../components/CoinChart";
import { CoinContext } from "./CoinState";
export function CoinProvider({children}:{children:React.ReactNode}){
  const [coins,setCoins]=useState<Coin[]>([]);
  const [rsiHistoric,setRsiHistoric]=useState<CoinHistoric[]>([]);
  const [selectedCoin,setSelectedCoin]=useState<Coin|null>(null);
  const [indicatorStates,setIndicatorStates]=useState<IndicatorState[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  const sequence=useRef(0);
  const active=useRef(false);
  const refresh=useCallback(()=>{
    const request=++sequence.current;
    void Promise.all([SupabaseCoinService.getCoins(),SupabaseCoinService.getIntervalsAlert(),
      SupabaseCoinService.getIndicatorStates()]).then(([nextCoins,alerts,states])=>{
      if(!active.current||request!==sequence.current)return;
      setCoins(nextCoins);setRsiHistoric(alerts);setIndicatorStates(states);setError(null);
      setRevision(n=>n+1);
    }).catch((reason:unknown)=>{
      if(active.current&&request===sequence.current)setError(reason instanceof Error?reason.message:String(reason));
    }).finally(()=>{if(active.current&&request===sequence.current)setLoading(false);});
  },[]);
  useEffect(()=>{
    active.current=true;refresh();
    let delayed:ReturnType<typeof setTimeout>|undefined;
    const notify=()=>{if(delayed)clearTimeout(delayed);delayed=setTimeout(refresh,750);};
    const channel=SupabaseCoinService.watch(notify);
    const timer=setInterval(refresh,60000);
    return ()=>{active.current=false;sequence.current++;clearInterval(timer);
      if(delayed)clearTimeout(delayed);void channel.unsubscribe();};
  },[refresh]);
  return <CoinContext.Provider value={{coins,rsiHistoric,setSelectedCoin,indicatorStates,error,loading,refresh,revision}}>
    <DrawerCoinChart selectedCoin={selectedCoin} onClose={()=>setSelectedCoin(null)} revision={revision}/>
    <div className="bg-gray-900 min-h-screen text-base text-white relative">{children}</div>
  </CoinContext.Provider>;
}
