---
name: tauri-github-deploy
description: Automates the deployment and notarization of Tauri apps for Windows and macOS using GitHub Actions. Use when the user wants to set up CI/CD, releases, or notarization for their Tauri project.
---

# Tauri GitHub Deploy

This skill automates the creation of a GitHub Action workflow for building, signing, and notarizing Tauri applications.

## Prerequisites

On the first run, or when asked for setup, you **MUST** present the content of `references/setup-guide.md` to the user. This guide explains the secrets they need to configure in GitHub.

## Workflow

1.  **Check Environment**: Verify the project has a `package.json` and `src-tauri/tauri.conf.json`.
2.  **Read Version**: Read the current version from `package.json`.
3.  **Onboarding**: If this is the first time setting up deployment, read and display `references/setup-guide.md`.
4.  **Create Workflow**: 
    - Copy `assets/release.yml` to `.github/workflows/release.yml`.
    - Ensure the `.github/workflows` directory exists.
5.  **Verify Configuration**: Check `src-tauri/tauri.conf.json` for the `bundle > identifier` and other mandatory fields.
6.  **Next Steps**: Remind the user to push to `main` or create a tag to trigger the first release.

## Troubleshooting Notarization

If notarization fails in the GitHub Action:
- Ensure `APPLE_PASSWORD` is an **App-Specific Password**.
- Ensure `APPLE_TEAM_ID` is correct.
- Ensure the `bundle > identifier` in `tauri.conf.json` is unique and matches what's expected by Apple.
