import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UpdateChecker from './UpdateChecker.svelte';

// Provide a working localStorage mock for the jsdom environment
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem:    vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem:    vi.fn((key: string, value: string) => { localStorageStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key]; }),
  clear:      vi.fn(() => { for (const k in localStorageStore) delete localStorageStore[k]; }),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCheckForUpdates = vi.fn();

vi.mock('../tauri-api', () => ({
  checkForUpdates: (...args: unknown[]) => mockCheckForUpdates(...args),
}));

const mockOpenShell = vi.fn();
vi.mock('@tauri-apps/api/shell', () => ({
  open: (...args: unknown[]) => mockOpenShell(...args),
}));

const stableRelease = {
  tagName: 'v0.1.2',
  name: 'evtx-to-csv v0.1.2',
  body: 'Bug fixes and improvements.',
  publishedAt: '2026-04-02T12:00:00Z',
  htmlUrl: 'https://github.com/maxacode/evtx-to-csv/releases/tag/v0.1.2',
  isPrerelease: false,
};

const devRelease = {
  tagName: 'v0.1.2-dev.5',
  name: 'evtx-to-csv v0.1.2 (Dev build #5)',
  body: 'Development build — may be unstable.',
  publishedAt: '2026-04-02T13:00:00Z',
  htmlUrl: 'https://github.com/maxacode/evtx-to-csv/releases/tag/v0.1.2-dev.5',
  isPrerelease: true,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UpdateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: no update available (same version as current)
    mockCheckForUpdates.mockResolvedValue({ ...stableRelease, tagName: 'v0.1.2' });
  });

  it('renders channel selector with Stable and Dev buttons', async () => {
    mockCheckForUpdates.mockResolvedValue(null);
    const { getByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    expect(getByText('Stable')).toBeTruthy();
    expect(getByText('Dev')).toBeTruthy();
  });

  it('shows "Up to date" when running the latest stable version', async () => {
    mockCheckForUpdates.mockResolvedValue({ ...stableRelease, tagName: 'v0.1.2' });
    const { findByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    expect(await findByText('✓ Up to date')).toBeTruthy();
  });

  it('shows update badge when a newer stable version is available', async () => {
    mockCheckForUpdates.mockResolvedValue({ ...stableRelease, tagName: 'v0.1.3' });
    const { findByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    expect(await findByText('↑ v0.1.3 available')).toBeTruthy();
  });

  it('opens detail panel when update badge is clicked', async () => {
    mockCheckForUpdates.mockResolvedValue({ ...stableRelease, tagName: 'v0.1.3' });
    const { findByText, getByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    const badge = await findByText('↑ v0.1.3 available');
    await fireEvent.click(badge);
    expect(getByText('evtx-to-csv v0.1.2')).toBeTruthy();
    expect(getByText('Bug fixes and improvements.')).toBeTruthy();
  });

  it('calls openShell with release URL when Download is clicked', async () => {
    mockCheckForUpdates.mockResolvedValue({ ...stableRelease, tagName: 'v0.1.3' });
    mockOpenShell.mockResolvedValue(undefined);
    const { findByText, getByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    await fireEvent.click(await findByText('↑ v0.1.3 available'));
    await fireEvent.click(getByText('Download v0.1.3'));
    expect(mockOpenShell).toHaveBeenCalledWith(stableRelease.htmlUrl);
  });

  it('switches to dev channel and re-checks when Dev button is clicked', async () => {
    mockCheckForUpdates
      .mockResolvedValueOnce({ ...stableRelease, tagName: 'v0.1.2' }) // initial stable check
      .mockResolvedValueOnce(devRelease);                               // dev check after switch
    const { findByText, getByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    await findByText('✓ Up to date');
    await fireEvent.click(getByText('Dev'));
    await waitFor(() => expect(mockCheckForUpdates).toHaveBeenCalledWith('dev'));
  });

  it('persists channel choice to localStorage', async () => {
    mockCheckForUpdates.mockResolvedValue(null);
    const { getByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    await fireEvent.click(getByText('Dev'));
    expect(localStorage.getItem('evtx-update-channel')).toBe('dev');
  });

  it('shows error status when check fails', async () => {
    mockCheckForUpdates.mockRejectedValue(new Error('Network error'));
    const { findByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    expect(await findByText('⚠ Check failed')).toBeTruthy();
  });

  it('re-checks when "Up to date" status is clicked', async () => {
    mockCheckForUpdates.mockResolvedValue({ ...stableRelease, tagName: 'v0.1.2' });
    const { findByText } = render(UpdateChecker, { currentVersion: '0.1.2' });
    const upToDate = await findByText('✓ Up to date');
    await fireEvent.click(upToDate);
    expect(mockCheckForUpdates).toHaveBeenCalledTimes(2);
  });

  it('closes detail panel when ✕ is clicked', async () => {
    mockCheckForUpdates.mockResolvedValue({ ...stableRelease, tagName: 'v0.1.3' });
    const { findByText, getByLabelText, queryByText } = render(UpdateChecker, {
      currentVersion: '0.1.2',
    });
    await fireEvent.click(await findByText('↑ v0.1.3 available'));
    await fireEvent.click(getByLabelText('Close'));
    expect(queryByText('Bug fixes and improvements.')).toBeNull();
  });
});
