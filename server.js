import express from "express";
import axios from "axios";
import { WebSocketServer, WebSocket } from "ws";

const app = express();

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

const PORT = 3000;

const DELTA_REST_URL =
    "https://api.india.delta.exchange";

const DELTA_WS_URL =
    "wss://public-socket.india.delta.exchange";

const DEFAULT_RESOLUTION = "1d";

const HISTORICAL_CANDLES = 150;

const MAX_CHARTS = 300;

let currentResolution =
    DEFAULT_RESOLUTION;

let products = [];

let deltaWS = null;

let deltaConnecting = false;

let reconnectTimer = null;

const browserClients = new Set();

const subscribedSymbols = new Set();

const RESOLUTION_SECONDS = {
    "1m": 1 * 60,
    "3m": 3 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
    "1d": 24 * 60 * 60
};

const WS_CHANNELS = {
    "1m": "candlestick_1m",
    "3m": "candlestick_3m",
    "30m": "candlestick_30m",
    "1h": "candlestick_1h",
    "4h": "candlestick_4h",
    "1d": "candlestick_1d"
};

//app.use(express.json());
//app.use(express.static("public"));

// ============================================================
// TIMESTAMP HELPERS
// ============================================================

function normalizeTimestamp(timestamp) {
    let ts = Number(timestamp);

    if (!Number.isFinite(ts)) {
        return null;
    }

    // Nanoseconds
    if (ts > 1e14) {
        ts = Math.floor(ts / 1000000);
    }
    // Milliseconds
    else if (ts > 1e11) {
        ts = Math.floor(ts / 1000);
    }

    return ts;
}

function bucketTimestamp(timestamp, resolution) {
    const seconds =
        RESOLUTION_SECONDS[resolution];

    if (!seconds) {
        return timestamp;
    }

    return (
        Math.floor(timestamp / seconds) *
        seconds
    );
}

// ============================================================
// PRODUCT TAGS
// ============================================================

function getProductTags(product) {
    const tags = [];

    if (product.category) {
        tags.push(product.category);
    }

    if (product.sector) {
        tags.push(product.sector);
    }

    if (product.tag) {
        tags.push(product.tag);
    }

    const productSpecs =
        product.product_specs;

    const specTags =
        productSpecs?.tags;

    if (Array.isArray(specTags)) {
        tags.push(...specTags);
    } else if (specTags) {
        tags.push(specTags);
    }

    return [
        ...new Set(
            tags
                .flatMap(tag =>
                    String(tag).split(",")
                )
                .map(tag =>
                    tag.trim().toLowerCase()
                )
                .filter(Boolean)
        )
    ];
}

// ============================================================
// LOAD DELTA PRODUCTS
// ============================================================

async function getProducts() {
    try {
        console.log(
            "Loading products from Delta..."
        );

        const response =
            await axios.get(
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
            const symbol =
                String(
                    product.symbol || ""
                )
                    .trim()
                    .toUpperCase();

            if (!symbol) {
                continue;
            }

            const contractType =
                String(
                    product.contract_type || ""
                ).toLowerCase();

            const isPerpetual =
                contractType.includes(
                    "perpetual"
                ) ||
                contractType ===
                    "perpetual_futures" ||
                contractType ===
                    "perpetual";

            if (!isPerpetual) {
                continue;
            }

            const productState =
                String(
                    product.state || ""
                ).toLowerCase();

            if (
                productState &&
                ![
                    "live",
                    "active",
                    "enabled",
                    "online"
                ].includes(productState)
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
                    product.underlying_asset_symbol ||
                    "",

                contractType:
                    product.contract_type || "",

                category:
                    product.category ||
                    product.sector ||
                    product.tag ||
                    "",

                tags:
                    getProductTags(product)
            });
        }

        return result;
        
    } catch (error) {
        console.error(
            "Failed to load products:"
        );

        console.error(
            error.response?.data ||
            error.message
        );

        return [];
    }
}

// ============================================================
// PRODUCTS API
// ============================================================

app.get(
    "/api/products",
    async (req, res) => {
        try {
            if (!products.length) {
                products =
                    await getProducts();
            }

            res.json({
                success: true,

                count:
                    products.length,

                resolution:
                    currentResolution,

                products
            });
        } catch (error) {
            console.error(
                "Products API error:",
                error.message
            );

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ============================================================
// HISTORICAL MARK PRICE CANDLES
// ============================================================

async function candleHandler(
    req,
    res
) {
    try {
        const symbol =
            String(
                req.params.symbol ||
                req.query.symbol ||
                ""
            )
                .trim()
                .toUpperCase();

        if (!symbol) {
            return res.status(400).json({
                success: false,
                error:
                    "Symbol is required"
            });
        }

        const resolution =
            String(
                req.query.resolution ||
                currentResolution
            );

        const resolutionSeconds =
            RESOLUTION_SECONDS[
                resolution
            ];

        if (!resolutionSeconds) {
            return res.status(400).json({
                success: false,
                error:
                    "Invalid resolution"
            });
        }

        const end =
            Math.floor(
                Date.now() / 1000
            );

        const start =
            end -
            resolutionSeconds *
                HISTORICAL_CANDLES;

        // IMPORTANT:
        // Historical data is MARK PRICE.
        const markSymbol =
            `MARK:${symbol}`;

        console.log(
            `CANDLES ${markSymbol} ${resolution}`
        );

        const response =
            await axios.get(
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
            response.data?.result ||
            [];

        const candleMap =
            new Map();

        for (const candle of raw) {
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
                continue;
            }

            const candleTime =
                bucketTimestamp(
                    time,
                    resolution
                );

            candleMap.set(
                candleTime,
                {
                    time: candleTime,
                    open,
                    high,
                    low,
                    close
                }
            );
        }

        const candles =
            [...candleMap.values()]
                .sort(
                    (a, b) =>
                        a.time - b.time
                )
                .slice(
                    -HISTORICAL_CANDLES
                );

        res.json({
            success: true,

            symbol,

            markSymbol,

            resolution,

            candles
        });
    } catch (error) {
        console.error(
            `Candle error for ${
                req.params.symbol ||
                req.query.symbol ||
                ""
            }:`
        );

        console.error(
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

app.get(
    "/api/candles/:symbol",
    candleHandler
);

app.get(
    "/api/candles",
    candleHandler
);

// ============================================================
// BROWSER WEBSOCKET HELPERS
// ============================================================

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
// PARSE DELTA MARK PRICE CANDLE
// ============================================================

function handleDeltaMessage(
    rawMessage
) {
    try {
        const message =
            JSON.parse(
                rawMessage
            );

        const type =
            String(
                message.type || ""
            ).toLowerCase();

        // We only process candle messages.
        // DO NOT process trades here.
        if (
            !type.includes(
                "candlestick"
            )
        ) {
            return;
        }

        const data =
            message.data ||
            message;

        // Delta can provide the symbol
        // in different locations depending
        // on message structure.
        let symbol =
            data.symbol ||
            data.sy ||
            message.symbol ||
            message.sy ||
            "";

        symbol =
            String(symbol)
                .replace(
                    /^MARK:/i,
                    ""
                )
                .trim()
                .toUpperCase();

        if (!symbol) {
            return;
        }

        const timestamp =
            data.time ??
            data.timestamp ??
            data.ts ??
            message.time ??
            message.timestamp ??
            message.ts;

        const time =
            normalizeTimestamp(
                timestamp
            );

        if (time === null) {
            return;
        }

        const candleTime =
            bucketTimestamp(
                time,
                currentResolution
            );

        // Support normal OHLC keys
        // and short Delta-style keys.
        const open =
            Number(
                data.open ??
                data.o
            );

        const high =
            Number(
                data.high ??
                data.h
            );

        const low =
            Number(
                data.low ??
                data.l
            );

        const close =
            Number(
                data.close ??
                data.c
            );

        if (
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close)
        ) {
            return;
        }

        // Send ONLY MARK PRICE candle
        // data to browser.
        broadcast({
            type:
                "mark_candle",

            symbol,

            markSymbol:
                `MARK:${symbol}`,

            resolution:
                currentResolution,

            time:
                candleTime,

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
// SUBSCRIBE TO DELTA MARK PRICE CANDLES
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

    const symbols =
        [...subscribedSymbols];

    if (!symbols.length) {
        console.log(
            "No symbols to subscribe"
        );

        return;
    }

    // IMPORTANT:
    // MARK PRICE ONLY.
    //
    // Example:
    // MARK:BTCUSD
    // MARK:ETHUSD
    //
    // DO NOT replace this with
    // the trades channel.
    const markSymbols =
        symbols.map(
            symbol =>
                `MARK:${symbol}`
        );

    const message = {
        type: "subscribe",

        payload: {
            channels: [
                {
                    name: channel,

                    symbols:
                        markSymbols
                }
            ]
        }
    };

    console.log(
        `SUBSCRIBE ${channel} -> ${markSymbols.length} MARK PRICE symbols`
    );

    deltaWS.send(
        JSON.stringify(message)
    );
}

// ============================================================
// CONNECT DELTA WEBSOCKET
// ============================================================

function connectDeltaWebSocket() {
    if (deltaConnecting) {
        return;
    }

    deltaConnecting = true;

    if (reconnectTimer) {
        clearTimeout(
            reconnectTimer
        );

        reconnectTimer = null;
    }

    if (deltaWS) {
        try {
            deltaWS.removeAllListeners();

            deltaWS.close();
        } catch {}

        deltaWS = null;
    }

    subscribedSymbols.clear();

    for (
        const product
        of products
    ) {
        subscribedSymbols.add(
            product.symbol
        );
    }

    if (
        !subscribedSymbols.size
    ) {
        deltaConnecting = false;

        console.log(
            "No products available for Delta WebSocket"
        );

        return;
    }

    console.log(
        `Connecting Delta WS: ${currentResolution}`
    );

    const socket =
        new WebSocket(
            DELTA_WS_URL
        );

    deltaWS =
        socket;

    socket.on(
        "open",
        () => {
            deltaConnecting = false;

            console.log(
                "Delta WebSocket CONNECTED"
            );

            broadcast({
                type:
                    "delta_status",

                connected:
                    true,

                resolution:
                    currentResolution
            });

            subscribeToDelta();
        }
    );

    socket.on(
        "message",
        data => {
            handleDeltaMessage(
                data.toString()
            );
        }
    );

    socket.on(
        "close",
        () => {
            deltaConnecting = false;

            console.log(
                "Delta WebSocket CLOSED"
            );

            broadcast({
                type:
                    "delta_status",

                connected:
                    false
            });

            if (!reconnectTimer) {
                reconnectTimer =
                    setTimeout(
                        () => {
                            reconnectTimer =
                                null;

                            connectDeltaWebSocket();
                        },
                        2000
                    );
            }
        }
    );

    socket.on(
        "error",
        error => {
            console.error(
                "Delta WebSocket ERROR:",
                error.message
            );
        }
    );
}

// ============================================================
// START HTTP SERVER
// ============================================================

const server =
    app.listen(
        PORT,
        async () => {
            console.log(
                `Dashboard running at http://localhost:${PORT}`
            );

            products =
                await getProducts();

            console.log(
                `Loaded ${products.length} products`
            );

            connectDeltaWebSocket();
        }
    );

// ============================================================
// BROWSER WEBSOCKET SERVER
//
// IMPORTANT:
// server must already exist before
// WebSocketServer({ server })
// ============================================================

const browserWSS =
    new WebSocketServer({
        server,
        path: "/ws"
    });

browserWSS.on(
    "connection",
    browserWS => {
        console.log(
            "Browser WebSocket CONNECTED"
        );

        browserClients.add(
            browserWS
        );

        sendBrowser(
            browserWS,
            {
                type:
                    "browser_status",

                connected:
                    true,

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
                        message.type !==
                        "set_resolution"
                    ) {
                        return;
                    }

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
                        `TIMEFRAME CHANGED -> ${currentResolution}`
                    );

                    broadcast({
                        type:
                            "resolution_changed",

                        resolution:
                            currentResolution
                    });

                    // Reconnect Delta WS
                    // with the new candle channel.
                    connectDeltaWebSocket();
                } catch (error) {
                    console.error(
                        "Browser WS message error:",
                        error.message
                    );
                }
            }
        );

        browserWS.on(
            "close",
            () => {
                console.log(
                    "Browser WebSocket CLOSED"
                );

                browserClients.delete(
                    browserWS
                );
            }
        );

        browserWS.on(
            "error",
            error => {
                console.error(
                    "Browser WS error:",
                    error.message
                );

                browserClients.delete(
                    browserWS
                );
            }
        );
    }
);
