const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.copyFileSync(path.join(root, 'P57_Interactive_Dashboard.html'), path.join(out, 'P57_Interactive_Dashboard.html'));

const assetsSrc = path.join(root, 'assets');
const assetsDest = path.join(out, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, assetsDest, { recursive: true });
}

console.log('Built static dashboard into public/');
