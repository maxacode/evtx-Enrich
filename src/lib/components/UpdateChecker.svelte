<!--
  UpdateChecker.svelte
  --------------------
  Compact update-notifier that lives in the toolbar.

  Behaviour:
  - On mount, auto-checks the stored channel (defaults to "stable").
  - Shows a green "Up to date" pill or an amber "Update available" badge.
  - Clicking the badge opens a detail panel with release notes and a
    "Download" button that opens the GitHub release in the browser.
  - Channel can be toggled between Stable (main) and Dev at any time;
    a new check is triggered immediately on change.
  - The chosen channel is persisted in localStorage across sessions.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { open as openShell } from '@tauri-apps/api/shell';
  import { checkForUpdates, installUpdate, relaunch } from '../tauri-api';
  import type { ReleaseInfo } from '../tauri-api';

  /** Current running version, passed in from App.svelte. */
  export let currentVersion: string = '0.1.2';

  type Channel = 'stable' | 'dev';

  const CHANNEL_KEY = 'evtxenrich-update-channel';

  function getStoredChannel(): Channel {
    try { return (localStorage?.getItem(CHANNEL_KEY) as Channel) ?? 'stable'; }
    catch { return 'stable'; }
  }

  function storeChannel(c: Channel) {
    try { localStorage?.setItem(CHANNEL_KEY, c); } catch { /* ignore */ }
  }

  let channel: Channel = getStoredChannel();
  let checking = false;
  let hasChecked = false;
  let release: ReleaseInfo | null = null;
  let error: string | null = null;
  let showPanel = false;
  let installing = false;
  let installError: string | null = null;

  // ---------------------------------------------------------------------------
  // Version comparison
  // ---------------------------------------------------------------------------

  /**
   * Parse "v0.1.2" or "v0.1.2-dev.5" → [0, 1, 2].
   * The pre-release suffix is stripped before comparison so that a dev tag
   * for the same base version is treated as equal, not greater.
   */
  function semverParts(tag: string): [number, number, number] {
    const core = tag.replace(/^v/, '').split('-')[0];
    const [a = 0, b = 0, c = 0] = core.split('.').map(Number);
    return [a, b, c];
  }

  function isNewer(tag: string, current: string): boolean {
    const [ra, rb, rc] = semverParts(tag);
    const [ca, cb, cc] = semverParts(current);
    if (ra !== ca) return ra > ca;
    if (rb !== cb) return rb > cb;
    return rc > cc;
  }

  $: hasUpdate = release !== null && isNewer(release.tagName, currentVersion);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function setChannel(c: Channel) {
    channel = c;
    storeChannel(c);
    // Reset state and re-check immediately
    release = null;
    hasChecked = false;
    error = null;
    showPanel = false;
    doCheck();
  }

  async function doCheck() {
    checking = true;
    error = null;
    try {
      release = await checkForUpdates(channel);
      hasChecked = true;
      if (hasUpdate) showPanel = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      hasChecked = true;
    } finally {
      checking = false;
    }
  }

  async function doInstall() {
    if (!release) return;
    installing = true;
    installError = null;
    try {
      if (channel === 'stable') {
        // Tauri's built-in updater: download + verify signature + install silently
        await installUpdate();
        await relaunch();
      } else {
        // Dev channel: open browser — Tauri updater isn't configured for dev endpoint
        await openShell(release.htmlUrl);
      }
    } catch (err) {
      installError = err instanceof Error ? err.message : String(err);
    } finally {
      installing = false;
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  onMount(() => {
    doCheck();
  });
</script>

<!-- ============================================================ Template === -->

<div class="update-checker">

  <!-- Channel selector pills -->
  <div class="channel-selector" role="group" aria-label="Update channel">
    <button
      class="channel-btn"
      class:active={channel === 'stable'}
      on:click={() => setChannel('stable')}
      title="Check for stable releases (main branch)"
    >
      Stable
    </button>
    <button
      class="channel-btn"
      class:active={channel === 'dev'}
      on:click={() => setChannel('dev')}
      title="Check for dev pre-releases (dev branch)"
    >
      Dev
    </button>
  </div>

  <!-- Status indicator / check button -->
  {#if checking}
    <span class="update-status checking">
      <span class="mini-spinner" aria-hidden="true"></span>
      Checking…
    </span>
  {:else if error}
    <button class="update-status error" on:click={doCheck} title="Click to retry">
      ⚠ Check failed
    </button>
  {:else if hasChecked && hasUpdate && release}
    <!-- Amber badge — clickable to toggle panel -->
    <button
      class="update-status has-update"
      on:click={() => (showPanel = !showPanel)}
      title="Click to see update details"
    >
      ↑ {release.tagName} available
    </button>
  {:else if hasChecked}
    <button class="update-status up-to-date" on:click={doCheck} title="Click to re-check">
      ✓ Up to date
    </button>
  {:else}
    <button class="update-status idle" on:click={doCheck}>
      Check updates
    </button>
  {/if}

  <!-- Detail panel -->
  {#if showPanel && release}
    <div class="update-panel" role="dialog" aria-label="Update details">
      <div class="update-panel-header">
        <div>
          <span class="update-panel-title">{release.name || release.tagName}</span>
          <span class="update-panel-date">{formatDate(release.publishedAt)}</span>
        </div>
        <button class="panel-close" on:click={() => (showPanel = false)} aria-label="Close">✕</button>
      </div>

      {#if release.body}
        <div class="update-panel-body">
          <!-- Show first 400 chars of release notes to keep it compact -->
          <pre class="release-notes">{release.body.slice(0, 400)}{release.body.length > 400 ? '\n…' : ''}</pre>
        </div>
      {/if}

      <div class="update-panel-footer">
        {#if installing}
          <span class="update-status checking">
            <span class="mini-spinner" aria-hidden="true"></span>
            {channel === 'stable' ? 'Installing…' : 'Opening…'}
          </span>
        {:else if installError}
          <div class="install-error-row">
            <span class="install-error">{installError}</span>
            <button class="btn-download btn-retry" on:click={doInstall}>Retry</button>
          </div>
        {:else}
          <button class="btn-download" on:click={doInstall}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 10v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            {channel === 'stable' ? `Install ${release.tagName}` : `Download ${release.tagName}`}
          </button>
        {/if}
        <span class="update-channel-label">
          {release.isPrerelease ? 'Dev build' : 'Stable release'}
        </span>
      </div>
    </div>
  {/if}

</div>

<!-- ================================================================ Style === -->

<style>
  .update-checker {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* ── Channel selector ── */
  .channel-selector {
    display: flex;
    border: 1px solid var(--color-border, #2a2d3a);
    border-radius: 5px;
    overflow: hidden;
  }

  .channel-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted, #8b92a5);
    font-size: 11px;
    padding: 3px 8px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    line-height: 1;
  }

  .channel-btn:hover {
    background: var(--color-surface-hover, rgba(255,255,255,0.05));
    color: var(--color-text, #e2e4eb);
  }

  .channel-btn.active {
    background: var(--color-accent, #5c7cfa);
    color: #fff;
  }

  /* ── Status badges ── */
  .update-status {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    cursor: default;
    line-height: 1;
  }

  button.update-status {
    cursor: pointer;
    background: transparent;
    transition: opacity 0.15s;
  }

  button.update-status:hover {
    opacity: 0.8;
  }

  .update-status.checking {
    color: var(--color-text-muted, #8b92a5);
  }

  .update-status.up-to-date {
    color: var(--color-success, #4ade80);
    border-color: rgba(74, 222, 128, 0.2);
    background: rgba(74, 222, 128, 0.06);
  }

  .update-status.has-update {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.08);
    font-weight: 500;
  }

  .update-status.error {
    color: var(--color-error, #f87171);
    border-color: rgba(248, 113, 113, 0.2);
    background: rgba(248, 113, 113, 0.06);
    cursor: pointer;
  }

  .update-status.idle {
    color: var(--color-text-muted, #8b92a5);
    border-color: var(--color-border, #2a2d3a);
  }

  /* ── Spinner ── */
  .mini-spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--color-text-muted, #8b92a5);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Detail panel ── */
  .update-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 200;
    width: 340px;
    background: var(--color-surface, #1a1d27);
    border: 1px solid var(--color-border, #2a2d3a);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .update-panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--color-border, #2a2d3a);
    gap: 8px;
  }

  .update-panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text, #e2e4eb);
    display: block;
  }

  .update-panel-date {
    font-size: 11px;
    color: var(--color-text-muted, #8b92a5);
    display: block;
    margin-top: 2px;
  }

  .panel-close {
    background: none;
    border: none;
    color: var(--color-text-muted, #8b92a5);
    cursor: pointer;
    font-size: 13px;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
  }

  .panel-close:hover {
    color: var(--color-text, #e2e4eb);
  }

  .update-panel-body {
    padding: 10px 14px;
    max-height: 160px;
    overflow-y: auto;
  }

  .release-notes {
    font-size: 11px;
    color: var(--color-text-muted, #8b92a5);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: inherit;
    line-height: 1.5;
  }

  .update-panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid var(--color-border, #2a2d3a);
    gap: 8px;
  }

  .btn-download {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--color-accent, #5c7cfa);
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-download:hover {
    opacity: 0.88;
  }

  .update-channel-label {
    font-size: 11px;
    color: var(--color-text-muted, #8b92a5);
  }

  .install-error-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .install-error {
    font-size: 11px;
    color: var(--color-error, #f87171);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-retry {
    flex-shrink: 0;
  }
</style>
