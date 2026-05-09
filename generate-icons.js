// Run once: node generate-icons.js
// Requires: npm install --save-dev sharp
const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const svg    = fs.readFileSync(path.join(__dirname, 'public', 'icons', 'icon.svg'));
const outDir = path.join(__dirname, 'public', 'icons');

const sizes = [
  { name: 'icon-72.png',           size: 72  },
  { name: 'icon-96.png',           size: 96  },
  { name: 'icon-128.png',          size: 128 },
  { name: 'icon-144.png',          size: 144 },
  { name: 'icon-152.png',          size: 152 },
  { name: 'icon-192.png',          size: 192 },
  { name: 'icon-384.png',          size: 384 },
  { name: 'icon-512.png',          size: 512 },
  { name: 'favicon-16.png',        size: 16  },
  { name: 'favicon-32.png',        size: 32  },
  { name: 'apple-touch-icon.png',  size: 180 },
];

(async () => {
  for (const { name, size } of sizes) {
    await sharp(svg).resize(size, size).png().toFile(path.join(outDir, name));
    console.log(`✓ ${name} (${size}px)`);
  }
  console.log('\nVsi opomniki so generirani!');
})().catch(err => { console.error(err); process.exit(1); });
