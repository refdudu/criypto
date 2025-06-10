import Binance from "node-binance-api";
import "dotenv/config";

async function buyBTCUSDT(amountUSDT: number) {
  const binance = new Binance({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET,
    test: true,
  });
  try {
    const ticker = await binance.prices("BTCUSDT");
    console.log("🚀 ~ buyBTCUSDT ~ ticker:", ticker);
    const btcPrice = ticker["BTCUSDT"];
    if (!btcPrice) {
      throw new Error("Preço do BTC não encontrado.");
    }
    const price = btcPrice;

    const quantity = amountUSDT / price;

    console.log(`Comprando aproximadamente ${quantity} BTC a ${price} USDT`);
    console.log(binance.getInfo());
    const info = await binance.account();
    console.log("🚀 ~ buyBTCUSDT ~ info:", info);

    // const order = await binance.marketBuy("BTCUSDT", quantity);
    // console.log("Ordem executada:", order);
  } catch (error) {
    console.error("Erro ao comprar BTC:", error);
  }
}
buyBTCUSDT(1);
