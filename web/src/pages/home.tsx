import moment from "moment";
import { useCoinContext } from "../contexts/CoinContext";
import classNames from "classnames";
import { ArrowUpCircle, ArrowDownCircle, Clock } from "lucide-react";

import { useMemo, useState, type Dispatch, type ReactNode } from "react";
import type {
  Coin,
  CoinHistoric,
  IndicatorState,
} from "../services/supabase/SupabaseCoinService";
import { SelectPeriod } from "../components/SelectPeriod";
import { AlertRSIContent } from "../components/AlertRSIContent";
import { AllCoinsContent } from "../components/AllCoinsContent";

type PageType = "coins" | "alerts" | "analysis";

export const HomePage = () => {
  const [type, setType] = useState<PageType>("coins");
  const [inputText, setInputText] = useState("");
  const { coins, rsiHistoric, setSelectedCoin, indicatorStates } =
    useCoinContext();

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
      {type === "coins" && (
        <AllCoinsContent coins={_coins} setSelectedCoin={setSelectedCoin} />
      )}
      {type === "alerts" && <AlertRSIContent rsiHistoric={_rsiHistoric} />}
      {type === "analysis" && <Signals indicatorStates={indicatorStates} />}
    </div>
  );
};

interface HeaderProps {
  type: PageType;
  inputText: string;
  setInputText: (value: string) => void;
  setType: Dispatch<React.SetStateAction<PageType>>;
}

const Header = ({ type, inputText, setInputText, setType }: HeaderProps) => {
  const ButtonHeader = ({
    children,
    type: _type,
  }: {
    children: ReactNode;
    type: PageType;
  }) => (
    <button
      onClick={() => setType(_type)}
      className={classNames("text-white p-2 rounded", {
        "bg-gray-500": type === _type,
        "bg-gray-700": type !== _type,
      })}
    >
      {children}
    </button>
  );

  return (
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
        <SelectPeriod
          changeSelectedInterval={() => {}}
          intervals={["5m", "15m", "30m", "1h", "4h", "1d"]}
          selectedInterval={null}
        />
      </div>
      <div className="flex items-center gap-4">
        <ButtonHeader type="alerts">Alertas</ButtonHeader>
        <ButtonHeader type="analysis">Análise</ButtonHeader>
        <ButtonHeader type="coins">Tempo real</ButtonHeader>
      </div>
    </header>
  );
};

const Signals = ({
  indicatorStates,
}: {
  indicatorStates: IndicatorState[];
}) => {
  // Separar sinais armados dos demais
  const armed = indicatorStates.filter(
    (s) => s.armed_divergence_type && s.armed_at_timestamp
  );
  const others = indicatorStates.filter(
    (s) => !s.armed_divergence_type && !s.armed_at_timestamp
  );

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-2">Sinais Armados</h2>
      {armed.length === 0 && (
        <div className="text-gray-400 mb-4">
          Nenhum sinal armado no momento.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        {armed.map((state) => (
          <div
            key={state.symbol + state.interval + state.updated_at}
            className={`flex flex-col p-4 rounded shadow bg-gray-800 border-l-4 ${
              state.armed_divergence_type === "BULLISH"
                ? "border-green-500"
                : "border-red-500"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-white text-lg">
                {state.symbol} - {state.interval}
              </span>
              {state.armed_divergence_type === "BULLISH" ? (
                <ArrowUpCircle className="text-green-400" size={22} />
              ) : (
                <ArrowDownCircle className="text-red-400" size={22} />
              )}
              <Clock className="text-gray-400 ml-2" size={18} />
            </div>
            <span className="text-gray-300 mb-1">
              RSI topo: <b>{state.last_high_rsi ?? "N/A"}</b> | RSI fundo:{" "}
              <b>{state.last_low_rsi ?? "N/A"}</b>
            </span>
            <span className="text-gray-300 mb-1">
              Preço de confirmação:{" "}
              <b>{state.armed_confirmation_price ?? "N/A"}</b>
            </span>
            <span className="text-gray-400 text-sm mb-1">
              Armado em:{" "}
              {state.armed_at_timestamp
                ? moment(state.armed_at_timestamp).format("DD/MM/YYYY HH:mm")
                : "N/A"}
            </span>
            <span className="text-gray-500 text-xs mt-1">
              Divergência armada:{" "}
              {state.armed_divergence_type === "BULLISH" ? "Alta" : "Baixa"}
            </span>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold mb-2">Outros Sinais</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {others.map((state) => (
          <div
            key={state.symbol + state.interval + state.updated_at}
            className="flex flex-col p-4 rounded shadow bg-gray-700"
          >
            <span className="font-semibold text-white">
              {state.symbol} - {state.interval}
            </span>
            <span className="text-gray-300">
              RSI topo: <b>{state.last_high_rsi ?? "N/A"}</b> | RSI fundo:{" "}
              <b>{state.last_low_rsi ?? "N/A"}</b>
            </span>
            <span className="text-gray-400 text-sm">
              Última atualização:{" "}
              {moment(state.updated_at).format("DD/MM/YYYY HH:mm")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
