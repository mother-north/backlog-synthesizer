import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('../src/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { user: { id: 1, displayName: 'Admin', email: 'admin@test.com', roles: ['Admin'] } };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../src/services/api', () => ({
  authApi: { changePassword: vi.fn().mockResolvedValue({}) },
  usersApi: { getAll: vi.fn().mockResolvedValue({ data: { rows: [{ id: 1, email: 'admin@test.com', display_name: 'Admin', roles: ['Admin'], created_at: '2025-01-01' }] } }) },
  rolesApi: { getAll: vi.fn().mockResolvedValue({ data: { rows: [{ id: 1, name: 'Admin', description: 'Administrator' }] } }) },
  menuAccessApi: { getAll: vi.fn().mockResolvedValue({ data: { rows: [] } }), getMyAccess: vi.fn().mockResolvedValue({ data: { rows: [] } }) },
  accessLogApi: { getAll: vi.fn().mockResolvedValue({ data: { rows: [] } }), clear: vi.fn(), log: vi.fn().mockResolvedValue({}) },
}));

import Profile from '../src/pages/settings/Profile';
import Users from '../src/pages/settings/Users';
import Roles from '../src/pages/settings/Roles';
import AccessLog from '../src/pages/settings/AccessLog';

function wrap(component: React.ReactNode) {
  return render(<MemoryRouter><App>{component}</App></MemoryRouter>);
}

describe('Profile', () => {
  it('renders account info', () => {
    wrap(<Profile />);
    expect(screen.getByText('Account Info')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
  });

  it('renders change password form', () => {
    wrap(<Profile />);
    expect(screen.getByText('Current Password')).toBeInTheDocument();
    expect(screen.getByText('New Password')).toBeInTheDocument();
  });
});

describe('Users', () => {
  it('renders users heading', async () => {
    wrap(<Users />);
    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    });
  });
});

describe('Roles', () => {
  it('renders roles heading', async () => {
    wrap(<Roles />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Roles');
    });
  });
});

describe('AccessLog', () => {
  it('renders activity log heading', async () => {
    wrap(<AccessLog />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Activity Log');
    });
  });
});
