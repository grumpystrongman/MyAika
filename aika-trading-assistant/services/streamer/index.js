import "dotenv/config";
import WebSocket from "ws";

const wsUrl = process.env.COINBASE_WS_URL || "wss://advanced-trade-ws.coinbase.com";
const token = process.env.COINBASE_WS_TOKEN || "";
const productIds = (process.env.COINBASE_WS_PRODUCTS || "BTC-USD").split(",").map(v => v.trim()).filter(Boolean);

if (!token) {
  console.warn("COINBASE_WS_TOKEN missing; streamer will not subscribe.");
}

const ws = new WebSocket(wsUrl);

ws.on("open", () => {
  const payload = {
    type: "subscribe",
    product_ids: productIds,
    channels: ["market_data", "user"],
    token
  };
  ws.send(JSON.stringify(payload));
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === "error") {
      console.error("ws error", msg);
    } else {
      console.log("ws event", msg.type || "message");
    }
  } catch (err) {
    console.error("ws parse error", err);
  }
});

ws.on("close", () => {
  console.log("ws closed");
});

ws.on("error", (err) => {
  console.error("ws error", err);
});
