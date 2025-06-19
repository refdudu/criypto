import moment from "moment";
import { useCoinContext } from "../contexts/CoinContext";
import classNames from "classnames";
import { useMemo, useState, type Dispatch } from "react";
import type {
  Coin,
  CoinHistoric,
} from "../services/supabase/SupabaseCoinService";

export const HomePage = () => {
  const [type, setType] = useState<"coins" | "alerts">("coins");
  const [inputText, setInputText] = useState("");
  const { coins, rsiHistoric, setSelectedCoin } = useCoinContext();

  const { _coins, _rsiHistoric } = useMemo(() => {
    const _coins = coins.filter((coin) => {
      const searchText = inputText.toLowerCase();
      return (
        coin.id.toLowerCase().includes(searchText) ||
        coin.intervals.some((interval) =>
          interval.interval.toLowerCase().includes(searchText)
        )
      );
    });
    const _rsiHistoric = rsiHistoric.filter((historic) => {
      const searchText = inputText.toLowerCase();
      return (
        historic.coinId.toLowerCase().includes(searchText) ||
        historic.interval.toLowerCase().includes(searchText)
      );
    });
    return { _coins, _rsiHistoric };
  }, [coins, rsiHistoric, inputText]);

  return (
    <div>
      <header className="flex items-center justify-between gap-4 h-16 px-4 bg-gray-800 c">
        <div className="flex items-center gap-2">
          <h2>{type === "alerts" ? "Alertas" : "Dados em tempo real"}</h2>
          <input
            type="text"
            placeholder="Pesquisar..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="bg-gray-700 p-2 rounded"
          />
        </div>
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
      {type === "coins" && (
        <CoinsData coins={_coins} setSelectedCoin={setSelectedCoin} />
      )}
      {type === "alerts" && <RSIData rsiHistoric={_rsiHistoric} />}
    </div>
  );
};
const CoinsData = ({
  coins,
  setSelectedCoin,
}: {
  coins: Coin[];
  setSelectedCoin: Dispatch<React.SetStateAction<Coin | null>>;
}) => {
  return (
    <div className="grid h-[calc(100vh-4rem)] overflow-y-auto grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
      {coins.map((coin) => (
        <button
          type="button"
          className={
            "p-4 flex-1  justify-center flex flex-col hover:bg-gray-600"
          }
          key={coin.id}
          onClick={() => setSelectedCoin(coin)}
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
        </button>
      ))}
    </div>
  );
};
const RSIData = ({ rsiHistoric }: { rsiHistoric: CoinHistoric[] }) => {
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
