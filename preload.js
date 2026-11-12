// Small bridge for desktop-only features the web page can't do itself.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('flameDesktop', {
  savePdf: (name) => ipcRenderer.invoke('flame:save-pdf', String(name || '')),
  showFile: (file) => ipcRenderer.invoke('flame:show-file', String(file || '')),
  checkForUpdates: () => ipcRenderer.invoke('flame:update-check'),
  restartToUpdate: () => ipcRenderer.invoke('flame:update-restart'),
  onUpdateReady: (cb) => ipcRenderer.on('flame:update-ready', (_e, ver) => cb(String(ver || '')))
});
