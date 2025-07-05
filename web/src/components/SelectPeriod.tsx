interface HeaderProps {
  intervals: string[];
  selectedInterval: string | null;
  changeSelectedInterval: (interval: string | null) => void;
}
export const SelectPeriod = ({
  intervals,
  selectedInterval,
  changeSelectedInterval,
}: HeaderProps) => {
  return (
    <div className="p-4bg-gray-800">
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
    </div>
  );
};
