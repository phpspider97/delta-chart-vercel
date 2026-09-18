const CONFIG = {

  defaultChartLimit: 'all',

  defaultColumns: 4,

  resolution: "1d",

  maxCandles: 150,

  swingStrength: 4

};


const state = {

  products: [],

  charts: new Map(),

  socket: null,

  connected: false,

  search: "",

  category: "all",

  chartLimit:
    CONFIG.defaultChartLimit,

  columns:
    CONFIG.defaultColumns,

  resolution:
    CONFIG.resolution,

  swingStrength:
    CONFIG.swingStrength

};


// ============================================================
// DOM
// ============================================================

const chartsContainer =
  document.getElementById(
    "chartsContainer"
  );


const searchInput =
  document.getElementById(
    "searchInput"
  );


const categoryFilter =
  document.getElementById(
    "categoryFilter"
  );


const chartLimit =
  document.getElementById(
    "chartLimit"
  );


const columnCount =
  document.getElementById(
    "columnCount"
  );


const resolutionSelect =
  document.getElementById(
    "resolutionSelect"
  );


const signalStrength =
  document.getElementById(
    "signalStrength"
  );


const reloadButton =
  document.getElementById(
    "reloadButton"
  );


const connectionStatus =
  document.getElementById(
    "connectionStatus"
  );


const currentResolution =
  document.getElementById(
    "currentResolution"
  );


const chartCount =
  document.getElementById(
    "chartCount"
  );


const buySignalCount =
  document.getElementById(
    "buySignalCount"
  );


const sellSignalCount =
  document.getElementById(
    "sellSignalCount"
  );


const emptyState =
  document.getElementById(
    "emptyState"
  );


// ============================================================
// TAGS
// ============================================================

function getProductTags(product) {
  //console.log('product : ',product)
  let tags =
    product.tags || [];


  if (
    typeof tags ===
    "string"
  ) {

    tags =
      tags.split(",");

  }


  if (
    !Array.isArray(tags)
  ) {

    tags = [];

  }


  return tags

    .flatMap(
      tag =>
        String(tag).split(",")
    )

    .map(
      tag =>
        tag.trim().toLowerCase()
    )

    .filter(Boolean)

    .filter(
      (tag, index, array) =>
        array.indexOf(tag) ===
        index
    );

}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {

  return String(
    value ?? ""
  )

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


// ============================================================
// LOAD PRODUCTS
// ============================================================

async function loadProducts() {

  try {

    const response =
      await fetch(
        "/api/products"
      );


    const data =
      await response.json();


    if (!data.success) {

      throw new Error(
        "Failed to load products"
      );

    }


    state.products =
      data.products || [];


    console.log(
      `Loaded ${state.products.length} products`
    );


    populateCategoryFilter();

  } catch (error) {

    console.error(
      "Product error:",
      error
    );

  }

}


// ============================================================
// UNIQUE TAG DROPDOWN
// ============================================================

function populateCategoryFilter() {

  const uniqueTags =
    new Set();


  for (
    const product
    of state.products
  ) {

    const tags =
      getProductTags(
        product
      );


    for (
      const tag
      of tags
    ) {

      uniqueTags.add(tag);

    }

  }


  const currentValue =
    categoryFilter.value;


  categoryFilter.innerHTML = `

    <option value="all">
      All Tags
    </option>

  `;


  [
    ...uniqueTags
  ]

    .sort()

    .forEach(tag => {

      const option =
        document.createElement(
          "option"
        );


      option.value = tag;

      option.textContent =
        tag.toUpperCase();


      categoryFilter.appendChild(
        option
      );

    });


  if (
    [
      ...categoryFilter.options
    ].some(
      option =>
        option.value ===
        currentValue
    )
  ) {

    categoryFilter.value =
      currentValue;

  } else {

    categoryFilter.value =
      "all";

    state.category =
      "all";

  }

}


// ============================================================
// FILTER PRODUCTS
// ============================================================

function getFilteredProducts() {

  let products =
    [...state.products];


  // ==========================================================
  // SEARCH
  // ==========================================================

  if (state.search) {

    const search =
      state.search
        .toLowerCase()
        .trim();


    products =
      products.filter(
        product => {

          const symbol =
            String(
              product.symbol || ""
            ).toLowerCase();


          const tags =
            getProductTags(
              product
            );


          if (
            symbol.includes(
              search
            )
          ) {

            return true;

          }


          return tags.some(
            tag =>
              tag.includes(
                search
              )
          );

        }
      );

  }


  // ==========================================================
  // TAG FILTER
  // ==========================================================

  if (
    state.category !==
    "all"
  ) {

    const selected =
      state.category
        .toLowerCase()
        .trim();


    products =
      products.filter(
        product => {

          const tags =
            getProductTags(
              product
            );


          return tags.includes(
            selected
          );

        }
      );

  }


  // ==========================================================
  // LIMIT
  // ==========================================================

  if (
    state.chartLimit !==
    "all"
  ) {

    products =
      products.slice(
        0,
        Number(
          state.chartLimit
        )
      );

  }


  return products;

}


// ============================================================
// CREATE CHART CARD
// ============================================================

function createChartCard(
  product
) {

  const card =
    document.createElement(
      "div"
    );


  card.className =
    "chart-card";


  const tags =
    getProductTags(
      product
    );


  const tagText =
    tags.length
      ? tags
          .map(
            tag =>
              tag.toUpperCase()
          )
          .join(", ")
      : "ALT";


  card.innerHTML = `

    <div class="chart-header">

      <div class="chart-symbol-wrapper">

        <span class="chart-symbol">
          ${escapeHtml(
            product.symbol
          )}
        </span>

        <span
          class="chart-tags"
          title="${escapeHtml(
            tagText
          )}"
        >
          ${escapeHtml(
            tagText
          )}
        </span>

      </div>


      <span
        class="chart-price"
        data-price
      >
        -
      </span>

    </div>


    <div class="chart"></div>

  `;


  chartsContainer.appendChild(
    card
  );


  const chartElement =
    card.querySelector(
      ".chart"
    );


  const priceElement =
    card.querySelector(
      "[data-price]"
    );


  const chart =
    LightweightCharts.createChart(
      chartElement,
      {

        layout: {

          background: {
            color:
              "#111923"
          },

          textColor:
            "#9da9b5"

        },


        grid: {

          vertLines: {
            color:
              "#1d2732"
          },

          horzLines: {
            color:
              "#1d2732"
          }

        },


        rightPriceScale: {

          borderColor:
            "#303b47"

        },


        timeScale: {

          borderColor:
            "#303b47",

          timeVisible:
            true,

          secondsVisible:
            false,


          tickMarkFormatter:
            time => {

              const date =
                new Date(
                  Number(time) *
                    1000
                );


              return date.toLocaleString(
                "en-IN",
                {

                  timeZone:
                    "Asia/Kolkata",

                  day:
                    "2-digit",

                  month:
                    "2-digit",

                  hour:
                    "2-digit",

                  minute:
                    "2-digit",

                  hour12:
                    false

                }
              );

            }

        },


        localization: {

          timeFormatter:
            time => {

              const date =
                new Date(
                  Number(time) *
                    1000
                );


              return date.toLocaleString(
                "en-IN",
                {

                  timeZone:
                    "Asia/Kolkata",

                  day:
                    "2-digit",

                  month:
                    "2-digit",

                  hour:
                    "2-digit",

                  minute:
                    "2-digit",

                  hour12:
                    false

                }

              );

            }

        }

      }
    );


  const series =
    chart.addCandlestickSeries({

      upColor:
        "#26a69a",

      downColor:
        "#ef5350",

      borderVisible:
        false,

      wickUpColor:
        "#26a69a",

      wickDownColor:
        "#ef5350"

    });


  const chartData = {

    product,

    card,

    chart,

    series,

    priceElement,

    candles: [],

    candleMap:
      new Map(),

    signals: [],

    markers: []

  };


  state.charts.set(
    product.symbol,
    chartData
  );


  loadHistoricalCandles(
    product.symbol
  );


  return card;

}


// ============================================================
// LOAD HISTORICAL CANDLES
// ============================================================

async function loadHistoricalCandles(
  symbol
) {

  try {

    const chartData =
      state.charts.get(
        symbol
      );


    if (!chartData) {
      return;
    }


    const response =
      await fetch(
        `/api/candles/${encodeURIComponent(
          symbol
        )}?resolution=${encodeURIComponent(
          state.resolution
        )}`
      );


    const data =
      await response.json();


    if (
      !data.success
    ) {

      throw new Error(
        "Failed to load candles"
      );

    }


    const candles =
      data.candles || [];


    chartData.candles =
      candles;


    chartData.candleMap =
      new Map(
        candles.map(
          candle => [
            candle.time,
            candle
          ]
        )
      );


    chartData.series.setData(
      candles
    );


    if (candles.length) {

      const last =
        candles[
          candles.length - 1
        ];


      updatePriceDisplay(
        chartData,
        last.close
      );

    }


    // ========================================================
    // RUN PRICE ACTION ENGINE
    // ========================================================

    calculatePriceActionSignals(
      chartData
    );


  } catch (error) {

    console.error(
      `Historical candle error ${symbol}:`,
      error
    );

  }

}


// ============================================================
// PRICE FORMAT
// ============================================================

function formatPrice(
  price
) {

  const value =
    Number(price);


  if (
    !Number.isFinite(value)
  ) {

    return "-";

  }


  if (value >= 1000) {

    return value.toLocaleString(
      "en-IN",
      {
        maximumFractionDigits:
          2
      }
    );

  }


  if (value >= 1) {

    return value.toFixed(
      4
    );

  }


  return value.toFixed(
    8
  );

}


// ============================================================
// PRICE DISPLAY
// ============================================================

function updatePriceDisplay(
  chartData,
  price
) {

  if (
    !chartData.priceElement
  ) {
    return;
  }


  chartData.priceElement.textContent =
    formatPrice(price);

}


// ============================================================
// IS SWING HIGH?
//
// A candle is a swing high when its HIGH is higher than
// N candles on the left and N candles on the right.
// ============================================================

function isSwingHigh(
  candles,
  index,
  strength
) {

  if (
    index - strength < 0 ||
    index + strength >=
      candles.length
  ) {

    return false;

  }


  const high =
    candles[index].high;


  for (
    let i = 1;
    i <= strength;
    i++
  ) {

    if (
      high <=
      candles[index - i].high
    ) {

      return false;

    }


    if (
      high <=
      candles[index + i].high
    ) {

      return false;

    }

  }


  return true;

}


// ============================================================
// IS SWING LOW?
// ============================================================

function isSwingLow(
  candles,
  index,
  strength
) {

  if (
    index - strength < 0 ||
    index + strength >=
      candles.length
  ) {

    return false;

  }


  const low =
    candles[index].low;


  for (
    let i = 1;
    i <= strength;
    i++
  ) {

    if (
      low >=
      candles[index - i].low
    ) {

      return false;

    }


    if (
      low >=
      candles[index + i].low
    ) {

      return false;

    }

  }


  return true;

}


// ============================================================
// BULLISH ENGULFING
// ============================================================

function isBullishEngulfing(
  previous,
  current
) {

  if (!previous || !current) {
    return false;
  }


  const previousBearish =
    previous.close <
    previous.open;


  const currentBullish =
    current.close >
    current.open;


  return (
    previousBearish &&
    currentBullish &&
    current.open <=
      previous.close &&
    current.close >=
      previous.open
  );

}


// ============================================================
// BEARISH ENGULFING
// ============================================================

function isBearishEngulfing(
  previous,
  current
) {

  if (!previous || !current) {
    return false;
  }


  const previousBullish =
    previous.close >
    previous.open;


  const currentBearish =
    current.close <
    current.open;


  return (
    previousBullish &&
    currentBearish &&
    current.open >=
      previous.close &&
    current.close <=
      previous.open
  );

}


// ============================================================
// PRICE ACTION SIGNAL ENGINE
// ============================================================

function calculatePriceActionSignals(
  chartData
) {

  const candles =
    chartData.candles;


  if (
    candles.length <
    state.swingStrength * 2 + 5
  ) {

    return;

  }


  const strength =
    state.swingStrength;


  const swingHighs = [];
  const swingLows = [];


  // ==========================================================
  // FIND ALL CONFIRMED SWINGS
  // ==========================================================

  for (
    let i = strength;
    i <
      candles.length -
        strength;
    i++
  ) {

    if (
      isSwingHigh(
        candles,
        i,
        strength
      )
    ) {

      swingHighs.push({
        index: i,

        time:
          candles[i].time,

        price:
          candles[i].high
      });

    }


    if (
      isSwingLow(
        candles,
        i,
        strength
      )
    ) {

      swingLows.push({
        index: i,

        time:
          candles[i].time,

        price:
          candles[i].low
      });

    }

  }


  const signals = [];


  // ==========================================================
  // STATE
  // ==========================================================

  let previousSwingLow =
    null;

  let previousSwingHigh =
    null;

  let higherLow =
    null;

  let lowerHigh =
    null;


  let lastBrokenHighTime =
    null;

  let lastBrokenLowTime =
    null;


  // ==========================================================
  // PROCESS CANDLES
  // ==========================================================

  for (
    let i = 0;
    i < candles.length;
    i++
  ) {

    const candle =
      candles[i];


    // ========================================================
    // CONFIRMED SWING LOW
    // ========================================================

    const swingLow =
      swingLows.find(
        swing =>
          swing.index === i
      );


    if (swingLow) {

      if (
        previousSwingLow
      ) {

        // Higher Low

        if (
          swingLow.price >
          previousSwingLow.price
        ) {

          higherLow =
            swingLow;

        }

      }


      previousSwingLow =
        swingLow;

    }


    // ========================================================
    // CONFIRMED SWING HIGH
    // ========================================================

    const swingHigh =
      swingHighs.find(
        swing =>
          swing.index === i
      );


    if (swingHigh) {

      if (
        previousSwingHigh
      ) {

        // Lower High

        if (
          swingHigh.price <
          previousSwingHigh.price
        ) {

          lowerHigh =
            swingHigh;

        }

      }


      previousSwingHigh =
        swingHigh;

    }


    // ========================================================
    // BUY
    //
    // Higher Low exists
    // +
    // Current candle closes above previous swing high
    // ========================================================

    if (
      higherLow &&
      previousSwingHigh &&
      higherLow.index <
        i &&
      previousSwingHigh.index <
        i &&
      candle.close >
        previousSwingHigh.price
    ) {

      if (
        lastBrokenHighTime !==
        previousSwingHigh.time
      ) {

        const previous =
          candles[i - 1];


        const bullishCandle =
          candle.close >
          candle.open;


        const engulfing =
          isBullishEngulfing(
            previous,
            candle
          );


        if (
          bullishCandle ||
          engulfing
        ) {

          signals.push({

            type: "BUY",

            time:
              candle.time,

            price:
              candle.low,

            signalPrice:
              candle.close,

            swingLow:
              higherLow.price,

            brokenLevel:
              previousSwingHigh.price,

            reason:
              engulfing
                ? "Higher Low + Bullish Engulfing + Break"
                : "Higher Low + Bullish Break"

          });


          lastBrokenHighTime =
            previousSwingHigh.time;


          // Prevent repeated BUYs
          higherLow =
            null;

        }

      }

    }


    // ========================================================
    // SELL
    //
    // Lower High exists
    // +
    // Current candle closes below previous swing low
    // ========================================================

    if (
      lowerHigh &&
      previousSwingLow &&
      lowerHigh.index <
        i &&
      previousSwingLow.index <
        i &&
      candle.close <
        previousSwingLow.price
    ) {

      if (
        lastBrokenLowTime !==
        previousSwingLow.time
      ) {

        const previous =
          candles[i - 1];


        const bearishCandle =
          candle.close <
          candle.open;


        const engulfing =
          isBearishEngulfing(
            previous,
            candle
          );


        if (
          bearishCandle ||
          engulfing
        ) {

          signals.push({

            type: "SELL",

            time:
              candle.time,

            price:
              candle.high,

            signalPrice:
              candle.close,

            swingHigh:
              lowerHigh.price,

            brokenLevel:
              previousSwingLow.price,

            reason:
              engulfing
                ? "Lower High + Bearish Engulfing + Break"
                : "Lower High + Bearish Break"

          });


          lastBrokenLowTime =
            previousSwingLow.time;


          // Prevent repeated SELLs
          lowerHigh =
            null;

        }

      }

    }

  }


  chartData.signals =
    signals;


  drawSignalMarkers(
    chartData
  );


  updateSignalCounters();

}


// ============================================================
// DRAW BUY / SELL MARKERS
// ============================================================

function drawSignalMarkers(
  chartData
) {

  const markers =
    chartData.signals.map(
      signal => {

        if (
          signal.type ===
          "BUY"
        ) {

          return {

            time:
              signal.time,

            position:
              "belowBar",

            color:
              "#4ade80",

            shape:
              "arrowUp",

            text:
              "BUY"

          };

        }


        return {

          time:
            signal.time,

          position:
            "aboveBar",

          color:
            "#f87171",

          shape:
            "arrowDown",

          text:
            "SELL"

        };

      }
    );


  chartData.markers =
    markers;


  // Lightweight Charts 4.x
  // supports setMarkers on series.

  if (
    typeof chartData.series.setMarkers ===
    "function"
  ) {

    // chartData.series.setMarkers(
    //   markers
    // );

  } else {

    console.warn(
      "setMarkers() is not available in this Lightweight Charts version."
    );

  }

}


// ============================================================
// SIGNAL COUNTERS
// ============================================================

function updateSignalCounters() {

  let buys = 0;
  let sells = 0;


  for (
    const chartData
    of state.charts.values()
  ) {

    for (
      const signal
      of chartData.signals
    ) {

      if (
        signal.type ===
        "BUY"
      ) {

        buys++;

      }


      if (
        signal.type ===
        "SELL"
      ) {

        sells++;

      }

    }

  }


  buySignalCount.textContent =
    buys;


  sellSignalCount.textContent =
    sells;

}


// ============================================================
// UPDATE LIVE CANDLE
// ============================================================

function updateLiveCandle(
  message
) {

  const chartData =
    state.charts.get(
      message.symbol
    );


  if (!chartData) {
    return;
  }


  const candle = {

    time:
      Number(message.time),

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
    !Number.isFinite(
      candle.time
    )
  ) {
    return;
  }


  if (
    !Number.isFinite(
      candle.open
    ) ||
    !Number.isFinite(
      candle.high
    ) ||
    !Number.isFinite(
      candle.low
    ) ||
    !Number.isFinite(
      candle.close
    )
  ) {
    return;
  }


  chartData.candleMap.set(
    candle.time,
    candle
  );


  const existingIndex =
    chartData.candles.findIndex(
      item =>
        item.time ===
        candle.time
    );


  if (
    existingIndex !==
    -1
  ) {

    chartData.candles[
      existingIndex
    ] = candle;

  } else {

    chartData.candles.push(
      candle
    );

    chartData.candles.sort(
      (a, b) =>
        a.time - b.time
    );

  }


  if (
    chartData.candles.length >
    CONFIG.maxCandles
  ) {

    chartData.candles =
      chartData.candles.slice(
        -CONFIG.maxCandles
      );

  }


  chartData.series.update(
    candle
  );


  updatePriceDisplay(
    chartData,
    candle.close
  );


  // ==========================================================
  // RECALCULATE PRICE ACTION
  // ==========================================================

  calculatePriceActionSignals(
    chartData
  );

}


// ============================================================
// RENDER CHARTS
// ============================================================

function renderCharts() {

  state.charts.forEach(
    chartData => {

      try {

        chartData.chart.remove();

      } catch {
        // ignore
      }

    }
  );


  state.charts.clear();


  chartsContainer.innerHTML =
    "";


  chartsContainer.style.setProperty(
    "--chart-columns",
    state.columns
  );


  const filteredProducts =
    getFilteredProducts();


  chartCount.textContent =
    filteredProducts.length;


  if (
    filteredProducts.length ===
    0
  ) {

    emptyState.classList.remove(
      "hidden"
    );

    updateSignalCounters();

    return;

  }


  emptyState.classList.add(
    "hidden"
  );


  for (
    const product
    of filteredProducts
  ) {

    createChartCard(
      product
    );

  }


  currentResolution.textContent =
    state.resolution;


  updateSignalCounters();

}


// ============================================================
// BROWSER WS
// ============================================================

function connectBrowserWebSocket() {

  if (
    state.socket &&
    state.socket.readyState ===
      WebSocket.OPEN
  ) {

    state.socket.close();

  }


  const protocol =
    location.protocol ===
    "https:"
      ? "wss:"
      : "ws:";


  const wsUrl =
    `${protocol}//${location.host}/ws`;


  state.socket =
    new WebSocket(
      wsUrl
    );


  state.socket.onopen =
    () => {

      console.log(
        "Browser WebSocket connected"
      );

      state.connected =
        true;

      updateConnectionStatus();

    };


  state.socket.onmessage =
    event => {

      try {

        const message =
          JSON.parse(
            event.data
          );


        if (
          message.type ===
          "mark_candle"
        ) {

          updateLiveCandle(
            message
          );

        }


        if (
          message.type ===
          "delta_status"
        ) {

          state.connected =
            message.connected;

          updateConnectionStatus();

        }


        if (
          message.type ===
          "resolution_changed"
        ) {

          currentResolution.textContent =
            message.resolution;

        }

      } catch (error) {

        console.error(
          "WS message error:",
          error
        );

      }

    };


  state.socket.onclose =
    () => {

      state.connected =
        false;

      updateConnectionStatus();


      setTimeout(
        connectBrowserWebSocket,
        2000
      );

    };


  state.socket.onerror =
    error => {

      console.error(
        "Browser WS error:",
        error
      );

    };

}


// ============================================================
// CONNECTION STATUS
// ============================================================

function updateConnectionStatus() {

  if (
    state.connected
  ) {

    connectionStatus.textContent =
      "Connected";


    connectionStatus.className =
      "status connected";

  } else {

    connectionStatus.textContent =
      "Disconnected";


    connectionStatus.className =
      "status disconnected";

  }

}


// ============================================================
// TIMEFRAME
// ============================================================

function changeTimeframe(
  resolution
) {

  if (
    state.resolution ===
    resolution
  ) {

    return;

  }


  state.resolution =
    resolution;


  currentResolution.textContent =
    resolution;


  renderCharts();


  if (
    state.socket &&
    state.socket.readyState ===
      WebSocket.OPEN
  ) {

    state.socket.send(
      JSON.stringify({

        type:
          "set_resolution",

        resolution

      })
    );

  }

}


// ============================================================
// SEARCH
// ============================================================

searchInput.addEventListener(
  "input",
  event => {

    state.search =
      event.target.value;

    renderCharts();

  }
);


// ============================================================
// TAG FILTER
// ============================================================

categoryFilter.addEventListener(
  "change",
  event => {

    state.category =
      event.target.value;

    renderCharts();

  }
);


// ============================================================
// CHART LIMIT
// ============================================================

chartLimit.addEventListener(
  "change",
  event => {

    state.chartLimit =
      event.target.value;

    renderCharts();

  }
);


// ============================================================
// COLUMNS
// ============================================================

columnCount.addEventListener(
  "change",
  event => {

    state.columns =
      Number(
        event.target.value
      );


    chartsContainer.style.setProperty(
      "--chart-columns",
      state.columns
    );

  }
);


// ============================================================
// TIMEFRAME SELECT
// ============================================================

resolutionSelect.addEventListener(
  "change",
  event => {

    changeTimeframe(
      event.target.value
    );

  }
);


// ============================================================
// SWING STRENGTH
// ============================================================

signalStrength.addEventListener(
  "change",
  event => {

    state.swingStrength =
      Number(
        event.target.value
      );


    console.log(
      "Swing strength:",
      state.swingStrength
    );


    for (
      const chartData
      of state.charts.values()
    ) {

      calculatePriceActionSignals(
        chartData
      );

    }

  }
);


// ============================================================
// RELOAD
// ============================================================

reloadButton.addEventListener(
  "click",
  async () => {

    reloadButton.disabled =
      true;


    reloadButton.textContent =
      "Loading...";


    try {

      await loadProducts();

      renderCharts();


      if (
        state.socket &&
        state.socket.readyState ===
          WebSocket.OPEN
      ) {

        state.socket.send(
          JSON.stringify({

            type:
              "set_resolution",

            resolution:
              state.resolution

          })
        );

      }

    } finally {

      reloadButton.disabled =
        false;


      reloadButton.textContent =
        "Reload";

    }

  }
);


// ============================================================
// INITIALIZE
// ============================================================

async function initialize() {

  resolutionSelect.value =
    state.resolution;


  chartLimit.value =
    state.chartLimit;


  columnCount.value =
    state.columns;


  signalStrength.value =
    state.swingStrength;


  await loadProducts();


  renderCharts();


  connectBrowserWebSocket();

}


initialize();
