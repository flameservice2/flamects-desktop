// Saves the page's current print layout (#print-area) as a PDF so a
// quotation can be shared on WhatsApp or by email. Files go to
// Documents\Flame CTS\Quotations; show-file only reveals files there.
const path = require('path');
const fs = require('fs');

function registerShareIpc(ipcMain, { app, shell, isTrusted }) {
  const pdfDir = () => path.join(app.getPath('documents'), 'Flame CTS', 'Quotations');
  ipcMain.handle('flame:save-pdf', async (e, name) => {
    if (isTrusted && !isTrusted(e.sender)) throw new Error('Not allowed');
    const safe = String(name || 'document').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90) || 'document';
    const dir = pdfDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, safe + '.pdf');
    const data = await e.sender.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    await fs.promises.writeFile(file, data);
    return file;
  });
  ipcMain.handle('flame:show-file', (e, p) => {
    if (isTrusted && !isTrusted(e.sender)) return false;
    const file = path.normalize(String(p || ''));
    if (!file.startsWith(pdfDir() + path.sep) || !fs.existsSync(file)) return false;
    shell.showItemInFolder(file);
    return true;
  });
}
module.exports = { registerShareIpc };
