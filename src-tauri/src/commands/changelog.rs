//! In-app changelog. CHANGELOG.md is embedded at build time and parsed into
//! structured entries so the frontend just lays them out — no markdown renderer
//! needed and no network dependency. Bundling (rather than fetching GitHub
//! releases) keeps it available offline and pinned to the running build.

/// CHANGELOG.md lives at the repo root, three levels up from this file
/// (`commands/` → `src/` → `src-tauri/` → repo root).
const CHANGELOG_MD: &str = include_str!("../../../CHANGELOG.md");

#[derive(serde::Serialize, specta::Type)]
pub struct ChangelogEntry {
    /// e.g. "v1.1.1".
    pub version: String,
    /// ISO date from the heading, when present.
    pub date: Option<String>,
    pub sections: Vec<ChangelogSection>,
}

#[derive(serde::Serialize, specta::Type)]
pub struct ChangelogSection {
    /// "Features", "Fixes", … — empty for bullets that precede any `###` head.
    pub title: String,
    pub items: Vec<String>,
}

#[specta::specta]
#[tauri::command]
pub fn get_changelog() -> Vec<ChangelogEntry> {
    parse_changelog(CHANGELOG_MD)
}

/// Parse the bundled CHANGELOG.md. The format is deliberately simple so the
/// parser stays tolerant:
/// - `## v1.2.3 — 2026-01-01` starts a version (the date is any trailing
///   `YYYY-MM-DD` token, separator-agnostic).
/// - `### Title` starts a section within the current version.
/// - `- item` / `* item` is an item within the current section; a bullet that
///   appears before any `###` lands in a leading untitled section.
///
/// Everything else (the `# Changelog` title, prose, blank lines) is ignored.
fn parse_changelog(md: &str) -> Vec<ChangelogEntry> {
    let mut entries: Vec<ChangelogEntry> = Vec::new();

    for raw in md.lines() {
        let line = raw.trim_end();

        if let Some(rest) = line.strip_prefix("## ") {
            let version = rest.split_whitespace().next().unwrap_or("").to_string();
            // The date is the trailing token iff it looks like YYYY-MM-DD, so a
            // version line with no date (or a different separator) still parses.
            let date = rest
                .split_whitespace()
                .last()
                .filter(|&t| is_iso_date(t))
                .map(|t| t.to_string());
            entries.push(ChangelogEntry { version, date, sections: Vec::new() });
        } else if let Some(title) = line.strip_prefix("### ") {
            if let Some(entry) = entries.last_mut() {
                entry.sections.push(ChangelogSection {
                    title: title.trim().to_string(),
                    items: Vec::new(),
                });
            }
        } else if let Some(item) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
            if let Some(entry) = entries.last_mut() {
                if entry.sections.is_empty() {
                    entry.sections.push(ChangelogSection {
                        title: String::new(),
                        items: Vec::new(),
                    });
                }
                // last_mut is safe: we just guaranteed at least one section.
                entry.sections.last_mut().unwrap().items.push(item.trim().to_string());
            }
        }
    }

    entries
}

/// Cheap `YYYY-MM-DD` shape check — avoids pulling in a date crate just to
/// recognize the heading's trailing token.
fn is_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter()
            .enumerate()
            .all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versions_sections_and_items() {
        let md = "\
# Changelog

## v1.1.0 — 2026-06-16
### Features
- Streamer Mode.
- Another thing.
### Fixes
- A fix.

## v0.1.0 — 2026-04-12
- Initial release.
";
        let entries = parse_changelog(md);
        assert_eq!(entries.len(), 2);

        assert_eq!(entries[0].version, "v1.1.0");
        assert_eq!(entries[0].date.as_deref(), Some("2026-06-16"));
        assert_eq!(entries[0].sections.len(), 2);
        assert_eq!(entries[0].sections[0].title, "Features");
        assert_eq!(entries[0].sections[0].items.len(), 2);
        assert_eq!(entries[0].sections[1].title, "Fixes");

        // A bullet before any `###` lands in a leading untitled section.
        assert_eq!(entries[1].version, "v0.1.0");
        assert_eq!(entries[1].sections.len(), 1);
        assert_eq!(entries[1].sections[0].title, "");
        assert_eq!(entries[1].sections[0].items, vec!["Initial release."]);
    }

    #[test]
    fn the_bundled_changelog_parses_and_is_nonempty() {
        let entries = parse_changelog(CHANGELOG_MD);
        assert!(!entries.is_empty(), "bundled CHANGELOG.md produced no entries");
        // Every entry should have a version and at least one item somewhere.
        for e in &entries {
            assert!(e.version.starts_with('v'), "bad version: {:?}", e.version);
            assert!(
                e.sections.iter().any(|s| !s.items.is_empty()),
                "version {} has no items",
                e.version
            );
        }
    }
}
