// Preloaded into the server process: replaces global fetch so NO real network is used.
// Behaviour per venue comes from MOCK_STATE (JSON file); every outgoing URL is logged.
import fs from 'node:fs';
const T0 = 1_700_000_000_000, H = 3_600_000;
const res = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input) => {
  const url = String(input);
  fs.appendFileSync(process.env.MOCK_LOG, url + '\n');
  const st = JSON.parse(fs.readFileSync(process.env.MOCK_STATE, 'utf8'));
  if (url.includes('api.bybit.com')) {
    if (st.bybit !== 'ok') return res({ retCode: 10024, retMsg: 'blocked' }, 403);
    return url.includes('/kline')
      ? res({ retCode: 0, result: { list: [3, 2, 1].map(i => [String(T0 + i * H), '100', '101', '99', '100.5', '10', '1000']) } })
      : res({ retCode: 0, result: { list: [{ symbol: 'BTCUSDT', lastPrice: '100.5', markPrice: '100.4' }] } });
  }
  if (url.includes('okx.com')) {
    if (st.okx !== 'ok') return res({ code: '50000', msg: 'down' }, 503);
    return url.includes('/candles')   // OKX is newest-first: [ts,o,h,l,c,vol(contracts),volCcy,volCcyQuote,confirm]
      ? res({ code: '0', data: [3, 2, 1].map(i => [String(T0 + i * H), '100', '101', '99', '100.5', '5000', '12.5', '1250', '1']) })
      : res({ code: '0', data: [{ last: '100.6', high24h: '105', low24h: '95', open24h: '99', volCcy24h: '777' }] });
  }
  if (url.includes('fapi.binance.com')) {
    if (st.binance !== 'ok') return res({ msg: 'down' }, 451);
    return url.includes('/klines')    // Binance is oldest-first
      ? res([1, 2, 3].map(i => [T0 + i * H, '100', '101', '99', '100.7', '33', T0 + i * H + H - 1, '3300']))
      : res({ lastPrice: '100.7', highPrice: '105', lowPrice: '95', openPrice: '99', volume: '888', quoteVolume: '88800' });
  }
  if (url.includes('coingecko') || url.includes('api.binance.com')) {
    // CoinGecko (spot, fabricated volume) and Binance SPOT must never be called.
    return res({ forbidden: true }, 500);
  }
  return res({}, 404);
};
