import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  //   Brush,
} from "recharts";
import type {
  Coin,
  CoinHistoric,
} from "../services/supabase/SupabaseCoinService";
import { createPortal } from "react-dom";
import classNames from "classnames";

interface DrawerCoinChartProps {
  selectedCoin: Coin | null;
  onClose: () => void;
}
export const DrawerCoinChart = ({
  selectedCoin,
  onClose,
}: DrawerCoinChartProps) => {
  //   if (!isVisible) return null;

  const isVisible = !!selectedCoin;
  return createPortal(
    <div
      className={classNames("fixed top-0 left-0 right-0 z-50 flex", {
        "pointer-events-none": !isVisible,
      })}
    >
      <button
        type="button"
        className={classNames(
          "flex-1 bg-black cursor-pointer transition-opacity",
          {
            "opacity-40 delay-100 duration-100": isVisible,
            "opacity-0 pointer-events-none": !isVisible,
          }
        )}
        onClick={onClose}
      />
      <div
        className={classNames(
          "w-full flex items-center justify-center max-w-[50%] h-screen bg-gray-800 p-4 transition duration-100",
          {
            "opacity-100 translate-x-0": isVisible,
            "opacity-0 pointer-events-none translate-x-full": !isVisible,
          }
        )}
      >
        {isVisible && <DrawerContent selectedCoin={selectedCoin} />}
      </div>
    </div>,
    document.body
  );
};

const DrawerContent = ({ selectedCoin }: { selectedCoin: Coin }) => {
  //   useEffect(() => {
  //     console.log("DrawerContent mounted");
  //     return () => {
  //       console.log("DrawerContent unmounted");
  //       // Cleanup logic if needed
  //     };
  //   }, []);

  return (
    <div className="w-full h-full flex-col flex ">
      <span>{selectedCoin.id}</span>
      <CoinChart data={[]} />
    </div>
  );
};

export const CoinChart = ({ data }: { data: CoinHistoric[] }) => {
  // Calculate min and max values for Y-axis domain
  const prices = data.reduce((acc, cur) => {
    acc.push(cur.highPrice);
    acc.push(cur.lowPrice);
    return acc;
  }, [] as number[]);

  const yMin = Math.min(...prices);
  const yMax = Math.max(...prices);
  const padding = (yMax - yMin) * 0.1; // 10% padding

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        {/* Grade de fundo */}
        <CartesianGrid strokeDasharray="3 3" />

        {/* Eixo X (horizontal) - usa a chave 'timestamp' dos dados */}
        <XAxis dataKey="timestamp" />

        {/* Eixo Y (vertical) */}
        {/* <YAxis /> */}
        <YAxis domain={[yMin - padding, yMax + padding]} />

        {/* Tooltip (dica) que aparece ao passar o mouse */}
        <Tooltip
          content={({ payload }) => {
            if (!payload?.[0]?.payload) return <></>;
            const { timestamp, highPrice, closePrice, lowPrice, rsiValue } =
              payload?.[0]?.payload;
            return (
              <div className="p-2 bg-gray-800 rounded flex flex-col">
                <span>Data: {timestamp}</span>
                <span>Máximo: {highPrice}</span>
                <span>Mínimo: {lowPrice}</span>
                <span>Fechamento: {closePrice}</span>
                <span>RSI: {rsiValue}</span>
              </div>
            );
          }}
        />

        {/* Legenda do gráfico */}
        <Legend />

        {/* A primeira linha do gráfico - usa a chave 'highPrice' dos dados */}
        <Line
          type="monotone"
          dataKey="closePrice"
          stroke="#8884d8"
          activeDot={{ r: 8 }}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
