import { HistoricalKlineData } from "./interfaces";
import { analyzeStrategy } from "./strategy";
import { enrichHistory,assertContiguous,normalizeHistory,HISTORY_LIMIT,intervalMilliseconds } from "./indicators";

export interface BacktestSettings {
  horizonBars:number;targetAtr:number;stopAtr:number;feeBpsPerSide:number;slippageBpsPerSide:number;
}
export const defaultBacktestSettings:BacktestSettings={
  horizonBars:12,targetAtr:1.5,stopAtr:1,feeBpsPerSide:10,slippageBpsPerSide:5
};
export interface BacktestTrade{
  signalTime:string;direction:"BULLISH"|"BEARISH";entryTime:string;entry:number;exit:number;
  exitReason:"TARGET"|"STOP"|"BOTH_STOP_FIRST"|"HORIZON"|"GAP_STOP"|"GAP_TARGET";netReturn:number;
}
/** Conservative OHLC fills. If a later candle gaps beyond a stop, exit at its opening price. */
export function simulateExit(rows:HistoricalKlineData[],first:number,last:number,direction:1|-1,target:number,stop:number):
  {exit:number;exitIndex:number;reason:BacktestTrade["exitReason"]}{
  let exit=rows[last].closePrice,exitIndex=last,reason:BacktestTrade["exitReason"]="HORIZON";
  for(let j=first;j<=last;j++){
    const bar=rows[j],gapStop=direction>0?bar.openPrice<=stop:bar.openPrice>=stop;
    const gapTarget=direction>0?bar.openPrice>=target:bar.openPrice<=target;
    if(gapStop){exit=bar.openPrice;exitIndex=j;reason="GAP_STOP";break;}
    if(gapTarget){exit=bar.openPrice;exitIndex=j;reason="GAP_TARGET";break;}
    const hitTarget=direction>0?bar.highPrice>=target:bar.lowPrice<=target;
    const hitStop=direction>0?bar.lowPrice<=stop:bar.highPrice>=stop;
    if(hitStop&&hitTarget){exit=stop;exitIndex=j;reason="BOTH_STOP_FIRST";break;}
    if(hitStop){exit=stop;exitIndex=j;reason="STOP";break;}
    if(hitTarget){exit=target;exitIndex=j;reason="TARGET";break;}
  }
  return {exit,exitIndex,reason};
}
export function backtest(raw:HistoricalKlineData[],interval:string,
  settings:BacktestSettings=defaultBacktestSettings):BacktestTrade[]{
  const values=[settings.horizonBars,settings.targetAtr,settings.stopAtr,settings.feeBpsPerSide,settings.slippageBpsPerSide];
  if(!values.every(Number.isFinite)||!Number.isInteger(settings.horizonBars)||settings.horizonBars<1||
    settings.targetAtr<=0||settings.stopAtr<=0||settings.feeBpsPerSide<0||settings.slippageBpsPerSide<0||
    settings.slippageBpsPerSide>=10000)throw new Error("Invalid backtest settings");
  const rows=normalizeHistory(raw,Number.MAX_SAFE_INTEGER);
  assertContiguous(rows,interval); // Do not treat a discontinuous series as consecutive candles.
  if(rows.length<HISTORY_LIMIT+2)return [];
  const series=enrichHistory(rows); // Warm up once, then use exactly the same indicator values as live.
  const step=intervalMilliseconds(interval), trades:BacktestTrade[]=[];
  let lastExit=-1;
  for(let i=HISTORY_LIMIT-1;i+1<series.length;i++){
    if(i<=lastExit)continue;
    const history=series.slice(i-HISTORY_LIMIT+1,i+1);
    const event=analyzeStrategy(history,interval,undefined,true).events.find(e=>
      e.type==="CONFIRMED"&&e.timestamp===Date.parse(series[i].timestamp));
    const atr=series[i].atrValue;
    if(!event||atr==null||atr<=0)continue;
    const direction=event.direction==="BULLISH"?1:-1;
    const next=series[i+1];
    if(Date.parse(next.timestamp)-Date.parse(series[i].timestamp)!==step)throw new Error("Noncontiguous entry");
    const slip=settings.slippageBpsPerSide/10000,fees=2*settings.feeBpsPerSide/10000;
    const entry=next.openPrice*(1+direction*slip);
    const target=entry+direction*settings.targetAtr*atr,stop=entry-direction*settings.stopAtr*atr;
    const end=Math.min(series.length-1,i+settings.horizonBars);
    const result=simulateExit(series,i+1,end,direction as 1|-1,target,stop);
    const {exit,exitIndex,reason}=result;
    const executedExit=exit*(1-direction*slip);
    trades.push({signalTime:series[i].timestamp,direction:event.direction,entryTime:next.timestamp,entry,
      exit:executedExit,exitReason:reason,netReturn:direction*(executedExit-entry)/entry-fees});
    lastExit=exitIndex; // No overlapping trades in the same symbol.
  }
  return trades;
}
export function summarizeBacktest(trades:BacktestTrade[]){
  const wins=trades.filter(t=>t.netReturn>0).length;
  const gains=trades.reduce((s,t)=>s+Math.max(0,t.netReturn),0);
  const losses=trades.reduce((s,t)=>s+Math.max(0,-t.netReturn),0);
  let equity=1,peak=1,maximumDrawdown=0;
  for(const t of trades){equity*=1+t.netReturn;peak=Math.max(peak,equity);maximumDrawdown=Math.max(maximumDrawdown,1-equity/peak);}
  return {trades:trades.length,winRate:trades.length?wins/trades.length:null,
    meanReturn:trades.length?trades.reduce((s,t)=>s+t.netReturn,0)/trades.length:null,
    compoundedReturn:equity-1,maximumDrawdown,profitFactor:losses>0?gains/losses:null};
}
