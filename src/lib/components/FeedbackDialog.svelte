<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getClient, Body, ResponseType } from '@tauri-apps/api/http';
  import { type, version as osVersion, arch } from '@tauri-apps/api/os';
  import { getVersion } from '@tauri-apps/api/app';
  import { readTextFile } from '@tauri-apps/api/fs';
  import { resourceDir, appLocalDataDir } from '@tauri-apps/api/path';
  import { getSystemInfo } from '../tauri-api';

  export let show = false;

  const dispatch = createEventDispatcher();
  
  // Default configuration
  let config = {
    webhook_url: 'https://webhook.site/kids-video-ml',
    collect_fields: {
      username: true,
      hostname: true,
      os_type: true,
      os_version: true,
      arch: true,
      app_version: true,
      timestamp: true,
      timezone: true,
      locale: true
    }
  };

  let requestType: 'bug' | 'feature' = 'bug';
  let description = '';
  let status: 'idle' | 'sending' | 'success' | 'error' = 'idle';
  let errorMessage = '';

  // System info storage
  let capturedData: any = {};

  onMount(async () => {
    await loadConfig();
    await captureSystemData();
  });

  async function loadConfig() {
    const configFileName = 'feedback-config.json';
    const paths = [];
    
    try {
      paths.push(`./${configFileName}`);
      paths.push(await resourceDir() + configFileName);
      paths.push(await appLocalDataDir() + configFileName);
    } catch (e) {
      console.warn('Failed to resolve some config paths', e);
    }

    for (const path of paths) {
      try {
        const content = await readTextFile(path);
        const parsed = JSON.parse(content);
        if (parsed.webhook_url) {
          config = { ...config, ...parsed };
          console.log(`Loaded config from ${path}`);
          break;
        }
      } catch (e) {
        // Skip and try next path
      }
    }
  }

  async function captureSystemData() {
    const fields = config.collect_fields;
    const data: any = {};

    try {
      if (fields.os_type) data.os_type = await type();
      if (fields.os_version) data.os_version = await osVersion();
      if (fields.arch) data.arch = await arch();
      if (fields.app_version) data.app_version = await getVersion();
      if (fields.timestamp) data.timestamp = new Date().toISOString();
      if (fields.timezone) data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (fields.locale) data.locale = navigator.language;

      if (fields.username || fields.hostname) {
        const info = await getSystemInfo();
        if (fields.username) data.username = info.username;
        if (fields.hostname) data.hostname = info.hostname;
      }
    } catch (e) {
      console.error('Failed to capture some system data', e);
    }

    capturedData = data;
  }

  async function handleSubmit() {
    if (!description) {
      errorMessage = 'Please provide a description.';
      status = 'error';
      return;
    }

    status = 'sending';
    errorMessage = '';

    try {
      const client = await getClient();
      
      const authHeader = requestType === 'bug' 
        ? 'Evtx-CSV-Bug' 
        : 'EVTX-CSV-Feature-Request';

      const payload = {
        type: requestType,
        description,
        ...capturedData
      };

      const response = await client.post(config.webhook_url, Body.json(payload), {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'User-Agent': 'Tauri-App'
        },
        responseType: ResponseType.Text
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
        errorMessage = `Webhook error (${response.status}): ${response.data}`;
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
        <h2>Submit Feedback to Author</h2>
        <button class="close-btn" on:click={close}>&times;</button>
      </div>

      <div class="modal-body">
        {#if status === 'success'}
          <div class="success-message">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p>Sent! The author is now working on it.</p>
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
            <label for="desc">What should the author fix or add?</label>
            <textarea
              id="desc"
              bind:value={description}
              placeholder="e.g., Add a button to clear all filters..."
              rows="6"
            ></textarea>
          </div>

          <div class="env-info">
            <p><strong>Captured info:</strong> 
              {capturedData.os_type || ''} {capturedData.os_version || ''} 
              {capturedData.username ? `| ${capturedData.username}` : ''}
              {capturedData.hostname ? `@${capturedData.hostname}` : ''}
            </p>
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
            Send to Author
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

  textarea {
    background: #0f172a;
    border: 1px solid #3d4260;
    border-radius: 6px;
    padding: 10px;
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
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
