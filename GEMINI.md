# Project Guidelines: evtx-to-csv

1. bump the version of the GUI program everytime you make a change
2. Add the Branch/Worktree name to the Program Title of the Window so i can tell the difference. (remove it when pushing to github)
3. Run tests for the items that were changed. 
4. run a dev build and check for any errors if there are fix them. 
5. Always add a version number into the GUI  
   
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
