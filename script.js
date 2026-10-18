/**
 * Aloion Banner Creator: canvas engine + editor wiring.
 * Static, no build step. Works on GitHub Pages, from file://, and headless.
 *
 * Scripting:
 *   - URL params:  index.html?template=quiz&title=...&optionA=...&size=1080x1080
 *   - JS:          await Aloion.ready; await Aloion.apply({...}); await Aloion.exportImage()
 *   - Node:        node render.mjs spec.json   (see README.md)
 */
(() => {
  "use strict";

  const B = window.ALOION_BRAND;
  const SERIF = B.fonts.serif;
  const SANS = B.fonts.sans;
  const OPTION_LABELS = ["ক", "খ", "গ", "ঘ"];

  const DEFAULTS = {
    template: "magazine", // magazine | news | quote | quiz
    size: "1080x1350", // 1080x1350 | 1080x1080
    theme: "light", // light | dark (news, quote, quiz)
    title: "ভেজা হাতে কাপড় ধোয়ার পাউডার গরম লাগে কেন?",
    subtitle: "দোষটা ঘর্ষণের, নাকি পাউডারের ভেতরের রসায়নের?",
    author: "জাহিদুল ইসলাম শান্ত",
    category: "দৈনন্দিন বিজ্ঞান",
    section: "science",
    link: "aloion.com",
    options: ["", "", "", ""],
    answer: -1, // quiz: -1 = no answer shown, 0..3 = highlight
    cta: "উত্তর কমেন্টে লেখো",
    accent: "", // empty = automatic (theme / section accent)
    overlay: 0.45, // photo darkening for full-bleed templates
    focus: 50, // 0..100, which part of a cropped photo to keep
    titleFont: "auto", // auto | serif | sans
    logo: "wordmark", // wordmark | badge
    grain: false,
    scale: 2, // export pixel ratio
    format: "png", // png | jpg
    quality: 0.92,
    image: "", // URL or data: URL (set via upload, URL param or API)
  };

  const S = { ...DEFAULTS, options: [...DEFAULTS.options] };
  let photo = null; // HTMLImageElement
  const badge = new Image();

  /* ---------------------------------------------------------- assets */

  const wordmarkPaths = (window.ALOION_WORDMARK?.paths || []).map((d) => new Path2D(d));

  const ready = (async () => {
    const faces = (window.ALOION_FONTS || []).map(
      (f) => new FontFace(f.family.replace(/"/g, ""), `url(${f.src})`, { weight: f.weight, style: "normal" }),
    );
    faces.forEach((f) => document.fonts.add(f));
    await Promise.all(faces.map((f) => f.load().catch((e) => console.error("font", f.family, e))));
    await new Promise((res) => {
      badge.onload = res;
      badge.onerror = res;
      badge.src = typeof ALOION_LOGO !== "undefined" ? ALOION_LOGO : "aloionLogo.jpg";
    });
    measureFonts();
  })();

  // Vertical metrics measured from the real fonts, so Bangla vowel signs and
  // conjuncts never collide with neighbouring lines.
  const MET = {};
  function measureFonts() {
    const c = document.createElement("canvas").getContext("2d");
    for (const fam of [SERIF, SANS]) {
      for (const w of [400, 500, 600, 700]) {
        c.font = `${w} 100px ${fam}`;
        const up = c.measureText("ঈশ্বরী ঠিকই কিংবা শীর্ষ");
        const down = c.measureText("কুসুম গ্রন্থ রূপ সুপ্ত দৃশ্য");
        const matra = c.measureText("কখগ");
        MET[fam + w] = {
          asc: up.actualBoundingBoxAscent / 100,
          desc: down.actualBoundingBoxDescent / 100,
          matra: matra.actualBoundingBoxAscent / 100,
        };
      }
    }
  }
  const met = (fam, w) => MET[fam + w] || { asc: 0.95, desc: 0.35, matra: 0.62 };

  /* ---------------------------------------------------------- colour */

  function hexToRgb(h) {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (r) => "#" + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  function lum(hex) {
    return hexToRgb(hex)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((v, i) => v + (hexToRgb(b)[i] - v) * t));
  // Nudge a colour toward `toward` until it reads on `bg` (used for accent text).
  function readable(color, bg, min = 4.5, toward) {
    toward = toward || (lum(bg) > 0.4 ? B.color.ink : B.color.paper);
    let c = color;
    for (let t = 0.1; contrast(c, bg) < min && t <= 1; t += 0.1) c = mix(color, toward, t);
    return c;
  }
  const onColor = (fill) => (contrast("#FFFFFF", fill) >= 4.5 ? "#FFFFFF" : B.color.ink);
  const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(",")},${a})`;

  /* ---------------------------------------------------------- text */

  const font = (w, size, fam) => `${w} ${size}px ${fam}`;
  const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("bn", { granularity: "grapheme" }) : null;
  const graphemes = (s) => (segmenter ? [...segmenter.segment(s)].map((g) => g.segment) : Array.from(s));

  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text || "").split(/\n/)) {
      const words = para.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        if (out.length) out.push("");
        continue;
      }
      let line = "";
      for (let word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width <= maxW) {
          line = test;
          continue;
        }
        if (line) out.push(line);
        // a single word wider than the column: break between grapheme clusters
        if (ctx.measureText(word).width > maxW) {
          let part = "";
          for (const g of graphemes(word)) {
            if (ctx.measureText(part + g).width > maxW && part) {
              out.push(part);
              part = g;
            } else part += g;
          }
          word = part;
        }
        line = word;
      }
      out.push(line);
    }
    return out;
  }

  // Even out line lengths (no lonely last word) without adding a line.
  function wrapBalanced(ctx, text, maxW) {
    const greedy = wrap(ctx, text, maxW);
    if (greedy.length < 2) return greedy;
    let lo = maxW * 0.45;
    let hi = maxW;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (wrap(ctx, text, mid).length <= greedy.length) hi = mid;
      else lo = mid;
    }
    return wrap(ctx, text, hi);
  }

  function ellipsize(ctx, lines, maxLines, maxW) {
    if (lines.length <= maxLines) return lines;
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.split(" ").slice(0, -1).join(" ");
    keep[maxLines - 1] = (last || keep[maxLines - 1]) + "…";
    return keep;
  }

  /** A measured text block: {lines, size, lh, w, fam, height, draw(x, top, color, align)} */
  function block(ctx, text, { fam = SANS, w = 400, size, lhr = 1.35, maxW, maxLines = 99, balance = false }) {
    ctx.font = font(w, size, fam);
    let lines = balance ? wrapBalanced(ctx, text, maxW) : wrap(ctx, text, maxW);
    const overflow = lines.length > maxLines;
    lines = ellipsize(ctx, lines, maxLines, maxW);
    const m = met(fam, w);
    const lh = size * lhr;
    const n = lines.length;
    const height = n ? (n - 1) * lh + (m.asc + m.desc) * size : 0;
    const width = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    return {
      lines, size, lh, fam, w, height, width, overflow,
      draw(c, x, top, color, align = "left") {
        c.save();
        c.font = font(w, size, fam);
        c.fillStyle = color;
        c.textAlign = align;
        c.textBaseline = "alphabetic";
        lines.forEach((l, i) => c.fillText(l, x, top + m.asc * size + i * lh));
        c.restore();
      },
    };
  }

  // Largest size (max..min) that fits in maxLines; falls back to ellipsis at min.
  function fit(ctx, text, o) {
    const step = o.step || 2;
    for (let s = o.max; s >= o.min; s -= step) {
      const b = block(ctx, text, { ...o, size: s, maxLines: 99 });
      if (b.lines.length <= o.maxLines && (!o.maxH || b.height <= o.maxH)) return block(ctx, text, { ...o, size: s });
    }
    return block(ctx, text, { ...o, size: o.min });
  }

  // Single line of text, vertically centred on cy using the Bangla matra line.
  function label(ctx, text, x, cy, { fam = SANS, w = 500, size, color, align = "left", track = 0 }) {
    ctx.save();
    ctx.font = font(w, size, fam);
    if (track && "letterSpacing" in ctx) ctx.letterSpacing = `${track}px`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    const m = met(fam, w);
    const isLatin = !/[\u0980-\u09FF]/.test(text);
    const mid = isLatin ? size * 0.36 : (m.matra * size) / 2 + size * 0.04;
    ctx.fillText(text, x, cy + mid);
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  }

  const textWidth = (ctx, text, f, track = 0) => {
    ctx.save();
    ctx.font = f;
    if (track && "letterSpacing" in ctx) ctx.letterSpacing = `${track}px`;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  };

  // Shrink a one-line label to fit maxW (down to `min`), then ellipsize.
  function fitLine(ctx, text, maxW, { fam = SANS, w = 500, size, min = Math.round(size * 0.78) }) {
    let s = size;
    while (s > min && textWidth(ctx, text, font(w, s, fam)) > maxW) s -= 1;
    let t = text;
    if (textWidth(ctx, t, font(w, s, fam)) > maxW) {
      const g = graphemes(text);
      while (g.length && textWidth(ctx, g.join("") + "…", font(w, s, fam)) > maxW) g.pop();
      t = g.join("").trim() + "…";
    }
    return { text: t, size: s };
  }

  /* ---------------------------------------------------------- shapes, images, logo */

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCover(ctx, img, x, y, w, h, focus = 50) {
    const ir = img.naturalWidth / img.naturalHeight;
    const fr = w / h;
    let sw, sh, sx, sy;
    if (ir > fr) {
      sh = img.naturalHeight;
      sw = sh * fr;
      sx = (img.naturalWidth - sw) * (focus / 100);
      sy = 0;
    } else {
      sw = img.naturalWidth;
      sh = sw / fr;
      sx = 0;
      sy = (img.naturalHeight - sh) * (focus / 100);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  }

  // Vector wordmark. (x, y) = top-left, h = height of the full lockup box.
  function drawWordmark(ctx, x, y, h, color) {
    const [bx, by, bw, bh] = window.ALOION_WORDMARK.box;
    const s = h / bh;
    ctx.save();
    ctx.translate(x - bx * s, y - by * s);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    wordmarkPaths.forEach((p) => ctx.fill(p));
    ctx.restore();
    return bw * s;
  }
  const wordmarkWidth = (h) => {
    const [, , bw, bh] = window.ALOION_WORDMARK.box;
    return (bw / bh) * h;
  };

  function drawBadge(ctx, x, y, d) {
    if (!badge.naturalWidth) return d;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(badge, x, y, d, d);
    ctx.restore();
    return d;
  }

  // Logo in the chosen style; `align` right means x is the right edge. Returns width.
  function drawLogo(ctx, x, y, h, color, align = "left") {
    if (S.logo === "badge") {
      const d = h * 1.25;
      drawBadge(ctx, align === "right" ? x - d : x, y - (d - h) / 2, d);
      return d;
    }
    const w = wordmarkWidth(h);
    drawWordmark(ctx, align === "right" ? x - w : x, y, h, color);
    return w;
  }

  // Section / category kicker: filled pill.
  function pill(ctx, text, x, y, { fill, size = 28, h = 52, align = "left", maxW = 620 }) {
    const padX = h * 0.42;
    ({ text, size } = fitLine(ctx, text, maxW - padX * 2, { w: 600, size, min: Math.round(size * 0.8) }));
    const f = font(600, size, SANS);
    const tw = textWidth(ctx, text, f);
    const w = tw + padX * 2;
    const px = align === "right" ? x - w : x;
    ctx.save();
    ctx.fillStyle = fill;
    rr(ctx, px, y, w, h, h / 2);
    ctx.fill();
    ctx.restore();
    label(ctx, text, px + padX, y + h / 2, { w: 600, size, color: onColor(fill) });
    return { w, h };
  }

  function photoBackground(ctx, W, H, strength, { bottom = 0.92, from = 0.3 } = {}) {
    drawCover(ctx, photo, 0, 0, W, H, S.focus);
    const base = B.color.maroonDeep;
    ctx.fillStyle = rgba("#140505", strength);
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * from, 0, H);
    g.addColorStop(0, rgba(base, 0));
    g.addColorStop(0.55, rgba(base, bottom * 0.85));
    g.addColorStop(1, rgba(base, bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // a quiet top scrim so the logo always reads
    const t = ctx.createLinearGradient(0, 0, 0, 220);
    t.addColorStop(0, rgba("#140505", 0.45));
    t.addColorStop(1, rgba("#140505", 0));
    ctx.fillStyle = t;
    ctx.fillRect(0, 0, W, 220);
  }

  function themeFor() {
    // Text over a photo is always light-on-dark.
    const T = { ...(photo ? B.themes.dark : B.themes[S.theme] || B.themes.light) };
    const bg = photo ? B.color.maroonDeep : T.bg;
    T.accentRaw = S.accent || T.accent;
    T.accentText = readable(T.accentRaw, bg, 4.5);
    T.accentFill = contrast(T.accentRaw, bg) >= 1.6 ? T.accentRaw : T.accentText;
    return T;
  }

  const titleFam = (fallback) => (S.titleFont === "serif" ? SERIF : S.titleFont === "sans" ? SANS : fallback);
  const titleW = (fam) => (fam === SERIF ? 400 : 700);

  /* ---------------------------------------------------------- templates */

  // Magazine story: section-tinted paper, framed cover, editorial title.
  function drawMagazine(ctx, W, H) {
    const sec = B.sections[S.section] || B.sections.science;
    const sq = H / W < 1.1;
    const M = 64;
    const ink = B.color.ink;
    const accent = readable(S.accent || sec.accent, sec.tint, 4.5);
    ctx.fillStyle = sec.tint;
    ctx.fillRect(0, 0, W, H);

    // Masthead: wordmark | ম্যাগাজিন ................ SECTION
    const mh = sq ? 64 : 74;
    const mY = sq ? 38 : 46;
    const wmW = drawLogo(ctx, M, mY, mh, B.color.red);
    const cy = mY + mh * 0.62;
    ctx.fillStyle = rgba(ink, 0.28);
    ctx.fillRect(M + wmW + 22, cy - 20, 2, 40);
    label(ctx, "ম্যাগাজিন", M + wmW + 44, cy, { fam: SERIF, w: 400, size: sq ? 36 : 40, color: ink });
    label(ctx, sec.en.toUpperCase(), W - M, cy, { w: 600, size: 22, color: accent, align: "right", track: 3.5 });
    const mastBottom = mY + mh + (sq ? 16 : 24);

    // Footer
    const footH = sq ? 84 : 96;
    const ruleY = H - footH - (sq ? 6 : 14);
    ctx.fillStyle = rgba(ink, 0.2);
    ctx.fillRect(M, ruleY, W - 2 * M, 2);
    const fcy = ruleY + (H - ruleY) / 2 - 4;
    const linkTxt = (S.link || "").trim();
    let linkW = 0;
    if (linkTxt) {
      const lf = fitLine(ctx, linkTxt, (W - 2 * M) * 0.48, { w: 600, size: sq ? 26 : 28, min: 22 });
      linkW = label(ctx, lf.text, W - M, fcy, { w: 600, size: lf.size, color: accent, align: "right" });
    }
    if (S.author.trim()) {
      const fs = sq ? 28 : 30;
      const pw = label(ctx, "লেখা: ", M, fcy, { w: 400, size: fs, color: rgba(ink, 0.68) });
      const af = fitLine(ctx, S.author.trim(), W - 2 * M - linkW - pw - 36, { w: 600, size: fs, min: 22 });
      label(ctx, af.text, M + pw, fcy, { w: 600, size: af.size, color: ink });
    }

    // Text block, measured bottom-up so the cover takes what is left.
    const maxW = W - 2 * M;
    const fam = titleFam(SERIF);
    const hasImg = !!photo;
    const minImg = sq ? 330 : 520;
    let k = 1;
    let L;
    for (; k >= 0.7; k -= 0.05) {
      const title = fit(ctx, S.title, {
        fam, w: titleW(fam), max: Math.round((hasImg ? (sq ? 76 : 88) : sq ? 112 : 128) * k), min: Math.round(46 * k),
        maxW, maxLines: hasImg ? 3 : 5, lhr: fam === SERIF ? 1.22 : 1.24, balance: true,
      });
      const hook = S.subtitle.trim()
        ? block(ctx, S.subtitle, { w: 400, size: Math.round((sq ? 32 : 36) * Math.max(k, 0.85)), lhr: 1.4, maxW, maxLines: 2, balance: true })
        : null;
      const kick = S.category.trim() ? (sq ? 48 : 54) : 0;
      const gapK = kick ? (sq ? 26 : 32) : 0;
      const gapH = hook ? (sq ? 16 : 22) : 0;
      const textH = kick + gapK + title.height + gapH + (hook ? hook.height : 0);
      const textBottom = ruleY - (sq ? 34 : 46);
      const textTop = textBottom - textH;
      const imgTop = mastBottom;
      const imgBottom = textTop - (sq ? 36 : 48);
      L = { title, hook, kick, gapK, gapH, textTop, imgTop, imgBottom, textH };
      if (!hasImg || imgBottom - imgTop >= minImg) break;
    }

    let ty = L.textTop;
    if (hasImg) {
      const x = M;
      const y = L.imgTop;
      const w = W - 2 * M - 12;
      const h = L.imgBottom - L.imgTop - 12;
      const r = 22;
      // hard offset shadow, the aloion.com card style
      ctx.fillStyle = accent;
      rr(ctx, x + 12, y + 12, w, h, r);
      ctx.fill();
      ctx.save();
      rr(ctx, x, y, w, h, r);
      ctx.clip();
      drawCover(ctx, photo, x, y, w, h, S.focus);
      ctx.restore();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      rr(ctx, x, y, w, h, r);
      ctx.stroke();
    } else {
      // no cover: centre the text block in the free space
      ty = mastBottom + (ruleY - mastBottom - L.textH) / 2 - 10;
    }

    if (L.kick) {
      pill(ctx, S.category.trim(), M, ty, { fill: accent, size: sq ? 26 : 29, h: L.kick });
      ty += L.kick + L.gapK;
    }
    L.title.draw(ctx, M - 2, ty, ink);
    ty += L.title.height + L.gapH;
    if (L.hook) L.hook.draw(ctx, M, ty, rgba(ink, 0.74));
  }

  // News / editorial: full-bleed photo, headline anchored bottom-left.
  function drawNews(ctx, W, H) {
    const T = themeFor();
    const sq = H / W < 1.1;
    const M = 72;
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    if (photo) photoBackground(ctx, W, H, S.overlay * 0.5, { from: sq ? 0.15 : 0.28, bottom: 0.94 });

    const nl = sq ? 66 : 76;
    drawLogo(ctx, M, M - 16, nl, T.logo);
    if (S.link.trim()) label(ctx, S.link.trim(), W - M, M - 16 + nl * 0.62, { w: 600, size: 26, color: T.muted, align: "right" });

    const maxW = W - 2 * M;
    const fam = titleFam(SANS);
    const footH = S.author.trim() ? (sq ? 84 : 96) : 0;
    const bottom = H - M + 10 - footH;
    const headline = fit(ctx, S.title, {
      fam, w: titleW(fam), max: sq ? 76 : 88, min: 48, maxW, maxLines: sq ? 4 : 5, lhr: fam === SERIF ? 1.22 : 1.24, balance: true,
    });
    const snip = S.subtitle.trim() ? block(ctx, S.subtitle, { w: 400, size: sq ? 32 : 36, lhr: 1.42, maxW, maxLines: sq ? 2 : 3, balance: true }) : null;
    const kick = S.category.trim() ? 52 : 0;
    let h = (kick ? kick + 34 : 0) + headline.height + (snip ? 26 + snip.height : 0);
    let y = bottom - h;

    if (kick) {
      pill(ctx, S.category.trim(), M, y, { fill: T.accentFill, size: 28, h: kick });
      y += kick + 34;
    }
    headline.draw(ctx, M - 2, y, T.ink);
    y += headline.height;
    if (snip) {
      y += 26;
      snip.draw(ctx, M, y, T.muted);
    }
    if (footH) {
      const ry = H - M + 10 - footH + 28;
      ctx.fillStyle = T.rule;
      ctx.fillRect(M, ry, maxW, 2);
      const cy = ry + (H - ry) / 2 - 6;
      ctx.fillStyle = T.accentFill;
      ctx.fillRect(M, cy - 15, 5, 30);
      const af = fitLine(ctx, S.author.trim(), maxW - 22, { w: 600, size: 30, min: 22 });
      label(ctx, af.text, M + 22, cy, { w: 600, size: af.size, color: T.ink });
    }
  }

  // Quote: big serif quotation, author with accent dash.
  function drawQuote(ctx, W, H) {
    const T = themeFor();
    const sq = H / W < 1.1;
    const M = 80;
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    if (photo) photoBackground(ctx, W, H, S.overlay, { from: 0.1, bottom: 0.7 });

    const topY = M - 8;
    let kickH = 0;
    if (S.category.trim()) {
      pill(ctx, S.category.trim(), M, topY, { fill: T.accentFill, size: 27, h: 50 });
      kickH = 50;
    }
    const logoH = sq ? 62 : 70;
    const footY = H - M - logoH + 10;
    drawLogo(ctx, W - M, footY, logoH, T.logo, "right");

    const maxW = W - 2 * M;
    const fam = titleFam(SERIF);
    const areaTop = topY + kickH + (sq ? 40 : 70);
    const areaBottom = footY - (sq ? 40 : 60);
    const markH = sq ? 96 : 130;
    const author = S.author.trim();
    const authH = author ? 40 + 32 : 0;
    const quote = fit(ctx, S.title, {
      fam, w: titleW(fam), max: sq ? 76 : 90, min: 40, maxW, maxLines: sq ? 6 : 8, lhr: fam === SERIF ? 1.38 : 1.34,
      balance: true, maxH: areaBottom - areaTop - markH - authH,
    });
    const total = markH + quote.height + authH;
    let y = areaTop + Math.max(0, (areaBottom - areaTop - total) * 0.5);

    // opening quotation mark, drawn in the serif face
    ctx.save();
    ctx.font = font(400, sq ? 210 : 280, SERIF);
    ctx.fillStyle = T.accentText;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("“", M - 10, y + (sq ? 160 : 214));
    ctx.restore();
    y += markH;
    quote.draw(ctx, M, y, T.ink);
    y += quote.height;
    if (author) {
      y += 40;
      ctx.fillStyle = T.accentFill;
      ctx.fillRect(M, y + 14, 56, 4);
      label(ctx, author, M + 78, y + 16, { w: 500, size: 32, color: T.muted });
    }
  }

  // Quiz: question + four options (ক খ গ ঘ), optional highlighted answer.
  function drawQuiz(ctx, W, H) {
    const T = themeFor();
    const sq = H / W < 1.1;
    const M = 72;
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    if (photo) {
      drawCover(ctx, photo, 0, 0, W, H, S.focus);
      ctx.fillStyle = rgba(B.color.maroonDeep, Math.min(0.94, 0.7 + S.overlay * 0.3));
      ctx.fillRect(0, 0, W, H);
    }

    // header row: kicker left, logo right
    const topY = M - 12;
    const logoH = sq ? 62 : 70;
    drawLogo(ctx, W - M, topY - 8, logoH, T.logo, "right");
    if (S.category.trim()) pill(ctx, S.category.trim(), M, topY + logoH * 0.62 - 8 - 26, { fill: T.accentFill, size: 28, h: 52 });
    const headBottom = topY + logoH;

    // footer row
    const footH = 88;
    const ry = H - M - footH + 24;
    const cta = S.cta.trim();
    const link = S.link.trim();
    if (cta || link) {
      ctx.fillStyle = T.rule;
      ctx.fillRect(M, ry, W - 2 * M, 2);
      const cy = ry + (H - ry) / 2 - 8;
      let lw = 0;
      if (link) {
        const lf = fitLine(ctx, link, (W - 2 * M) * 0.45, { w: 600, size: 27, min: 22 });
        lw = label(ctx, lf.text, W - M, cy, { w: 600, size: lf.size, color: T.accentText, align: "right" });
      }
      if (cta) {
        const cf = fitLine(ctx, S.answer >= 0 ? "সঠিক উত্তর: " + OPTION_LABELS[S.answer] : cta, W - 2 * M - lw - 36, { w: 500, size: 30, min: 22 });
        label(ctx, cf.text, M, cy, { w: 500, size: cf.size, color: T.muted });
      }
    }
    const areaTop = headBottom + (sq ? 44 : 64);
    const areaBottom = (cta || link ? ry : H - M) - (sq ? 36 : 52);

    const maxW = W - 2 * M;
    const fam = titleFam(SANS);
    const opts = S.options.map((o) => String(o || "").trim());
    let L;
    for (let k = 1; k >= 0.6; k -= 0.04) {
      const q = fit(ctx, S.title, {
        fam, w: titleW(fam), max: Math.round((sq ? 62 : 74) * k), min: Math.round(40 * k), maxW, maxLines: 4, lhr: 1.3, balance: true,
      });
      const chip = Math.round((sq ? 56 : 62) * Math.max(k, 0.75));
      const padY = Math.round((sq ? 20 : 26) * k);
      const gap = Math.round((sq ? 16 : 24) * k);
      const tx = 26 + chip + 24;
      const rows = opts.map((o) => block(ctx, o, { w: 500, size: Math.round((sq ? 36 : 40) * Math.max(k, 0.75)), lhr: 1.3, maxW: maxW - tx - 70, maxLines: 2 }));
      const rowH = rows.map((r) => Math.max(chip, r.height) + padY * 2);
      const qGap = Math.round((sq ? 40 : 56) * k);
      const total = q.height + qGap + rowH.reduce((a, b) => a + b, 0) + gap * 3;
      L = { q, chip, padY, gap, tx, rows, rowH, qGap, total };
      if (total <= areaBottom - areaTop) break;
    }
    let y = areaTop + Math.max(0, (areaBottom - areaTop - L.total) * 0.45);
    L.q.draw(ctx, M - 1, y, T.ink);
    y += L.q.height + L.qGap;

    L.rows.forEach((r, i) => {
      const h = L.rowH[i];
      const on = S.answer === i;
      const fill = on ? T.accentFill : photo ? rgba(B.color.maroonDeep, 0.6) : T.panel;
      ctx.fillStyle = fill;
      rr(ctx, M, y, maxW, h, 18);
      ctx.fill();
      ctx.strokeStyle = on ? T.accentFill : T.rule;
      ctx.lineWidth = 2;
      rr(ctx, M + 1, y + 1, maxW - 2, h - 2, 17);
      ctx.stroke();
      const textCol = on ? onColor(T.accentFill) : T.ink;
      // letter chip
      const cx = M + 26 + L.chip / 2;
      const ccy = y + h / 2;
      ctx.beginPath();
      ctx.arc(cx, ccy, L.chip / 2, 0, Math.PI * 2);
      if (on) {
        ctx.fillStyle = textCol;
        ctx.fill();
      } else {
        ctx.strokeStyle = T.accentFill;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      label(ctx, OPTION_LABELS[i], cx, ccy, { w: 600, size: Math.round(L.chip * 0.5), color: on ? T.accentFill : T.accentText, align: "center" });
      r.draw(ctx, M + L.tx, ccy - r.height / 2, textCol);
      if (on) {
        // check mark
        const kx = M + maxW - 50;
        ctx.save();
        ctx.strokeStyle = textCol;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(kx - 14, ccy);
        ctx.lineTo(kx - 3, ccy + 11);
        ctx.lineTo(kx + 16, ccy - 12);
        ctx.stroke();
        ctx.restore();
      }
      y += h + L.gap;
    });
  }

  const TEMPLATES = { magazine: drawMagazine, news: drawNews, quote: drawQuote, quiz: drawQuiz };

  function grain(ctx, pw, ph) {
    const img = ctx.getImageData(0, 0, pw, ph);
    const d = img.data;
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 9;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function dims() {
    return B.sizes[S.size] || B.sizes["1080x1350"];
  }

  function paint(canvas, scale) {
    const { w: W, h: H } = dims();
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: S.grain });
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    (TEMPLATES[S.template] || drawMagazine)(ctx, W, H);
    if (S.grain) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      grain(ctx, canvas.width, canvas.height);
    }
    return canvas;
  }

  /* ---------------------------------------------------------- export + API */

  const preview = document.getElementById("cardCanvas");
  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    return new Promise((res) => {
      raf = requestAnimationFrame(async () => {
        await ready;
        paint(preview, Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * 0.5 + 0.5)));
        updateMeta();
        res();
      });
    });
  }

  async function exportImage(opts = {}) {
    await ready;
    const scale = Number(opts.scale || S.scale) || 2;
    const format = (opts.format || S.format) === "jpg" ? "jpg" : "png";
    const c = paint(document.createElement("canvas"), scale);
    return c.toDataURL(format === "jpg" ? "image/jpeg" : "image/png", Number(opts.quality || S.quality));
  }

  function fileName(scale, format) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    const { w, h } = dims();
    return `aloion-${S.template}-${w}x${h}${scale > 1 ? "@" + scale + "x" : ""}-${stamp}.${format}`;
  }

  async function download() {
    try {
      const scale = Number(S.scale) || 2;
      const format = S.format === "jpg" ? "jpg" : "png";
      const url = await exportImage({ scale, format });
      const a = document.createElement("a");
      a.download = fileName(scale, format);
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Export failed:", err);
      alert("ছবিটি এক্সপোর্ট করা যায়নি। অন্য সাইটের লিংক থেকে নেওয়া ছবি হলে কম্পিউটার থেকে আপলোড করে আবার চেষ্টা করুন।");
    }
  }

  function loadImage(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const img = new Image();
      if (!/^data:|^blob:/.test(src)) img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => {
        console.error("Image failed to load:", String(src).slice(0, 80));
        res(null);
      };
      img.src = src;
    });
  }

  const ALIASES = { hook: "subtitle", snippet: "subtitle", headline: "title", quote: "title", question: "title", writer: "author", label: "category", sectionLabel: "category", footer: "link", cover: "image" };

  function normalise(spec) {
    const out = {};
    for (let [k, v] of Object.entries(spec || {})) {
      k = ALIASES[k] || k;
      const m = /^option([A-D])$/.exec(k);
      if (m) {
        out.options = out.options || [...S.options];
        out.options["ABCD".indexOf(m[1])] = String(v);
        continue;
      }
      if (!(k in DEFAULTS)) continue;
      if (k === "options") v = (Array.isArray(v) ? v : String(v).split("|")).slice(0, 4).map(String);
      else if (["overlay", "focus", "scale", "quality"].includes(k)) v = Number(v);
      else if (k === "answer") {
        const s = String(v).trim().toUpperCase();
        v = "ABCD".includes(s) && s.length === 1 ? "ABCD".indexOf(s) : OPTION_LABELS.includes(s) ? OPTION_LABELS.indexOf(s) : s === "" ? -1 : Number(s);
        if (!(v >= 0 && v <= 3)) v = -1;
      }
      else if (k === "grain") v = v === true || v === "1" || v === "true";
      else if (k === "size") v = String(v).replace("×", "x");
      out[k] = v;
    }
    if (out.options) while (out.options.length < 4) out.options.push("");
    return out;
  }

  async function apply(spec = {}) {
    const n = normalise(spec);
    if (n.template === "magazine" && n.accent === undefined) n.accent = "";
    Object.assign(S, n);
    if ("image" in n) photo = await loadImage(n.image);
    syncForm();
    await render();
    return { ...S };
  }

  window.Aloion = {
    ready,
    apply,
    render,
    exportImage,
    download,
    state: () => ({ ...S, options: [...S.options] }),
    brand: B,
    defaults: DEFAULTS,
    // empty content, so a spec only shows what it sets
    blank: { title: "", subtitle: "", author: "", category: "", options: ["", "", "", ""], answer: -1, image: "", accent: "" },
  };

  /* ---------------------------------------------------------- editor UI */

  const $ = (id) => document.getElementById(id);
  const form = $("editor");
  const FIELD_LABELS = {
    magazine: { title: "শিরোনাম", subtitle: "এক লাইনের হুক", author: "লেখক", category: "সেকশন লেবেল" },
    news: { title: "শিরোনাম", subtitle: "সংক্ষিপ্ত বর্ণনা (ঐচ্ছিক)", author: "লেখক / সূত্র", category: "বিভাগ" },
    quote: { title: "উক্তি", subtitle: "", author: "যাঁর উক্তি", category: "বিভাগ" },
    quiz: { title: "প্রশ্ন", subtitle: "", author: "", category: "বিষয়" },
  };

  function syncForm() {
    if (!form) return;
    form.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      let v = key.startsWith("options.") ? S.options[+key.split(".")[1]] : S[key];
      if (el.type === "radio") el.checked = String(v) === el.value;
      else if (el.type === "checkbox") el.checked = !!v;
      else if (el.type === "file") return;
      else if (el.type === "color") el.value = S.accent || currentAutoAccent();
      else el.value = v ?? "";
    });
    const t = S.template;
    document.body.dataset.template = t;
    document.querySelectorAll("[data-show]").forEach((el) => {
      el.hidden = !el.dataset.show.split(" ").includes(t);
    });
    const labels = FIELD_LABELS[t];
    document.querySelectorAll("[data-label]").forEach((el) => {
      el.textContent = labels[el.dataset.label] || el.textContent;
    });
    $("accentAuto").hidden = !S.accent;
    $("imageName").textContent = photo ? (S.imageName || "ছবি যুক্ত হয়েছে") : "কোনো ছবি নেই";
    $("removeImage").hidden = !photo;
    $("themeNote").hidden = !photo || t === "magazine";
  }

  function currentAutoAccent() {
    if (S.template === "magazine") return (B.sections[S.section] || B.sections.science).accent;
    return (photo ? B.themes.dark : B.themes[S.theme] || B.themes.light).accent;
  }

  function updateMeta() {
    const meta = $("canvasMeta");
    if (!meta) return;
    const { w, h } = dims();
    const s = Number(S.scale) || 2;
    meta.textContent = `${w}×${h} · এক্সপোর্ট ${w * s}×${h * s} px · ${S.format.toUpperCase()}`;
    const wrapEl = preview.parentElement;
    wrapEl.style.aspectRatio = `${w} / ${h}`;
    wrapEl.style.setProperty("--ratio", String(w / h));
  }

  function bindUI() {
    if (!form) return;
    form.addEventListener("input", (e) => {
      const el = e.target;
      const key = el.dataset.key;
      if (!key || el.type === "file") return;
      if (key.startsWith("options.")) S.options[+key.split(".")[1]] = el.value;
      else if (el.type === "checkbox") S[key] = el.checked;
      else if (el.type === "radio") {
        if (!el.checked) return;
        S[key] = ["scale", "answer"].includes(key) ? Number(el.value) : el.value;
      } else if (["overlay", "focus", "answer"].includes(key)) S[key] = Number(el.value);
      else S[key] = el.value;
      if (["template", "section", "theme", "accent"].includes(key) || el.type === "radio") syncForm();
      render();
    });
    form.addEventListener("submit", (e) => e.preventDefault());

    $("imageUpload").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        S.image = ev.target.result;
        S.imageName = file.name;
        photo = await loadImage(S.image);
        syncForm();
        render();
      };
      reader.readAsDataURL(file);
    });
    $("removeImage").addEventListener("click", () => {
      photo = null;
      S.image = "";
      $("imageUpload").value = "";
      syncForm();
      render();
    });
    $("accentAuto").addEventListener("click", () => {
      S.accent = "";
      syncForm();
      render();
    });
    document.querySelectorAll("[data-swatch]").forEach((b) =>
      b.addEventListener("click", () => {
        S.accent = b.dataset.swatch;
        syncForm();
        render();
      }),
    );
    $("generateBtn").addEventListener("click", render);
    $("downloadBtn").addEventListener("click", download);

    // header wordmark as inline SVG (same vector as on the banners)
    const head = $("brandMark");
    if (head && window.ALOION_WORDMARK) {
      const [x, y, w, h] = window.ALOION_WORDMARK.box;
      head.innerHTML = `<svg viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="Aloion"><g fill="currentColor">${window.ALOION_WORDMARK.paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
    }
    const sw = $("swatches");
    if (sw && !sw.children.length) {
      B.swatches.forEach((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "swatch";
        b.style.background = c;
        b.title = c;
        b.dataset.swatch = c;
        b.addEventListener("click", () => {
          S.accent = c;
          syncForm();
          render();
        });
        sw.appendChild(b);
      });
    }
  }

  async function init() {
    bindUI();
    const params = Object.fromEntries(new URLSearchParams(location.search));
    if (location.hash.startsWith("#spec=")) {
      try {
        Object.assign(params, JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(6))))));
      } catch (e) {
        console.error("Bad #spec", e);
      }
    }
    await apply(params);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
