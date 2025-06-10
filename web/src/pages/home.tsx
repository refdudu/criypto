import moment from "moment";
import { useCoinContext } from "../contexts/CoinContext";
import classNames from "classnames";
import { useMemo, useState } from "react";
import type { CoinHistoric } from "../services/CoinService";

export const HomePage = () => {
  const [type, setType] = useState<"coins" | "alerts">("coins");
  return (
    <div>
      <header className="flex items-center justify-between gap-4 h-16 px-4 bg-gray-800 c">
        <h2>{type === "alerts" ? "Alertas" : "Dados em tempo real"}</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setType("alerts")}
            className={classNames("text-white p-2 rounded", {
              "bg-gray-500": type === "alerts",
              "bg-gray-700": type !== "alerts",
            })}
          >
            Alertas
          </button>
          <button
            onClick={() => setType("coins")}
            className={classNames("text-white p-2 rounded", {
              "bg-gray-500": type === "coins",
              "bg-gray-700": type !== "coins",
            })}
          >
            Tempo real
          </button>
        </div>
      </header>
      {type === "coins" && <CoinsData />}
      {type === "alerts" && <RCIData />}
    </div>
  );
};
const CoinsData = () => {
  const { coins } = useCoinContext();

  return (
    <div className="grid h-[calc(100vh-4rem)] overflow-y-auto grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
      {coins.map((coin) => (
        <div
          className={
            "p-4 flex-1  justify-center flex flex-col hover:bg-gray-600"
          }
          key={coin.id}
          onClick={() => {}}
        >
          <span className="">{coin.id}</span>
          <span className="text-sm text-gray-300">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
              //   unitDisplay: "long",
            }).format(coin.closePrice)}
          </span>

          {coin.intervals.map((interval) => (
            <div
              key={interval.timestamp}
              className={classNames(
                {
                  "bg-red-600": interval.rsiValue && interval.rsiValue < 35,
                  "bg-green-600": interval.rsiValue && interval.rsiValue > 70,
                },
                "text-sm flex justify-between text-gray-300"
              )}
            >
              <span className="w-9 font-bold">{interval.interval}</span>
              <span className="w-9">{interval.rsiValue?.toFixed(2)}</span>
              <span className="font-bold">
                {moment(interval.timestamp).format("HH:mm DD/MM")}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
const RCIData = () => {
  const { rciHistoric } = useCoinContext();

  const group = useMemo(() => {
    const group = rciHistoric.reduce((acc, historic) => {
      if (!historic.rsiValue) return acc;

      const key = historic.rsiValue < 35 ? "buy" : "sell";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(historic);
      return acc;
    }, {} as Record<string, CoinHistoric[]>);
    return group;
  }, [rciHistoric]);

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
        <CardRCIItem
          key={`${historic.timestamp}_${historic.coinId}_${historic.interval}`}
          {...{ historic }}
        />
      ))}
    </div>
  );
};

interface RCIHistoricItemProps {
  historic: CoinHistoric;
}
const CardRCIItem = ({ historic }: RCIHistoricItemProps) => {
  return (
    <div
      className={classNames("p-4 flex-1  justify-center flex flex-col", {
        "bg-red-600": historic.rsiValue && historic.rsiValue < 35,
        "bg-green-600": historic.rsiValue && historic.rsiValue > 70,
      })}
    >
      <span className="">{historic.coinId}</span>
      <span className="text-sm text-gray-300">
        Valor:{" "}
        <b>
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(historic.closePrice)}
        </b>
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
