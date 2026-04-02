import { render, fireEvent, waitFor } from '@testing-library/svelte';
import App from './App.svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tauriApi from './lib/tauri-api';

vi.mock('./lib/tauri-api', () => ({
  openEvtxFiles: vi.fn(),
  openFolderDialog: vi.fn(),
  listEvtxInDir: vi.fn(),
  reloadSignatures: vi.fn(),
  getSignaturesInfo: vi.fn(),
  parseEvtx: vi.fn(),
  exportCsv: vi.fn(),
  saveFileDialog: vi.fn(),
  enrichRecords: vi.fn(),
  runEnrichmentCheck: vi.fn(),
  revealInFolder: vi.fn(),
  openFile: vi.fn(),
  openFolder: vi.fn(),
  getEvtxSummary: vi.fn(),
  getSystemInfo: vi.fn(() => Promise.resolve({ username: 'test', hostname: 'host' })),
}));

// Mock @tauri-apps/api/app
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(() => Promise.resolve('0.1.1')),
}));

// Mock @tauri-apps/api/path
vi.mock('@tauri-apps/api/path', () => ({
  resourceDir: vi.fn(() => Promise.resolve('/res/')),
  appLocalDataDir: vi.fn(() => Promise.resolve('/data/')),
}));

// Mock @tauri-apps/api/fs
vi.mock('@tauri-apps/api/fs', () => ({
  writeTextFile: vi.fn().mockResolvedValue(undefined),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (tauriApi.getSignaturesInfo as any).mockResolvedValue({ count: 120, path: '/mock/path' });
  });

  it('renders correctly on mount', async () => {
    const { getByText } = render(App);
    expect(getByText('evtx-to-csv')).toBeInTheDocument();
    expect(getByText('No files loaded')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(tauriApi.getSignaturesInfo).toHaveBeenCalled();
      expect(getByText('120 rules active')).toBeInTheDocument();
    });
  });

  it('adds files via file picker', async () => {
    (tauriApi.openEvtxFiles as any).mockResolvedValue(['/path/to/log1.evtx']);
    (tauriApi.getEvtxSummary as any).mockResolvedValue({
      total_records: 50,
      start_time: '2023',
      end_time: '2023',
      event_ids: {}
    });

    const { getByText, getAllByText } = render(App);
    
    const addFilesBtn = getAllByText('Add Files')[0]; // One in toolbar, one in empty state
    await fireEvent.click(addFilesBtn);

    await waitFor(() => {
      expect(tauriApi.openEvtxFiles).toHaveBeenCalled();
      expect(getByText('log1.evtx')).toBeInTheDocument();
    });
  });

  it('toggles global filters panel', async () => {
    const { getByText, queryByText } = render(App);
    
    expect(queryByText('Global Filter Panel')).not.toBeInTheDocument();

    const globalFiltersBtn = getByText('Global Filters');
    await fireEvent.click(globalFiltersBtn);

    expect(getByText('Global Filter Panel')).toBeInTheDocument();
    
    await fireEvent.click(globalFiltersBtn);
    expect(queryByText('Global Filter Panel')).not.toBeInTheDocument();
  });
});
