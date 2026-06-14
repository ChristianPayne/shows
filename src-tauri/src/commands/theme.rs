//! Theme/accent derivation. The DOM application (setting CSS variables) lives
//! in the frontend by necessity, but the *logic* — turning a picked hex color
//! into a full accent definition — belongs here.

use serde::Serialize;

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AccentColors {
    pub primary: String,
    pub primary_foreground: String,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AccentPreset {
    pub id: String,
    pub label: String,
    pub swatch: String,
    pub light: AccentColors,
    pub dark: AccentColors,
}

/// Build a full accent definition from a user-picked hex color. The hex drives
/// --primary directly (a valid CSS color) for both themes, with a foreground
/// chosen for contrast. The id derives from the hex so re-adding the same color
/// de-dupes instead of stacking.
#[specta::specta]
#[tauri::command]
pub fn make_custom_accent(hex: String) -> AccentPreset {
    let swatch = hex.to_lowercase();
    let fg = readable_foreground(&swatch).to_string();
    let colors = AccentColors {
        primary: swatch.clone(),
        primary_foreground: fg,
    };
    AccentPreset {
        id: format!("custom-{swatch}"),
        label: swatch.to_uppercase(),
        light: AccentColors {
            primary: colors.primary.clone(),
            primary_foreground: colors.primary_foreground.clone(),
        },
        dark: colors,
        swatch,
    }
}

/// Dark text on light accents, light text on dark ones, by perceived luminance.
fn readable_foreground(hex: &str) -> &'static str {
    let h = hex.trim_start_matches('#');
    if h.len() < 6 {
        return "oklch(0.985 0 0)";
    }
    let channel = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap_or(0) as f64 / 255.0;
    let lum = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
    if lum > 0.6 {
        "oklch(0.205 0 0)"
    } else {
        "oklch(0.985 0 0)"
    }
}
