---
name: release
description: Cut a new release of the shows Tauri app — survey commits since last tag, decide the next version, ensure README and RELEASE_NOTES.md reflect what shipped, run pre-flight checks (tsc, cargo check, clippy), bump versions across all three files, commit, tag, and push to both git remotes so CI builds and publishes the artifacts. Use this whenever the user asks to release, ship, cut a version, tag the next version, publish, or roll out a new build of the shows app — even when they don't say the word "release" (e.g. "let's get this out", "ship it", "tag the next one", "push a new version").
---

# Releasing the shows app

Cut a new release of the `shows` Tauri desktop app: survey what's changed, make the docs match reality, run pre-flight checks, bump three version files in lockstep, commit, tag, and push to both remotes. CI takes it from there and the auto-updater rolls the new version out to installed copies.

## Why this skill exists

Releases for this app touch a fragile chain of moving parts: three version files that must stay byte-identical, a Tauri auto-updater that silently breaks if signing or version drifts, two git remotes that have to stay in sync, and a `RELEASE_NOTES.md` file that the GitHub workflow reads at build time. The order of operations and the invariants below exist because each one corresponds to a real failure mode that has bitten this project (or could bite it). Following them in order keeps the machine working.

## Before you start

Sanity-check the environment. If any of these aren't true, stop and tell the user before doing anything else:

1. Current branch is `main`.
2. The two remotes are configured: `github` (public, the only one that triggers CI) and `origin` (the user's personal mirror on their own server). Verify with `git remote -v`.
3. `bun`, `cargo`, `gh`, and `git` are runnable from the project root.

## How to interact with the user

This skill is destructive — it commits, tags, and pushes to public remotes. Move through the phases below, but **pause at three explicit checkpoints** for human approval:

- **Checkpoint A** — after Phase 1, to confirm the version-bump decision
- **Checkpoint B** — after Phase 2 and Phase 3, to review the README edits and the drafted `RELEASE_NOTES.md`
- **Checkpoint C** — right before Phase 6, to confirm "ready to commit + tag + push"

At each checkpoint, summarize concisely what's about to happen and wait for an explicit go-ahead. Don't paraphrase confirmation as "looks good, proceeding" — wait for the user.

Between checkpoints, narrate progress in single sentences, not paragraphs.

## Phase 1: Survey and decide the version

```bash
git fetch --tags github
LAST_TAG=$(git tag --sort=-v:refname | head -1)
git log $LAST_TAG..HEAD --oneline
git diff $LAST_TAG..HEAD --stat
```

You're answering two questions:

**1. What kind of release is this?** Read the commit subjects and decide:

- **Patch** (`X.Y.Z+1`) — bug fixes, internal refactors, copy tweaks, dependency bumps with no behavior change
- **Minor** (`X.Y+1.0`) — new user-facing features, new settings, new pages, additive API changes
- **Major** (`X+1.0.0`) — removed features, breaking schema changes, large rewrites where existing users will notice the disruption

This is a personal app with a small audience, so apply judgment rather than dogma. When in doubt, prefer the smaller bump and explain the call.

**2. What's in this release?** Read the actual diffs of the commits, not just subjects. You need this material for Phases 2 and 3.

**At Checkpoint A**, tell the user:
- The last tag and the count of commits since
- The bump you've chosen and one sentence of reasoning
- A bullet list of the meaningful changes you found

Wait for them to confirm or override the version before continuing.

## Phase 2: README parity check

This is the most important thing this skill does and the easiest to skip. Don't skip it.

Read `README.md` in full. For every meaningful change in the release, ask: *would a new user reading the README right now know about this?*

Things to look for:

- **New feature** → README should mention it in the right section
- **Removed feature** → README should not still claim it exists
- **New setting, keybinding, route, page, or UI element** → reflect it
- **New external dependency or system requirement** → install instructions need it
- **Renamed pages, commands, or files** → update any README references
- **New API key requirement** → mention it in setup
- **New keyboard shortcut** → list it where shortcuts live

List the discrepancies you find and propose specific edits with the Edit tool. Don't merely flag them — apply them. If there are zero discrepancies, say so explicitly: *"README is current — no edits needed."* That's a valid and frequent outcome.

Apply the edits *before* the checkpoint so the user can review them in place.

## Phase 3: Generate RELEASE_NOTES.md

`RELEASE_NOTES.md` lives at the repo root. The release workflow reads it and passes its contents as the GitHub release body, so whatever you write here is what users see on the Releases page.

The file is **overwritten each release** — it always reflects the version currently being cut. History lives in git.

### Format

Use this template, dropping any section that has zero entries. Lead with the most user-visible category.

```markdown
# vX.Y.Z

## Features
- Short, user-facing description of what's new

## Improvements
- Enhancements to existing features, performance, polish

## Fixes
- Bug fixes (describe the user-visible symptom, not the internal cause)

## Internal
- Refactors, dependency bumps, CI changes — only include if a curious user might care
```

### How to write the entries

- **Translate, don't copy.** Commit subjects are written for developers; release notes are written for users. "Add cache invalidation on entity delete" → "Lists now refresh immediately after deleting an item."
- **One bullet per user-visible change**, not one bullet per commit. If three commits implemented one feature, that's one bullet.
- **Drop pure-internal commits** (refactors with no observable effect, test additions, formatting). They belong in `## Internal` only if they're notable.
- **Group multiple small fixes** if they're related. "Fixed several form validation issues" beats five micro-bullets.
- **Use the same vocabulary as the app.** If the UI says "events", don't write "shows" in the notes.

### Categorization heuristics

The repo doesn't use conventional commits, so classify by reading the diff, not the prefix:

| Signal | Probably belongs in |
|---|---|
| New file in `src/pages/`, new route, new top-level UI element | Features |
| New setting in `SettingsPage`, new column in a table, new sort/filter option | Features or Improvements |
| Tweaks to existing components, copy changes, layout polish | Improvements |
| Bug fixes, error handling, "stop X from happening", crash fixes | Fixes |
| Dependency bumps, CI changes, refactors, type-only changes | Internal (or omit) |

Write the file with the Write tool. Show it to the user **as part of Checkpoint B** along with the README diffs.

## Phase 4: Pre-flight checks

These all run from the project root and must all pass before tagging. If any fail, stop and report — do not "fix and continue" without checking with the user. The whole point of pre-flight is that broken code doesn't get tagged.

```bash
# TypeScript
bunx tsc --noEmit

# Rust check + clippy (clippy as errors)
( cd src-tauri && cargo check && cargo clippy -- -D warnings )
```

Run them in parallel where possible. Report results concisely:

> ✅ tsc clean ✅ cargo check clean ✅ clippy clean

If clippy fires warnings, treat them as errors (the `-D warnings` flag does this automatically — don't bypass it). Ask the user how to proceed.

## Phase 5: Migration safety check

If any commit in `$LAST_TAG..HEAD` touched the `MIGRATIONS` array in `src-tauri/src/db/mod.rs`, surface it loudly:

> ⚠️ This release contains a database migration. Migrations run automatically on first launch of the new version and are not reversible. Has this been tested against a real DB snapshot?

Wait for explicit confirmation. Don't auto-skip this check even if the user seems impatient — a bad migration that ships to installed copies is the worst-case failure for this app.

## Phase 6: Bump versions

The three version files **must be byte-identical**. If they drift, `tauri-action` produces filenames from `tauri.conf.json` but the binary reports the version from `Cargo.toml`, and the auto-updater compares the wrong strings — the update channel silently stops working. This has happened before. It's the single most important invariant in this whole skill.

| File | Where in the file |
|---|---|
| `package.json` | `"version": "X.Y.Z"` top-level |
| `src-tauri/tauri.conf.json` | `"version": "X.Y.Z"` top-level |
| `src-tauri/Cargo.toml` | `version = "X.Y.Z"` under `[package]` |

`Cargo.lock` regenerates on next build — don't edit it by hand, but expect it to show as modified after `cargo check` ran in Phase 4.

After bumping, verify all three match before moving on:

```bash
grep -E '"version"' package.json src-tauri/tauri.conf.json
grep -E '^version' src-tauri/Cargo.toml
```

All three should print the same `X.Y.Z`. If they don't, fix it now.

## Phase 7: Commit, tag, push

**Checkpoint C goes here.** Show the user what will be committed (`git status` and a brief recap of the version + the staged files: README edits, `RELEASE_NOTES.md`, the three version files, `Cargo.lock`). Wait for go-ahead.

Then:

```bash
git add -A
git commit -m "Release vX.Y.Z"
git tag vX.Y.Z
git push github main
git push origin main
git push github vX.Y.Z
git push origin vX.Y.Z
```

Both remotes, every time. The two remotes are mirrors — they should always be in sync. The `github` remote is the one that triggers the release workflow when the tag arrives; pushing the tag to `origin` keeps the mirror complete.

If any push is rejected (non-fast-forward), stop and report. Don't force-push to recover — investigate first.

## Phase 8: Hand off to CI

```bash
gh run watch --repo ChristianPayne/shows
```

Tell the user something like:

> Tagged and pushed `vX.Y.Z`. CI is building macOS and Windows artifacts in parallel. Cold cache: ~15–25 min, warm cache: ~10–12 min. The workflow auto-publishes the release when the build finishes (no manual draft step), and the auto-updater will pick it up on the next launch of any installed copy. The release notes you just wrote will appear as the body on the GitHub release page.

Then you're done. Don't try to publish, edit, or babysit the release any further — the workflow handles it.

## Invariants — never violate these

- **Forward-only versions.** Never reuse a version, never publish a lower version after a higher one. The updater compares versions lexicographically and gets confused by out-of-order releases.
- **Both remotes, always.** The mirrors only have value if they stay in sync.
- **Three version files in lockstep, byte-identical.** This is the single most common way to break the auto-updater.
- **Never `--no-verify` and never `-D warnings` overrides.** If a check fails, it's signal — fix the root cause, don't silence it.
- **Never rotate the Tauri signing key as part of a release.** Key rotation requires a careful multi-release handoff (ship a release with the old key that *contains* the new pubkey first, then rotate). If the user asks to rotate, treat it as a separate task and warn them.
- **Migrations get explicit human approval.** No auto-skipping the migration check.

## Common failure modes

| Symptom | What's probably wrong |
|---|---|
| `git push` rejected (non-fast-forward) | Someone (maybe past-you on another machine) pushed to that remote already. Fetch, reconcile, retry. Don't force-push without permission. |
| `tag already exists` | Reusing a version. Stop — versions are forward-only. Pick the next one. |
| CI: signing fails with "bad password" | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub secrets doesn't match the key. Not a release-time fix — bail out and address it separately. |
| CI: matrix asset count wrong | Likely a version-file drift. Verify all three files match the tag, then re-tag (delete + re-push). |
| Auto-updater not seeing the release after publish | `curl -sL https://github.com/ChristianPayne/shows/releases/latest/download/latest.json` and check the `version` field. If it lags, GitHub is propagating — wait a minute. If it's wrong, version files drifted. |

## Where the release infrastructure lives

| Thing | Location |
|---|---|
| CI workflow | `.github/workflows/release.yml` |
| Release notes (read by workflow) | `RELEASE_NOTES.md` (repo root) |
| Updater Rust module | `src-tauri/src/updater.rs` |
| Updater config | `src-tauri/tauri.conf.json` → `plugins.updater` |
| Frontend updater banner | `src/components/UpdateBanner.tsx` |
| Frontend "Check for Updates" button | `src/pages/SettingsPage.tsx` |
| Required GH secrets | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| Migration list | `src-tauri/src/db/mod.rs` (`MIGRATIONS` array) |
