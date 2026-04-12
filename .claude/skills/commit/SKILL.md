---
name: commit
description: Stage all uncommitted changes in the shows project and create a single Conventional Commits message that's descriptive enough for the release skill to pull straight into RELEASE_NOTES.md. Use this whenever the user asks to commit, save, snapshot, check in, or "wrap up" their current changes — even when they don't say the word "commit" (e.g. "let's get this saved", "lock it in", "make a checkpoint"). Does NOT push.
---

# Committing changes in the shows app

Stage every uncommitted change in the working tree, write one Conventional Commits message rich enough to feed the release notes downstream, confirm once with the user, then commit. No pushing — that belongs to the `release` skill.

## Why this skill exists

Two things have to stay true for this project's release pipeline to keep working:

1. **Commit history is the source of truth for release notes.** The `release` skill surveys commits since the last tag to draft `RELEASE_NOTES.md`. If commit messages are vague ("misc fixes", "wip"), the release notes are vague too, and the user has to rewrite them by hand. Every commit should describe *what changed and why* in enough detail that a future reader — or the release skill — can summarize the user-visible impact without re-reading the diff.
2. **The repo is moving to Conventional Commits.** Older history uses freeform "Add X, Y, Z" subjects. New commits should use the conventional format so the release skill can group them by type (features vs. fixes vs. chores) automatically. Don't reformat old commits — just write new ones in the new style.

The skill also exists to keep commits **atomic by intent, not by accident**. Staging everything in one shot is convenient, but only safe when the working tree actually represents one coherent change. Part of this skill's job is to notice when it doesn't and surface that to the user before committing.

## How to interact with the user

This skill has exactly **one checkpoint**: after drafting the message, before running `git commit`. Show the user the staged file list and the proposed message, then wait for explicit approval. Don't paraphrase silence as approval — wait for a clear yes.

If the user pushes back on the message, revise and re-show. Don't commit until they say go.

## Phase 1 — Survey the working tree

Run these in parallel to understand what's about to be committed:

- `git status` (no `-uall` flag — it can OOM on large repos)
- `git diff` for unstaged changes
- `git diff --staged` for anything already staged
- `git log --oneline -10` to see recent message style for context

Read the diffs carefully. You're looking for three things:

1. **What actually changed** — files, functions, behavior. This becomes the commit body.
2. **Why** — the motivation. Pull from conversation context if you have it; otherwise infer from the diff and ask the user if it's not obvious.
3. **Red flags** that should pause the commit (see next phase).

## Phase 2 — Safety scan

Before staging anything, check for things that should NOT be committed. If you find any, stop and ask the user before proceeding:

- **Secrets**: `.env`, `.env.local`, files matching `*credentials*`, `*secret*`, `*.pem`, `*.key`, API tokens hardcoded in source. The shows project does not currently track any `.env` files — if one shows up as untracked, that's a strong signal it shouldn't be committed.
- **Large binaries** that don't belong in git (build artifacts, `target/`, `dist/`, `node_modules/`, screenshots/videos that should live elsewhere). Most of these are gitignored, but untracked files can slip through.
- **Unrelated changes** that look like they belong in separate commits. Per the user's preference, this skill bundles everything into a single commit — but if the diff spans clearly unrelated work (e.g. a bug fix in `commands/import.rs` plus an unrelated UI tweak in `ArtistsPage.tsx` plus a dependency bump), call it out in your checkpoint summary so the user can decide whether to proceed or split manually first.
- **In-progress / debugging cruft**: leftover `console.log`, `dbg!`, `println!`, commented-out code blocks, TODO markers added in this change. Surface these — the user may want to clean up before committing.
- **Merge conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`) anywhere in the diff. Hard stop.

Don't be precious about minor things — the user knows their codebase. But anything in the list above is worth one quick mention before committing.

## Phase 3 — Draft the commit message

Use Conventional Commits format:

```
<type>(<scope>): <subject>

<body>
```

### Type

Pick the type that best describes the *dominant* change in the diff. If it's genuinely mixed, pick the one a release-notes reader would care about most:

- `feat` — new user-visible functionality
- `fix` — bug fix
- `perf` — performance improvement with no behavior change
- `refactor` — code restructuring with no behavior change
- `style` — formatting, whitespace, lint fixes (no logic change)
- `docs` — README, comments, RELEASE_NOTES, doc-only changes
- `test` — adding or fixing tests
- `build` — build system, Tauri config, Cargo/bun dependencies
- `ci` — GitHub Actions workflows
- `chore` — anything else that doesn't fit (version bumps, gitignore tweaks, file renames with no logic change)

### Scope

Optional but encouraged. Use it when the change is concentrated in one area. Good scopes for this project, based on its layout:

- Rust commands: `events`, `artists`, `venues`, `locations`, `import`, `backup`, `media`, `maintenance`
- Rust internals: `db`, `models`, `queries`, `metadata`
- Frontend pages: `events-page`, `artists-page`, `settings-page`, etc.
- Frontend components: `event-detail`, `media-gallery`, etc.
- Cross-cutting: `ui`, `api`, `types`, `tauri-config`

If the change spans many areas, omit the scope rather than picking one arbitrarily.

### Subject line

- Imperative mood ("add", "fix", "rename" — not "added", "adds")
- No trailing period
- Lowercase first word (after the type prefix)
- Aim for ≤72 characters; hard cap at 100
- Specific enough to stand alone in a release-notes bullet

**Bad subjects** (too vague to feed release notes):
- `feat: updates`
- `fix: bug fix`
- `refactor: cleanup`

**Good subjects** (a release-notes reader knows what changed):
- `feat(media): support drag-and-drop image upload on entity pages`
- `fix(import): handle CSV rows with trailing whitespace in venue names`
- `refactor(db): move groupArtists logic from TypeScript to Rust`

### Body

The body is what makes commits useful for release notes. Write it whenever the change is non-trivial — which is most of the time. Skip it only for genuinely one-line changes (typo fixes, version bumps).

Structure:

- One short paragraph (2-5 sentences) describing **what changed and why**, in plain English a user of the app would understand.
- If the change touches multiple areas, follow the paragraph with a bulleted list of the concrete sub-changes — one bullet per logically distinct piece. This gives the release skill ready-made bullet points.
- Wrap body lines at ~72 characters for `git log` readability.
- Mention user-visible impact explicitly. "Users can now…" or "Fixes a bug where…" framings translate directly into release notes.

**Example body:**

```
feat(events): add lineup images and clickable stat badges

Event detail pages now show artist images inline in the lineup section,
making it easier to recognize who played at a glance. The dashboard's
stat badges (total events, total artists, etc.) are now clickable and
navigate to a filtered list of the underlying records.

- Render artist thumbnails next to names in EventDetail lineup
- Make StatBadge components clickable with router navigation
- Add default sort order to ArtistsPage and VenuesPage lists
```

Notice how each bullet could become a release-notes line on its own.

### What NOT to put in the message

- **No Claude / Co-Authored-By trailer.** This project's history doesn't use one (check `git log`), and the user hasn't asked for it. Don't add one.
- **No line numbers or file paths in the body** beyond what's needed to disambiguate. The diff already records *where*; the message records *what* and *why*.
- **No references to the current task or conversation** ("as discussed", "per request", "for the issue we talked about"). The message should make sense to a future reader who has no context.
- **No emojis** unless the user explicitly asks.

## Phase 4 — Checkpoint: confirm with the user

Show the user:

1. The list of files about to be staged (from `git status`).
2. Any red flags from the safety scan, if any.
3. The full proposed commit message (subject + body), in a code block so they can read it as it will appear in `git log`.

Ask: "Ready to stage and commit, or want to revise?"

Wait for explicit approval. If they want changes, revise the message and re-show. If they want to abort, do nothing — leave the working tree exactly as it was.

## Phase 5 — Stage and commit

Once approved:

1. `git add -A` to stage everything in the working tree, including untracked files. (The user explicitly opted into stage-all behavior; the safety scan in Phase 2 is what protects against accidental inclusions.)
2. Commit using a HEREDOC to preserve formatting:

   ```bash
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): <subject>

   <body>
   EOF
   )"
   ```

3. Run `git status` after the commit to confirm a clean working tree (or surface anything that didn't get committed for some reason — e.g. files blocked by a pre-commit hook).

### If a pre-commit hook fails

Do **not** retry with `--no-verify`. The hook is there for a reason. Read the error, fix the underlying issue (or surface it to the user if it's not obvious), re-stage the fix, and create a **new** commit — never `--amend`, since the failed commit didn't actually happen and amending would modify the *previous* commit instead.

## Phase 6 — Done

Report what was committed: the commit hash (from `git log -1 --oneline`) and a one-sentence summary of what landed. Do **not** push. If the user wants to push, that's a separate step they'll ask for explicitly — or it'll happen as part of the `release` skill.

## Quick reference: the loop

1. Survey: `git status`, `git diff`, `git diff --staged`, `git log --oneline -10` (parallel)
2. Safety scan the diff for secrets, binaries, mixed concerns, debug cruft, conflict markers
3. Draft a Conventional Commits message with a release-notes-ready body
4. Show the user the file list + message, wait for approval
5. `git add -A`, `git commit` via HEREDOC, `git status` to verify
6. Report the hash and summary. No push.
