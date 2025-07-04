import "dotenv/config";

export const webhook = async (body: object) => {
  try {
    await fetch(process.env.WEBHOOK_URL || "", {
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
