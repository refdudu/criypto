import moment from "moment";
import { useCoinContext } from "../contexts/CoinContext";
import classNames from "classnames";

export const HomePage = () => {
  const { coins } = useCoinContext();
  return (
    <main className="grid h-[calc(100vh-4rem)] overflow-y-auto grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4 p-4">
      {coins.map((coin) => (
        <div
          className={classNames(
            "p-4 flex-1 items-center justify-center flex flex-col hover:bg-gray-600",
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
            EMA: <b>{coin.emaValue}</b>
          </span>
          <span className="text-sm text-gray-300">
            EMA: <b>{moment(coin.timestamp).format("HH:mm:ss MM/DD/YYYY")}</b>
          </span>
        </div>
      ))}
    </main>
  );
};
