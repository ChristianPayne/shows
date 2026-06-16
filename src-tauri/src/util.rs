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

/// Absolute path to the media root for the current build. Release builds
/// use `<app_data_dir>/media`; dev builds use `<app_data_dir>/media_dev`.
///
/// The split mirrors the DB-naming convention (`shows.db` vs
/// `shows_dev.db`) so the two environments can't stomp on each other's
/// uploads — before this, `media/` was shared and a `wipe_database` in
/// release would also nuke anything dev had attached (and vice versa).
pub fn media_root(app_data_dir: &Path) -> PathBuf {
    let name = if cfg!(debug_assertions) {
        "media_dev"
    } else {
        "media"
    };
    app_data_dir.join(name)
}

/// Absolute path to an event's media folder. Does not create the directory.
pub fn event_folder_path(app_data_dir: &Path, id: i64, name: &str) -> PathBuf {
    media_root(app_data_dir).join(event_folder_name(id, name))
}

// ── Streamer Mode ───────────────────────────────────────────────────────────

/// Collapse a friend's name to its first word.
///
/// Streamer Mode trades full names for first-name-only so a shared screen
/// doesn't out the people you go to shows with. This is the single source of
/// truth for that transform — every command that emits a friend name funnels
/// through it. We keep the leading whitespace-delimited token and nothing else;
/// deliberately blunt, because anything cleverer risks leaking more than the
/// first name. An empty or all-whitespace name yields "" — there was nothing
/// safe to show anyway.
pub fn mask_first_name(name: &str) -> String {
    name.split_whitespace().next().unwrap_or("").to_string()
}

/// Whether Streamer Mode is currently on, read from the `settings` table.
///
/// A missing row (fresh install) or any value other than `"true"` reads as off.
/// The read shares the request's pool, so if it failed the surrounding data
/// query would have failed too — we default to off rather than thread an error
/// through every display command.
pub async fn streamer_mode_enabled(pool: &sqlx::SqlitePool) -> bool {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM settings WHERE key = 'streamer_mode'")
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
    row.is_some_and(|(v,)| v == "true")
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

    #[test]
    fn mask_first_name_keeps_leading_token() {
        assert_eq!(mask_first_name("Sarah Chen"), "Sarah");
        assert_eq!(mask_first_name("Madonna"), "Madonna");
        assert_eq!(mask_first_name("  Mary  Jane  Watson "), "Mary");
        assert_eq!(mask_first_name(""), "");
        assert_eq!(mask_first_name("   "), "");
    }
}
