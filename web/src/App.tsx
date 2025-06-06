import {
  collection,
  getDocs,
  getDoc,
  collectionGroup,
  doc,
  orderBy,
  query,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { use, useEffect, useState } from "react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";
import classNames from "classnames";

interface Coin {
  closePrice: number;
  emaValue: number;
  highPrice: number;
  id: string;
  lowPrice: number;
  openPrice: number;
  rsiValue: number;
  timestamp: string;
  intervals: string[];
}
interface CoinHistoric {
  closePrice: number;
  emaValue: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  rsiValue: number;
  timestamp: string;
}

export const App = () => {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<string | null>(null);
  const [coinHistoric, setCoinHistoric] = useState<CoinHistoric[]>([]);

  const changeSelectedCoin = (coin: Coin) => {
    setSelectedCoin(coin);
  };
  const getOnChangeInterval = async (interval: string | null) => {
    if (!selectedCoin) return;
    const _collection = collection(
      firestore,
      `/marketData/${selectedCoin?.id}/${interval}`
    );
    const orderCollection = orderBy("timestamp", "asc");

    const coinDocRef = await getDocs(query(_collection, orderCollection));
    coinDocRef.docChanges().forEach((change) => {
      if (change.type === "added") {
        const timestamp = new Date(change.doc.data().timestamp).toLocaleString();
        console.log("New coin: ", { ...change.doc.data(), timestamp });
      }
      if (change.type === "modified") {
        console.log("Modified coin: ", change.doc.data());
      }
      if (change.type === "removed") {
        console.log("Removed coin: ", change.doc.data());
      }
    });
    // console.log("🚀 ~ coinDocRef:", coinDocRef);
    const _coinHistoric = coinDocRef.docs.map((x) => {
      const timestamp = new Date(x.data().timestamp).toLocaleString();
      return {
        ...x.data(),
        timestamp,
      } as CoinHistoric;
    });
    
  };
  const changeSelectedInterval = async (interval: string | null) => {
    setSelectedInterval(interval);
    getOnChangeInterval(interval);
  };

  useEffect(() => {
    const get = async () => {
      const intervalStateDocRef = await getDocs(
        collection(firestore, "marketData")
      );
      //   console.log("🚀 ~ intervalStateDocRef:", intervalStateDocRef);
      const _coins = intervalStateDocRef.docs.map(
        (x) =>
          ({
            id: x.id,
            ...x.data(),
          } as Coin)
      );
      setCoins(_coins);
    };
    get();
  }, []);

  useEffect(() => {
    if (!selectedCoin) return;
    // Carrega o primeiro intervalo por padrão
    const firstInterval = selectedCoin.intervals?.[0] || null;
    setSelectedInterval(firstInterval);
    getOnChangeInterval(firstInterval);
  }, [selectedCoin]);

  //   useEffect(() => {
  //     if (!selectedInterval) return;
  //   }, [selectedInterval]);
  return (
    <div className="w-screen flex bg-gray-900 text-base text-white">
      <div className="bg-gray-700 overflow-y-auto h-screen w-full max-w-48  flex flex-col">
        {coins.map((coin) => (
          <button
            className={classNames(
              "p-4 flex flex-col items-start cursor-pointer hover:bg-gray-600",
              {
                "bg-gray-600": selectedCoin?.id === coin.id,
                "bg-gray-700": selectedCoin?.id !== coin.id,
              }
            )}
            key={coin.id}
            onClick={() => changeSelectedCoin(coin)}
          >
            <span className="">{coin.id}</span>
            <span className="text-sm text-gray-300">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(coin.closePrice)}
            </span>

            {/* <p>Close Price: {coin.closePrice}</p>
            <p>EMA Value: {coin.emaValue}</p>
            <p>High Price: {coin.highPrice}</p>
            <p>Low Price: {coin.lowPrice}</p>
            <p>Open Price: {coin.openPrice}</p>
            <p>RSI Value: {coin.rsiValue}</p>
            <p>Timestamp: {coin.timestamp}</p> */}
          </button>
        ))}
      </div>
      <div className="bg-gray-700 overflow-y-auto h-screen w-full max-w-32  flex flex-col">
        {selectedCoin && (
          <Intervals
            intervals={selectedCoin?.intervals}
            selectedInterval={selectedInterval}
            changeSelectedInterval={changeSelectedInterval}
          />
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {coinHistoric.length > 0 && <MyChartRCI data={coinHistoric} />}
        {coinHistoric.length > 0 && <MyChart data={coinHistoric} />}
      </div>
    </div>
  );
};

interface IntervalsProps {
  intervals: string[];
  selectedInterval: string | null;
  changeSelectedInterval: (interval: string | null) => void;
}
const Intervals = ({
  intervals,
  selectedInterval,
  changeSelectedInterval,
}: IntervalsProps) => {
  return (
    <>
      {intervals?.map((interval) => (
        <button
          className={classNames(
            "p-4 flex flex-col items-start cursor-pointer hover:bg-gray-600",
            {
              "bg-gray-600": selectedInterval === interval,
              "bg-gray-700": selectedInterval !== interval,
            }
          )}
          key={interval}
          onClick={() => changeSelectedInterval(interval)}
        >
          <span className="">{interval}</span>
        </button>
      ))}
    </>
  );
};
const MyChart = ({ data }: { data: CoinHistoric[] }) => {
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
            const { timestamp, highPrice, lowPrice, rsiValue } =
              payload?.[0]?.payload;
            return (
              <div className="p-2 bg-gray-800 rounded flex flex-col">
                <span>Data: {timestamp}</span>
                <span>Máximo: {highPrice}</span>
                <span>Mínimo: {lowPrice}</span>
                <span>RCI: {rsiValue}</span>
              </div>
            );
          }}
        />

        {/* Legenda do gráfico */}
        <Legend />

        {/* A primeira linha do gráfico - usa a chave 'highPrice' dos dados */}
        <Line
          type="monotone"
          dataKey="highPrice"
          stroke="#8884d8"
          activeDot={{ r: 8 }}
          dot={false}
        />
        <Brush dataKey="timestamp" height={30} stroke="#8884d8" />
        {/* A segunda linha do gráfico - usa a chave 'lowPrice' dos dados */}
        <Line type="monotone" dataKey="lowPrice" stroke="#82ca9d" dot={false} />
        {/* <Line type="monotone" dataKey="rsiValue" stroke="#ca8282" dot={false} /> */}

        {/* <Brush dataKey="lowPrice" height={30} stroke="#82ca9d" /> */}
      </LineChart>
    </ResponsiveContainer>
  );
};
const MyChartRCI = ({ data }: { data: CoinHistoric[] }) => {
  // Calculate min and max values for Y-axis domain
  const prices = data.reduce((acc, cur) => {
    acc.push(cur.rsiValue);
    return acc;
  }, [] as number[]);

  const yMin = Math.min(...prices);
  const yMax = Math.max(...prices);
  const padding = (yMax - yMin) * 0.1; // 10% padding

  return (
    <ResponsiveContainer width="100%" height={100}>
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
            const { timestamp, highPrice, lowPrice, rsiValue } =
              payload?.[0]?.payload;
            return (
              <div className="p-2 bg-gray-800 rounded flex flex-col">
                <span>Data: {timestamp}</span>
                <span>Máximo: {highPrice}</span>
                <span>Mínimo: {lowPrice}</span>
                <span>RCI: {rsiValue}</span>
              </div>
            );
          }}
        />

        {/* Legenda do gráfico */}
        {/* <Legend /> */}

        <Line type="monotone" dataKey="rsiValue" stroke="#82ca9d" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};
