#!/usr/bin/env node
/**
 * Generate the site-wide Open Graph card.
 *
 * Every link PrivyDrop puts into a chat app renders as a preview card, and
 * without an og:image that card is a bare line of text. This script renders a
 * static 1200x630 PNG from an SVG template so the text stays crisp and the
 * asset is reproducible rather than hand-drawn.
 *
 * Usage: node scripts/generate-og-image.js
 * Output: public/og/og-default.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const WIDTH = 1200;
const HEIGHT = 630;
const OUT_DIR = path.join(__dirname, '..', 'public', 'og');
const OUT_FILE = path.join(OUT_DIR, 'og-default.png');
const LOGO = path.join(__dirname, '..', 'public', 'logo.png');

const SANS = 'Noto Sans, DejaVu Sans, sans-serif';
const INK = '#0f172a';
const MUTED = '#475569';
const FAINT = '#7c8aa0';
const ACCENT = '#2f6fb0';

const CHIPS = [
  'No account',
  'No file size limit',
  'Files never touch our server',
  'End-to-end encrypted',
  'Open source (MIT)',
];

// Rough advance-width estimate for Noto Sans, used only to lay out chips.
function textWidth(text, size) {
  return Math.round(text.length * size * 0.56);
}

function chipLayer() {
  const size = 26;
  const padX = 20;
  const height = 46;
  const gap = 14;
  const y = 440;
  const out = [];
  let x = 88;
  for (const chip of CHIPS) {
    const w = textWidth(chip, size) + padX * 2;
    out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + height +
      '" rx="23" fill="#ffffff" stroke="#d9e2ec" stroke-width="1.5"/>');
    out.push('<text x="' + (x + padX) + '" y="' + (y + 31) + '" font-family="' + SANS +
      '" font-size="' + size + '" font-weight="500" fill="' + MUTED + '">' + chip + '</text>');
    x += w + gap;
    if (x > WIDTH - 140) break;
  }
  return out.join('');
}

function buildSvg(logoDataUri) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + WIDTH + '" height="' + HEIGHT +
      '" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#ffffff"/>',
    '<stop offset="55%" stop-color="#f6f9fc"/>',
    '<stop offset="100%" stop-color="#eaf1f8"/>',
    '</linearGradient>',
    '<linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="' + ACCENT + '"/>',
    '<stop offset="100%" stop-color="#63b3ed"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="' + WIDTH + '" height="' + HEIGHT + '" fill="url(#bg)"/>',
    '<rect x="0" y="0" width="10" height="' + HEIGHT + '" fill="url(#edge)"/>',
    '<circle cx="1060" cy="120" r="230" fill="#ffffff" opacity="0.6"/>',
    '<circle cx="1150" cy="520" r="160" fill="#e6f0fa" opacity="0.75"/>',
    '<image href="' + logoDataUri + '" x="88" y="118" width="156" height="156"/>',
    '<text x="284" y="206" font-family="' + SANS + '" font-size="76" font-weight="700" fill="' + INK + '">PrivyDrop</text>',
    '<text x="286" y="258" font-family="' + SANS + '" font-size="32" font-weight="400" fill="' + MUTED + '">Peer-to-peer file &amp; clipboard sharing</text>',
    '<text x="88" y="352" font-family="' + SANS + '" font-size="28" font-weight="400" fill="' + MUTED + '">Send a file or text straight from browser to browser.</text>',
    '<text x="88" y="394" font-family="' + SANS + '" font-size="28" font-weight="400" fill="' + MUTED + '">No sign-up, no size limit, nothing stored on a server.</text>',
    chipLayer(),
    '<rect x="88" y="534" width="' + (WIDTH - 176) + '" height="1" fill="#dbe4ee"/>',
    '<text x="88" y="578" font-family="' + SANS + '" font-size="24" font-weight="500" fill="' + FAINT + '">privydrop.app</text>',
    '<text x="1112" y="578" text-anchor="end" font-family="' + SANS + '" font-size="24" font-weight="400" fill="' + FAINT + '">github.com/david-bai00/PrivyDrop</text>',
    '</svg>',
  ].join('');
}

async function main() {
  const logoBuffer = await sharp(LOGO).resize(300, 300, { fit: 'inside' }).png().toBuffer();
  const logoDataUri = 'data:image/png;base64,' + logoBuffer.toString('base64');

  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await sharp(Buffer.from(buildSvg(logoDataUri))).png({ compressionLevel: 9 }).toFile(OUT_FILE);

  const meta = await sharp(OUT_FILE).metadata();
  if (meta.width !== WIDTH || meta.height !== HEIGHT) {
    throw new Error('unexpected size ' + meta.width + 'x' + meta.height);
  }

  // A missing font renders no glyphs and still 'succeeds', so assert on ink.
  const stats = await sharp(OUT_FILE).stats();
  const stdev = stats.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3;
  if (stdev < 8) {
    throw new Error('card looks blank (channel stdev ' + stdev.toFixed(1) + ') - check fonts');
  }

  console.log('wrote ' + OUT_FILE + ' (' + meta.width + 'x' + meta.height + ')');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
