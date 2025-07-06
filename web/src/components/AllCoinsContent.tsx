import classNames from "classnames";
import moment from "moment";
import type { Dispatch } from "react";
import type { Coin } from "../services/supabase/SupabaseCoinService";

export const AllCoinsContent = ({
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
              key={`${interval.timestamp}_${interval.interval}_${coin.id}`}
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
