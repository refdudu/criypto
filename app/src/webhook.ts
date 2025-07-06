import "dotenv/config";

export const webhook = async (url: string, body: object) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    console.log(response.status, response.statusText);
  } catch (error) {
    console.error("Error sending webhook:", error);
  }
};

export const webhookList = async (body: object) => {
  if (process.env.LUCA_WEBHOOK_URL)
    webhook(process.env.LUCA_WEBHOOK_URL || "", body);
  if (process.env.WEBHOOK_SITE) webhook(process.env.WEBHOOK_SITE || "", body);
};
