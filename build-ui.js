const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'src', 'ui.html'), 'utf-8');
const outDir = path.join(__dirname, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(path.join(outDir, 'ui.html'), html);
console.log('UI build complete');
