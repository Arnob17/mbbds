# Aloion Banner Creator · আলোআয়ন ব্যানার ক্রিয়েটর

A static tool for Aloion's social banners. It has no build step and no server, and it runs on GitHub Pages,
from a double-clicked `index.html` (file://), and in headless Chrome.

Live: https://arnob17.github.io/aloion_creator

## Templates

| Template | Use it for | Inputs |
| --- | --- | --- |
| **ম্যাগাজিন স্টোরি** `magazine` | Aloion Magazine story posts | cover image, section colour, section label, title, one-line hook, writer, footer link |
| **খবর / এডিটোরিয়াল** `news` | announcements, editorial headlines over a photo | photo, label, headline, snippet, author, link |
| **উক্তি** `quote` | quotes and short thoughts | optional photo, label, quote, author |
| **কুইজ** `quiz` | four-option questions, plus an answer-reveal version | optional photo, subject, question, options ক–ঘ, answer, call to action, link |

Every template comes in **1080×1350 (4:5)** and **1080×1080 (1:1)**. Export is PNG or JPG at 1× or **2×**
(2160×2700 / 2160×2160). The 2× setting is the default. PNG is lossless but runs 4–7 MB with a photo; JPG is about 1 MB.

## Brand system (`brand.js`)

- **Colours** come from aloion.com: red `#E11D2E`, maroon `#3D0A0A`/`#2A0707`, ink `#2B1414`,
  paper `#FFF8F0`, cream `#FDF0DF`, sun `#FFB627`.
  Two themes: *light* (paper + red) and *dark* (maroon + sun). Text on a photo always uses the dark treatment.
- **Magazine sections**: tint / accent pairs. Every accent passes WCAG AA (≥ 4.5:1) on its tint and behind white text.

  | Section | Tint | Accent |
  | --- | --- | --- |
  | Ideas | `#FFF1CC` | `#8A5A00` |
  | Science | `#E3F1EC` | `#16705A` |
  | Literature | `#ECE6F4` | `#5B3E8E` |
  | LifeStyle | `#FCE3D6` | `#B23F1E` |
  | Society | `#E2ECF6` | `#245A8D` |
  | Culture | `#F8E1E4` | `#A8253E` |
  | Voices | `#F3EBDD` | `#7A4A24` |
  | Comics | `#FFF4C2` | `#C2261F` |

- **Type**: *Tiro Bangla* is the title font in every template: magazine titles, news headlines, quotes,
  quiz questions, quiz option letters (ক–ঘ) and quiz option text (≥ 38 px, where it stays legible).
  Tiro Bangla has a single weight (400) and is never faux-bolded. *Hind Siliguri* (400/500/600/700) is for small text:
  section pills, hooks/snippets, author lines, footers and links. "শিরোনামের ফন্ট" can switch a banner's title to
  Hind Siliguri Bold. No uppercase or letter-spaced labels anywhere. Both fonts are bundled in `fonts.js` (base64 woff2,
  subset to Latin + Bengali, SIL OFL; see `fonts/`), so conjuncts (ন্দ্ব, জ্ঞ, র্ষ, ক্ত …) shape identically on every computer.
- **Logo**: `wordmark.js` holds the vector "aloion" wordmark taken from aloion.com. It is drawn as a vector path,
  so it stays sharp at any size. The round "আ" badge (`logo.js` / `aloionLogo.jpg`) is still available
  under "লোগো".
- **Layout**: 64–80 px outer margins depending on the template. Title, hook and footer sizes are measured, so long
  Bangla text shrinks to fit, lines are balanced, and the text is never cut off.
  If the accent you pick is too light to read, the tool darkens it automatically.

## Scripting / headless rendering

### 1. URL parameters

```
index.html?template=quiz&size=1080x1080&title=...&optionA=...&optionB=...&optionC=...&optionD=...&answer=B
```

### 2. JavaScript (in the page)

```js
await Aloion.ready;
await Aloion.apply({ template: "magazine", section: "science", title: "…", hook: "…", writer: "…", image: dataUrl });
const png = await Aloion.exportImage({ scale: 2, format: "png" }); // data: URL
Aloion.download(); // same as the button
```

### 3. Node: `render.mjs`

```
npm i            # installs playwright (once)
npx playwright install chromium
node render.mjs examples/magazine.json            # writes next to the spec (see "out")
node render.mjs a.json b.json --out-dir banners/
CHROME_PATH=/usr/bin/google-chrome node render.mjs spec.json   # use an installed Chrome via playwright-core
```

The script opens `index.html` and calls the tool's own `Aloion.exportImage()`, so its output is byte-for-byte the
same as the Download button. A spec file holds one object or an array of objects:

| key | values |
| --- | --- |
| `template` | `magazine` · `news` · `quote` · `quiz` |
| `size` | `1080x1350` · `1080x1080` |
| `title` (aliases `headline`, `quote`, `question`) | main text; `\n` forces a line break |
| `hook` / `subtitle` / `snippet` | second line |
| `author` / `writer` | name |
| `category` / `label` | the pill label (magazine: section label) |
| `section` | `ideas` `science` `literature` `lifestyle` `society` `culture` `voices` `comics` |
| `link` | footer link, `""` to hide |
| `options`, `answer`, `cta` | quiz: 4 strings; `-1` / `0–3` / `"A"–"D"` / `"ক"–"ঘ"`; footer line |
| `image` | file path (relative to the spec), URL or data: URL |
| `theme`, `accent`, `overlay`, `focus` | `light`/`dark`; `#hex`; 0–1; 0–100 (crop position) |
| `titleFont`, `logo`, `grain` | `auto`/`serif`/`sans`; `wordmark`/`badge`; `true`/`false` |
| `scale`, `format`, `out` | `1`/`2`; `png`/`jpg`; output path |

## Brand rules for copy

Aloion is a learning platform. Do not call it the "first" of anything, and do not present it as a coaching
centre, a blog or a question bank.

## Files

`index.html` editor UI · `style.css` · `script.js` canvas engine and API · `brand.js` palette/sections ·
`wordmark.js` vector logo · `fonts.js` bundled fonts · `logo.js` badge (base64) · `render.mjs` headless renderer ·
`examples/` sample specs
