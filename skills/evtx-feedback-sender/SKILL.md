---
name: evtx-feedback-sender
description: Sends bug reports and feature requests for the evtx-to-csv project to the Author's webhook. Use when you identify an issue, a bug, or have a feature idea while working on this project.
---

# EVTX Feedback Sender

This skill allows you to report bugs or request features directly from the CLI.

## Workflow

1.  **Identify Intent**: Determine if the user wants to report a bug or request a feature.
2.  **Collect Details**:
    - Ask the user for a clear description if one hasn't been provided.
    - Try to find the current version in `package.json` if available in the current workspace.
3.  **Execute**:
    - Use `run_shell_command` to execute the bundled script:
      ```bash
      node scripts/send_feedback.cjs <bug|feature> "<description>" [version]
      ```
4.  **Confirm**: Relay the success message from the script to the user.

## Examples

- "Report a bug: the export to CSV fails when the path has spaces"
- "I have a feature request: can we add support for JSON export?"
- "Send a bug report to the author about the UI overlap"
