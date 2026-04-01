import { create } from 'zustand';
import { authApi, refreshAccessToken } from '../services/api';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

interface User {
  id: number;
  email: string;
  displayName?: string;
  roles: string[];
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  menuVersion: number;

  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  isAdmin: () => boolean;
  hasRole: (role: string) => boolean;
  bumpMenuVersion: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  error: null,
  menuVersion: 0,

  login: async (email, password, rememberMe) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password, rememberMe);
      const { accessToken, refreshToken, user } = response.data;

      localStorage.setItem('bs_accessToken', accessToken);
      localStorage.setItem('bs_refreshToken', refreshToken);
      localStorage.setItem('bs_user', JSON.stringify(user));

      if (rememberMe) {
        localStorage.setItem('bs_rememberEmail', email);
      } else {
        localStorage.removeItem('bs_rememberEmail');
      }

      set({ user, accessToken, refreshToken, isLoading: false });
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    const { refreshToken } = get();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem('bs_accessToken');
    localStorage.removeItem('bs_refreshToken');
    localStorage.removeItem('bs_user');

    set({ user: null, accessToken: null, refreshToken: null });
  },

  initializeAuth: async () => {
    set({ isLoading: true });

    const accessToken = localStorage.getItem('bs_accessToken');
    const refreshToken = localStorage.getItem('bs_refreshToken');
    const userStr = localStorage.getItem('bs_user');

    if (accessToken && refreshToken && userStr) {
      try {
        const user = JSON.parse(userStr);

        if (isTokenExpired(accessToken)) {
          const res = await refreshAccessToken(refreshToken);
          const newToken = res.data.accessToken;
          localStorage.setItem('bs_accessToken', newToken);
          set({ user, accessToken: newToken, refreshToken, isLoading: false });
        } else {
          set({ user, accessToken, refreshToken, isLoading: false });
        }
      } catch {
        localStorage.removeItem('bs_accessToken');
        localStorage.removeItem('bs_refreshToken');
        localStorage.removeItem('bs_user');
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  isAdmin: () => {
    const { user } = get();
    return user?.roles.includes('Admin') ?? false;
  },

  hasRole: (role: string) => {
    const { user } = get();
    return user?.roles.includes(role) ?? false;
  },

  bumpMenuVersion: () => {
    set(s => ({ menuVersion: s.menuVersion + 1 }));
  },
}));
