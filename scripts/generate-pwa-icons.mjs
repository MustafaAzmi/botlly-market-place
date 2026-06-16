// Zero-dependency PWA icon generator.
//
// Renders the customer (shopping bag) and merchant (storefront) icons with
// signed-distance-field shapes + supersampling, and encodes PNGs manually
// (zlib deflate + CRC32) so no image libraries are needed in CI.
//
// Usage: node scripts/generate-pwa-icons.mjs
// Output: public/icons/*.png

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// --------------------------------------------------------------------------
// PNG encoding
// --------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------------------
// SDF shapes (normalized 0..1 coordinates, distances in normalized units)
// --------------------------------------------------------------------------

const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

// Customer app: shopping bag.
function customerGlyph(color) {
  return [
    // handle: upper part of a ring, hidden below y=0.46 (bag covers the rest)
    {
      d: (x, y) => Math.max(Math.abs(sdCircle(x, y, 0.5, 0.42, 0.135)) - 0.03, y - 0.46),
      color,
    },
    // bag body
    { d: (x, y) => sdRoundRect(x, y, 0.5, 0.595, 0.245, 0.195, 0.07), color },
  ];
}

// Merchant app: storefront with scalloped awning.
function merchantGlyph(color, bg) {
  const layers = [
    // awning top bar
    { d: (x, y) => sdRoundRect(x, y, 0.5, 0.335, 0.275, 0.04, 0.02), color },
  ];
  // 4 hanging scallops (lower half circles)
  for (let i = 0; i < 4; i += 1) {
    const cx = 0.5 + (i - 1.5) * 0.1375;
    layers.push({
      d: (x, y) => Math.max(sdCircle(x, y, cx, 0.372, 0.0688), 0.372 - y),
      color,
    });
  }
  layers.push(
    // shop body (below the awning scallops)
    { d: (x, y) => sdRoundRect(x, y, 0.5, 0.585, 0.235, 0.135, 0.035), color },
    // door (punched back to background color)
    { d: (x, y) => sdRoundRect(x, y, 0.5, 0.615, 0.068, 0.105, 0.034), color: bg },
  );
  return layers;
}

// --------------------------------------------------------------------------
// Renderer with 3x3 supersampling
// --------------------------------------------------------------------------

/**
 * @param size      output pixels
 * @param bg        [r,g,b] background color
 * @param glyph     array of { d(x,y) -> sdf, color: [r,g,b] }
 * @param opts.rounded  round the background corners (transparent outside)
 * @param opts.zoom     scale glyph around center (maskable safe zone)
 */
function renderIcon(size, bg, glyph, { rounded = false, zoom = 1 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 3;
  const aa = 1.5 / size; // smoothing width in normalized units
  const cornerR = 0.21;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          // background coverage
          let bgCov = 1;
          if (rounded) {
            const d = sdRoundRect(nx, ny, 0.5, 0.5, 0.5, 0.5, cornerR);
            bgCov = Math.min(Math.max(0.5 - d / aa, 0), 1);
          }
          let cr = bg[0];
          let cg = bg[1];
          let cb = bg[2];
          // glyph layers (coords zoomed around center)
          const gx = 0.5 + (nx - 0.5) / zoom;
          const gy = 0.5 + (ny - 0.5) / zoom;
          for (const layer of glyph) {
            const d = layer.d(gx, gy);
            const cov = Math.min(Math.max(0.5 - d / (aa / zoom), 0), 1);
            if (cov > 0) {
              cr = cr + (layer.color[0] - cr) * cov;
              cg = cg + (layer.color[1] - cg) * cov;
              cb = cb + (layer.color[2] - cb) * cov;
            }
          }
          r += cr * bgCov;
          g += cg * bgCov;
          b += cb * bgCov;
          a += 255 * bgCov;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      // un-premultiply for PNG straight alpha
      const k = alpha > 0 ? 255 / alpha : 0;
      px[i] = Math.round(Math.min(255, (r / n) * k));
      px[i + 1] = Math.round(Math.min(255, (g / n) * k));
      px[i + 2] = Math.round(Math.min(255, (b / n) * k));
      px[i + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, px);
}

// --------------------------------------------------------------------------
// Emit all icons
// --------------------------------------------------------------------------

const WHITE = [255, 255, 255];
const BLACK = [17, 24, 39]; // #111827
const CUSTOMER_BG = [22, 163, 74]; // #16a34a
const MERCHANT_BG = [34, 197, 94]; // #22c55e

const apps = [
  { key: "customer", bg: CUSTOMER_BG, glyph: customerGlyph(WHITE) },
  { key: "merchant", bg: MERCHANT_BG, glyph: merchantGlyph(WHITE, BLACK) },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const app of apps) {
  const variants = [
    [`${app.key}-192.png`, renderIcon(192, app.bg, app.glyph, { rounded: true })],
    [`${app.key}-512.png`, renderIcon(512, app.bg, app.glyph, { rounded: true })],
    // maskable: full bleed + glyph inside the 80% safe zone
    [`${app.key}-maskable-512.png`, renderIcon(512, app.bg, app.glyph, { zoom: 0.78 })],
    // apple touch: full bleed (iOS rounds corners itself)
    [`${app.key}-apple-180.png`, renderIcon(180, app.bg, app.glyph)],
  ];
  for (const [name, buf] of variants) {
    writeFileSync(join(OUT_DIR, name), buf);
    console.log(`wrote public/icons/${name} (${buf.length} bytes)`);
  }
}
