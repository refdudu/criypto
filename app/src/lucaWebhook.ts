import "dotenv/config";

export const lucaWebhook = async (body: {
  id: string;
  rsi: number;
  ema: number;
  date: Date;
  interval: string;
}) => {
  try {
    const response = await fetch(process.env.LUCA_WEBHOOK_URL || "", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error("Error sending webhook:", error);
  }
};
