import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

console.log('Test setup running...');

// Mock Tauri
(window as any).__TAURI__ = {};

// Default mock for IPC
(window as any).__TAURI_IPC__ = vi.fn().mockImplementation((message) => {
  console.log('IPC call:', message);
  return Promise.resolve();
});

// If using @tauri-apps/api/mocks
import { mockIPC } from '@tauri-apps/api/mocks';

// You can use mockIPC in individual tests as well.
