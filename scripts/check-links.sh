#!/usr/bin/env bash
# Checks that every outside address the app uses still answers: the
# company/tender sites linked from the page, the Dashboard news/weather
# feeds, the database host and the update files for PCs and phones.
# Run by the "Check links" workflow (GitHub can reach these sites).
set -u
ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
bad=0
check() {  # label url
  code=$(curl -s -o /dev/null -m 25 -L -A "$ua" -w '%{http_code}' "$2" || true)
  case "$code" in 2*|3*) mark=OK;; 401|403|405) mark=OK-ANSWERS;; *) mark=FAIL; bad=$((bad+1));; esac
  printf '%-10s %s  %s  (%s)\n' "$mark" "$code" "$2" "$1"
}
for u in $(grep -oE "https://[a-z0-9.-]+\.(qa|com)(/[a-zA-Z0-9/_-]*)?" src/FlameCTS.html | grep -vE "supabase|github|google|jsdelivr|cloudflare|appspot|wa\.me|rss2json|wikipedia|open-meteo|youtube" | sort -u); do check "page link" "$u"; done
node -e "const {FEEDS}=require('./feeds'); for (const [k,v] of Object.entries(FEEDS)) console.log(k+' '+(typeof v==='function'?v():v))" | while read -r k u; do check "feed $k" "$u"; done
for k in yt-ted yt-aje; do u=$(node -e "console.log('https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(require('./feeds').FEEDS['$k']))"); check "web feed $k" "$u"; done
sb=$(grep -o 'const SUPABASE_URL = "[^"]*"' src/FlameCTS.html | cut -d'"' -f2)
check "database" "$sb/rest/v1/"
v=$(node -p "require('./package.json').version")
check "PC update feed" "https://github.com/flameservice2/flamects-desktop/releases/latest/download/latest.yml"
check "PC installer v$v" "https://github.com/flameservice2/flamects-desktop/releases/download/v$v/FlameCTS-Setup-$v.exe"
check "phone page update" "https://github.com/flameservice2/flamects-desktop/releases/latest/download/FlameCTS-app.html"
check "phone app info" "https://raw.githubusercontent.com/flameservice2/flamects-desktop/main/android/latest.json"
check "phone APK" "$(node -p "require('./android/latest.json').apk")"
echo "Failed: $bad"
