// generate-icons.js — run once to create placeholder PNG icons
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

async function main() {
  const dir = path.join(__dirname, 'icons');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  for (const size of [16, 48, 128]) {
    // Solid #0084FF blue square
    const img = new Jimp(size, size, 0x0084FFFF);
    await img.writeAsync(path.join(dir, `icon${size}.png`));
    console.log(`Created icon${size}.png`);
  }
}

main().catch(console.error);
