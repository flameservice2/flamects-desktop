// Fixed list of public video, reading and weather sources shown on the
// Dashboard. The page asks for app://flame/__feed/<key>; the main process
// fetches only these exact addresses (no CORS limits there) and hands back
// the text. Any other key is refused, so the page can't use this to reach
// arbitrary sites.
const yt = (id) => 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id;
const FEEDS = {
  // Watch: latest videos from a few well-made channels
  'yt-ted':      yt('UCAuUUnT6oDeKwE6v1NGQxug'),
  'yt-natgeo':   yt('UCpVm7bg6pXKo1Pr6k5kxG9A'),
  'yt-kurz':     yt('UCsXVk37bltHxD1rDPwtNM8Q'),
  'yt-aje':      yt('UCNye-wNBqNL5ZzHSJj3l8Bg'),
  'yt-bloomberg':yt('UCIALMKvObZNtJ6AmdCLP7Lg'),
  // Read: Wikipedia's featured content for today (article, picture, on this day)
  'wiki':        () => 'https://en.wikipedia.org/api/rest_v1/feed/featured/' + new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
  'weather':      'https://api.open-meteo.com/v1/forecast?latitude=25.2854&longitude=51.531&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FQatar&forecast_days=1'
};

async function handleFeed(key, fetchFn) {
  const src = Object.prototype.hasOwnProperty.call(FEEDS, key) ? FEEDS[key] : null;
  const url = typeof src === 'function' ? src() : src;
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
