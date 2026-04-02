import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openFile } from './tauri-api';
import { open as openShell } from '@tauri-apps/api/shell';
import { invoke } from '@tauri-apps/api/tauri';

vi.mock('@tauri-apps/api/shell', () => ({
  open: vi.fn(),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

describe('tauri-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure tauri is "available" for assertTauriAvailable
    (window as any).__TAURI__ = {};
  });

  it('openFile fallback: Mock openShell to fail, and verify that revealInFolder is called and the function returns "revealed"', async () => {
    const testPath = '/path/to/test.evtx';
    
    // 1. Mock openShell to fail (e.g., no default app for .evtx)
    (openShell as any).mockRejectedValue(new Error('No default application'));
    
    // 2. Mock invoke for reveal_in_folder (called by revealInFolder fallback)
    (invoke as any).mockResolvedValue(undefined);

    // 3. Execute
    const result = await openFile(testPath);

    // 4. Verify
    expect(openShell).toHaveBeenCalled();
    // Since revealInFolder is an internal call to another exported function in the same module,
    // we verify it by checking if the underlying Tauri invoke was called correctly.
    expect(invoke).toHaveBeenCalledWith('reveal_in_folder', { path: testPath });
    expect(result).toBe('revealed');
  });

  it('openFile success: returns "opened" when openShell succeeds', async () => {
    const testPath = '/path/to/test.evtx';
    (openShell as any).mockResolvedValue(undefined);

    const result = await openFile(testPath);

    expect(openShell).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('reveal_in_folder', expect.anything());
    expect(result).toBe('opened');
  });
});
