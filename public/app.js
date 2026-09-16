const CONFIG = {
  defaultChartLimit: 'all',
  defaultColumns: 4,
  resolution: "1d",
  maxCandles: 150
};

const SELECTED_SYMBOLS = [
    "BTCUSD",
    "ETHUSD",
    "PAXGUSD",
    "VVVUSD",
    "LITUSD",
    "TRBUSD",
    "AAVEUSD",
    "UNIUSD",
    "INJUSD",
    "NEARUSD",
    "DASHUSD",
    "GRAMUSD",
    "TAOUSD",
    "BCHUSD",
    "LTCUSD",
    "MUSD",
    "GIGGLEUSD",
    "SLVONUSD",
    "SOLUSD",
    "DOTUSD",
    "KSMUSD",
    "LINKUSD",
    "HYPEUSD",
    "ETCUSD",
    "INTCBUSD",
    "SOXLBUSD",
    "DRAMBUSD",
    "SKHYBUSD",
    "BABABUSD",
    "EWYBUSD",
    "CRCLXUSD",
    "MSTRBUSD",
    "SPCXXUSD",
    "HOODBUSD",
    "COINXUSD",
    "PLTRBUSD",
    "RKLBBUSD"
];

const state = {
  products: [],
  filteredProducts: [],
  charts: new Map(),
  resolution: CONFIG.resolution,
  chartLimit: String(CONFIG.defaultChartLimit),
  columns: CONFIG.defaultColumns,
  displayMode: "selected",
  search: "",
  tag: "all",
  socket: null,
  reconnectTimer: null
};

// ============================================================
// DOM
// ============================================================

const chartsContainer =
  document.getElementById("chartsContainer");

const loading =
  document.getElementById("loading");

const productCount =
  document.getElementById("productCount");

const visibleCount =
  document.getElementById("visibleCount");

const connectionDot =
  document.getElementById("connectionDot");

const connectionText =
  document.getElementById("connectionText");

const displayMode =
  document.getElementById("displayMode");

const searchInput =
  document.getElementById("searchInput");

const tagFilter =
  document.getElementById("tagFilter");

const chartLimit =
  document.getElementById("chartLimit");

const columns =
  document.getElementById("columns");

const timeframe =
  document.getElementById("timeframe");

const reloadButton =
  document.getElementById("reloadButton");

const currentTimeframe =
  document.getElementById("currentTimeframe");

const lastUpdate =
  document.getElementById("lastUpdate");

// ============================================================
// RESOLUTION
// ============================================================

const RESOLUTION_SECONDS = {
  "1m": 60,
  "3m": 180,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400
};

// ============================================================
// PRICE FORMAT
// ============================================================

function formatPrice(price) {
  const value = Number(price);

  if (!Number.isFinite(value)) {
      return "--";
  }

  if (Math.abs(value) >= 1000) {
      return value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
      });
  }

  if (Math.abs(value) >= 1) {
      return value.toLocaleString("en-US", {
          minimumFractionDigits: 3,
          maximumFractionDigits: 4
      });
  }

  return value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 8
  });
}

// ============================================================
// TIMESTAMP
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

function bucketTimestamp(timestamp) {
  const seconds =
      RESOLUTION_SECONDS[state.resolution];

  if (!seconds) {
      return timestamp;
  }

  return (
      Math.floor(timestamp / seconds) *
      seconds
  );
}

// ============================================================
// IST TIME
// ============================================================

function formatIST(timestamp) {
  const date =
      new Date(Number(timestamp) * 1000);

  if (Number.isNaN(date.getTime())) {
      return "--";
  }

  return date.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
  });
}

// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {
  return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
}

// ============================================================
// SELECTED SYMBOLS
// ============================================================

function getSelectedSymbolSet() {
  return new Set(
      SELECTED_SYMBOLS.map(
          symbol => symbol.toUpperCase()
      )
  );
}

function getBaseProducts() {
  if (state.displayMode === "all") {
      return [...state.products];
  }

  const selected =
      getSelectedSymbolSet();

  return state.products.filter(product => {
      const symbol =
          String(product.symbol || "")
              .trim()
              .toUpperCase();

      return selected.has(symbol);
  });
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

  if (Array.isArray(product.tags)) {
      tags.push(...product.tags);
  } else if (product.tags) {
      tags.push(product.tags);
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
// TAG DROPDOWN
// ============================================================

function populateTags() {
  const tags = new Set();

  for (const product of state.products) {
      for (
          const tag
          of getProductTags(product)
      ) {
          tags.add(tag);
      }
  }

  tagFilter.innerHTML = `
      <option value="all">
          All Tags
      </option>
  `;

  [...tags]
      .sort()
      .forEach(tag => {
          const option =
              document.createElement("option");

          option.value = tag;

          option.textContent =
              tag.toUpperCase();

          tagFilter.appendChild(option);
      });

  if (tags.has(state.tag)) {
      tagFilter.value = state.tag;
  }
}

// ============================================================
// FILTER PRODUCTS
// ============================================================

function applyFilters() {
  let products = getBaseProducts();

  if (state.search) {
      const search =
          state.search.toLowerCase();

      products =
          products.filter(product =>
              String(product.symbol || "")
                  .toLowerCase()
                  .includes(search)
          );
  }

  if (state.tag !== "all") {
      products =
          products.filter(product =>
              getProductTags(product).includes(
                  state.tag
              )
          );
  }

  if (state.chartLimit !== "all") {
      products =
          products.slice(
              0,
              Number(state.chartLimit)
          );
  }

  state.filteredProducts =
      products;

  renderCharts();
}

// ============================================================
// CONNECTION STATUS
// ============================================================

function setConnectionStatus(connected) {
  if (connected) {
      connectionDot.className =
          "status-dot online";

      connectionText.textContent =
          "LIVE";
  } else {
      connectionDot.className =
          "status-dot offline";

      connectionText.textContent =
          "OFFLINE";
  }
}

// ============================================================
// LOAD PRODUCTS
// ============================================================

async function loadProducts() {
  try {
      loading.style.display = "flex";

      const response =
          await fetch("/api/products");

      if (!response.ok) {
          throw new Error(
              `HTTP ${response.status}`
          );
      }

      const data =
          await response.json();

      state.products =
          Array.isArray(data.products)
              ? data.products
              : [];

      productCount.textContent =
          state.products.length;

      populateTags();

      applyFilters();
  } catch (error) {
      console.error(
          "Products error:",
          error
      );

      chartsContainer.innerHTML = `
          <div class="empty-state">

              <div class="empty-state-icon">
                  !
              </div>

              <div class="empty-state-title">
                  Unable to load products
              </div>

              <div class="empty-state-text">
                  Check the Node.js server and Delta API connection.
              </div>

          </div>
      `;
  } finally {
      loading.style.display = "none";
  }
}

// ============================================================
// DESTROY CHARTS
// ============================================================

function destroyCharts() {
  for (
      const chartData
      of state.charts.values()
  ) {
      try {
          chartData.resizeObserver?.disconnect();

          chartData.chart.remove();
      } catch (error) {
          console.error(
              "Chart destroy error:",
              error
          );
      }
  }

  state.charts.clear();
}

// ============================================================
// RENDER CHARTS
// ============================================================

function renderCharts() {
  destroyCharts();

  chartsContainer.innerHTML = "";

  chartsContainer.style.setProperty(
      "--chart-columns",
      state.columns
  );

  if (!state.filteredProducts.length) {
      chartsContainer.innerHTML = `
          <div class="empty-state">

              <div class="empty-state-icon">
                  ◌
              </div>

              <div class="empty-state-title">
                  No markets found
              </div>

              <div class="empty-state-text">
                  Change your search or filter.
              </div>

          </div>
      `;

      visibleCount.textContent = "0";

      return;
  }

  visibleCount.textContent =
      state.filteredProducts.length;

  for (
      const product
      of state.filteredProducts
  ) {
      createChartCard(product);
  }
}

// ============================================================
// CREATE CHART CARD
// ============================================================

function createChartCard(product) {
  const symbol =
      String(product.symbol || "")
          .trim()
          .toUpperCase();

  // ========================================================
  // PRODUCT TAGS
  // ========================================================

  const productTags =
      getProductTags(product);

  const tagsHtml =
      productTags.length
          ? productTags
              .slice(0, 5)
              .map(
                  tag =>
                      `
                      <span class="product-tag">
                          ${escapeHtml(tag)}
                      </span>
                      `
              )
              .join("")
          : `
              <span class="product-tag">
                  PERPETUAL
              </span>
          `;

  // ========================================================
  // CARD
  // ========================================================

  const card =
      document.createElement("article");

  card.className = "chart-card";

  card.innerHTML = `
      <div class="chart-header">

          <div class="symbol-section">

              <div class="symbol-row">

                  <span class="symbol-name">
                      ${escapeHtml(symbol)}
                  </span>

                  <span class="live-badge">
                      LIVE
                  </span>

              </div>

              <div class="symbol-subtitle">
                  MARK PRICE
              </div>

              <div class="product-tags">
                  ${tagsHtml}
              </div>

          </div>

          <div class="price-section">

              <div
                  class="current-price"
                  data-role="price"
              >
                  --
              </div>

              <div
                  class="price-change"
                  data-role="change"
              >
                  --
              </div>

          </div>

      </div>

      <div
          class="chart"
          data-role="chart"
      ></div>

      <div class="chart-footer">

          <div class="footer-item">

              <span class="footer-label">
                  HIGH
              </span>

              <span
                  class="footer-value"
                  data-role="high"
              >
                  --
              </span>

          </div>

          <div class="footer-item">

              <span class="footer-label">
                  LOW
              </span>

              <span
                  class="footer-value"
                  data-role="low"
              >
                  --
              </span>

          </div>

          <div class="footer-item">

              <span class="footer-label">
                  UPDATE
              </span>

              <span
                  class="footer-value"
                  data-role="time"
              >
                  --
              </span>

          </div>

          <div
              class="chart-status"
              data-role="status"
          >
              Loading
          </div>

      </div>
  `;

  chartsContainer.appendChild(card);

  const chartElement =
      card.querySelector(
          '[data-role="chart"]'
      );

  const priceElement =
      card.querySelector(
          '[data-role="price"]'
      );

  const changeElement =
      card.querySelector(
          '[data-role="change"]'
      );

  const highElement =
      card.querySelector(
          '[data-role="high"]'
      );

  const lowElement =
      card.querySelector(
          '[data-role="low"]'
      );

  const timeElement =
      card.querySelector(
          '[data-role="time"]'
      );

  const statusElement =
      card.querySelector(
          '[data-role="status"]'
      );

  // ========================================================
  // LIGHTWEIGHT CHART
  // ========================================================

  const chart =
      LightweightCharts.createChart(
          chartElement,
          {
              width:
                  chartElement.clientWidth,

              height: 290,

              layout: {
                  background: {
                      color: "#0b1016"
                  },

                  textColor: "#778494"
              },

              grid: {
                  vertLines: {
                      color: "#141c25"
                  },

                  horzLines: {
                      color: "#141c25"
                  }
              },

              rightPriceScale: {
                  borderColor:
                      "#202a35",

                  scaleMargins: {
                      top: 0.08,
                      bottom: 0.08
                  }
              },

              timeScale: {
                  borderColor:
                      "#202a35",

                  timeVisible: true,

                  secondsVisible: false,

                  rightOffset: 3,

                  barSpacing: 6,

                  minBarSpacing: 2
              },

              crosshair: {
                  mode:
                      LightweightCharts
                          .CrosshairMode
                          .Normal
              },

              localization: {
                  priceFormatter:
                      price =>
                          formatPrice(price)
              }
          }
      );

  const candleSeries =
      chart.addCandlestickSeries({
          upColor: "#20b26b",
          downColor: "#e05260",
          borderUpColor: "#20b26b",
          borderDownColor: "#e05260",
          wickUpColor: "#20b26b",
          wickDownColor: "#e05260"
      });

  const chartData = {
      symbol,

      product,

      card,

      chart,

      candleSeries,

      candles: [],

      lastCandleTime: null,

      priceElement,

      changeElement,

      highElement,

      lowElement,

      timeElement,

      statusElement,

      resizeObserver: null
  };

  state.charts.set(
      symbol,
      chartData
  );

  // ========================================================
  // RESPONSIVE
  // ========================================================

  chartData.resizeObserver =
      new ResizeObserver(() => {
          chart.applyOptions({
              width:
                  chartElement.clientWidth
          });
      });

  chartData.resizeObserver.observe(
      chartElement
  );

  // ========================================================
  // LOAD HISTORICAL MARK PRICE
  // ========================================================

  loadHistoricalCandles(
      chartData
  );
}

// ============================================================
// HISTORICAL MARK PRICE CANDLES
// ============================================================

async function loadHistoricalCandles(
  chartData
) {
  try {
      chartData.statusElement.textContent =
          "Loading";

      const url =
          `/api/candles/${encodeURIComponent(
              chartData.symbol
          )}?` +
          new URLSearchParams({
              resolution:
                  state.resolution
          });

      const response =
          await fetch(url);

      if (!response.ok) {
          throw new Error(
              `HTTP ${response.status}`
          );
      }

      const data =
          await response.json();

      const candles =
          Array.isArray(data)
              ? data
              : Array.isArray(data.candles)
                  ? data.candles
                  : [];

      if (!candles.length) {
          chartData.statusElement.textContent =
              "No data";

          return;
      }

      const map = new Map();

      for (
          const candle
          of candles
      ) {
          const time =
              Number(candle.time);

          const open =
              Number(candle.open);

          const high =
              Number(candle.high);

          const low =
              Number(candle.low);

          const close =
              Number(candle.close);

          if (
              !Number.isFinite(time) ||
              !Number.isFinite(open) ||
              !Number.isFinite(high) ||
              !Number.isFinite(low) ||
              !Number.isFinite(close)
          ) {
              continue;
          }

          map.set(
              time,
              {
                  time,
                  open,
                  high,
                  low,
                  close
              }
          );
      }

      chartData.candles =
          [...map.values()]
              .sort(
                  (a, b) =>
                      a.time - b.time
              );

      if (
          !chartData.candles.length
      ) {
          chartData.statusElement.textContent =
              "No valid data";

          return;
      }

      chartData.candleSeries.setData(
          chartData.candles
      );

      const last =
          chartData.candles[
              chartData.candles.length - 1
          ];

      chartData.lastCandleTime =
          last.time;

      updateCard(
          chartData,
          last.close,
          last.time
      );

      chartData.statusElement.textContent =
          "Live";

      chartData.chart
          .timeScale()
          .fitContent();

  } catch (error) {
      console.error(
          `Historical Mark Price error ${chartData.symbol}:`,
          error
      );

      chartData.statusElement.textContent =
          "Data error";
  }
}

// ============================================================
// UPDATE CARD
// ============================================================

function updateCard(
  chartData,
  price,
  timestamp
) {
  const value =
      Number(price);

  if (!Number.isFinite(value)) {
      return;
  }

  chartData.priceElement.textContent =
      formatPrice(value);

  const candles =
      chartData.candles;

  // ========================================================
  // CHANGE FROM PREVIOUS CANDLE
  // ========================================================

  if (candles.length >= 2) {
      const previous =
          candles[
              candles.length - 2
          ].close;

      if (
          Number.isFinite(previous) &&
          previous !== 0
      ) {
          const change =
              (
                  (
                      value -
                      previous
                  ) /
                  previous
              ) * 100;

          const sign =
              change >= 0
                  ? "+"
                  : "";

          chartData.changeElement.textContent =
              `${sign}${change.toFixed(2)}%`;

          chartData.changeElement.className =
              "price-change " +
              (
                  change >= 0
                      ? "positive"
                      : "negative"
              );
      }
  }

  // ========================================================
  // HIGH / LOW
  // ========================================================

  const recent =
      candles.slice(-20);

  if (recent.length) {
      const high =
          Math.max(
              ...recent.map(
                  candle =>
                      candle.high
              )
          );

      const low =
          Math.min(
              ...recent.map(
                  candle =>
                      candle.low
              )
          );

      chartData.highElement.textContent =
          formatPrice(high);

      chartData.lowElement.textContent =
          formatPrice(low);
  }

  // ========================================================
  // UPDATE TIME
  // ========================================================

  chartData.timeElement.textContent =
      formatIST(timestamp);

  lastUpdate.textContent =
      formatIST(timestamp);
}

// ============================================================
// LIVE MARK PRICE CANDLE
// ============================================================

function updateLiveCandle(message) {
  if (
      !message ||
      message.type !== "mark_candle"
  ) {
      return;
  }

  const symbol =
      String(
          message.symbol || ""
      )
          .replace(
              /^MARK:/i,
              ""
          )
          .trim()
          .toUpperCase();

  const chartData =
      state.charts.get(symbol);

  if (!chartData) {
      return;
  }

  if (
      message.resolution &&
      message.resolution !==
          state.resolution
  ) {
      return;
  }

  const rawTime =
      normalizeTimestamp(
          message.time
      );

  if (rawTime === null) {
      return;
  }

  const time =
      bucketTimestamp(rawTime);

  const candle = {
      time,

      open:
          Number(message.open),

      high:
          Number(message.high),

      low:
          Number(message.low),

      close:
          Number(message.close)
  };

  if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close)
  ) {
      return;
  }

  const candles =
      chartData.candles;

  const lastIndex =
      candles.length - 1;

  // ========================================================
  // FIRST CANDLE
  // ========================================================

  if (lastIndex < 0) {
      candles.push(candle);

      chartData.candleSeries.update(
          candle
      );
  }

  // ========================================================
  // SAME CANDLE
  // ========================================================

  else {
      const last =
          candles[lastIndex];

      if (
          candle.time ===
          last.time
      ) {
          candles[lastIndex] =
              candle;

          chartData.candleSeries.update(
              candle
          );
      }

      // ====================================================
      // NEW CANDLE
      // ====================================================

      else if (
          candle.time >
          last.time
      ) {
          candles.push(candle);

          if (
              candles.length >
              CONFIG.maxCandles
          ) {
              candles.shift();
          }

          chartData.candleSeries.update(
              candle
          );
      }

      // Older candle
      else {
          return;
      }
  }

  updateCard(
      chartData,
      candle.close,
      candle.time
  );

  chartData.statusElement.textContent =
      "Live";
}

// ============================================================
// BROWSER WEBSOCKET
// ============================================================

function connectWebSocket() {
  if (state.reconnectTimer) {
      clearTimeout(
          state.reconnectTimer
      );

      state.reconnectTimer =
          null;
  }

  if (
      state.socket &&
      (
          state.socket.readyState ===
              WebSocket.OPEN ||
          state.socket.readyState ===
              WebSocket.CONNECTING
      )
  ) {
      return;
  }

  console.log(
      "Connecting browser WebSocket..."
  );

  const socket =
      new WebSocket(
          `${
              location.protocol === "https:"
                  ? "wss"
                  : "ws"
          }://${location.host}/ws`
      );

  state.socket = socket;

  socket.addEventListener(
      "open",
      () => {
          console.log(
              "Browser WebSocket CONNECTED"
          );

          setConnectionStatus(true);

          sendResolutionChange();
      }
  );

  socket.addEventListener(
      "message",
      event => {
          try {
              const message =
                  JSON.parse(
                      event.data
                  );

              // MARK PRICE CANDLE
              if (
                  message.type ===
                  "mark_candle"
              ) {
                  updateLiveCandle(
                      message
                  );
              }

              // DELTA STATUS
              if (
                  message.type ===
                  "delta_status"
              ) {
                  setConnectionStatus(
                      Boolean(
                          message.connected
                      )
                  );
              }

              // TIMEFRAME
              if (
                  message.type ===
                  "resolution_changed"
              ) {
                  if (
                      message.resolution
                  ) {
                      currentTimeframe.textContent =
                          message.resolution;
                  }
              }

          } catch (error) {
              console.error(
                  "WS message error:",
                  error
              );
          }
      }
  );

  socket.addEventListener(
      "close",
      () => {
          console.log(
              "Browser WebSocket CLOSED"
          );

          setConnectionStatus(false);

          if (!state.reconnectTimer) {
              state.reconnectTimer =
                  setTimeout(
                      () => {
                          state.reconnectTimer =
                              null;

                          connectWebSocket();
                      },
                      2000
                  );
          }
      }
  );

  socket.addEventListener(
      "error",
      error => {
          console.error(
              "Browser WebSocket ERROR:",
              error
          );
      }
  );
}

// ============================================================
// SEND TIMEFRAME
// ============================================================

function sendResolutionChange() {
  if (
      !state.socket ||
      state.socket.readyState !==
          WebSocket.OPEN
  ) {
      return;
  }

  state.socket.send(
      JSON.stringify({
          type:
              "set_resolution",

          resolution:
              state.resolution
      })
  );

  currentTimeframe.textContent =
      state.resolution;
}

// ============================================================
// RELOAD
// ============================================================

reloadButton.addEventListener(
  "click",
  async () => {
      reloadButton.disabled = true;

      reloadButton.innerHTML =
          "↻ Loading...";

      try {
          await loadProducts();
      } finally {
          reloadButton.disabled =
              false;

          reloadButton.innerHTML =
              "↻ Reload";
      }
  }
);

// ============================================================
// DISPLAY MODE
// ============================================================

displayMode.addEventListener(
  "change",
  () => {
      state.displayMode =
          displayMode.value;

      applyFilters();
  }
);

// ============================================================
// SEARCH
// ============================================================

searchInput.addEventListener(
  "input",
  () => {
      state.search =
          searchInput.value.trim();

      applyFilters();
  }
);

// ============================================================
// TAG FILTER
// ============================================================

tagFilter.addEventListener(
  "change",
  () => {
      state.tag =
          tagFilter.value;

      applyFilters();
  }
);

// ============================================================
// CHART LIMIT
// ============================================================

chartLimit.addEventListener(
  "change",
  () => {
      state.chartLimit =
          chartLimit.value;

      applyFilters();
  }
);

// ============================================================
// COLUMNS
// ============================================================

columns.addEventListener(
  "change",
  () => {
      state.columns =
          Number(columns.value);

      chartsContainer.style.setProperty(
          "--chart-columns",
          state.columns
      );
  }
);

// ============================================================
// TIMEFRAME
// ============================================================

timeframe.addEventListener(
  "change",
  () => {
      state.resolution =
          timeframe.value;

      currentTimeframe.textContent =
          state.resolution;

      sendResolutionChange();

      applyFilters();
  }
);

// ============================================================
// INITIALIZE
// ============================================================

async function initialize() {
  state.resolution =
      timeframe.value ||
      CONFIG.resolution;

  state.chartLimit =
      chartLimit.value ||
      String(
          CONFIG.defaultChartLimit
      );

  state.columns =
      Number(
          columns.value ||
          CONFIG.defaultColumns
      );

  state.displayMode =
      displayMode.value ||
      "selected";

  currentTimeframe.textContent =
      state.resolution;

  await loadProducts();

  connectWebSocket();
}

initialize();
