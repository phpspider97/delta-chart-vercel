import express from "express";
import axios from "axios";
import { WebSocketServer, WebSocket } from "ws";
  
const app = express();

const PORT = 3000;

const DELTA_REST_URL = "https://api.india.delta.exchange";
const DELTA_WS_URL = "wss://public-socket.india.delta.exchange";

const DEFAULT_RESOLUTION = "1d";
const HISTORICAL_CANDLES = 150;
const MAX_CHARTS = 300;

let currentResolution = DEFAULT_RESOLUTION;

const RESOLUTION_SECONDS = {
  "3m": 3 * 60,
  "30m": 30 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60
};

const WS_CHANNELS = {
  "3m": "candlestick_3m",
  "30m": "candlestick_30m",
  "1h": "candlestick_1h",
  "4h": "candlestick_4h",
  "1d": "candlestick_1d"
};

let products = [];
let deltaWS = null;

const browserClients = new Set();
const subscribedSymbols = new Set();

app.use(express.json());
app.use(express.static("public"));


// ============================================================
// HELPERS
// ============================================================

function normalizeTimestamp(timestamp) {
  let ts = Number(timestamp);

  if (!Number.isFinite(ts)) {
    return null;
  }

  if (ts > 1e14) {
    ts = Math.floor(ts / 1000000);
  } else if (ts > 1e11) {
    ts = Math.floor(ts / 1000);
  }

  return ts;
}


function bucketTimestamp(timestamp, resolution) {
  const seconds = RESOLUTION_SECONDS[resolution];

  if (!seconds) {
    return timestamp;
  }

  return Math.floor(timestamp / seconds) * seconds;
}


function shuffleArray(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [
      result[j],
      result[i]
    ];
  }

  return result;
}


// ============================================================
// TAGS
// ============================================================

function getProductTags(product) {
  const allTags = [];

  if (product.category) {
    allTags.push(product.category);
  }

  if (product.sector) {
    allTags.push(product.sector);
  }

  if (product.product_specs.tags) {
    allTags.push(product.product_specs.tags);
  }

  if (product.product_specs.tags) {
    if (Array.isArray(product.product_specs.tags)) {
      allTags.push(...product.product_specs.tags);
    } else {
      allTags.push(product.product_specs.tags);
    }
  }

  return [
    ...new Set(
      allTags
        .flatMap(tag => String(tag).split(","))
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
}


// ============================================================
// PRODUCTS
// ============================================================

async function getProducts() {
  try {
    const response = await axios.get(
      `${DELTA_REST_URL}/v2/products`,
      {
        timeout: 15000
      }
    );

    const list =
      response.data?.result ||
      response.data?.products ||
      [];

    const result = [];
    const symbols = new Set();

    for (const product of list) {
      const symbol = String(
        product.symbol || ""
      ).trim();

      if (!symbol) {
        continue;
      }

      const contractType = String(
        product.contract_type || ""
      ).toLowerCase();

      const isPerpetual =
        contractType.includes("perpetual") ||
        contractType === "perpetual_futures" ||
        contractType === "perpetual";

      if (!isPerpetual) {
        continue;
      }

      const state = String(
        product.state || ""
      ).toLowerCase();

      if (
        state &&
        ![
          "live",
          "active",
          "enabled",
          "online"
        ].includes(state)
      ) {
        continue;
      }

      if (symbols.has(symbol)) {
        continue;
      }

      symbols.add(symbol);

      result.push({
        symbol,

        productId: product.id,

        description:
          product.description || "",

        underlyingAsset:
          product.underlying_asset_symbol || "",

        contractType:
          product.contract_type || "",

        category:
          product.category ||
          product.sector ||
          product.tag ||
          "",

        tags: getProductTags(product),

        rawCategory:
          product.category || "",

        rawTag:
          product.tag || ""
      });
    }

    return shuffleArray(result).slice(
      0,
      MAX_CHARTS
    );

  } catch (error) {
    console.error(
      "Failed to load products:",
      error.message
    );

    return [];
  }
}


// ============================================================
// PRODUCTS API
// ============================================================

app.get("/api/products", async (req, res) => {
  products = await getProducts();

  res.json({
    success: true,
    count: products.length,
    resolution: currentResolution,
    products
  });
});


// ============================================================
// HISTORICAL MARK PRICE
// ============================================================

app.get(
  "/api/candles/:symbol",
  async (req, res) => {
    try {
      const symbol = String(
        req.params.symbol
      ).toUpperCase();

      const resolution = String(
        req.query.resolution ||
        currentResolution
      );

      const resolutionSeconds =
        RESOLUTION_SECONDS[resolution];

      if (!resolutionSeconds) {
        return res.status(400).json({
          success: false,
          error: "Invalid resolution"
        });
      }

      const end = Math.floor(
        Date.now() / 1000
      );

      const start =
        end -
        resolutionSeconds *
          HISTORICAL_CANDLES;

      const markSymbol =
        `MARK:${symbol}`;

      const response = await axios.get(
        `${DELTA_REST_URL}/v2/history/candles`,
        {
          params: {
            resolution,
            symbol: markSymbol,
            start,
            end
          },

          timeout: 15000
        }
      );

      const raw =
        response.data?.result || [];

      const candles = raw
        .map(candle => {
          const time =
            normalizeTimestamp(
              candle.time ??
              candle.timestamp ??
              candle.t
            );

          const open =
            Number(candle.open);

          const high =
            Number(candle.high);

          const low =
            Number(candle.low);

          const close =
            Number(candle.close);

          if (
            time === null ||
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close)
          ) {
            return null;
          }

          return {
            time: bucketTimestamp(
              time,
              resolution
            ),

            open,
            high,
            low,
            close
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.time - b.time
        );

      const unique = [];
      const seen = new Set();

      for (const candle of candles) {
        if (seen.has(candle.time)) {
          continue;
        }

        seen.add(candle.time);
        unique.push(candle);
      }

      res.json({
        success: true,

        symbol,

        markSymbol,

        resolution,

        candles:
          unique.slice(
            -HISTORICAL_CANDLES
          )
      });

    } catch (error) {
      console.error(
        `Candle error ${req.params.symbol}:`,
        error.response?.data ||
        error.message
      );

      res.status(500).json({
        success: false,

        error:
          error.response?.data ||
          error.message
      });
    }
  }
);


// ============================================================
// BROWSER WEBSOCKET
// ============================================================

const server = app.listen(
  PORT,
  () => {
    console.log(
      `Dashboard running at http://localhost:${PORT}`
    );
  }
);

const browserWSS =
  new WebSocketServer({
    server,
    path: "/ws"
  });


function sendBrowser(
  client,
  message
) {
  if (
    client.readyState ===
    WebSocket.OPEN
  ) {
    client.send(
      JSON.stringify(message)
    );
  }
}


function broadcast(message) {
  for (
    const client
    of browserClients
  ) {
    sendBrowser(
      client,
      message
    );
  }
}


// ============================================================
// DELTA MESSAGE
// ============================================================

function handleDeltaMessage(
  rawMessage
) {
  try {
    const message =
      JSON.parse(rawMessage);

    const type =
      String(
        message.type || ""
      ).toLowerCase();

    if (
      !type.includes("candlestick")
    ) {
      return;
    }

    const data =
      message.data ||
      message;

    let symbol =
      data.symbol ||
      message.symbol ||
      "";

    symbol = String(symbol)
      .replace(/^MARK:/i, "")
      .toUpperCase();

    if (!symbol) {
      return;
    }

    const timestamp =
      data.time ??
      data.timestamp ??
      data.ts ??
      message.time ??
      message.ts;

    const time =
      normalizeTimestamp(timestamp);

    if (time === null) {
      return;
    }

    const candleTime =
      bucketTimestamp(
        time,
        currentResolution
      );

    const open =
      Number(data.open);

    const high =
      Number(data.high);

    const low =
      Number(data.low);

    const close =
      Number(data.close);

    if (
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      return;
    }

    broadcast({
      type: "mark_candle",

      symbol,

      markSymbol:
        `MARK:${symbol}`,

      resolution:
        currentResolution,

      time: candleTime,

      open,
      high,
      low,
      close
    });

  } catch (error) {
    console.error(
      "Delta message error:",
      error.message
    );
  }
}


// ============================================================
// DELTA SUBSCRIBE
// ============================================================

function subscribeToDelta() {
  if (
    !deltaWS ||
    deltaWS.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  const channel =
    WS_CHANNELS[
      currentResolution
    ];

  const symbols = [
    ...subscribedSymbols
  ];

  if (!symbols.length) {
    return;
  }

  const subscription = {
    type: "subscribe",

    payload: {
      channels: [
        {
          name: channel,

          symbols: symbols.map(
            symbol =>
              `MARK:${symbol}`
          )
        }
      ]
    }
  };

  console.log(
    `Subscribing ${symbols.length} symbols to ${channel}`
  );

  deltaWS.send(
    JSON.stringify(
      subscription
    )
  );
}


// ============================================================
// CONNECT DELTA
// ============================================================

function connectDeltaWebSocket() {
  if (deltaWS) {
    try {
      deltaWS.close();
    } catch {
      // ignore
    }
  }

  subscribedSymbols.clear();

  for (const product of products) {
    subscribedSymbols.add(
      product.symbol
    );
  }

  if (!subscribedSymbols.size) {
    console.log(
      "No symbols available"
    );

    return;
  }

  console.log(
    `Connecting Delta WS: ${currentResolution}`
  );

  deltaWS =
    new WebSocket(
      DELTA_WS_URL
    );

  deltaWS.on(
    "open",
    () => {
      console.log(
        "Delta WebSocket connected"
      );

      broadcast({
        type:
          "delta_status",

        connected: true,

        resolution:
          currentResolution
      });

      subscribeToDelta();
    }
  );

  deltaWS.on(
    "message",
    data => {
      handleDeltaMessage(
        data.toString()
      );
    }
  );

  deltaWS.on(
    "close",
    () => {
      console.log(
        "Delta WebSocket disconnected"
      );

      broadcast({
        type:
          "delta_status",

        connected: false
      });

      setTimeout(
        () => {
          connectDeltaWebSocket();
        },
        2000
      );
    }
  );

  deltaWS.on(
    "error",
    error => {
      console.error(
        "Delta WS error:",
        error.message
      );
    }
  );
}


// ============================================================
// BROWSER CONNECTION
// ============================================================

browserWSS.on(
  "connection",
  browserWS => {

    browserClients.add(
      browserWS
    );

    sendBrowser(
      browserWS,
      {
        type:
          "browser_status",

        connected: true,

        resolution:
          currentResolution
      }
    );

    sendBrowser(
      browserWS,
      {
        type:
          "delta_status",

        connected:
          deltaWS?.readyState ===
          WebSocket.OPEN,

        resolution:
          currentResolution
      }
    );


    browserWS.on(
      "message",
      raw => {

        try {

          const message =
            JSON.parse(
              raw.toString()
            );


          if (
            message.type ===
            "set_resolution"
          ) {

            const resolution =
              String(
                message.resolution
              );


            if (
              !RESOLUTION_SECONDS[
                resolution
              ]
            ) {
              return;
            }


            if (
              resolution ===
              currentResolution
            ) {
              return;
            }


            currentResolution =
              resolution;


            console.log(
              `Resolution changed to ${currentResolution}`
            );


            broadcast({
              type:
                "resolution_changed",

              resolution:
                currentResolution
            });


            connectDeltaWebSocket();

          }

        } catch (error) {

          console.error(
            "Browser WS error:",
            error.message
          );

        }

      }
    );


    browserWS.on(
      "close",
      () => {
        browserClients.delete(
          browserWS
        );
      }
    );


    browserWS.on(
      "error",
      () => {
        browserClients.delete(
          browserWS
        );
      }
    );

  }
);


// ============================================================
// INITIALIZE
// ============================================================

async function initialize() {

  products =
    await getProducts();

  console.log(
    `Loaded ${products.length} products`
  );

  connectDeltaWebSocket();
}

initialize();
