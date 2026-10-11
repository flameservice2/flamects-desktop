// Builds app/ from src/FlameCTS.html for the desktop app.
// The page itself is left untouched except for two things the desktop app
// should carry with it instead of fetching on every start:
//   1. supabase-js (was loaded from cdn.jsdelivr.net)
//   2. the Sora and Inter fonts (were loaded from Google Fonts)
// Data still comes live from Supabase exactly as in the browser.
const fs = require('fs');
const path = require('path');
const { desktopize } = require('../lib/desktopize');
const pkg = require('../package.json');

const root = path.join(__dirname, '..');
const out = path.join(root, 'app');
const nm = path.join(root, 'node_modules');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor', 'fonts', 'files'), { recursive: true });

let html = fs.readFileSync(path.join(root, 'src', 'FlameCTS.html'), 'utf8');

function swap(re, replacement, what) {
  if (!re.test(html)) throw new Error('Could not find ' + what + ' in FlameCTS.html');
  html = html.replace(re, replacement);
}

// Save button + safe multi-user saving, added inline so the same page can
// also be used as the web version.
const liveCss = fs.readFileSync(path.join(root, 'src', 'live-save.css'), 'utf8');
const liveJs = fs.readFileSync(path.join(root, 'src', 'live-save.js'), 'utf8');
swap(/<\/style>\s*<\/head>/, '</style>\n<style>\n' + liveCss + '</style>\n</head>', 'the end of <head>');
swap(/<\/body>\s*<\/html>\s*$/, () => '<script>\n' + liveJs + '</script>\n</body>\n</html>\n', 'the end of <body>');
// Version stamp: lets an installed app tell whether a published update is newer.
swap(/<head>/, '<head>\n<meta name="flame-version" content="' + pkg.version + '">', 'the <head> tag');

fs.mkdirSync(path.join(root, 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'web', 'FlameCTS.html'), html);   // same page for the browser version

html = desktopize(html, true);

fs.copyFileSync(path.join(nm, '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
  path.join(out, 'vendor', 'supabase.js'));

// Same families and weights the page asked Google Fonts for (latin subsets).
const fonts = { sora: [500, 600, 700, 800], inter: [400, 500, 600, 700] };
let css = '';
for (const [family, weights] of Object.entries(fonts)) {
  const pkg = path.join(nm, '@fontsource', family);
  for (const w of weights) {
    for (const subset of ['latin']) {
      const file = `${family}-${subset}-${w}-normal.woff2`;
      const src = path.join(pkg, 'files', file);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(out, 'vendor', 'fonts', 'files', file));
      const name = family[0].toUpperCase() + family.slice(1);
      css += `@font-face{font-family:'${name}';font-style:normal;font-display:swap;font-weight:${w};src:url(files/${file}) format('woff2')}\n`;
    }
  }
}
fs.writeFileSync(path.join(out, 'vendor', 'fonts', 'fonts.css'), css);
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('app/ prepared');
