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
import type { CoinHistoric } from "../services/CoinService";

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
          dataKey="closePrice"
          stroke="#8884d8"
          activeDot={{ r: 8 }}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
