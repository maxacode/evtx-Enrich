# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), with an added commit-history section so the release notes match the repository history. 

## [0.2.5] - 2026-05-05

### Changed

- Added a larger in-app activity panel for file picking, folder scanning, combined export, and report generation so long-running actions feel responsive.
- Added a richer per-file progress panel during parse, export, enrich, and report steps.
- Fixed keyword context dropdown persistence in both file-level and global filter panels.
- Updated the application title to show `Coro Prism` with the active worktree name `dev` per `GEMINI.md`.

---

## [0.2.4] - 2026-04-04

### Changed


- Autocomplete Disabled
- Fixed dropdown for context 
- Version bump to test the update mechanism end-to-end.

---

## [0.2.3] - 2026-04-04

### Fixed

- Dev channel update link now points to the correct release tag (e.g. `v0.2.3-dev.42`) instead of the bare version tag (`v0.2.3`) which never exists on `dev`. The `latest.json` manifest now includes a `tag` field with the full tag, and the updater uses it directly.

---

## [0.2.2] - 2026-04-04

### Changed

- Version bump to test the in-app update checker flow.

---

## [0.2.1] - 2026-04-04

### Fixed

- `shell.open` scope regex was over-restrictive (`https?://\w+` doesn't match domains with dots), causing "failed to open Scoped command argument" errors when the updater or feedback dialog tried to open any real URL. Simplified to `^(mailto:|tel:|https?://|file://).+`.

---

## [0.2.0] - 2026-04-04

### Changed

- Bumped to next minor version (`0.2.0`).
- GitHub Actions workflow now automatically updates README download links after each release on `main` and `dev`.

---

## [0.1.2] - 2026-04-02

### Added

- **Update checker** in the toolbar: automatically checks GitHub Releases on launch and shows a badge when a newer version is available.
- Channel selector (Stable / Dev) lets users track the `main` release channel or the `dev` pre-release channel; choice is persisted across sessions.
- Detail panel shows release title, publish date, and release notes with a "Download" button that opens the GitHub release page in the browser.
- macOS network entitlements (`com.apple.security.network.client`) so outbound HTTP works correctly in signed & notarized builds — this also fixes the webhook feedback submission on macOS.

### Changed

- Window title updated to reflect `dev` worktree per GEMINI.md guidelines.

---

## [0.1.1] - 2026-04-01

### Added

- `.evtx` file summaries with date range, record count, and top event IDs.
- LLM-optimized export mode with aggressive filtering, shortened strings, and empty-column removal.
- More signature coverage over multiple follow-up signature updates.
- Global filters that can be applied across multiple loaded files.
- Keyword search and multi-file to single-CSV export support.
- Native dialog and file-management improvements.
- Combined enrich-and-export workflow that produces one output CSV.
- Refreshed documentation, technical README content, sample report, and GitHub Actions build workflow.

### Changed

- Renamed the application consistently to `evtx-to-csv` across the app, docs, and packaging.
- Hardened signatures initialization and path resolution, including better dev-mode behavior and Documents-folder seeding.
- Improved macOS and Windows packaging, signing diagnostics, and native build workflow reliability.
- GUI now shows the shipped application version in the header and footer.

### Fixed

- Multiple signature initialization issues, including reload failures and syntax errors.
- App syntax regression in `App.svelte`.
- Windows icon packaging and macOS build target/signing issues.

### Commit History

#### 2026-04-01

- `2d431c1` Make manual signing test extremely verbose
- `7d95a6e` Add secret length check to Test Signing
- `029530e` Verify certificate password with openssl
- `5febc17` Count certificate bags in p12
- `27ba4c1` Check security import exit code and file type
- `8ef76cb` Final workflow cleanup (ready for correct p12 secret)

#### 2026-03-31

- `ec889ae` New Readme and technical readme.
- `97028db` Sample report added
- `1066cc4` build for github actions
- `6b7dd6e` Fix syntax error in App.svelte
- `00aff4b` Fix Windows missing icon and macOS universal build targets
- `f424180` Final fixes for Windows icons and macOS signing identity
- `69c9531` Add debug identities step and revert to secret for signing identity
- `d27891a` Test native macOS build (removed universal) and fix debug step shell
- `83037c7` Add Test Signing step and disable macOSPrivateApi for debugging
- `cdfca07` Improve Test Signing script to find exact identity string
- `eb126e6` Dump certificate details in Test Signing

#### 2026-03-30

- `380ea2c` feat: Enhanced native dialog handling and file management features
- `f339a21` Merge branch 'features-todo' into main
- `69540d7` Merge pull request #4 from maxacode/main
- `2d1160d` Merge pull request #5 from maxacode/features-todo
- `5a62e27` Added enrich and combine into 1 output csv

#### 2026-03-27

- `575d4bd` added more signatures
- `8a749e0` Global filters added
- `ced4739` Merge pull request #1 from maxacode:multi-file-same-filter
- `50b4913` Keyword search, multi-to-singl csv output
- `ae31b31` Merge pull request #2 from maxacode/more-signatures

#### 2026-03-26

- `d2d1dea` Added more signatures

#### 2026-03-25

- `e87a4f0` Refactor signature initialization and update resource paths for consistency

#### 2026-03-24

- `7672138` Initial commit - Rename to evtx-to-csv and add quick action buttons
- `fe04a3d` Complete rename to evtx-to-csv in all files and update documentation
- `e4a11eb` Add .evtx file summary feature (dates, record count, top event IDs)
- `839c3ae` Implement LLM-Optimized Export mode with aggressive filtering, string shortening, and empty column removal
- `4afb026` Robust signatures seeding and resolution (fix reload error)
- `499f9a0` Prioritize working directory for signatures in dev mode
- `c892275` Fix syntax error in init_signatures
- `19635f2` Ensure signatures are seeded to Documents folder on first run (dev and prod)
- `7fa88e7` Add debugging logs for signature initialization
- `5253521` Final fix for Documents folder seeding

## [0.1.0] - 2026-03-24

### Added

- Initial desktop release of `evtx-to-csv`.
- Tauri + Svelte + TypeScript application shell.
- EVTX parsing, CSV export, enrichment checks, and multi-file workflow foundation.
