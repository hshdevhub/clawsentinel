#!/usr/bin/env node
// ClawSentinel Guard — Extension Build Script
// Uses esbuild to bundle TypeScript source files (if any).
// Copies static assets to dist/.
// Generates placeholder icon PNGs (colored squares) using raw PNG construction.

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const watch = process.argv.includes('--watch');

// ── Clean dist ────────────────────────────────────────────────────────────────

if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}

const dirs = [
  DIST,
  path.join(DIST, 'content'),
  path.join(DIST, 'background'),
  path.join(DIST, 'popup'),
  path.join(DIST, 'rules'),
  path.join(DIST, 'icons')
];
for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });

// ── Copy static files ─────────────────────────────────────────────────────────

const copies = [
  // Manifest
  ['manifest.json', 'manifest.json'],
  // Content scripts (plain JS — no bundling needed)
  ['content/scanner.js',        'content/scanner.js'],
  ['content/clawhub-badges.js', 'content/clawhub-badges.js'],
  ['content/scanner.css',       'content/scanner.css'],
  // Background
  ['background/service-worker.js', 'background/service-worker.js'],
  // Popup
  ['popup/popup.html', 'popup/popup.html'],
  ['popup/popup.js',   'popup/popup.js'],
  ['popup/popup.css',  'popup/popup.css'],
  // Rules
  ['rules/injection-patterns.json', 'rules/injection-patterns.json']
];

for (const [src, dest] of copies) {
  const srcPath  = path.join(ROOT, src);
  const destPath = path.join(DIST, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
  } else {
    console.warn(`[warn] Source not found: ${src}`);
  }
}

// ── Generate placeholder icons ────────────────────────────────────────────────
// Creates minimal valid PNG files with solid colors.
// Replace with real artwork before Chrome Web Store submission.

const COLORS = {
  green:  [16, 185, 129],   // #10b981 — safe
  yellow: [245, 158, 11],   // #f59e0b — warning
  red:    [239, 68,  68],   // #ef4444 — danger
  grey:   [107, 114, 128]   // #6b7280 — default/unscanned
};

const SIZES = [16, 48, 128];

for (const [color, [r, g, b]] of Object.entries(COLORS)) {
  for (const size of SIZES) {
    const filename = `icon-${color}-${size}.png`;
    const destPath = path.join(DIST, 'icons', filename);
    const pngData  = createSolidColorPNG(size, size, r, g, b);
    fs.writeFileSync(destPath, pngData);
  }
}

function createSolidColorPNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width, height, bit depth=8, color type=2 (RGB), compression=0, filter=0, interlace=0
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width,  0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8]  = 8;  // bit depth
  ihdrData[9]  = 2;  // color type: RGB
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk: raw image data (filter byte 0 + RGB per row)
  const rowSize = 1 + width * 3; // filter byte + RGB pixels
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    rawData[rowStart] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const offset = rowStart + 1 + x * 3;
      rawData[offset]     = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput  = Buffer.concat([typeBytes, data]);
  const crc       = Buffer.alloc(4);
  crc.writeInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBytes, data, crc]);
}

// CRC-32 implementation (PNG requires it for each chunk)
function crc32(buf) {
  const table = makeCrcTable();
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) | 0;
}

let _crcTable = null;
function makeCrcTable() {
  if (_crcTable) return _crcTable;
  _crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    _crcTable[n] = c;
  }
  return _crcTable;
}

// ── Report ────────────────────────────────────────────────────────────────────

const distFiles = fs.readdirSync(DIST, { recursive: true })
  .filter(f => typeof f === 'string' && !fs.statSync(path.join(DIST, f)).isDirectory());

console.log(`\n[ClawSentinel Guard] Build complete → dist/`);
console.log(`  Files:  ${distFiles.length}`);
console.log(`  Icons:  ${Object.keys(COLORS).length} colors × ${SIZES.length} sizes`);
console.log(`  Copies: ${copies.length} static assets`);
console.log(`\n  Load dist/ as unpacked extension in chrome://extensions\n`);
