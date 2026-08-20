const sharp = require('sharp');
const fs = require('fs');

async function convert() {
  const svg = fs.readFileSync('public/logo.svg');
  await sharp(svg).resize(16, 16).png().toFile('public/icon-16.png');
  await sharp(svg).resize(48, 48).png().toFile('public/icon-48.png');
  await sharp(svg).resize(128, 128).png().toFile('public/icon-128.png');
  console.log('Conversion done');
}
convert();
