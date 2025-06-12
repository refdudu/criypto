import { BrowserRouter, Route, Routes } from "react-router";
import { CoinProvider } from "./contexts/CoinContext";
import { HomePage } from "./pages/home";

export const App = () => {
  return (
    <BrowserRouter>
      <CoinProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </CoinProvider>
    </BrowserRouter>
  );
};
