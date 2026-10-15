// Fixed list of public news / weather / exchange-rate sources shown on the
// Dashboard. The page asks for app://flame/__feed/<key>; the main process
// fetches only these exact addresses (no CORS limits there) and hands back
// the text. Any other key is refused, so the page can't use this to reach
// arbitrary sites.
// Google News search, Qatar edition, for work opportunities in Flame's lines.
const gn = (q) => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-QA&gl=QA&ceid=QA:en';
const FEEDS = {
  'qatar':        'https://news.google.com/rss/search?q=Qatar&hl=en-QA&gl=QA&ceid=QA:en',
  'qatar-top':    'https://news.google.com/rss?hl=en-QA&gl=QA&ceid=QA:en',
  'world-bbc':    'https://feeds.bbci.co.uk/news/world/rss.xml',
  'world-aj':     'https://www.aljazeera.com/xml/rss/all.xml',
  'business':     'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-QA&gl=QA&ceid=QA:en',
  'business-bbc': 'https://feeds.bbci.co.uk/news/business/rss.xml',
  'weather':      'https://api.open-meteo.com/v1/forecast?latitude=25.2854&longitude=51.531&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FQatar&forecast_days=1',
  'opp-all':          gn('Qatar (tender OR "contract awarded" OR RFQ OR bid OR "invites bids") (road OR construction OR maintenance OR equipment OR contracting OR supply) when:30d'),
  'opp-road':         gn('Qatar ("road works" OR roadworks OR "road project" OR "road maintenance" OR Ashghal) (tender OR contract OR awarded OR project) when:60d'),
  'opp-tma':          gn('Qatar ("traffic management" OR "truck mounted attenuator" OR "traffic diversion" OR "vehicle rental" OR "vehicle hire" OR "fleet rental") when:90d'),
  'opp-heavy':        gn('Qatar ("heavy equipment" OR "construction equipment" OR crane OR excavator OR "equipment rental") (tender OR supply OR contract OR rental) when:90d'),
  'opp-trading':      gn('Qatar ("industrial supplies" OR "industrial trading" OR procurement OR "supply contract" OR "local suppliers") when:60d'),
  'opp-construction': gn('Qatar (construction OR maintenance) (tender OR "contract awarded" OR "awards contract" OR bid) when:60d'),
  'opp-contracting':  gn('Qatar ("general contracting" OR "main contractor" OR "EPC contract" OR "contract awarded" OR subcontract) when:60d')
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
