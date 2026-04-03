import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from 'antd';
import CheckPanel from '../src/components/CheckPanel';

vi.mock('../src/services/api', () => ({
  checksApi: {
    resolve: vi.fn().mockResolvedValue({}),
  },
}));

const mockCheck = {
  id: 1,
  check_type: 'overlap',
  details: 'Overlaps with ERIS-042',
  proposed_resolution: 'Merge stories',
  routed_to: 'PM',
  status: 'open',
};

function renderPanel(props = {}) {
  return render(
    <App>
      <CheckPanel check={mockCheck} onClose={vi.fn()} onResolved={vi.fn()} {...props} />
    </App>
  );
}

describe('CheckPanel', () => {
  it('renders three resolution options', () => {
    renderPanel();
    expect(screen.getByText('Accept proposed resolution')).toBeInTheDocument();
    expect(screen.getByText('Override with custom resolution')).toBeInTheDocument();
    expect(screen.getByText('Dismiss (not an issue)')).toBeInTheDocument();
  });

  it('renders save and cancel buttons', () => {
    renderPanel();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('defaults to accept option', () => {
    renderPanel();
    const acceptRadio = screen.getByLabelText('Accept proposed resolution');
    expect(acceptRadio).toBeChecked();
  });
});
