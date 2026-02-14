function resolveFeed(feed) {
  const normalized = String(feed || "iex").toLowerCase();
  return normalized === "sip" ? "sip" : "iex";
}

function getAlpacaKeys() {
  const key = process.env.ALPACA_DATA_KEY || process.env.ALPACA_API_KEY || "";
  const secret = process.env.ALPACA_DATA_SECRET || process.env.ALPACA_API_SECRET || "";
  return { key, secret };
}

export function createAlpacaTradeStream({ symbol, feed = "iex", onTrade, onStatus, onError } = {}) {
  if (typeof WebSocket === "undefined") {
    throw new Error("websocket_not_available");
  }
  const { key, secret } = getAlpacaKeys();
  if (!key || !secret) {
    throw new Error("alpaca_data_not_configured");
  }
  const resolvedFeed = resolveFeed(feed);
  const url = resolvedFeed === "sip"
    ? "wss://stream.data.alpaca.markets/v2/sip"
    : "wss://stream.data.alpaca.markets/v2/iex";

  const ws = new WebSocket(url);
  let closed = false;

  const safeStatus = (status, detail) => {
    if (typeof onStatus === "function") onStatus(status, detail);
  };

  const safeError = (err) => {
    if (typeof onError === "function") onError(err);
  };

  ws.addEventListener("open", () => {
    safeStatus("connected");
    ws.send(JSON.stringify({ action: "auth", key, secret }));
  });

  ws.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    const messages = Array.isArray(payload) ? payload : [payload];
    for (const msg of messages) {
      const type = msg?.T || msg?.type;
      if (type === "error") {
        safeError(new Error(msg?.msg || "alpaca_stream_error"));
        continue;
      }
      if (type === "success" && msg?.msg === "authenticated") {
        ws.send(JSON.stringify({ action: "subscribe", trades: [symbol] }));
        safeStatus("authenticated");
        continue;
      }
      if (type === "subscription") {
        safeStatus("subscribed");
        continue;
      }
      if (type === "t" && msg?.S === symbol) {
        if (typeof onTrade === "function") {
          onTrade({
            price: Number(msg?.p),
            size: Number(msg?.s || 0),
            timestamp: msg?.t || new Date().toISOString(),
            exchange: msg?.x || null
          });
        }
      }
    }
  });

  ws.addEventListener("error", (err) => {
    safeError(err);
  });

  ws.addEventListener("close", () => {
    if (closed) return;
    closed = true;
    safeStatus("closed");
  });

  return {
    close: () => {
      if (closed) return;
      closed = true;
      ws.close();
    }
  };
}
