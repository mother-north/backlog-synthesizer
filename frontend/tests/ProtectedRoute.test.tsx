import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../src/components/ProtectedRoute';

describe('ProtectedRoute', () => {
  it('redirects to login when not authenticated', () => {
    vi.mock('../src/store/auth', () => ({
      useAuthStore: vi.fn((selector) => {
        const state = { user: null, loading: false };
        return selector ? selector(state) : state;
      }),
    }));

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Should redirect — protected content not visible
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
