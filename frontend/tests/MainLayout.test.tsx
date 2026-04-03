import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import MainLayout from '../src/components/MainLayout';

vi.mock('../src/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      user: { displayName: 'Admin', email: 'admin@test.com', roles: ['Admin'] },
      logout: vi.fn(),
      menuVersion: 0,
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../src/services/api', () => ({
  menuAccessApi: { getMyAccess: vi.fn().mockResolvedValue({ data: { rows: [] } }) },
  accessLogApi: { log: vi.fn().mockResolvedValue({}) },
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/meetings']}>
      <App>
        <MainLayout />
      </App>
    </MemoryRouter>
  );
}

describe('MainLayout', () => {
  it('renders app title', async () => {
    renderLayout();
    await waitFor(() => {
      expect(screen.getByText('Backlog Synthesizer')).toBeInTheDocument();
    });
  });

  it('renders user name in dropdown', async () => {
    renderLayout();
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });
  });

  it('renders navigation items', async () => {
    renderLayout();
    await waitFor(() => {
      expect(screen.getByText('Meetings')).toBeInTheDocument();
      expect(screen.getByText('Stories')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});
