import type { CSSProperties } from "react";

// Genre/tag colors.
//
// A tag's FAMILY sets its hue band (electronic = blues, rock = warm reds, …)
// and a stable hash of the tag name varies the hue WITHIN that band — so all
// electronic genres read as blue, but techno / house / trance are each a
// distinct blue. Lightness + chroma come from the --tag-l / --tag-c CSS tokens
// so colors re-tint per theme, and a future palette switcher can re-skin
// everything by reassigning those tokens (and the bands below).
//
// This is the one place the tag→color mapping lives; every consumer just calls
// tagColor()/tagChipStyle(). Swapping pure-hash for family-aware (or vice
// versa) is a change here and nowhere else.

// Hue band per family, in OKLch hue degrees. `base` is the band start, `spread`
// its width — electronic is widest because collections skew heavily toward it,
// so its many genres need room to stay distinct.
const FAMILY_BANDS: Record<string, { base: number; spread: number }> = {
  rock: { base: 20, spread: 40 }, // red → orange
  other: { base: 62, spread: 28 }, // amber / gold
  folk: { base: 105, spread: 45 }, // green (roots)
  reggae: { base: 152, spread: 33 }, // teal-green
  electronic: { base: 198, spread: 82 }, // cyan → blue → indigo
  metal: { base: 282, spread: 18 }, // violet (cool, narrow)
  hiphop: { base: 302, spread: 26 }, // magenta-violet
  pop: { base: 330, spread: 28 }, // pink
};

// The seeded common genres, grouped by family. Exact lookups for these;
// custom tags fall through to keyword matching below.
const FAMILY_TAGS: Record<string, string[]> = {
  rock: [
    "rock", "indie rock", "alternative rock", "classic rock", "hard rock",
    "punk", "post-punk", "pop punk", "garage rock", "psychedelic rock",
    "progressive rock", "post-rock", "math rock", "grunge", "shoegaze",
    "dream pop", "emo", "indie", "alternative",
  ],
  metal: [
    "metal", "heavy metal", "thrash metal", "death metal", "black metal",
    "doom metal", "progressive metal", "metalcore", "nu metal", "hardcore",
    "stoner rock", "sludge",
  ],
  electronic: [
    "electronic", "house", "deep house", "tech house", "techno", "trance",
    "progressive house", "dubstep", "drum and bass", "breakbeat", "ambient",
    "idm", "downtempo", "trip hop", "synthwave", "electronica", "hyperpop",
  ],
  hiphop: ["hip hop", "rap", "trap", "r&b", "soul", "neo soul", "funk"],
  folk: [
    "jam band", "bluegrass", "folk", "indie folk", "folk rock", "americana",
    "country", "singer-songwriter",
  ],
  pop: ["pop", "indie pop", "synth pop", "electropop", "dance pop", "art pop"],
  reggae: [
    "reggae", "dub", "ska", "dancehall", "afrobeat", "latin", "salsa",
    "reggaeton", "world",
  ],
  other: [
    "experimental", "noise", "industrial", "gospel", "instrumental",
    "acoustic", "lo-fi", "surf rock",
  ],
};

const TAG_FAMILY: Record<string, string> = {};
for (const [family, tags] of Object.entries(FAMILY_TAGS)) {
  for (const tag of tags) TAG_FAMILY[tag] = family;
}

// Resolve a tag to a family: exact seed lookup first, then best-effort keyword
// matching for custom tags. null → unknown, spread across the whole wheel.
function familyOf(tag: string): string | null {
  if (TAG_FAMILY[tag]) return TAG_FAMILY[tag];
  if (tag.includes("metal") || tag.includes("hardcore")) return "metal";
  if (/house|techno|trance|electro|dnb|drum and bass|dubstep|edm|synth|wave|idm|ambient/.test(tag))
    return "electronic";
  if (tag.includes("hop") || tag.includes("rap") || tag.includes("trap") || tag.includes("soul"))
    return "hiphop";
  if (tag.includes("folk") || tag.includes("country") || tag.includes("bluegrass") || tag.includes("americana"))
    return "folk";
  if (tag.includes("reggae") || tag.includes("dub") || tag.includes("ska") || tag.includes("latin"))
    return "reggae";
  if (tag.includes("punk") || tag.includes("rock") || tag.includes("indie")) return "rock";
  if (tag.includes("pop")) return "pop";
  return null;
}

// Stable string → [0, 1) hash (FNV-1a). Same tag always lands the same hue.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Build the tag's OKLch color, optionally with an alpha channel. Alpha (rather
// than color-mix) keeps the tints to one widely-supported CSS function.
function tagOklch(tag: string, alpha?: number): string {
  const t = tag.trim().toLowerCase();
  const family = familyOf(t);
  const band = family ? FAMILY_BANDS[family] : { base: 0, spread: 360 };
  const hue = Math.round(band.base + hash01(t) * band.spread) % 360;
  const a = alpha === undefined ? "" : ` / ${alpha}`;
  return `oklch(var(--tag-l) var(--tag-c) ${hue}${a})`;
}

/** Solid OKLch color string for a tag. Theme-aware via --tag-l / --tag-c. */
export function tagColor(tag: string): string {
  return tagOklch(tag);
}

/**
 * Inline style for a genre-tinted chip: faint fill, colored text + border.
 * `selected` deepens the fill/border for toggle chips (e.g. the tag filter)
 * so an active genre reads clearly without a separate color.
 */
export function tagChipStyle(
  tag: string,
  opts?: { selected?: boolean }
): CSSProperties {
  return {
    backgroundColor: tagOklch(tag, opts?.selected ? 0.3 : 0.16),
    color: tagOklch(tag),
    borderColor: tagOklch(tag, opts?.selected ? 0.6 : 0.34),
  };
}
