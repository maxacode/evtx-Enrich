/**
 * tauri-api.ts
 * ------------
 * Typed wrapper layer around all Tauri IPC commands and dialog APIs.
 *
 * This module is the single boundary between the Svelte UI and the Rust backend.
 * All Tauri `invoke` calls and dialog calls live here — components never call
 * `invoke` directly. This makes it easy to mock for testing and keeps the
 * API contract in one place.
 *
 * Functions exported:
 *   - openEvtxFiles()             — open a multi-select file dialog filtered to .evtx
 *   - saveFileDialog()            — open a save-as dialog for CSV output
 *   - saveReportDialog()          — open a save-as dialog for Markdown report output
 *   - parseEvtx()                 — invoke the parse_evtx Rust command
 *   - exportCsv()                 — invoke the export_csv Rust command
 *   - runEnrichmentCheck()        — invoke the run_enrichment_check Rust command
 *   - readSuspiciousCommands()    — invoke read_suspicious_commands (reads bundled file)
 *   - enrichRecords()             — invoke enrich_records (dedup + XML cleanup)
 *   - reloadSignatures()          — invoke reload_signatures (hot-reload signatures.json)
 *   - getSignaturesInfo()         — invoke get_signatures_info (rule count + file path)
 *
 * Error handling:
 *   All functions use try/catch and either return a safe fallback value or
 *   re-throw with a more descriptive message so the UI can display it.
 */

import { invoke } from '@tauri-apps/api/tauri';
import { open, save } from '@tauri-apps/api/dialog';
import { open as openShell } from '@tauri-apps/api/shell';
import { getClient, ResponseType } from '@tauri-apps/api/http';
import type { FilterConfig, EventRecord } from './types';

// ---------------------------------------------------------------------------
// Update checker
// ---------------------------------------------------------------------------

export interface ReleaseInfo {
  /** Tag name, e.g. "v0.1.2" or "v0.1.2-dev.5" */
  tagName: string;
  /** Human-readable release title */
  name: string;
  /** Markdown release notes body */
  body: string;
  /** ISO 8601 publish timestamp */
  publishedAt: string;
  /** URL to the GitHub release page for download */
  htmlUrl: string;
  /** True if this is a pre-release (dev build) */
  isPrerelease: boolean;
}

/**
 * Fetch the latest release from GitHub for the chosen channel.
 *
 * @param channel - "stable" returns the latest non-prerelease; "dev" returns the latest prerelease.
 * @returns The latest ReleaseInfo for that channel, or null if none found.
 */
export async function checkForUpdates(channel: 'stable' | 'dev'): Promise<ReleaseInfo | null> {
  const client = await getClient();
  const response = await client.get<unknown[]>(
    'https://api.github.com/repos/maxacode/evtx-to-csv/releases',
    {
      responseType: ResponseType.Json,
      headers: { 'User-Agent': 'evtx-to-csv-app' },
    }
  );

  const releases = response.data as Array<Record<string, unknown>>;
  const filtered = releases.filter((r) =>
    channel === 'dev' ? r['prerelease'] === true : r['prerelease'] === false
  );

  if (filtered.length === 0) return null;

  const latest = filtered[0];
  return {
    tagName:      String(latest['tag_name'] ?? ''),
    name:         String(latest['name'] ?? ''),
    body:         String(latest['body'] ?? ''),
    publishedAt:  String(latest['published_at'] ?? ''),
    htmlUrl:      String(latest['html_url'] ?? ''),
    isPrerelease: latest['prerelease'] === true,
  };
}

function assertTauriAvailable(feature: string) {
  // In a normal browser tab (e.g. opening Vite's dev URL directly), Tauri APIs
  // are not available. Failing loudly here avoids "button does nothing" UX.
  const w = window as unknown as { __TAURI__?: unknown };
  if (!w.__TAURI__) {
    throw new Error(
      `${feature} is only available inside the Tauri desktop app window (not a regular browser tab).`
    );
  }
}

function toFileUrl(path: string): string {
  // Keep URLs as-is
  if (/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.test(path)) {
    return path;
  }

  // Windows absolute path: C:\foo\bar → file:///C:/foo/bar
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    const normalized = path.replace(/\\/g, '/');
    return `file:///${encodeURI(normalized)}`;
  }

  // POSIX absolute path: /Users/... → file:///Users/...
  if (path.startsWith('/')) {
    return `file://${encodeURI(path)}`;
  }

  // Fallback: leave untouched (may still work depending on platform)
  return path;
}

/**
 * Reveal the given path in the system file manager (Finder/Explorer).
 */
export async function revealInFolder(path: string): Promise<void> {
  assertTauriAvailable('Reveal in folder');
  try {
    await invoke<void>('reveal_in_folder', { path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to reveal in folder: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Shell / Path helpers
// ---------------------------------------------------------------------------

/**
 * Opens a file using the system default application.
 * @param path - Absolute path to the file
 */
export async function openFile(path: string): Promise<'opened' | 'revealed'> {
  assertTauriAvailable('Shell open');
  try {
    await openShell(toFileUrl(path));
    return 'opened';
  } catch (err) {
    // If the OS has no default handler (common for .evtx on macOS),
    // fall back to revealing it in Finder/Explorer.
    try {
      await revealInFolder(path);
      return 'revealed';
    } catch (err2) {
      const message = err instanceof Error ? err.message : String(err);
      const message2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`Failed to open file: ${message}; fallback failed: ${message2}`);
    }
  }
}

/**
 * Opens the folder containing the specified file.
 * @param path - Absolute path to the file
 */
export async function openFolder(path: string): Promise<void> {
  assertTauriAvailable('Shell open');
  try {
    // Strip the filename to get the directory path
    const folderPath = path.replace(/[\\/][^\\/]+$/, '');
    await openShell(toFileUrl(folderPath));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open folder: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// File dialog helpers
// ---------------------------------------------------------------------------

/**
 * Opens a native directory picker dialog that allows selecting a single folder.
 *
 * Returns the absolute path to the selected directory, or null if cancelled.
 *
 * @returns Promise resolving to the selected folder path or null
 */
export async function openFolderDialog(): Promise<string | null> {
  assertTauriAvailable('Folder picker');
  try {
    // Prefer backend-driven dialog for reliability across platforms.
    return await invoke<string | null>('select_directory');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fallback to the JS dialog API if the command fails for any reason.
    try {
      const result = await open({ directory: true, multiple: false });
      if (result === null) return null;
      return Array.isArray(result) ? result[0] : result;
    } catch (err2) {
      const message2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`Failed to open folder picker: ${message}; fallback failed: ${message2}`);
    }
  }
}

/**
 * Invokes the Rust `list_evtx_in_dir` command to recursively find .evtx files.
 *
 * @param path      - Absolute path to the directory to scan
 * @param recursive - Whether to search subdirectories (default: true)
 * @returns Promise resolving to an array of absolute file paths
 */
export async function listEvtxInDir(path: string, recursive: boolean = true): Promise<string[]> {
  try {
    const files = await invoke<string[]>('list_evtx_in_dir', {
      path,
      recursive,
    });

    return files;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list files in ${path}: ${message}`);
  }
}

/**
 * Opens a native file picker dialog that allows selecting one or more .evtx files.
 *
 * Returns an array of absolute file paths. Returns an empty array if the user
 * cancels the dialog (Tauri returns null on cancel).
 *
 * @returns Promise resolving to an array of selected file paths (may be empty)
 */
export async function openEvtxFiles(): Promise<string[]> {
  assertTauriAvailable('File picker');
  try {
    // Prefer backend-driven dialog for reliability across platforms.
    return await invoke<string[]>('select_evtx_files');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fallback to the JS dialog API if the command fails for any reason.
    try {
      const result = await open({
        multiple: true,
        filters: [{ name: 'Event Log', extensions: ['evtx'] }],
      });
      if (result === null) return [];
      if (Array.isArray(result)) return result;
      return [result];
    } catch (err2) {
      const message2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`Failed to open file picker: ${message}; fallback failed: ${message2}`);
    }
  }
}

/**
 * Opens a native save dialog pre-filled with the given default filename.
 * Used for choosing where to write the CSV export.
 *
 * @param defaultName - Suggested filename WITHOUT the .csv extension
 * @returns Promise resolving to the chosen absolute path, or null if cancelled
 */
export async function saveFileDialog(defaultName: string): Promise<string | null> {
  assertTauriAvailable('Save dialog');
  try {
    // Prefer backend-driven dialog for reliability across platforms.
    return await invoke<string | null>('select_save_csv', { default_name: defaultName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fallback to the JS dialog API if the command fails for any reason.
    try {
      const result = await save({
        defaultPath: `${defaultName}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      return result ?? null;
    } catch (err2) {
      const message2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`Failed to open save dialog: ${message}; fallback failed: ${message2}`);
    }
  }
}

/**
 * Opens a native save dialog for saving the enrichment analysis Markdown report.
 *
 * @param defaultName - Suggested filename WITHOUT the .md extension
 * @returns Promise resolving to the chosen absolute path, or null if cancelled
 */
export async function saveReportDialog(defaultName: string): Promise<string | null> {
  assertTauriAvailable('Save dialog');
  try {
    // Prefer backend-driven dialog for reliability across platforms.
    return await invoke<string | null>('select_save_md', { default_name: defaultName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fallback to the JS dialog API if the command fails for any reason.
    try {
      const result = await save({
        defaultPath: `${defaultName}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      return result ?? null;
    } catch (err2) {
      const message2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`Failed to open save dialog: ${message}; fallback failed: ${message2}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Backend command wrappers
// ---------------------------------------------------------------------------

/**
 * Invokes the Rust `parse_evtx` command to read and filter an .evtx file.
 *
 * The backend parses the binary event log format, applies all active filters
 * from the FilterConfig, and returns only matching EventRecord objects.
 *
 * @param path    - Absolute path to the .evtx file to parse
 * @param filters - FilterConfig describing which events to include
 * @returns Promise resolving to an array of matching EventRecord objects
 * @throws Error with descriptive message on backend failure
 */
export async function parseEvtx(path: string, filters: FilterConfig): Promise<EventRecord[]> {
  try {
    // Invoke the Rust command — field names must match the Rust handler's parameter names
    const records = await invoke<EventRecord[]>('parse_evtx', {
      path,
      filters,
    });

    return records;
  } catch (err) {
    // Wrap with context so the UI can show a meaningful error
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${path}: ${message}`);
  }
}

/**
 * Quickly scan an .evtx file for record count and date ranges.
 * @param path - Absolute path to the .evtx file
 */
export async function getEvtxSummary(path: string): Promise<import('./types').FileSummary> {
  try {
    return await invoke<import('./types').FileSummary>('get_evtx_summary', { path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to get summary for ${path}: ${message}`);
  }
}

/**
 * Invokes the Rust `export_csv` command to write EventRecord data to a CSV file.
 *
 * The backend handles CSV formatting, header row generation, and field escaping.
 * The output file will be created or overwritten at outputPath.
 *
 * @param records    - Array of EventRecord objects to serialize
 * @param outputPath - Absolute path where the CSV file should be written
 * @param filters    - FilterConfig used to determine if LLM optimization is needed
 * @throws Error with descriptive message on backend failure
 */
export async function exportCsv(
  records: EventRecord[],
  outputPath: string,
  filters: FilterConfig
): Promise<void> {
  try {
    await invoke<void>('export_csv', {
      records,
      outputPath,
      filters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to export CSV to ${outputPath}: ${message}`);
  }
}

/**
 * Invokes the Rust `run_enrichment_check` command to analyze parsed events
 * against a library of known suspicious commands/patterns.
 *
 * The backend cross-references the EventRecord data with the rules loaded
 * in signatures.json and produces a Markdown report.
 *
 * @param records           - The parsed events to analyze
 * @returns Promise resolving to a Markdown-formatted report string
 * @throws Error with descriptive message on backend failure
 */
export async function runEnrichmentCheck(
  records: EventRecord[]
): Promise<string> {
  try {
    const report = await invoke<string>('run_enrichment_check', {
      records,
    });

    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Enrichment check failed: ${message}`);
  }
}

/**
 * Invoke the Rust `enrich_records` command to deduplicate and clean records.
 *
 * What this does on the Rust side:
 *   - Parses TaskContent XML fields → compact IR summary (Cmd, Args, URI, RunAs…)
 *   - Normalises LogonType numbers → human-readable labels (e.g. "3 (Network)")
 *   - Deduplicates records by (timestamp + event_id + computer + username + ip)
 *   - Removes records with zero IR-relevant fields
 *
 * @param records - Raw parsed EventRecord array from parseEvtx()
 * @returns Promise resolving to a cleaned, deduplicated EventRecord array
 * @throws Error with descriptive message on backend failure
 */
export async function enrichRecords(records: EventRecord[]): Promise<EventRecord[]> {
  try {
    const enriched = await invoke<EventRecord[]>('enrich_records', { records });
    return enriched;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Enrich records failed: ${message}`);
  }
}

/**
 * Reload signatures.json from disk without restarting the app.
 * The Rust backend re-reads the file from its last-known path and recompiles
 * all regex rules. Returns updated info.
 *
 * @returns Promise resolving to { count: number; path: string }
 * @throws Error if the file cannot be read or parsed
 */
export async function reloadSignatures(): Promise<{ count: number; path: string }> {
  try {
    const result = await invoke<{ count: number; path: string }>('reload_signatures');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to reload signatures: ${message}`);
  }
}

/**
 * Get current signature info (rule count + file path) without triggering a reload.
 * Called on app mount to populate the toolbar status indicator.
 *
 * @returns Promise resolving to { count: number; path: string }
 */
export async function getSignaturesInfo(): Promise<{ count: number; path: string }> {
  try {
    const result = await invoke<{ count: number; path: string }>('get_signatures_info');
    return result;
  } catch (err) {
    console.error('[tauri-api] getSignaturesInfo error:', err);
    return { count: 0, path: '' };
  }
}

/** Get system username and hostname from the backend. */
export async function getSystemInfo(): Promise<{ username: string; hostname: string }> {
  return await invoke('get_system_info');
}
