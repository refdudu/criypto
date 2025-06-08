interface HeaderProps {
  intervals: string[];
  selectedInterval: string | null;
  changeSelectedInterval: (interval: string | null) => void;
}
export const Header = ({
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
