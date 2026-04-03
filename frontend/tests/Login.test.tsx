import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import Login from '../src/pages/Login';

vi.mock('../src/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { user: null, login: vi.fn(), loading: false };
    return selector ? selector(state) : state;
  }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <App>
        <Login />
      </App>
    </MemoryRouter>
  );
}

describe('Login', () => {
  it('renders email field', () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i) || screen.getByPlaceholderText(/email/i)).toBeDefined();
  });

  it('renders password field', () => {
    renderLogin();
    expect(screen.getByLabelText(/password/i) || screen.getByPlaceholderText(/password/i)).toBeDefined();
  });

  it('renders login button', () => {
    renderLogin();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
