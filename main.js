const { app, BrowserWindow, Menu, protocol, net, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { pathToFileURL } = require('url');

// Serve the page from app://flame/ rather than file:// so it has a real,
// stable origin: the Supabase login session and offline cache (both kept in
// localStorage) survive restarts, and realtime/fetch behave as in a browser.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

const APP_DIR = path.join(__dirname, 'app');
let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(start);
}

function start() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(APP_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] }
  ]));

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 360,
    minHeight: 500,
    show: false,
    title: 'Flame Contracting Trading & Service WLL',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#1f1915',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true }
  });

  // Website, mail, phone and WhatsApp links open in the user's normal apps.
  const openOutside = (url) => {
    if (/^(https?|mailto|tel|whatsapp):/i.test(url)) shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); openOutside(url); }
  });

  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('app://flame/index.html');
  if (app.isPackaged) startAutoUpdate();
}

// Software updates: new versions are published as GitHub releases. The app
// checks when it starts and every 4 hours, downloads a newer version in the
// background (the download is checked against the release's checksum), and
// offers a restart. If the user picks "Later" it installs when the app is
// closed. Business data is untouched; it stays in Supabase.
function startAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let asked = false;
  autoUpdater.on('update-downloaded', async (info) => {
    if (asked || !win) return;
    asked = true;
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Flame CTS update',
      message: 'Flame CTS ' + info.version + ' is ready.',
      detail: 'Press Save first if you have unsaved changes. Restart now to use the new version, or choose Later and it will be installed when you close the app.'
    });
    if (response === 0) autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.on('error', (e) => console.log('Update check failed:', e && e.message));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 10 * 1000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

app.on('window-all-closed', () => app.quit());
