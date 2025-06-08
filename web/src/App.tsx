import { BrowserRouter, Route, Routes } from "react-router";
import { CoinProvider } from "./contexts/CoinContext";
import { Charts } from "./pages/charts";
import { HomePage } from "./pages/home";

export const App = () => {
  return (
    <BrowserRouter>
      <CoinProvider>
        <Routes>
          <Route path="/charts" element={<Charts />} />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </CoinProvider>
    </BrowserRouter>
  );
};
