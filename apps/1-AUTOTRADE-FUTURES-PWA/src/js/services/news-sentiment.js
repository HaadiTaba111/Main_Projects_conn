/**
 * 📰 ماژول ۴: news-sentiment.js
 * جمع‌آوری احساسات خبری و پردازش واژگان کلیدی صعودی/نزولی.
 */

const CRYPTOPANIC_URL = 'https://cryptopanic.com/api/v1/posts/';

const BULLISH_WORDS = ['surge', 'rally', 'bullish', 'etf', 'approval', 'partnership', 'adoption', 'all-time high', 'ath', 'upgrade', 'institutional', 'accumulate', 'buy'];
const BEARISH_WORDS = ['crash', 'dump', 'bearish', 'hack', 'exploit', 'sec sues', 'lawsuit', 'ban', 'delist', 'liquidation', 'sell-off', 'fud', 'rug', 'scam'];

export async function fetchNews({ apiKey, currency = 'BTC', hours = 6, kind = 'news' } = {}) {
  if (!apiKey) return { ok: false, error: 'API key موجود نیست', news: [] };
  const url = `${CRYPTOPANIC_URL}?auth_token=${apiKey}&currencies=${currency}&kind=${kind}&public=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, news: [] };
    const data = await res.json();
    const since = Date.now() - hours * 3600_000;
    const news = (data.results || [])
      .filter(n => new Date(n.published_at).getTime() >= since)
      .map(n => ({
        ts: new Date(n.published_at).getTime(),
        title: n.title,
        source: n.source?.title || 'unknown',
        url: n.url,
        votes: {
          positive: n.votes?.positive || 0,
          negative: n.votes?.negative || 0,
          important: n.votes?.important || 0,
          liked: n.votes?.liked || 0,
          disliked: n.votes?.disliked || 0
        }
      }));
    return { ok: true, news };
  } catch (err) {
    return { ok: false, error: err.message, news: [] };
  }
}

export function scoreSentiment(news) {
  if (!Array.isArray(news) || !news.length) return { score: 0, bullish: 0, bearish: 0, topNews: null };
  let score = 0, bullish = 0, bearish = 0;
  let topNews = null, topWeight = 0;

  for (const n of news) {
    const text = (n.title || '').toLowerCase();
    const votes = n.votes || {};
    const voteWeight = ((votes.positive || 0) - (votes.negative || 0)) * 0.5 + ((votes.important || 0) * 0.3);
    let wordScore = 0;
    for (const w of BULLISH_WORDS) if (text.includes(w)) wordScore += 1;
    for (const w of BEARISH_WORDS) if (text.includes(w)) wordScore -= 1;
    const itemScore = wordScore + voteWeight;
    score += itemScore;
    if (wordScore > 0) bullish++;
    if (wordScore < 0) bearish++;
    if (Math.abs(itemScore) > topWeight) { topWeight = Math.abs(itemScore); topNews = n; }
  }
  const normalized = Math.max(-30, Math.min(30, Number((score * 2).toFixed(1))));
  return { score: normalized, bullish, bearish, topNews, total: news.length };
}

export async function getNewsSignal({ apiKey, currency } = {}) {
  const { ok, news, error } = await fetchNews({ apiKey, currency });
  if (!ok) return { ok: false, error, score: 0 };
  const sentiment = scoreSentiment(news);
  return { ok: true, ...sentiment };
}
