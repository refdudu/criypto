import "dotenv/config";

export const lucaWebhook = async (name: string) => {
  const response = await fetch(process.env.LUCA_WEBHOOK_URL || "", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const data = await response.json();
  console.log(data);
};
