# Project Guidelines: evtx-to-csv


1. Always add a version number into the GUI  
2. Understand the feature or bug being changed.
3. Update or add tests for that change.
4. Run the test suite.
5. Bump the version number for every code change, and add a version note in CHANGELOG.md
6. Update docs when behavior, flags, workflows, or outputs change.
7. Add branch/worktree name to Application Title after Coro Prism. 
8. Run a test dev session (`cargo tauri dev`); fix any errors; if it launches cleanly, close the app.
9.  Run a test build (`cargo tauri build`); fix any errors; if it builds cleanly, close the app.


## Testing Standards
This project maintains high reliability by testing both the Svelte frontend and the Rust backend.

### Mandates:
1.  **Always Add Tests for New Features**: Any new UI component, utility function (TS/Rust), or Tauri command MUST have a corresponding test file (e.g., `ComponentName.test.ts` or a `#[cfg(test)]` block in Rust).
2.  **Run All Tests on Major Changes**: Before finalizing any significant change, run both test suites:
    *   Frontend: `npm test`
    *   Backend: `cd src-tauri && cargo test`
3.  **Mocking Policy**: For frontend unit tests, mock the Tauri API in `src/test/setup.ts` to ensure fast, isolated tests.
4.  **Edge Case Coverage**: Rust backend tests should explicitly test for:
    *   Malformed EVTX records.
    *   Extreme record counts.
    *   Invalid XML in enrichment data.

## Security & Version Control
1.  **Verify New Files**: For every new file created, verify its contents for sensitive data (API keys, PII, etc.) and confirm if it should be tracked by git or added to `.gitignore`.
2.  **No Customer Data**: Never include real customer logs or data in the repository; use synthetic or fully sanitized samples for testing.

## Architectural Patterns
- **Frontend**: Svelte 4, using `tauri-api.ts` as the single boundary for backend communication.
- **Backend**: Rust, using modular handlers for parsing, filtering, and enrichment to keep `main.rs` clean.
