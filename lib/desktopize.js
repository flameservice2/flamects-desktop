// Turns the browser copy of FlameCTS.html into the desktop page: supabase-js
// and the fonts come from the files shipped with the app instead of the
// internet. Used by scripts/prepare.js at build time (strict: every swap
// must apply) and by main.js when an update is downloaded (lenient: a page
// that already points somewhere else is left as it is).
function desktopize(html, strict) {
  const swaps = [
    [/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/,
      '<script src="vendor/supabase.js"></script>', 'the supabase-js script tag'],
    [/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/, '', 'the Google Fonts preconnect'],
    [/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/,
      '<link href="vendor/fonts/fonts.css" rel="stylesheet">', 'the Google Fonts stylesheet']
  ];
  for (const [re, rep, what] of swaps) {
    if (!re.test(html)) { if (strict) throw new Error('Could not find ' + what + ' in FlameCTS.html'); continue; }
    html = html.replace(re, rep);
  }
  return html;
}
module.exports = { desktopize };
