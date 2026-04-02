import { render, fireEvent } from '@testing-library/svelte';
import FilterPanel from './FilterPanel.svelte';
import { defaultFilters } from '../types';
import { describe, it, expect, vi } from 'vitest';

describe('FilterPanel', () => {
  it('updates filters when text input changes', async () => {
    const filters = defaultFilters();
    const { getByLabelText, component } = render(FilterPanel, { props: { filters } });

    const hostnameInput = getByLabelText('Hostname');
    await fireEvent.input(hostnameInput, { target: { value: 'DESKTOP-123' } });

    expect(filters.hostname).toBe('DESKTOP-123');
  });

  it('switches date mode and clears other mode values', async () => {
    const filters = defaultFilters();
    filters.relative_days = 7;
    const { getByText, component } = render(FilterPanel, { props: { filters } });

    const rangeTab = getByText('Date Range');
    await fireEvent.click(rangeTab);

    // After switching to range, relative_days should be null
    expect(filters.relative_days).toBeNull();

    const relativeTab = getByText('Relative');
    await fireEvent.click(relativeTab);
    
    // Switch back to relative should clear range (though they were already null)
    expect(filters.date_from).toBeNull();
    expect(filters.date_to).toBeNull();
  });

  it('toggles relative days pills', async () => {
    const filters = defaultFilters();
    const { getByText } = render(FilterPanel, { props: { filters } });

    const pill3 = getByText('3 days');
    await fireEvent.click(pill3);
    expect(filters.relative_days).toBe(3);

    await fireEvent.click(pill3); // toggle off
    expect(filters.relative_days).toBeNull();
  });
});
