# EMA 50 / EMA 200 + Vercel live candle changes

- Added EMA 50 and EMA 200 overlays to every chart.
- Added independent Show/Hide checkboxes for EMA 50 and EMA 200.
- Added 50/200 bullish and bearish crossover markers.
- EMA values recalculate whenever the live candle updates.
- Increased historical candles from 150 to 300 so EMA 200 can initialize.
- The browser now connects directly to Delta Exchange's public WebSocket at `wss://public-socket.india.delta.exchange`, which avoids relying on a persistent `/ws` server on Vercel.
- Live subscriptions use Delta's `candlestick_<resolution>` channel with `MARK:<symbol>` symbols.
- Timeframe changes reconnect the browser WebSocket with the selected candle channel.
- Old `*-old.js` files were not modified or used.
