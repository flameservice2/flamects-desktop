// Fixed list of public news and weather sources shown on the
// Dashboard. The page asks for app://flame/__feed/<key>; the main process
// fetches only these exact addresses (no CORS limits there) and hands back
// the text. Any other key is refused, so the page can't use this to reach
// arbitrary sites.
const FEEDS = {
  'qatar':        'https://news.google.com/rss/search?q=Qatar&hl=en-QA&gl=QA&ceid=QA:en',
  'qatar-top':    'https://news.google.com/rss?hl=en-QA&gl=QA&ceid=QA:en',
  'world-bbc':    'https://feeds.bbci.co.uk/news/world/rss.xml',
  'world-aj':     'https://www.aljazeera.com/xml/rss/all.xml',
  'business':     'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-QA&gl=QA&ceid=QA:en',
  'business-bbc': 'https://feeds.bbci.co.uk/news/business/rss.xml',
  'weather':      'https://api.open-meteo.com/v1/forecast?latitude=25.2854&longitude=51.531&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FQatar&forecast_days=1'
};

async function handleFeed(key, fetchFn) {
  const url = Object.prototype.hasOwnProperty.call(FEEDS, key) ? FEEDS[key] : null;
  if (!url) return new Response('Not found', { status: 404 });
  try {
    const r = await fetchFn(url, { headers: { 'user-agent': 'Mozilla/5.0 FlameCTS' } });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'text/plain', 'cache-control': 'no-store' } });
  } catch (e) {
    return new Response('Offline', { status: 503 });
  }
}

module.exports = { FEEDS, handleFeed };
