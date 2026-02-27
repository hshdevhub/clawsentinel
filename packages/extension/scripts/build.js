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
  ['content/scan-overlay.css',  'content/scan-overlay.css'],
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

// ── Generate icons — "CS" lettermark on a colored background ─────────────────
// Pure-Node PNG generation: no native dependencies.
// 5×7 bitmap font for "C" and "S"; scaled up for 48 and 128 px sizes.

const COLORS = {
  green:  [  5, 150, 105],  // #059669 — safe (darker for contrast)
  yellow: [217, 119,   6],  // #d97706 — warning (amber)
  red:    [220,  38,  38],  // #dc2626 — danger
  grey:   [ 75,  85,  99],  // #4b5563 — default/unscanned
};

const SIZES = [16, 48, 128];

// 5×7 bitmap font — each row is 5 bits, MSB left (1 = white pixel)
// C: classic rounded C shape
const LETTER_C = [
  0,1,1,1,0,
  1,0,0,0,1,
  1,0,0,0,0,
  1,0,0,0,0,
  1,0,0,0,0,
  1,0,0,0,1,
  0,1,1,1,0,
];
// S: top-open, bottom-open S curve
const LETTER_S = [
  0,1,1,1,0,
  1,0,0,0,1,
  1,0,0,0,0,
  0,1,1,1,0,
  0,0,0,0,1,
  1,0,0,0,1,
  0,1,1,1,0,
];

// Must be declared before icon generators are called (ESM TDZ)
let _crcTable = null;

for (const [color, [r, g, b]] of Object.entries(COLORS)) {
  for (const size of SIZES) {
    const filename = `icon-${color}-${size}.png`;
    const destPath = path.join(DIST, 'icons', filename);
    const pngData  = createLogoIcon(size, r, g, b);
    fs.writeFileSync(destPath, pngData);
  }
}

// Creates a square PNG icon: colored background + white "CS" lettermark.
//
// Scale strategy (font pixel → real pixels):
//   16 px  →  1×  (letters: 11×7 centred in 16×16)
//   48 px  →  4×  (letters: 44×28 centred in 48×48)
//  128 px  → 10×  (letters: 110×70 centred in 128×128)
//
// At 48 px and above a 2-pixel lighter inset ring is drawn first to give
// the icon visual depth.
function createLogoIcon(size, r, g, b) {
  const scale   = size <= 16 ? 1 : size <= 48 ? 4 : 10;
  const letterW = 5 * scale;
  const letterH = 7 * scale;
  const gapW    = 1 * scale;           // gap between C and S
  const totalW  = letterW + gapW + letterW;
  const leftOff = Math.floor((size - totalW) / 2);
  const topOff  = Math.floor((size - letterH) / 2);

  // --- pixel buffer (RGB, 3 bytes per pixel) ---
  const pixels = new Uint8Array(size * size * 3);

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3]     = r;
    pixels[i * 3 + 1] = g;
    pixels[i * 3 + 2] = b;
  }

  // Inset highlight ring at 48+ px: add ~40 to each channel (lighter shade)
  if (size >= 48) {
    const ring = size >= 128 ? 4 : 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x < ring || x >= size - ring || y < ring || y >= size - ring) {
          const idx = (y * size + x) * 3;
          pixels[idx]     = Math.min(255, pixels[idx]     + 40);
          pixels[idx + 1] = Math.min(255, pixels[idx + 1] + 40);
          pixels[idx + 2] = Math.min(255, pixels[idx + 2] + 40);
        }
      }
    }
  }

  // Draw a 5×7 letter bitmap in white, scaled, at (startCol, topOff)
  function drawLetter(bitmap, startCol) {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (!bitmap[row * 5 + col]) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = startCol + col * scale + sx;
            const py = topOff   + row * scale + sy;
            if (px >= 0 && px < size && py >= 0 && py < size) {
              const idx = (py * size + px) * 3;
              pixels[idx]     = 255;
              pixels[idx + 1] = 255;
              pixels[idx + 2] = 255;
            }
          }
        }
      }
    }
  }

  drawLetter(LETTER_C, leftOff);
  drawLetter(LETTER_S, leftOff + letterW + gapW);

  // --- encode as PNG ---
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB, no alpha
  const ihdr = makeChunk('IHDR', ihdrData);

  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    rawData[y * rowSize] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src  = (y * size + x) * 3;
      const dest = y * rowSize + 1 + x * 3;
      rawData[dest]     = pixels[src];
      rawData[dest + 1] = pixels[src + 1];
      rawData[dest + 2] = pixels[src + 2];
    }
  }
  const idat = makeChunk('IDAT', zlib.deflateSync(rawData));
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
