//! Capture-timestamp extraction for uploaded media.
//!
//! This is the "when was this photo / video taken" lookup — distinct from
//! `created_at`, which is the upload time into our database. Galleries sort
//! chronologically on `captured_at` when it's present and fall back to
//! `created_at` otherwise.
//!
//! Sources, by format:
//!
//! - **JPEG / HEIC / TIFF**: EXIF `DateTimeOriginal` via `kamadak-exif`.
//!   iPhones populate this reliably.
//! - **MP4 / MOV / M4V**: the `mvhd` box's `creation_time` inside `moov`,
//!   parsed with an inline ISO-BMFF box walker to avoid adding another crate
//!   dependency. iPhone HEVC MOV has this populated.
//! - **PNG / GIF / WebP / WebM**: no standardized capture timestamp field;
//!   returns `None` and the caller falls back to upload order.

use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use chrono::{DateTime, Utc};

/// Top-level entry point. `mime_type` is the same string we compute at
/// upload time via `mime_guess`, used here to pick a parser without having
/// to re-sniff the file.
pub fn extract_captured_at(path: &Path, mime_type: &str) -> Option<String> {
    if mime_type.starts_with("image/") {
        extract_exif_datetime(path)
    } else if is_mp4_family_mime(mime_type) {
        extract_mov_creation_time(path)
    } else {
        None
    }
}

fn is_mp4_family_mime(mime_type: &str) -> bool {
    matches!(
        mime_type,
        "video/mp4" | "video/quicktime" | "video/x-m4v" | "video/mpeg"
    )
}

/// EXIF `DateTimeOriginal` for images. `kamadak-exif` handles JPEG, HEIC,
/// and TIFF containers; PNG/GIF/WebP don't have standardized EXIF blocks
/// (technically WebP can, but iPhone/camera output almost never uses it),
/// so they'll hit the `read_from_container` branch and return `None`.
fn extract_exif_datetime(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let exif_reader = exif::Reader::new();
    let exif = exif_reader.read_from_container(&mut reader).ok()?;

    // Prefer DateTimeOriginal (when the shutter fired). Fall back to
    // DateTime (when the file was written) for scanned images and other
    // edge cases where only the modification time is recorded.
    let field = exif
        .get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
        .or_else(|| exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY))?;

    // Pull the raw ASCII bytes straight from the Value rather than going
    // through `display_value()`. The display layer reformats DateTime fields
    // with hyphens (`2024-01-15 14:23:05`), but on-disk EXIF is always
    // colon-delimited (`2024:01:15 14:23:05`). `normalize_exif_datetime`
    // expects the raw colon form so it can rewrite the date separators; if
    // we fed it the already-reformatted display string it would reject the
    // whole thing as "wrong shape" and we'd lose every timestamp.
    let raw_bytes = match &field.value {
        exif::Value::Ascii(parts) => parts.first()?,
        _ => return None,
    };
    let raw = std::str::from_utf8(raw_bytes).ok()?.trim_end_matches('\0');
    normalize_exif_datetime(raw)
}

/// EXIF stores `DateTimeOriginal` as `"YYYY:MM:DD HH:MM:SS"`. Swap the date
/// colons for hyphens so the string sorts correctly with the rest of our
/// `YYYY-MM-DD HH:MM:SS` timestamps.
fn normalize_exif_datetime(raw: &str) -> Option<String> {
    // Expect exactly 19 chars: `"YYYY:MM:DD HH:MM:SS"`.
    if raw.len() != 19 {
        return None;
    }
    let bytes = raw.as_bytes();
    if bytes[4] != b':' || bytes[7] != b':' || bytes[10] != b' ' {
        return None;
    }
    let mut out = raw.to_string();
    // SAFETY: we validated ASCII positions above; this mutation stays in
    // ASCII range so UTF-8 boundaries are intact.
    unsafe {
        let bytes = out.as_bytes_mut();
        bytes[4] = b'-';
        bytes[7] = b'-';
    }
    Some(out)
}

/// QuickTime / ISO-BMFF epoch: seconds between 1904-01-01 00:00:00 UTC and
/// the Unix epoch (1970-01-01 00:00:00 UTC). Used to convert `mvhd`
/// creation_time to a Unix timestamp for chrono.
const QUICKTIME_EPOCH_OFFSET: i64 = 2_082_844_800;

/// Apple QuickTime metadata key for the original recording timestamp. The
/// crucial thing about this key vs. `mvhd.creation_time` is that it *survives
/// re-exports*: iOS Photos rewrites `mvhd.creation_time` every time the file
/// is shared, AirDropped, or converted, but leaves this key alone. For an
/// iPhone video that's been anywhere near the Share Sheet, this is the only
/// reliable source of the original capture time.
const QT_CREATIONDATE_KEY: &str = "com.apple.quicktime.creationdate";

/// Extract the capture time from an MP4/MOV file. Tries two sources, in
/// order:
///
/// 1. `moov → meta → keys/ilst` → `com.apple.quicktime.creationdate` —
///    iPhone's authoritative original-capture time, untouched by exports.
/// 2. `moov → mvhd → creation_time` — the ISO-BMFF standard field. Correct
///    for most non-Apple containers (GoPro, dashcams, generic MP4s), but
///    unreliable for iPhone video that's been through the Share Sheet.
///
/// A `None` on both paths falls through to the caller, which stores
/// `captured_at = NULL` and lets the gallery sort by upload order.
fn extract_mov_creation_time(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();

    if let Some(ts) = extract_quicktime_creationdate(&mut file, file_len) {
        return Some(ts);
    }

    let creation_time = find_mvhd_creation_time(&mut file, 0, file_len)?;
    if creation_time == 0 {
        // Many tools leave creation_time zeroed when the original is
        // unknown. Treat as "no data" rather than trust 1904-01-01.
        return None;
    }
    let unix = creation_time as i64 - QUICKTIME_EPOCH_OFFSET;
    let dt = DateTime::<Utc>::from_timestamp(unix, 0)?;
    Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
}

/// Find the first direct child of `[start, end)` whose four-byte type
/// matches `target`. Returns `(body_start, body_end)` — the range *inside*
/// the box header, ready for further parsing.
///
/// This is the same pattern as the mvhd walker but hoisted into a helper
/// because the QuickTime metadata path needs to walk the same way at three
/// nesting levels (`moov`, `meta`, `ilst`).
fn find_box_in(
    file: &mut File,
    start: u64,
    end: u64,
    target: &[u8; 4],
) -> Option<(u64, u64)> {
    let mut cursor = start;
    while cursor + 8 <= end {
        file.seek(SeekFrom::Start(cursor)).ok()?;
        let mut header = [0u8; 8];
        file.read_exact(&mut header).ok()?;
        let size32 = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
        let (box_size, body_start) = match size32 {
            0 => (end - cursor, cursor + 8),
            1 => {
                let mut ext = [0u8; 8];
                file.read_exact(&mut ext).ok()?;
                (u64::from_be_bytes(ext), cursor + 16)
            }
            n => (n as u64, cursor + 8),
        };
        if box_size < 8 || cursor + box_size > end {
            return None;
        }
        let body_end = cursor + box_size;
        if &header[4..8] == target {
            return Some((body_start, body_end));
        }
        cursor = body_end;
    }
    None
}

/// Walk `moov → meta → (keys, ilst)` and extract the value for
/// `com.apple.quicktime.creationdate`. Returns the timestamp in our
/// standard `YYYY-MM-DD HH:MM:SS` format if found.
///
/// The meta box in QuickTime-flavored files has **no** version/flags header
/// — unlike ISO-BMFF's meta, which prefixes its children with a 4-byte
/// version/flags word. iPhone .mov files use the QuickTime layout, so the
/// children start immediately after the 8-byte box header.
fn extract_quicktime_creationdate(file: &mut File, file_len: u64) -> Option<String> {
    let (moov_start, moov_end) = find_box_in(file, 0, file_len, b"moov")?;
    let (meta_start, meta_end) = find_box_in(file, moov_start, moov_end, b"meta")?;

    // Inside meta: first locate `keys` to find the 1-based index of the
    // creationdate key, then locate `ilst` to find the entry with that index.
    let (keys_start, keys_end) = find_box_in(file, meta_start, meta_end, b"keys")?;
    let target_index = find_quicktime_key_index(file, keys_start, keys_end, QT_CREATIONDATE_KEY)?;

    let (ilst_start, ilst_end) = find_box_in(file, meta_start, meta_end, b"ilst")?;
    let (entry_body_start, entry_body_end) =
        find_ilst_entry_by_index(file, ilst_start, ilst_end, target_index)?;

    // Entry wraps a nested `data` box holding the payload.
    let (data_body_start, data_body_end) =
        find_box_in(file, entry_body_start, entry_body_end, b"data")?;

    // data box body layout:
    //   u8 version + [u8; 3] type-indicator flags (total 4 bytes)
    //   u32 locale (4 bytes, usually zero)
    //   payload: the rest
    if data_body_end < data_body_start + 8 {
        return None;
    }
    let payload_start = data_body_start + 8;
    let payload_len = (data_body_end - payload_start) as usize;
    file.seek(SeekFrom::Start(payload_start)).ok()?;
    let mut buf = vec![0u8; payload_len];
    file.read_exact(&mut buf).ok()?;
    let raw = std::str::from_utf8(&buf).ok()?.trim_end_matches('\0');

    parse_quicktime_iso_date(raw)
}

/// Scan a QuickTime `keys` box for `target_name` and return its 1-based
/// index, which `ilst` entries use as their type code.
///
/// Keys box body layout:
/// ```text
///   u32 version_and_flags
///   u32 entry_count
///   entries[]: for each entry:
///     u32 key_size      (full entry size including this header, in bytes)
///     [u8; 4] namespace (typically "mdta" for Apple metadata)
///     [u8; key_size-8] key_name (UTF-8, no null terminator)
/// ```
fn find_quicktime_key_index(
    file: &mut File,
    keys_start: u64,
    keys_end: u64,
    target_name: &str,
) -> Option<u32> {
    file.seek(SeekFrom::Start(keys_start)).ok()?;
    let mut header = [0u8; 8];
    file.read_exact(&mut header).ok()?;
    let entry_count = u32::from_be_bytes([header[4], header[5], header[6], header[7]]);

    let mut pos = keys_start + 8;
    for i in 1..=entry_count {
        if pos + 8 > keys_end {
            return None;
        }
        file.seek(SeekFrom::Start(pos)).ok()?;
        let mut kh = [0u8; 8];
        file.read_exact(&mut kh).ok()?;
        let key_size = u32::from_be_bytes([kh[0], kh[1], kh[2], kh[3]]) as u64;
        if key_size < 8 || pos + key_size > keys_end {
            return None;
        }
        let name_len = (key_size - 8) as usize;
        let mut name = vec![0u8; name_len];
        file.read_exact(&mut name).ok()?;
        if name == target_name.as_bytes() {
            return Some(i);
        }
        pos += key_size;
    }
    None
}

/// Scan an `ilst` box for the entry whose "type code" (first 4 bytes of its
/// 8-byte header, after the size) equals `target_index`. Each ilst entry's
/// body is the range `[body_start, body_end)` — return that so the caller
/// can parse the nested `data` box inside.
fn find_ilst_entry_by_index(
    file: &mut File,
    ilst_start: u64,
    ilst_end: u64,
    target_index: u32,
) -> Option<(u64, u64)> {
    let mut cursor = ilst_start;
    while cursor + 8 <= ilst_end {
        file.seek(SeekFrom::Start(cursor)).ok()?;
        let mut header = [0u8; 8];
        file.read_exact(&mut header).ok()?;
        let size = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as u64;
        let idx = u32::from_be_bytes([header[4], header[5], header[6], header[7]]);
        if size < 8 || cursor + size > ilst_end {
            return None;
        }
        if idx == target_index {
            return Some((cursor + 8, cursor + size));
        }
        cursor += size;
    }
    None
}

/// Parse an iPhone `creationdate` value. Format:
/// `YYYY-MM-DDTHH:MM:SS±HHMM` (example: `"2025-09-04T22:47:25-0700"`).
/// We return the local-time component in `YYYY-MM-DD HH:MM:SS` form and
/// deliberately drop the timezone offset so the result sorts alongside our
/// EXIF timestamps (which also carry no zone in our storage format).
fn parse_quicktime_iso_date(raw: &str) -> Option<String> {
    if raw.len() < 19 {
        return None;
    }
    let head = &raw[..19];
    let bytes = head.as_bytes();
    if bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return None;
    }
    let mut out = String::with_capacity(19);
    out.push_str(&head[..10]);
    out.push(' ');
    out.push_str(&head[11..]);
    Some(out)
}

/// Scan the top level of the file for `moov`, then inside it for `mvhd`,
/// and return the raw `creation_time` value. Caller handles epoch conversion
/// and zero-sentinel logic. Kept as the fallback path for non-Apple
/// containers after the QuickTime metadata lookup fails.
fn find_mvhd_creation_time(file: &mut File, start: u64, end: u64) -> Option<u64> {
    let (moov_start, moov_end) = find_box_in(file, start, end, b"moov")?;
    let (mvhd_start, mvhd_end) = find_box_in(file, moov_start, moov_end, b"mvhd")?;
    parse_mvhd_creation_time(file, mvhd_start, mvhd_end)
}

/// Parse the body of an `mvhd` box. Layout:
///
/// ```text
///   version:       u8
///   flags:         [u8; 3]
///   if version == 1:
///     creation_time:     u64 BE
///     modification_time: u64 BE
///     timescale:         u32 BE
///     duration:          u64 BE
///   else (version == 0):
///     creation_time:     u32 BE
///     modification_time: u32 BE
///     timescale:         u32 BE
///     duration:          u32 BE
///   ... (more fields we don't care about)
/// ```
fn parse_mvhd_creation_time(file: &mut File, body_start: u64, body_end: u64) -> Option<u64> {
    file.seek(SeekFrom::Start(body_start)).ok()?;
    let mut version_and_flags = [0u8; 4];
    file.read_exact(&mut version_and_flags).ok()?;
    let version = version_and_flags[0];

    match version {
        0 => {
            if body_start + 4 + 4 > body_end {
                return None;
            }
            let mut buf = [0u8; 4];
            file.read_exact(&mut buf).ok()?;
            Some(u32::from_be_bytes(buf) as u64)
        }
        1 => {
            if body_start + 4 + 8 > body_end {
                return None;
            }
            let mut buf = [0u8; 8];
            file.read_exact(&mut buf).ok()?;
            Some(u64::from_be_bytes(buf))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_exif_datetime() {
        assert_eq!(
            normalize_exif_datetime("2024:01:15 14:23:05").as_deref(),
            Some("2024-01-15 14:23:05")
        );
    }

    #[test]
    fn rejects_malformed_exif_datetime() {
        assert!(normalize_exif_datetime("not a timestamp").is_none());
        assert!(normalize_exif_datetime("2024-01-15 14:23:05").is_none()); // already hyphenated, wrong shape
        assert!(normalize_exif_datetime("").is_none());
    }

    #[test]
    fn unknown_mime_returns_none() {
        let path = Path::new("/dev/null");
        assert!(extract_captured_at(path, "application/pdf").is_none());
    }

    #[test]
    fn parses_iphone_iso_date() {
        assert_eq!(
            parse_quicktime_iso_date("2025-09-04T22:47:25-0700").as_deref(),
            Some("2025-09-04 22:47:25")
        );
    }

    #[test]
    fn rejects_malformed_iso_date() {
        assert!(parse_quicktime_iso_date("not a date").is_none());
        assert!(parse_quicktime_iso_date("2025/09/04T22:47:25").is_none());
        assert!(parse_quicktime_iso_date("").is_none());
    }

}
