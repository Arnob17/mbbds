#!/usr/bin/env node
/**
 * Headless renderer for the Aloion Banner Creator.
 * It opens index.html in Chromium and exports through the tool's own
 * Aloion.exportImage(), so files are identical to the Download button.
 *
 *   npm i -D playwright && npx playwright install chromium   (once)
 *   node render.mjs examples/magazine-detergent.json
 *   node render.mjs spec1.json spec2.json --out-dir demo/
 *
 * A spec is one object or an array of objects. Keys (all optional):
 *   template  magazine | news | quote | quiz
 *   size      1080x1350 | 1080x1080
 *   title, hook|subtitle, author|writer, category|label, section, link,
 *   options [4], answer (-1 or 0..3 or "ক"), cta, theme light|dark,
 *   accent "#hex", overlay 0..1, focus 0..100, titleFont auto|serif|sans,
 *   logo wordmark|badge, grain, scale 1|2, format png|jpg,
 *   image     local file path (relative to the spec file), URL or data: URL
 *   out       output path (relative to the spec file or --out-dir)
 *
 * Env: CHROME_PATH=/path/to/chrome to use an installed Chrome with playwright-core.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let outDir = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out-dir") outDir = args[++i];
  else files.push(args[i]);
}
if (!files.length) {
  console.error("usage: node render.mjs spec.json [more.json ...] [--out-dir dir]");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ({ chromium } = await import("playwright-core"));
}
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
await page.goto(pathToFileURL(path.join(here, "index.html")).href);
await page.waitForFunction(() => window.Aloion);

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

for (const file of files) {
  const base = path.dirname(path.resolve(file));
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [i, spec0] of (Array.isArray(raw) ? raw : [raw]).entries()) {
    const spec = { ...spec0 };
    if (spec.image && !/^(https?:|data:)/.test(spec.image)) {
      const p = path.resolve(base, spec.image);
      if (fs.existsSync(p)) {
        spec.image = `data:${MIME[path.extname(p).toLowerCase()] || "image/jpeg"};base64,${fs.readFileSync(p).toString("base64")}`;
      } else {
        console.warn(`warning: image not found, rendering without it: ${p}`);
        spec.image = "";
      }
    }
    const fmt = spec.format === "jpg" ? "jpg" : "png";
    const out = spec.out
      ? path.resolve(outDir || base, spec.out)
      : path.resolve(outDir || base, `${path.basename(file, ".json")}${i ? "-" + i : ""}.${fmt}`);
    delete spec.out;
    const dataUrl = await page.evaluate(async (s) => {
      await window.Aloion.ready;
      await window.Aloion.apply({ ...window.Aloion.defaults, ...window.Aloion.blank, ...s });
      return window.Aloion.exportImage();
    }, spec);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log("wrote", path.relative(process.cwd(), out));
  }
}
await browser.close();
