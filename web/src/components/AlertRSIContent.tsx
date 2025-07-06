import classNames from "classnames";
import moment from "moment";
import { useMemo } from "react";
import type { CoinHistoric } from "../services/supabase/SupabaseCoinService";

export const AlertRSIContent = ({ rsiHistoric }: { rsiHistoric: CoinHistoric[] }) => {
  const group = useMemo(() => {
    const group = rsiHistoric.reduce((acc, historic) => {
      if (!historic.rsiValue) return acc;

      const key = historic.rsiValue < 35 ? "buy" : "sell";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(historic);
      return acc;
    }, {} as Record<string, CoinHistoric[]>);
    return group;
  }, [rsiHistoric]);

  const buyGroup = group["buy"] || [];
  const sellGroup = group["sell"] || [];

  return (
    <div className="grid grid-cols-2">
      <GroupContainer
        historicList={buyGroup}
        // title={`Comprar ${buyGroup.length}`}
      />
      <GroupContainer
        historicList={sellGroup}
        // title={`Vender ${sellGroup.length}`}
      />
    </div>
  );
};
interface GroupContainerProps {
  historicList: CoinHistoric[];
}
const GroupContainer = ({ historicList }: GroupContainerProps) => {
  return (
    <div className="p-4 grid h-[calc(100vh-4rem)] overflow-y-auto grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {historicList.map((historic) => (
        <CardRSIItem
          key={`${historic.timestamp}_${historic.coinId}_${historic.interval}`}
          {...{ historic }}
        />
      ))}
    </div>
  );
};
interface RSIHistoricItemProps {
  historic: CoinHistoric;
}
const CardRSIItem = ({ historic }: RSIHistoricItemProps) => {
  const isHigh = historic.emaValue && historic.closePrice > historic.emaValue;
  return (
    <div
      className={classNames("p-4 flex-1  justify-center flex flex-col", {
        "bg-red-600": historic.rsiValue && historic.rsiValue < 35,
        "bg-green-600": historic.rsiValue && historic.rsiValue > 70,
      })}
    >
      <div>
        <span className="">
          {historic.coinId} {isHigh ? "🔼" : "🔽"}
        </span>
      </div>

      <span className="text-sm text-gray-300">
        Ema: <b>{historic.emaValue?.toFixed(5)}</b>
      </span>
      <span className="text-sm text-gray-300">
        Valor: <b>{historic.closePrice.toFixed(5)}</b>
      </span>
      <span className="text-sm text-gray-300">
        Intervalo: <b>{historic.interval}</b>
      </span>

      <span className="text-sm text-gray-300">
        RSI: <b>{historic.rsiValue?.toFixed(2)}</b>
      </span>
      <span className="text-sm text-gray-300">
        Date: <b>{moment(historic.timestamp).format("HH:mm MM/DD/YY")}</b>
      </span>
    </div>
  );
};
