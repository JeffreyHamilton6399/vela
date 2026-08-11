/**
 * Draws Vela's app icon and writes it as a PNG.
 *
 *   node scripts/make-icon.mjs
 *
 * Hand-rolled rather than pulled from an image library: the icon is a rounded
 * square carrying the same gradient the browser uses, with a sail cut out of
 * it, and that is a few lines of per-pixel maths. electron-builder derives the
 * .ico and .icns it needs from this one 512px file.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SIZE = 512;
const RADIUS = SIZE * 0.225;
/** How far outside the shape a pixel can be before it is fully transparent. */
const EDGE = 1.2;

/** The gradient, as the three stops used everywhere else in Vela. */
const STOPS = [
  { at: 0, rgb: [139, 92, 246] },
  { at: 0.55, rgb: [225, 48, 108] },
  { at: 1, rgb: [245, 158, 11] },
];

function gradientAt(t) {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i += 1) {
    const previous = STOPS[i - 1];
    const next = STOPS[i];
    if (clamped <= next.at) {
      const span = next.at - previous.at;
      const k = span === 0 ? 0 : (clamped - previous.at) / span;
      return previous.rgb.map((channel, index) =>
        Math.round(channel + (next.rgb[index] - channel) * k),
      );
    }
  }
  return STOPS[STOPS.length - 1].rgb;
}

/** Signed distance to a rounded square, negative inside. */
function roundedSquareDistance(x, y) {
  const half = SIZE / 2;
  const dx = Math.abs(x - half) - (half - RADIUS);
  const dy = Math.abs(y - half) - (half - RADIUS);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - RADIUS;
}

/** Signed distance to a triangle, negative inside. */
function triangleDistance(px, py, points) {
  let inside = true;
  let best = Infinity;

  for (let i = 0; i < 3; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % 3];
    const ex = bx - ax;
    const ey = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(wx - ex * t, wy - ey * t));
    if (ex * wy - ey * wx < 0) inside = false;
  }

  return inside ? -best : best;
}

/** Antialiased coverage from a signed distance. */
function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance / EDGE));
}

// The sail: a tall triangle leaning right, with a mast slot cut from it.
const SAIL = [
  [SIZE * 0.37, SIZE * 0.74],
  [SIZE * 0.6, SIZE * 0.17],
  [SIZE * 0.6, SIZE * 0.74],
];
const HULL = [
  [SIZE * 0.24, SIZE * 0.78],
  [SIZE * 0.76, SIZE * 0.78],
  [SIZE * 0.5, SIZE * 0.88],
];

const pixels = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const cx = x + 0.5;
    const cy = y + 0.5;

    const body = coverage(roundedSquareDistance(cx, cy));
    if (body <= 0) continue;

    const [r, g, b] = gradientAt((cx / SIZE) * 0.45 + (cy / SIZE) * 0.55);

    // The sail and hull are knocked out of the gradient in near-white.
    const mark = Math.max(coverage(triangleDistance(cx, cy, SAIL)), coverage(triangleDistance(cx, cy, HULL)));

    const offset = (y * SIZE + x) * 4;
    pixels[offset] = Math.round(r + (250 - r) * mark);
    pixels[offset + 1] = Math.round(g + (250 - g) * mark);
    pixels[offset + 2] = Math.round(b + (250 - b) * mark);
    pixels[offset + 3] = Math.round(body * 255);
  }
}

/* ------------------------------------------------------------------ */
/* PNG encoding                                                        */
/* ------------------------------------------------------------------ */

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // truecolour with alpha
// Each scanline is prefixed with its filter type; 0 means "none".
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.resolve(process.cwd(), 'build');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'icon.png'), png);

console.log(`wrote build/icon.png (${String(SIZE)}×${String(SIZE)}, ${String(Math.round(png.length / 1024))} KiB)`);
