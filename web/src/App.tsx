import {
  collection,
  getDocs,
  orderBy,
  query,
  onSnapshot,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { useEffect, useState } from "react";

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
  //   const [coinHistoric, setCoinHistoric] = useState<CoinHistoric[]>([]);

  useEffect(() => {
    const getCoins = async () => {
      const marketDataCol = collection(firestore, "marketData");
      const q = query(marketDataCol, orderBy("timestamp", "desc"));
      const coinSnapshot = await getDocs(q);
      const coinsList = coinSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Coin)
      );
      setCoins(coinsList);

      if (coinsList.length > 0) {
        const coin = coinsList[0];
        setSelectedCoin(coin);
        const interval = coin.intervals?.[0];
        if (interval) setSelectedInterval(interval);
      }
    };
    getCoins();
  }, []);

  useEffect(() => {
    if (selectedCoin) {
      const firstInterval = selectedCoin.intervals?.[0] || null;
      if (!selectedInterval) setSelectedInterval(firstInterval);
    }
  }, [selectedCoin]);

  //   useEffect(() => {
  //     if (!selectedCoin || !selectedInterval) {
  //       setCoinHistoric([]);
  //       return;
  //     }

  //     const historicCollection = collection(
  //       firestore,
  //       `/marketData/${selectedCoin.id}/${selectedInterval}`
  //     );
  //     const q = query(historicCollection, orderBy("timestamp", "asc"));

  //     const unsubscribe = onSnapshot(q, (querySnapshot) => {
  //       const newHistoricData = querySnapshot.docs.map((doc) => {
  //         const data = doc.data();
  //         const timestamp = new Date(data.timestamp).toLocaleString();
  //         return { ...data, timestamp } as CoinHistoric;
  //       });

  //       setCoinHistoric(newHistoricData);
  //     });

  //     return () => {
  //       unsubscribe();
  //     };
  //   }, [selectedCoin, selectedInterval]);

  const changeSelectedCoin = (coin: Coin) => {
    setSelectedCoin(coin);
  };

  const changeSelectedInterval = (interval: string | null) => {
    setSelectedInterval(interval);
  };
  //   const lastHistoric = coinHistoric[coinHistoric.length - 1];
  const intervals = selectedCoin?.intervals || ["1m", "5m"];
  return (
    <div className="bg-gray-900 text-base text-white">
      <Header {...{ changeSelectedInterval, intervals, selectedInterval }} />
      <main className="flex">
        <div className="bg-gray-700 overflow-y-auto h-[calc(100vh-4rem)] w-full max-w-56  flex flex-col">
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
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto h-[calc(100vh-4rem)] p-8">
          <header className="flex justify-between gap-16">
            <h1 className="text-2xl font-bold mb-4">
              {selectedCoin?.id} - {selectedInterval}
            </h1>
            {selectedCoin && (
              <div className="flex flex-col gap-2 text-lg text-gray-300 mb-4">
                <span>
                  Fechamento:{" "}
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(selectedCoin.closePrice)}
                </span>
                <span>RCI: {selectedCoin.rsiValue}</span>
              </div>
            )}
          </header>
          <div className="flex-1 overflow-y-auto  flex flex-col items-center justify-center">
            {/* {coinHistoric.length > 0 && <MyChartRCI data={coinHistoric} />}
            {coinHistoric.length > 0 && <MyChart data={coinHistoric} />} */}
          </div>
        </div>
      </main>
    </div>
  );
};
interface HeaderProps {
  intervals: string[];
  selectedInterval: string | null;
  changeSelectedInterval: (interval: string | null) => void;
}
const Header = ({
  intervals,
  selectedInterval,
  changeSelectedInterval,
}: HeaderProps) => {
  return (
    <header className="h-16 flex px-4 items-center bg-gray-800">
      <select
        value={selectedInterval || ""}
        onChange={(e) => changeSelectedInterval(e.target.value)}
        className="bg-gray-700 text-white p-2 rounded"
      >
        {intervals.map((interval) => (
          <option key={interval} value={interval}>
            {interval}
          </option>
        ))}
      </select>
    </header>
  );
};
// interface IntervalsProps {
//   intervals: string[];
//   selectedInterval: string | null;
//   changeSelectedInterval: (interval: string | null) => void;
// }
// const Intervals = ({
//   intervals,
//   selectedInterval,
//   changeSelectedInterval,
// }: IntervalsProps) => {
//   return (
//     <>
//       {intervals?.map((interval) => (
//         <button
//           className={classNames(
//             "p-4 flex flex-col items-start cursor-pointer hover:bg-gray-600",
//             {
//               "bg-gray-600": selectedInterval === interval,
//               "bg-gray-700": selectedInterval !== interval,
//             }
//           )}
//           key={interval}
//           onClick={() => changeSelectedInterval(interval)}
//         >
//           <span className="">{interval}</span>
//         </button>
//       ))}
//     </>
//   );
// };
// const MyChart = ({ data }: { data: CoinHistoric[] }) => {
//   // Calculate min and max values for Y-axis domain
//   const prices = data.reduce((acc, cur) => {
//     acc.push(cur.highPrice);
//     acc.push(cur.lowPrice);
//     return acc;
//   }, [] as number[]);

//   const yMin = Math.min(...prices);
//   const yMax = Math.max(...prices);
//   const padding = (yMax - yMin) * 0.1; // 10% padding

//   return (
//     <ResponsiveContainer width="100%" height={400}>
//       <LineChart
//         data={data}
//         margin={{
//           top: 5,
//           right: 30,
//           left: 20,
//           bottom: 5,
//         }}
//       >
//         {/* Grade de fundo */}
//         <CartesianGrid strokeDasharray="3 3" />

//         {/* Eixo X (horizontal) - usa a chave 'timestamp' dos dados */}
//         <XAxis dataKey="timestamp" />

//         {/* Eixo Y (vertical) */}
//         {/* <YAxis /> */}
//         <YAxis domain={[yMin - padding, yMax + padding]} />

//         {/* Tooltip (dica) que aparece ao passar o mouse */}
//         <Tooltip
//           content={({ payload }) => {
//             if (!payload?.[0]?.payload) return <></>;
//             const { timestamp, highPrice, lowPrice, rsiValue } =
//               payload?.[0]?.payload;
//             return (
//               <div className="p-2 bg-gray-800 rounded flex flex-col">
//                 <span>Data: {timestamp}</span>
//                 <span>Máximo: {highPrice}</span>
//                 <span>Mínimo: {lowPrice}</span>
//                 <span>RCI: {rsiValue}</span>
//               </div>
//             );
//           }}
//         />

//         {/* Legenda do gráfico */}
//         <Legend />

//         {/* A primeira linha do gráfico - usa a chave 'highPrice' dos dados */}
//         <Line
//           type="monotone"
//           dataKey="highPrice"
//           stroke="#8884d8"
//           activeDot={{ r: 8 }}
//           dot={false}
//         />
//         <Brush dataKey="timestamp" height={30} stroke="#8884d8" />
//         {/* A segunda linha do gráfico - usa a chave 'lowPrice' dos dados */}
//         <Line type="monotone" dataKey="lowPrice" stroke="#82ca9d" dot={false} />
//         {/* <Line type="monotone" dataKey="rsiValue" stroke="#ca8282" dot={false} /> */}

//         {/* <Brush dataKey="lowPrice" height={30} stroke="#82ca9d" /> */}
//       </LineChart>
//     </ResponsiveContainer>
//   );
// };
// const MyChartRCI = ({ data }: { data: CoinHistoric[] }) => {
//   // Calculate min and max values for Y-axis domain
//   const prices = data.reduce((acc, cur) => {
//     acc.push(cur.rsiValue);
//     return acc;
//   }, [] as number[]);

//   const yMin = Math.min(...prices);
//   const yMax = Math.max(...prices);
//   const padding = (yMax - yMin) * 0.1; // 10% padding

//   return (
//     <ResponsiveContainer width="100%" height={100}>
//       <LineChart
//         data={data}
//         margin={{
//           top: 5,
//           right: 30,
//           left: 20,
//           bottom: 5,
//         }}
//       >
//         {/* Grade de fundo */}
//         <CartesianGrid strokeDasharray="3 3" />

//         {/* Eixo X (horizontal) - usa a chave 'timestamp' dos dados */}
//         <XAxis dataKey="timestamp" />

//         {/* Eixo Y (vertical) */}
//         {/* <YAxis /> */}
//         <YAxis domain={[yMin - padding, yMax + padding]} />

//         {/* Tooltip (dica) que aparece ao passar o mouse */}
//         <Tooltip
//           content={({ payload }) => {
//             if (!payload?.[0]?.payload) return <></>;
//             const { timestamp, highPrice, lowPrice, rsiValue } =
//               payload?.[0]?.payload;
//             return (
//               <div className="p-2 bg-gray-800 rounded flex flex-col">
//                 <span>Data: {timestamp}</span>
//                 <span>Máximo: {highPrice}</span>
//                 <span>Mínimo: {lowPrice}</span>
//                 <span>RCI: {rsiValue}</span>
//               </div>
//             );
//           }}
//         />

//         {/* Legenda do gráfico */}
//         {/* <Legend /> */}
//         <Brush dataKey="timestamp" height={30} stroke="#8884d8" />
//         <Line type="monotone" dataKey="rsiValue" stroke="#82ca9d" dot={false} />
//       </LineChart>
//     </ResponsiveContainer>
//   );
// };
