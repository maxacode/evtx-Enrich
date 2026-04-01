<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getClient, Body } from '@tauri-apps/api/http';
  import { type, version as osVersion, arch } from '@tauri-apps/api/os';
  import { getVersion } from '@tauri-apps/api/app';

  export let show = false;

  const dispatch = createEventDispatcher();
  const STORAGE_KEY_TOKEN = 'gemini_feedback_github_token';
  const STORAGE_KEY_REPO = 'gemini_feedback_repo';

  let requestType: 'bug' | 'feature' = 'bug';
  let description = '';
  let githubToken = '';
  let repo = 'maks-derevencha/evtx-to-csv';
  let status: 'idle' | 'sending' | 'success' | 'error' = 'idle';
  let errorMessage = '';

  // System info
  let systemInfo = {
    os: '',
    osVer: '',
    arch: '',
    appVer: ''
  };

  onMount(async () => {
    githubToken = localStorage.getItem(STORAGE_KEY_TOKEN) || '';
    const savedRepo = localStorage.getItem(STORAGE_KEY_REPO);
    if (savedRepo) repo = savedRepo;

    try {
      systemInfo.os = await type();
      systemInfo.osVer = await osVersion();
      systemInfo.arch = await arch();
      systemInfo.appVer = await getVersion();
    } catch (e) {
      console.error('Failed to get system info', e);
    }
  });

  async function handleSubmit() {
    if (!description || !githubToken || !repo) {
      errorMessage = 'Please fill in all fields (Description, Repo, and Token).';
      status = 'error';
      return;
    }

    status = 'sending';
    errorMessage = '';

    try {
      const client = await getClient();
      
      localStorage.setItem(STORAGE_KEY_TOKEN, githubToken);
      localStorage.setItem(STORAGE_KEY_REPO, repo);

      const url = `https://api.github.com/repos/${repo}/dispatches`;
      
      const payload = {
        type: requestType,
        description,
        timestamp: new Date().toISOString(),
        environment: systemInfo
      };

      const response = await client.post(url, Body.json({
        event_type: 'gemini-fix',
        client_payload: payload
      }), {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Tauri-App'
        }
      });

      if (response.status >= 200 && response.status < 300) {
        status = 'success';
        description = '';
        setTimeout(() => {
          if (status === 'success') {
            close();
          }
        }, 3000);
      } else {
        status = 'error';
        errorMessage = `GitHub API error (${response.status}): ${JSON.stringify(response.data)}`;
      }
    } catch (err) {
      status = 'error';
      errorMessage = `Network error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function close() {
    status = 'idle';
    errorMessage = '';
    dispatch('close');
  }
</script>

{#if show}
  <div class="modal-overlay" on:click|self={close}>
    <div class="modal-content">
      <div class="modal-header">
        <h2>Submit Request to Gemini Agent</h2>
        <button class="close-btn" on:click={close}>&times;</button>
      </div>

      <div class="modal-body">
        {#if status === 'success'}
          <div class="success-message">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p>Sent! Your Gemini agent is now working on it.</p>
          </div>
        {:else}
          <div class="form-group">
            <label>Request Type</label>
            <div class="type-selector">
              <label class:active={requestType === 'bug'}>
                <input type="radio" bind:group={requestType} value="bug" /> Bug Fix
              </label>
              <label class:active={requestType === 'feature'}>
                <input type="radio" bind:group={requestType} value="feature" /> New Feature
              </label>
            </div>
          </div>

          <div class="form-group">
            <label for="repo">GitHub Repository (owner/repo)</label>
            <input id="repo" type="text" bind:value={repo} placeholder="e.g., user/repo" />
          </div>

          <div class="form-group">
            <label for="desc">What should Gemini fix or add?</label>
            <textarea
              id="desc"
              bind:value={description}
              placeholder="e.g., Add a button to clear all filters..."
              rows="4"
            ></textarea>
          </div>

          <div class="form-group">
            <label for="token">GitHub PAT (requires 'repo' scope)</label>
            <input id="token" type="password" bind:value={githubToken} placeholder="ghp_..." />
            <small>This token triggers the 'repository_dispatch' for your Gemini agent.</small>
          </div>

          <div class="env-info">
            <p><strong>Environment captured:</strong> {systemInfo.os} {systemInfo.osVer} ({systemInfo.arch}), App v{systemInfo.appVer}</p>
          </div>

          {#if status === 'error'}
            <div class="error-message">
              {errorMessage}
            </div>
          {/if}
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close} disabled={status === 'sending'}>
          Cancel
        </button>
        <button
          class="btn btn-primary"
          on:click={handleSubmit}
          disabled={status === 'sending' || status === 'success'}
        >
          {#if status === 'sending'}
            Sending...
          {:else}
            Trigger Gemini Agent
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: #1a1d2e;
    border: 1px solid #3d4260;
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    color: #e2e8f0;
  }

  .modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid #3d4260;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h2 {
    font-size: 18px;
    margin: 0;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  label {
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
  }

  input[type="text"],
  input[type="password"],
  textarea {
    background: #0f172a;
    border: 1px solid #3d4260;
    border-radius: 6px;
    padding: 10px;
    color: #fff;
    font-family: inherit;
    font-size: 14px;
  }

  textarea {
    resize: vertical;
  }

  small {
    font-size: 11px;
    color: #64748b;
  }

  .type-selector {
    display: flex;
    gap: 10px;
  }

  .type-selector label {
    flex: 1;
    padding: 10px;
    background: #0f172a;
    border: 1px solid #3d4260;
    border-radius: 6px;
    text-align: center;
    cursor: pointer;
    font-size: 14px;
    color: #e2e8f0;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .type-selector label.active {
    background: rgba(92, 124, 250, 0.1);
    border-color: #5c7cfa;
    color: #5c7cfa;
  }

  .type-selector input {
    display: none;
  }

  .env-info {
    background: #272b3f;
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
    color: #94a3b8;
  }

  .env-info p { margin: 0; }

  .modal-footer {
    padding: 16px 20px;
    border-top: 1px solid #3d4260;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-size: 14px;
  }

  .btn-primary {
    background: #5c7cfa;
    color: #fff;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid #3d4260;
    color: #94a3b8;
  }

  .success-message {
    text-align: center;
    color: #40c057;
    padding: 20px 0;
  }

  .error-message {
    background: rgba(250, 82, 82, 0.1);
    border: 1px solid #fa5252;
    color: #fa5252;
    padding: 10px;
    border-radius: 6px;
    font-size: 13px;
  }
</style>
