// Accent color presets — each defines the primary color in oklch for light and dark modes
export interface AccentPreset {
  id: string;
  label: string;
  swatch: string; // hex for the preview swatch
  light: { primary: string; primaryForeground: string };
  dark: { primary: string; primaryForeground: string };
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "neutral",
    label: "Neutral",
    swatch: "#1a1a1a",
    light: { primary: "oklch(0.205 0 0)", primaryForeground: "oklch(0.985 0 0)" },
    dark: { primary: "oklch(0.985 0 0)", primaryForeground: "oklch(0.205 0 0)" },
  },
  {
    id: "blue",
    label: "Blue",
    swatch: "#2563eb",
    light: { primary: "oklch(0.546 0.245 262.881)", primaryForeground: "oklch(0.985 0 0)" },
    dark: { primary: "oklch(0.623 0.214 259.815)", primaryForeground: "oklch(0.985 0 0)" },
  },
  {
    id: "violet",
    label: "Violet",
    swatch: "#7c3aed",
    light: { primary: "oklch(0.504 0.256 293.541)", primaryForeground: "oklch(0.985 0 0)" },
    dark: { primary: "oklch(0.586 0.22 292.717)", primaryForeground: "oklch(0.985 0 0)" },
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "#e11d48",
    light: { primary: "oklch(0.514 0.222 16.935)", primaryForeground: "oklch(0.985 0 0)" },
    dark: { primary: "oklch(0.6 0.2 15.341)", primaryForeground: "oklch(0.985 0 0)" },
  },
  {
    id: "orange",
    label: "Orange",
    swatch: "#ea580c",
    light: { primary: "oklch(0.554 0.195 38.402)", primaryForeground: "oklch(0.985 0 0)" },
    dark: { primary: "oklch(0.637 0.178 43.272)", primaryForeground: "oklch(0.985 0 0)" },
  },
  {
    id: "green",
    label: "Green",
    swatch: "#16a34a",
    light: { primary: "oklch(0.565 0.18 152.535)", primaryForeground: "oklch(0.985 0 0)" },
    dark: { primary: "oklch(0.648 0.17 150.079)", primaryForeground: "oklch(0.985 0 0)" },
  },
  {
    id: "teal",
    label: "Teal",
    swatch: "#0d9488",
    light: { primary: "oklch(0.555 0.115 174.402)", primaryForeground: "oklch(0.985 0 0)" },
    dark: { primary: "oklch(0.64 0.112 178.042)", primaryForeground: "oklch(0.985 0 0)" },
  },
];

export function applyAccent(presetId: string, isDark: boolean) {
  const preset = ACCENT_PRESETS.find((p) => p.id === presetId) ?? ACCENT_PRESETS[0];
  const vars = isDark ? preset.dark : preset.light;
  const root = document.documentElement;
  root.style.setProperty("--primary", vars.primary);
  root.style.setProperty("--primary-foreground", vars.primaryForeground);
  root.style.setProperty("--sidebar-primary", vars.primary);
  root.style.setProperty("--sidebar-primary-foreground", vars.primaryForeground);
}

export function clearAccent() {
  const root = document.documentElement;
  root.style.removeProperty("--primary");
  root.style.removeProperty("--primary-foreground");
  root.style.removeProperty("--sidebar-primary");
  root.style.removeProperty("--sidebar-primary-foreground");
}
