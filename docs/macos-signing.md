# macOS code signing & notarization

The `shows` macOS build is currently **unsigned**. Two consequences:

1. Every macOS user needs the `xattr -cr` workaround on first launch:
   ```bash
   xattr -cr /Applications/shows.app
   ```
2. The auto-updater itself breaks on macOS, because the updated `.app` written to disk also hits Gatekeeper and gets quarantined.

To fix this properly:

1. Join the **Apple Developer Program** ($99/year).
2. Generate a **Developer ID Application** certificate in the developer portal. Export it as `.p12` with a password.
3. Create an **app-specific password** at appleid.apple.com for notarization.
4. Add these repository secrets to GitHub:

   | Secret | Value |
   |---|---|
   | `APPLE_CERTIFICATE` | base64 of the `.p12` file (`base64 < cert.p12 \| pbcopy`) |
   | `APPLE_CERTIFICATE_PASSWORD` | the password used when exporting the `.p12` |
   | `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Christian Payne (TEAMID)` |
   | `APPLE_ID` | Apple ID email |
   | `APPLE_PASSWORD` | the **app-specific** password (not your real Apple ID password) |
   | `APPLE_TEAM_ID` | 10-character team ID from the developer portal |

5. No workflow changes needed — `tauri-apps/tauri-action` reads these env vars automatically and signs + notarizes the macOS artifact. Adds ~5 min to the macOS job for Apple's notarization API.

Once signed and notarized, the `xattr` workaround is no longer needed and auto-update works cleanly on macOS.

## Windows code signing (for completeness)

Windows has the equivalent SmartScreen "Windows protected your PC" warning on unsigned EXEs. After enough installs from the same publisher, SmartScreen quietly starts trusting you. The long-term fix is buying a Windows code-signing certificate (~$200/year) and adding it to CI secrets — same general pattern as macOS.

## Signing key rotation warning

The Tauri updater signing key (separate from Apple/Windows code signing — this is the minisign key in `TAURI_SIGNING_PRIVATE_KEY`) **must never be rotated as part of a normal release**. The public key is embedded in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` and gets compiled into every shipped binary. Installed copies will reject any update signed with a key that doesn't match the pubkey they were built with.

To rotate safely:

1. Generate the new key pair.
2. Ship a release using the **old** key that contains the **new** pubkey in `tauri.conf.json`. Installed copies accept this update (signed with the key they know), and after installing they now trust the new pubkey.
3. Only after step 2 has propagated to all users can you switch the GitHub secret to the new private key.

Skip step 2 and the update channel silently breaks for every installed copy. Avoid rotation unless you have to.
