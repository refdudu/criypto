import "dotenv/config";

export const webhook = async (body: object) => {
  try {
    const response = await fetch(process.env.WEBHOOK_URL || "", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    console.log("Webhook response status:", response.status);
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error("Error sending webhook:", error);
  }
};
