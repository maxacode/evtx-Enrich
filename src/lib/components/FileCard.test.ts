import { render, fireEvent, waitFor } from '@testing-library/svelte';
import FileCard from './FileCard.svelte';
import { defaultFilters } from '../types';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tauriApi from '../tauri-api';
import * as fs from '@tauri-apps/api/fs';

vi.mock('../tauri-api', () => ({
  saveFileDialog: vi.fn(),
  parseEvtx: vi.fn(),
  exportCsv: vi.fn(),
  runEnrichmentCheck: vi.fn(),
  enrichRecords: vi.fn(),
  openFile: vi.fn(),
  openFolder: vi.fn(),
  getEvtxSummary: vi.fn(),
}));

vi.mock('@tauri-apps/api/fs', () => ({
  writeTextFile: vi.fn(),
}));

describe('FileCard', () => {
  const mockEntry = {
    id: '1',
    path: '/path/to/test.evtx',
    name: 'test.evtx',
    summary: null,
    filters: defaultFilters(),
    outputName: 'test',
    status: 'idle' as const,
    recordCount: 0,
    errorMessage: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (tauriApi.getEvtxSummary as any).mockResolvedValue({
      total_records: 100,
      start_time: '2023-01-01T00:00:00Z',
      end_time: '2023-01-01T23:59:59Z',
      event_ids: { '4624': 10, '4625': 5 },
    });
  });

  it('loads summary on mount', async () => {
    render(FileCard, { props: { entry: { ...mockEntry }, runEnrichment: true } });

    await waitFor(() => {
      expect(tauriApi.getEvtxSummary).toHaveBeenCalledWith('/path/to/test.evtx');
    });
  });

  it('handles export process successfully', async () => {
    (tauriApi.saveFileDialog as any).mockResolvedValue('/path/to/output.csv');
    (tauriApi.parseEvtx as any).mockResolvedValue([{ id: 1, timestamp: '2023', event_id: 4624, extra_fields: {} }]);
    (tauriApi.exportCsv as any).mockResolvedValue(undefined);
    (tauriApi.runEnrichmentCheck as any).mockResolvedValue('# Report');
    (fs.writeTextFile as any).mockResolvedValue(undefined);

    const { getByText, getByTitle } = render(FileCard, { props: { entry: { ...mockEntry }, runEnrichment: true } });

    const exportBtn = getByText('Export CSV');
    await fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(tauriApi.saveFileDialog).toHaveBeenCalled();
      expect(tauriApi.parseEvtx).toHaveBeenCalled();
      expect(tauriApi.exportCsv).toHaveBeenCalled();
      expect(tauriApi.runEnrichmentCheck).toHaveBeenCalled();
      expect(fs.writeTextFile).toHaveBeenCalledWith('/path/to/output_report.md', '# Report');
      expect(getByText(/Exported 1 record/)).toBeInTheDocument();
    });
  });

  it('shows error message on failure', async () => {
    (tauriApi.saveFileDialog as any).mockRejectedValue(new Error('Dialog failed'));

    const { getByText } = render(FileCard, { props: { entry: { ...mockEntry }, runEnrichment: true } });

    const exportBtn = getByText('Export CSV');
    await fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(getByText('Dialog failed')).toBeInTheDocument();
    });
  });
});
