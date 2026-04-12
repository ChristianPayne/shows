use std::path::{Path, PathBuf};

/// Convert an event name into a filesystem-safe slug. Rules:
///
/// - lowercase
/// - every run of non-alphanumeric chars collapses to a single `-`
/// - leading/trailing `-` trimmed
/// - capped at 60 chars so cross-platform path limits (Windows 260, etc.)
///   have headroom once the `-<id>` suffix and filename are appended
/// - empty result falls back to `"event"` — combined with the id suffix the
///   folder name is still unique
pub fn slugify(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut prev_dash = true; // so leading dashes are dropped
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            for lc in c.to_lowercase() {
                out.push(lc);
            }
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.len() > 60 {
        out.truncate(60);
        while out.ends_with('-') {
            out.pop();
        }
    }
    if out.is_empty() {
        "event".to_string()
    } else {
        out
    }
}

/// Canonical folder name for an event's images. Slug is derived on the fly so
/// there's one source of truth (the `events.name` column). The id suffix
/// makes it collision-proof even when two events share a name.
pub fn event_folder_name(id: i64, name: &str) -> String {
    format!("{}-{}", slugify(name), id)
}

/// Absolute path to `<app_data_dir>/images`.
pub fn images_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("images")
}

/// Absolute path to an event's image folder. Does not create the directory.
pub fn event_folder_path(app_data_dir: &Path, id: i64, name: &str) -> PathBuf {
    images_root(app_data_dir).join(event_folder_name(id, name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Nine Inch Nails"), "nine-inch-nails");
        assert_eq!(slugify("  Lightning in a Bottle 2026  "), "lightning-in-a-bottle-2026");
        assert_eq!(slugify("!!!"), "event");
        assert_eq!(slugify(""), "event");
        assert_eq!(slugify("A/B + C"), "a-b-c");
    }

    #[test]
    fn slugify_length_cap() {
        let long = "a".repeat(200);
        assert!(slugify(&long).len() <= 60);
    }

    #[test]
    fn slugify_trailing_dash_after_truncate() {
        // Force a dash right at position 60 to verify we strip it.
        let mut s = "a".repeat(59);
        s.push(' ');
        s.push_str("tail");
        let out = slugify(&s);
        assert!(!out.ends_with('-'));
    }

    #[test]
    fn folder_name_includes_id() {
        assert_eq!(event_folder_name(42, "Test Show"), "test-show-42");
    }
}
