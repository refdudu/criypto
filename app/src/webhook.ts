import "dotenv/config";

export const webhook = async (url: string, body: object) => {
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("Error sending webhook:", error);
  }
};

export const lucaWebhook = async (body: {
  id: string;
  rsi: number;
  ema: number;
  date: Date;
  interval: string;
}) => webhook(process.env.LUCA_WEBHOOK_URL || "", body);
