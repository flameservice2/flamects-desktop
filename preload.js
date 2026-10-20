// Small bridge for desktop-only features the web page can't do itself.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('flameDesktop', {
  savePdf: (name) => ipcRenderer.invoke('flame:save-pdf', String(name || '')),
  showFile: (file) => ipcRenderer.invoke('flame:show-file', String(file || ''))
});
