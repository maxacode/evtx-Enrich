import { render, fireEvent } from '@testing-library/svelte';
import FilterPanel from './FilterPanel.svelte';
import type { FilterConfig } from '../types';
import { defaultFilters } from '../types';
import { describe, it, expect } from 'vitest';

describe('FilterPanel', () => {
  function trackLatestChange(component: { $on: (event: string, handler: (e: CustomEvent<FilterConfig>) => void) => void }, initial: FilterConfig) {
    let latest = initial;
    component.$on('change', (event) => {
      latest = event.detail;
    });
    return () => latest;
  }

  it('updates filters when text input changes', async () => {
    const filters = defaultFilters();
    const { getByLabelText, component } = render(FilterPanel, { props: { filters } });
    const getLatest = trackLatestChange(component, filters);

    const hostnameInput = getByLabelText('Hostname');
    await fireEvent.input(hostnameInput, { target: { value: 'DESKTOP-123' } });

    expect(getLatest().hostname).toBe('DESKTOP-123');
  });

  it('switches date mode and clears other mode values', async () => {
    const filters = defaultFilters();
    filters.relative_days = 7;
    const { getByText, component } = render(FilterPanel, { props: { filters } });
    const getLatest = trackLatestChange(component, filters);

    const rangeTab = getByText('Date Range');
    await fireEvent.click(rangeTab);

    // After switching to range, relative_days should be null
    expect(getLatest().relative_days).toBeNull();

    const relativeTab = getByText('Relative');
    await fireEvent.click(relativeTab);
    
    // Switch back to relative should clear range (though they were already null)
    expect(getLatest().date_from).toBeNull();
    expect(getLatest().date_to).toBeNull();
  });

  it('toggles relative days pills', async () => {
    const filters = defaultFilters();
    const { getByText, component } = render(FilterPanel, { props: { filters } });
    const getLatest = trackLatestChange(component, filters);

    const pill3 = getByText('3 days');
    await fireEvent.click(pill3);
    expect(getLatest().relative_days).toBe(3);

    await fireEvent.click(pill3); // toggle off
    expect(getLatest().relative_days).toBeNull();
  });

  it('enables and stores keyword context when a keyword is set', async () => {
    const filters = defaultFilters();
    const { getByLabelText, component, rerender } = render(FilterPanel, { props: { filters } });
    const getLatest = trackLatestChange(component, filters);

    const keywordInput = getByLabelText('Keyword') as HTMLInputElement;
    const contextSelect = getByLabelText(/Context/i) as HTMLSelectElement;

    expect(contextSelect.disabled).toBe(true);

    await fireEvent.input(keywordInput, { target: { value: 'powershell' } });
    expect(contextSelect.disabled).toBe(false);

    await fireEvent.change(contextSelect, { target: { value: '2' } });
    expect(getLatest().keyword_context).toBe(2);

    await rerender({ filters: getLatest() });
    expect((getByLabelText(/Context/i) as HTMLSelectElement).value).toBe('2');
  });
});
