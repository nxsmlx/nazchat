const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright-core');
const root = path.resolve(__dirname, '..');
const appUrl = pathToFileURL(path.join(root, 'nazchat/index.html')).href;
const executablePath = process.env.CHROMIUM_PATH || [
  '/usr/bin/chromium', '/usr/bin/chromium-headless-shell', '/usr/bin/chromium-browser'
].find(p => fs.existsSync(p));
function launch() {
  return chromium.launch({...(executablePath ? {executablePath} : {}), args:['--no-sandbox', '--disable-dev-shm-usage']});
}
module.exports = {launch, appUrl, root};
