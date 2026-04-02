# Tauri Release Setup Guide

This guide explains the prerequisites for deploying your Tauri app to Windows and macOS with signing and notarization.

## 1. GitHub Secrets
You must add the following secrets to your GitHub repository (**Settings > Secrets and variables > Actions**):

### macOS Notarization
*   `APPLE_ID`: Your Apple ID email (e.g., `user@example.com`).
*   `APPLE_PASSWORD`: An **App-Specific Password** generated at [appleid.apple.com](https://appleid.apple.com).
*   `APPLE_TEAM_ID`: Your 10-character Team ID (found in your Apple Developer account).

### macOS Signing (Optional but recommended)
*   `APPLE_CERTIFICATE`: Base64 encoded `.p12` file of your "Developer ID Application" certificate.
*   `APPLE_CERTIFICATE_PASSWORD`: The password for the `.p12` file.

### Windows Signing (Optional)
*   `WINDOWS_CERTIFICATE`: Base64 encoded `.pfx` or `.p12` file of your code signing certificate.
*   `WINDOWS_CERTIFICATE_PASSWORD`: The password for the certificate.

## 2. GitHub Token
The workflow uses the automatic `GITHUB_TOKEN` to create releases. Ensure your workflow has "Write" permissions (**Settings > Actions > General > Workflow permissions**).

## 3. Local Preparation
*   **Version Bump**: Ensure the version in `package.json` and `src-tauri/tauri.conf.json` matches what you want to release.
*   **Icons**: Ensure you have run `npm run tauri icon` to generate all required platform icons.
