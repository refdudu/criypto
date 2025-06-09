import moment from "moment";
import { useCoinContext } from "../contexts/CoinContext";
import classNames from "classnames";
import { useEffect, useState } from "react";
import type { CoinHistoric } from "../services/CoinService";
import { SupabaseCoinService } from "../services/supabase/SupabaseCoinService";

export const HomePage = () => {
  const [type, setType] = useState<"coins" | "alerts">("coins");
  return (
    <div>
      <header className="flex items-center justify-between gap-4 h-16 px-4 bg-gray-800">
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
      <div className="grid h-[calc(100vh-4rem)] overflow-y-auto grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4 p-4">
        {type === "coins" ? <CoinsData /> : <RCIData />}
      </div>
    </div>
  );
};
const CoinsData = () => {
  const { coins } = useCoinContext();

  return coins.map((coin) => (
    <div
      className={classNames(
        "p-4 flex-1  justify-center flex flex-col hover:bg-gray-600",
        {
          "bg-red-600": coin.rsiValue && coin.rsiValue < 35,
          "bg-green-600": coin.rsiValue && coin.rsiValue > 70,
        }
      )}
      key={coin.id}
      onClick={() => {}}
    >
      <span className="">{coin.id}</span>
      <span className="text-sm text-gray-300">
        {new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(coin.closePrice)}
      </span>
      <span className="text-sm text-gray-300">
        RSI: <b>{coin.rsiValue?.toFixed(2)}</b>
      </span>
      <span className="text-sm text-gray-300">
        Date: <b>{moment(coin.timestamp).format("HH:mm MM/DD/YY")}</b>
      </span>
    </div>
  ));
};
const RCIData = () => {
  const [rciHistoric, setRciHistoric] = useState<CoinHistoric[]>([]);
  useEffect(() => {
    const get = async () => {
      const data = await SupabaseCoinService.getIntervalsAlert();
      setRciHistoric(data);
    };
    get();
  }, []);
  useEffect(() => {
    const channel = SupabaseCoinService.watchIntervals(setRciHistoric);
    console.log("Effect for RCIData");
    return () => {
      if (channel) channel.unsubscribe();
    };
  }, []);

  return rciHistoric.map((historic) => {
    return (
      <div
        className={classNames(
          "p-4 flex-1  justify-center flex flex-col",
          {
            "bg-red-600": historic.rsiValue && historic.rsiValue < 35,
            "bg-green-600": historic.rsiValue && historic.rsiValue > 70,
          }
        )}
        key={`${historic.coinId}-${historic.interval}-${historic.timestamp}`}
        onClick={() => {}}
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
  });
};
