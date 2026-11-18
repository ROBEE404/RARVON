// Zips design/brand/rarvon-final into design/out/Rarvon-logo.zip.
const JSZip = require('jszip');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, 'rarvon-final');
const zip = new JSZip();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else zip.file(`Rarvon-logo/${path.relative(root, p).split(path.sep).join('/')}`, fs.readFileSync(p));
  }
};
walk(root);
zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then((buf) => {
  const out = path.join(__dirname, '..', 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'Rarvon-logo.zip'), buf);
  console.log(`${Object.keys(zip.files).length} entries, ${(buf.length / 1024).toFixed(0)} KB`);
});
