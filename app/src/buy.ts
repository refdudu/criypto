// import Binance from "node-binance-api";
// import "dotenv/config";

// async function buyBTCUSDT(amountUSDT: number) {
//   const binance = new Binance({
//     APIKEY: process.env.BINANCE_API_KEY,
//     APISECRET: process.env.BINANCE_API_SECRET,
//     test: true,
//   });
//   try {
//     const ticker = await binance.prices("BTCUSDT");
//     const btcPrice = ticker["BTCUSDT"];
//     if (!btcPrice) {
//       throw new Error("Preço do BTC não encontrado.");
//     }

//     const price = btcPrice;
//     const quantity = amountUSDT / price;
//     const info = await binance.account();
//     console.log("🚀 ~ buyBTCUSDT ~ info:", info.balances.filter(x=>['BTC','USDT'].includes(x.asset)))
//     const exchangeInfo = await binance.exchangeInfo();
//     const btcUsdtRules = exchangeInfo.symbols.find(
//       (s) => s.symbol === "BTCUSDT"
//     );
//     const lotSizeFilter = btcUsdtRules.filters.find(
//       (f) => f.filterType === "LOT_SIZE"
//     );
//     const stepSize = parseFloat(lotSizeFilter.stepSize);
//     const finalQuantity = Math.floor(quantity / stepSize) * stepSize;
//     const order = await binance.marketBuy(
//       "BTCUSDT",
//       parseFloat(finalQuantity.toFixed(6))
//     );
//   } catch (error) {
//     console.error("Erro ao comprar BTC:", error);
//   }
// }
// buyBTCUSDT(9800);
