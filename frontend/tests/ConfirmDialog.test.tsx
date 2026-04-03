import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from 'antd';
import ConfirmDialog from '../src/components/ConfirmDialog';

function renderDialog(props = {}) {
  const defaults = {
    open: true,
    title: 'Confirm Action',
    message: 'Are you sure?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    confirmText: 'Yes',
  };
  return render(
    <App>
      <ConfirmDialog {...defaults} {...props} />
    </App>
  );
}

describe('ConfirmDialog', () => {
  it('renders title and message', () => {
    renderDialog();
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('renders confirm button text', () => {
    renderDialog({ confirmText: 'Delete' });
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    renderDialog();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });
});
