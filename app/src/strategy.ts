import { HistoricalKlineData, Pivot, ArmedDivergence } from "./interfaces";
import { enrichHistory, intervalMilliseconds, normalizeHistory } from "./indicators";

export interface StrategySettings {
  pivotLeft:number; pivotRight:number; maxPivotBars:number; minPivotBars:number;
  minRsiDifference:number; expiryBars:number; atrBreakoutBuffer:number; atrInvalidationBuffer:number;
}
export const strategySettings:StrategySettings = {
  pivotLeft:2,pivotRight:2,maxPivotBars:60,minPivotBars:3,minRsiDifference:3,
  expiryBars:14,atrBreakoutBuffer:0,atrInvalidationBuffer:0.25
};
export interface StrategyEvent {
  type:"CONFIRMED"|"INVALIDATED"|"EXPIRED";
  direction:"BULLISH"|"BEARISH"; timestamp:number; confirmationPrice:number;
}
export interface StrategySnapshot {
  lastHigh:Pivot|null;lastLow:Pivot|null;armedDivergence:ArmedDivergence|null;events:StrategyEvent[];
}
const time=(c:HistoricalKlineData)=>Date.parse(c.timestamp);
function pivotAt(rows:HistoricalKlineData[],i:number,left:number,right:number,type:"HIGH"|"LOW"):boolean {
  if (rows[i].rsiValue==null || i<left || i+right>=rows.length) return false;
  for(let j=i-left;j<=i+right;j++) if(j!==i && (type==="LOW" ?
    rows[j].lowPrice<=rows[i].lowPrice : rows[j].highPrice>=rows[i].highPrice)) return false;
  return true;
}
/** Full chronological replay. precomputed=true is mandatory for the live rolling window. */
export function analyzeStrategy(raw:HistoricalKlineData[],interval:string,
  options:StrategySettings=strategySettings,precomputed=false):StrategySnapshot {
  if (!Number.isInteger(options.pivotLeft)||options.pivotLeft<1||!Number.isInteger(options.pivotRight)||options.pivotRight<1||
    options.minPivotBars<1||options.maxPivotBars<options.minPivotBars||options.expiryBars<1||
    options.minRsiDifference<0||options.atrBreakoutBuffer<0||options.atrInvalidationBuffer<0) throw new Error("Invalid strategy settings");
  const rows=precomputed?normalizeHistory(raw,Number.MAX_SAFE_INTEGER):enrichHistory(raw);
  const events:StrategyEvent[]=[];
  let lastHigh:Pivot|null=null,lastLow:Pivot|null=null,lastHighIndex=-1,lastLowIndex=-1;
  let armedDivergence:ArmedDivergence|null=null;
  const step=intervalMilliseconds(interval);
  for(let i=0;i<rows.length;i++){
    const current=rows[i],now=time(current);
    if(armedDivergence){
      const a=armedDivergence, direction=a.type;
      const emit=(type:StrategyEvent["type"])=>events.push({type,direction,timestamp:now,confirmationPrice:a.confirmationPrice});
      if(now-a.armedAtTimestamp>=options.expiryBars*step){emit("EXPIRED");armedDivergence=null;}
      else if(direction==="BULLISH"?current.closePrice<a.invalidationPrice:current.closePrice>a.invalidationPrice){
        emit("INVALIDATED");armedDivergence=null;
      }else{
        const buffer=(current.atrValue??0)*options.atrBreakoutBuffer;
        if(direction==="BULLISH"?current.closePrice>a.confirmationPrice+buffer:current.closePrice<a.confirmationPrice-buffer){
          emit("CONFIRMED");armedDivergence=null;
        }
      }
    }
    const p=i-options.pivotRight;
    if(p<options.pivotLeft) continue;
    const candidate=rows[p],rsi=candidate.rsiValue;
    if(rsi==null)continue;
    const pivotTime=time(candidate);
    if(pivotAt(rows,p,options.pivotLeft,options.pivotRight,"LOW")){
      const distance=p-lastLowIndex;
      if(!armedDivergence&&lastLow&&distance>=options.minPivotBars&&distance<=options.maxPivotBars&&
        candidate.lowPrice<lastLow.price&&rsi>=lastLow.rsi+options.minRsiDifference&&
        (rsi<30||lastLow.rsi<30)){
        const between=rows.slice(lastLowIndex+1,p);
        if(between.length)armedDivergence={type:"BULLISH",
          confirmationPrice:Math.max(...between.map(c=>c.highPrice)),
          invalidationPrice:candidate.lowPrice-(candidate.atrValue??0)*options.atrInvalidationBuffer,
          armedAtTimestamp:now,secondPivotTimestamp:pivotTime};
      }
      lastLow={price:candidate.lowPrice,rsi,timestamp:pivotTime};lastLowIndex=p;
    }
    if(pivotAt(rows,p,options.pivotLeft,options.pivotRight,"HIGH")){
      const distance=p-lastHighIndex;
      if(!armedDivergence&&lastHigh&&distance>=options.minPivotBars&&distance<=options.maxPivotBars&&
        candidate.highPrice>lastHigh.price&&rsi<=lastHigh.rsi-options.minRsiDifference&&
        (rsi>70||lastHigh.rsi>70)){
        const between=rows.slice(lastHighIndex+1,p);
        if(between.length)armedDivergence={type:"BEARISH",
          confirmationPrice:Math.min(...between.map(c=>c.lowPrice)),
          invalidationPrice:candidate.highPrice+(candidate.atrValue??0)*options.atrInvalidationBuffer,
          armedAtTimestamp:now,secondPivotTimestamp:pivotTime};
      }
      lastHigh={price:candidate.highPrice,rsi,timestamp:pivotTime};lastHighIndex=p;
    }
  }
  return {lastHigh,lastLow,armedDivergence,events};
}
