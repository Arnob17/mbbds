/* Aloion brand system for social banners.
 * Colours come from aloion.com (--brand-* CSS variables); section tints are the
 * Aloion Magazine section palette, each paired with a darker accent that passes
 * WCAG AA (>= 4.5:1) both as text on the tint and behind white text. */
window.ALOION_BRAND = {
  color: {
    red: "#E11D2E", // --brand-primary
    redDeep: "#B91C1C", // --brand-primary-hover
    maroon: "#3D0A0A", // --brand-maroon
    maroonDeep: "#2A0707", // --brand-maroon-deep
    extrude: "#6B1515", // --brand-extrude (hard shadows)
    ink: "#2B1414", // --brand-ink
    paper: "#FFF8F0", // --brand-paper
    cream: "#FDF0DF", // --brand-cream
    wash: "#F8E4C4", // --brand-wash
    sun: "#FFB627", // --brand-sun
    white: "#FFFFFF",
  },

  themes: {
    light: {
      bg: "#FFF8F0",
      ink: "#2B1414",
      muted: "rgba(43,20,20,0.72)",
      rule: "rgba(43,20,20,0.16)",
      panel: "rgba(43,20,20,0.035)",
      accent: "#E11D2E",
      logo: "#E11D2E",
    },
    dark: {
      bg: "#2A0707",
      ink: "#FFF8F0",
      muted: "rgba(255,248,240,0.76)",
      rule: "rgba(255,248,240,0.24)",
      panel: "rgba(255,248,240,0.06)",
      accent: "#FFB627",
      logo: "#FDF0DF",
    },
  },

  // Aloion Magazine sections: light tint background + darker accent.
  sections: {
    ideas: { en: "Ideas", bn: "ভাবনা", tint: "#FFF1CC", accent: "#8A5A00" },
    science: { en: "Science", bn: "বিজ্ঞান", tint: "#E3F1EC", accent: "#16705A" },
    literature: { en: "Literature", bn: "সাহিত্য", tint: "#ECE6F4", accent: "#5B3E8E" },
    lifestyle: { en: "LifeStyle", bn: "জীবনযাপন", tint: "#FCE3D6", accent: "#B23F1E" },
    society: { en: "Society", bn: "সমাজ", tint: "#E2ECF6", accent: "#245A8D" },
    culture: { en: "Culture", bn: "সংস্কৃতি", tint: "#F8E1E4", accent: "#A8253E" },
    voices: { en: "Voices", bn: "কণ্ঠস্বর", tint: "#F3EBDD", accent: "#7A4A24" },
    comics: { en: "Comics", bn: "কমিকস", tint: "#FFF4C2", accent: "#C2261F" },
  },

  sizes: {
    "1080x1350": { w: 1080, h: 1350, label: "৪:৫ পোস্ট" },
    "1080x1080": { w: 1080, h: 1080, label: "১:১ বর্গ" },
  },

  fonts: {
    serif: '"Tiro Bangla"', // editorial titles, quotes (same as aloion.com magazine)
    sans: '"Hind Siliguri"', // everything else
  },

  swatches: ["#E11D2E", "#FFB627", "#3D0A0A", "#16705A", "#245A8D", "#5B3E8E"],
};
