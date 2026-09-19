const CONFIG = {
  defaultChartLimit: 'all',
  defaultColumns: 4,
  resolution: "1d",
  maxCandles: 300
};

const SELECTED_SYMBOLS = [
    "BTCUSD",
    "BCHUSD",
    "ETHUSD",
    "ETCUSD",
    "PAXGUSD",
    "SLVONUSD",
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
    "LTCUSD",
    "MUSD",
    "GIGGLEUSD",
    "SOLUSD",
    "DOTUSD",
    "KSMUSD",
    "LINKUSD",
    "HYPEUSD",
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
    "RKLBBUSD",
    "LINKUSD",
    "AVAXUSD"
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
  reconnectTimer: null,
  showEMA50: false,
  showEMA200: false
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

const ema50Toggle =
  document.getElementById("ema50Toggle");

const ema200Toggle =
  document.getElementById("ema200Toggle");

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
    const selected =
        getSelectedSymbolSet();

    if (state.displayMode === "all") {
        return [...state.products];
    }

    return SELECTED_SYMBOLS
        .map(symbol => {
            return state.products.find(
                product =>
                    String(product.symbol || "")
                        .trim()
                        .toUpperCase() ===
                    symbol.toUpperCase()
            );
        })
        .filter(Boolean);
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
// EMA 50 / EMA 200
// ============================================================

function calculateEMA(candles, period) {
  if (!Array.isArray(candles) || candles.length < period) {
      return [];
  }

  const multiplier = 2 / (period + 1);
  const result = [];
  let sum = 0;

  // The candle array is already sorted. Only use finite closes.
  for (let i = 0; i < period; i++) {
      const close = Number(candles[i].close);
      if (!Number.isFinite(close)) return [];
      sum += close;
  }

  let ema = sum / period;
  result.push({
      time: Number(candles[period - 1].time),
      value: ema
  });

  for (let i = period; i < candles.length; i++) {
      const close = Number(candles[i].close);
      const time = Number(candles[i].time);
      if (!Number.isFinite(close) || !Number.isFinite(time)) continue;

      ema = ((close - ema) * multiplier) + ema;
      result.push({ time, value: ema });
  }

  return result;
}

function refreshEMAs(chartData) {
  const ema50 = calculateEMA(chartData.candles, 50);
  const ema200 = calculateEMA(chartData.candles, 200);

  if (chartData.ema50Series) {
      // Keep the EMA data loaded at all times. Use the series visibility
      // option for show/hide instead of replacing the data with [].
      chartData.ema50Series.setData(ema50);
      chartData.ema50Series.applyOptions({
          visible: state.showEMA50
      });
  }

  if (chartData.ema200Series) {
      chartData.ema200Series.setData(ema200);
      chartData.ema200Series.applyOptions({
          visible: state.showEMA200
      });
  }

  // Detect the latest 50/200 crossover. The marker is attached to
  // the candle where the relationship changed.
  const markers = [];
  const byTime50 = new Map(ema50.map(x => [x.time, x.value]));
  const byTime200 = new Map(ema200.map(x => [x.time, x.value]));
  const commonTimes = chartData.candles
      .map(c => c.time)
      .filter(t => byTime50.has(t) && byTime200.has(t));

  for (let i = 1; i < commonTimes.length; i++) {
      const prevTime = commonTimes[i - 1];
      const time = commonTimes[i];
      const prevDiff = byTime50.get(prevTime) - byTime200.get(prevTime);
      const diff = byTime50.get(time) - byTime200.get(time);

      if (prevDiff <= 0 && diff > 0) {
          markers.push({
              time,
              position: 'belowBar',
              color: '#20b26b',
              //shape: 'arrowUp',
              //text: '50/200 BULL'
          });
      } else if (prevDiff >= 0 && diff < 0) {
          markers.push({
              time,
              position: 'aboveBar',
              color: '#e05260',
              //shape: 'arrowDown',
              //text: '50/200 BEAR'
          });
      }
  }

  chartData.crossoverMarkers = markers.slice(-20);
  chartData.candleSeries.setMarkers(
      state.showEMA50 && state.showEMA200
          ? chartData.crossoverMarkers
          : []
  );
}

function applyEMAVisibility() {
  state.showEMA50 = Boolean(ema50Toggle?.checked);
  state.showEMA200 = Boolean(ema200Toggle?.checked);

  for (const chartData of state.charts.values()) {
      refreshEMAs(chartData);
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

  const ema50Series = chart.addLineSeries({
      color: "#f5c542",
      lineWidth: 1,
      lineVisible: true,
      visible: true,
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: true,
      //title: "EMA 50"
  });

  const ema200Series = chart.addLineSeries({
      color: "#68b541",
      lineWidth: 1,
      lineVisible: true,
      visible: true,
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: true,
      //title: "EMA 200"
  });

  const chartData = {
      symbol,

      product,

      card,

      chart,

      candleSeries,

      ema50Series,

      ema200Series,

      crossoverMarkers: [],

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

      refreshEMAs(chartData);

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

  refreshEMAs(chartData);

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
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
  }

  if (state.socket && (
      state.socket.readyState === WebSocket.OPEN ||
      state.socket.readyState === WebSocket.CONNECTING
  )) {
      return;
  }

  const socket = new WebSocket(
      "wss://public-socket.india.delta.exchange"
  );

  state.socket = socket;
  setConnectionStatus(false);
  connectionText.textContent = "CONNECTING";

  socket.addEventListener("open", () => {
      setConnectionStatus(true);
      subscribeBrowserDelta();
  });

  socket.addEventListener("message", event => {
      try {
          const message = JSON.parse(event.data);
          const type = String(message.type || "").toLowerCase();

          if (type === `candlestick_${state.resolution}` || type === "candlestick") {
              const data = message.data || message;
              const symbol = String(data.sy || data.symbol || "")
                  .replace(/^MARK:/i, "")
                  .trim()
                  .toUpperCase();

              updateLiveCandle({
                  type: "mark_candle",
                  symbol,
                  resolution: data.res || state.resolution,
                  time: data.ts ?? data.time,
                  open: data.o ?? data.open,
                  high: data.h ?? data.high,
                  low: data.l ?? data.low,
                  close: data.c ?? data.close
              });
          }
      } catch (error) {
          console.error("Delta WS message error:", error);
      }
  });

  socket.addEventListener("close", () => {
      setConnectionStatus(false);
      connectionText.textContent = "RECONNECTING";
      if (!state.reconnectTimer) {
          state.reconnectTimer = setTimeout(() => {
              state.reconnectTimer = null;
              connectWebSocket();
          }, 2000);
      }
  });

  socket.addEventListener("error", error => {
      console.error("Delta public WebSocket error:", error);
  });
}

function subscribeBrowserDelta() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;

  const symbols = [...state.charts.keys()].map(symbol => `MARK:${symbol}`);
  if (!symbols.length) return;

  state.socket.send(JSON.stringify({
      type: "subscribe",
      payload: {
          channels: [{
              name: `candlestick_${state.resolution}`,
              symbols
          }]
      }
  }));

  currentTimeframe.textContent = state.resolution;
}

// ============================================================
// SEND TIMEFRAME
// ============================================================

function sendResolutionChange() {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      try { state.socket.close(); } catch (_) {}
  }
  state.socket = null;
  currentTimeframe.textContent = state.resolution;
  connectWebSocket();
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
// EMA CONTROLS
// ============================================================

ema50Toggle?.addEventListener("change", applyEMAVisibility);
ema200Toggle?.addEventListener("change", applyEMAVisibility);

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
