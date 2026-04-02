import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeedbackDialog from './FeedbackDialog.svelte';

// Define mock variables for use in tests
const mockPost = vi.fn();
const mockReadTextFile = vi.fn();

// Mock Tauri APIs
vi.mock('@tauri-apps/api/http', () => ({
  getClient: vi.fn(() => ({
    post: mockPost
  })),
  Body: {
    json: vi.fn((data) => ({ type: 'Json', payload: data }))
  },
  ResponseType: { Text: 1 }
}));

vi.mock('@tauri-apps/api/os', () => ({
  type: vi.fn(() => Promise.resolve('Darwin')),
  version: vi.fn(() => Promise.resolve('23.0.0')),
  arch: vi.fn(() => Promise.resolve('arm64'))
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(() => Promise.resolve('0.1.1'))
}));

vi.mock('@tauri-apps/api/fs', () => ({
  readTextFile: (...args: any[]) => mockReadTextFile(...args)
}));

vi.mock('@tauri-apps/api/path', () => ({
  resourceDir: vi.fn(() => Promise.resolve('/res/')),
  appLocalDataDir: vi.fn(() => Promise.resolve('/data/'))
}));

vi.mock('../tauri-api', () => ({
  getSystemInfo: vi.fn(() => Promise.resolve({ username: 'testuser', hostname: 'testhost' }))
}));

describe('FeedbackDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ status: 200, data: 'OK' });
    mockReadTextFile.mockRejectedValue('File not found');
  });

  it('does not render when show is false', () => {
    const { queryByText } = render(FeedbackDialog, { show: false });
    expect(queryByText('Submit Feedback to Author')).toBeNull();
  });

  it('renders correctly when show is true', () => {
    const { getByText, getByPlaceholderText } = render(FeedbackDialog, { show: true });
    expect(getByText('Submit Feedback to Author')).toBeTruthy();
    expect(getByPlaceholderText('e.g., Add a button to clear all filters...')).toBeTruthy();
  });

  it('shows error if description is missing on submit', async () => {
    const { getByText } = render(FeedbackDialog, { show: true });
    const submitBtn = getByText('Send to Author');
    
    await fireEvent.click(submitBtn);
    
    expect(getByText('Please provide a description.')).toBeTruthy();
  });

  it('sends correct Authorization header for bug report', async () => {
    const { getByText, getByPlaceholderText } = render(FeedbackDialog, { show: true });
    
    await fireEvent.input(getByPlaceholderText('e.g., Add a button to clear all filters...'), {
      target: { value: 'This is a bug report' }
    });
    
    await fireEvent.click(getByText('Send to Author'));
    
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Evtx-CSV-Bug'
        })
      })
    );
  });

  it('sends correct Authorization header for feature request', async () => {
    const { getByText, getByPlaceholderText, getByLabelText } = render(FeedbackDialog, { show: true });
    
    // Click 'New Feature' radio button
    await fireEvent.click(getByText('New Feature'));
    
    await fireEvent.input(getByPlaceholderText('e.g., Add a button to clear all filters...'), {
      target: { value: 'This is a feature request' }
    });
    
    await fireEvent.click(getByText('Send to Author'));
    
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'EVTX-CSV-Feature-Request'
        })
      })
    );
  });

  it('displays success message and closes on successful submission', async () => {
    vi.useFakeTimers();
    const { getByText, getByPlaceholderText, queryByText, component } = render(FeedbackDialog, { show: true });
    const onClose = vi.fn();
    component.$on('close', onClose);

    await fireEvent.input(getByPlaceholderText('e.g., Add a button to clear all filters...'), {
      target: { value: 'Successful feedback' }
    });
    
    await fireEvent.click(getByText('Send to Author'));
    
    // Allow the async click handler to finish and the status to change to success
    await vi.advanceTimersByTimeAsync(100); 
    
    expect(getByText('Sent! The author is now working on it.')).toBeTruthy();

    // Now advance the remaining time for the auto-close (3000ms)
    await vi.advanceTimersByTimeAsync(3000);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('handles 500 Internal Server Error correctly', async () => {
    mockPost.mockResolvedValue({ status: 500, data: 'Server Error' });
    
    const { getByText, getByPlaceholderText } = render(FeedbackDialog, { show: true });
    
    await fireEvent.input(getByPlaceholderText('e.g., Add a button to clear all filters...'), {
      target: { value: 'Feedback with error' }
    });
    
    await fireEvent.click(getByText('Send to Author'));
    
    await waitFor(() => {
      expect(getByText('Webhook error (500): Server Error')).toBeTruthy();
    });
  });

  it('honors configuration when some fields are disabled', async () => {
    // Mock config that disables username and hostname
    const customConfig = JSON.stringify({
      webhook_url: 'https://test-webhook.site',
      collect_fields: {
        username: false,
        hostname: false,
        os_type: true,
        os_version: true
      }
    });
    
    mockReadTextFile.mockResolvedValue(customConfig);

    const { getByText, getByPlaceholderText } = render(FeedbackDialog, { show: true });
    
    // Wait for config to load and data to capture (async onMount)
    await waitFor(() => {
      expect(mockReadTextFile).toHaveBeenCalled();
    });

    await fireEvent.input(getByPlaceholderText('e.g., Add a button to clear all filters...'), {
      target: { value: 'Config test' }
    });
    
    await fireEvent.click(getByText('Send to Author'));

    // Check payload passed to post
    const payload = mockPost.mock.calls[0][1].payload;
    expect(payload.os_type).toBe('Darwin');
    expect(payload.username).toBeUndefined();
    expect(payload.hostname).toBeUndefined();
  });
});
