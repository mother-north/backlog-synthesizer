import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.BASE_URL + 'api');

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bs_accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

function doRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('bs_refreshToken');
    if (!refreshToken) throw new Error('No refresh token');
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    const { accessToken } = response.data;
    localStorage.setItem('bs_accessToken', accessToken);
    return accessToken as string;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const accessToken = await doRefresh();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('bs_accessToken');
        localStorage.removeItem('bs_refreshToken');
        localStorage.removeItem('bs_user');
        window.location.href = import.meta.env.BASE_URL + 'login';
        return new Promise(() => {});
      }
    }

    return Promise.reject(error);
  }
);

export function refreshAccessToken(token: string) {
  return axios.post<{ accessToken: string }>(`${API_BASE_URL}/auth/refresh`, { refreshToken: token });
}

// --- Auth ---
export const authApi = {
  login: (email: string, password: string, rememberMe: boolean) =>
    api.post('/auth/login', { email, password, rememberMe }),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/change-password', { currentPassword, newPassword }),
  getCurrentUser: () =>
    api.get('/auth/me'),
};

// --- Users ---
export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id: number) => api.get(`/users/${id}`),
  create: (data: { email: string; password: string; roles: string[]; displayName?: string }) =>
    api.post('/users', data),
  update: (id: number, data: Partial<{ email: string; roles: string[]; displayName: string }>) =>
    api.put(`/users/${id}`, data),
  resetPassword: (id: number, password: string) =>
    api.put(`/users/${id}/password`, { password }),
  delete: (id: number) => api.delete(`/users/${id}`),
};

// --- Roles ---
export const rolesApi = {
  getAll: () => api.get('/roles'),
  getById: (id: number) => api.get(`/roles/${id}`),
  create: (data: { name: string; description?: string }) => api.post('/roles', data),
  update: (id: number, data: Partial<{ name: string; description: string }>) =>
    api.put(`/roles/${id}`, data),
  delete: (id: number) => api.delete(`/roles/${id}`),
};

// --- Meetings ---
export const meetingsApi = {
  getAll: () => api.get('/meetings'),
  getById: (id: number) => api.get(`/meetings/${id}`),
  upload: (title: string, file?: File, transcript?: string) => {
    const form = new FormData();
    form.append('title', title);
    if (file) form.append('file', file);
    if (transcript) form.append('transcript', transcript);
    return api.post('/meetings/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  trigger: (id: number) => api.post(`/meetings/${id}/trigger`),
  getProgress: (id: number) => api.get(`/meetings/${id}/progress`),
  delete: (id: number) => api.delete(`/meetings/${id}`),
};

// --- Stories ---
export const storiesApi = {
  getAll: (params?: Record<string, string>) => api.get('/stories', { params }),
  getByMeeting: (meetingId: number) => api.get('/stories', { params: { meeting_id: meetingId } }),
  getById: (id: number) => api.get(`/stories/${id}`),
  update: (id: number, data: Partial<{ description: string; acceptance_criteria: string[]; epic_id: number; feature_tags: string[] }>) =>
    api.put(`/stories/${id}`, data),
  confirm: (id: number) => api.post(`/stories/${id}/confirm`),
  reject: (id: number, rationale: string) => api.post(`/stories/${id}/reject`, { rationale }),
  escalate: (id: number) => api.post(`/stories/${id}/escalate`),
  bulkConfirm: (ids: number[]) => api.post('/stories/bulk-confirm', { ids }),
  bulkReject: (ids: number[], rationale: string) => api.post('/stories/bulk-reject', { ids, rationale }),
};

// --- Checks ---
export const checksApi = {
  getByMeeting: (meetingId: number, params?: Record<string, string>) =>
    api.get('/checks', { params: { meeting_id: meetingId, ...params } }),
  getByStory: (storyId: number) => api.get(`/stories/${storyId}/checks`),
  resolve: (id: number, data: { resolution: string; notes?: string }) =>
    api.post(`/checks/${id}/resolve`, data),
  getActions: () => api.get('/checks/actions'),
  getActionCount: () => api.get('/checks/actions/count'),
};

// --- Epics ---
export const epicsApi = {
  getAll: () => api.get('/epics'),
  getByMeeting: (meetingId: number) => api.get('/epics', { params: { meeting_id: meetingId } }),
  approve: (id: number) => api.post(`/epics/${id}/approve`),
  reject: (id: number, data: { action: string; targetEpicId?: number; rationale?: string }) =>
    api.post(`/epics/${id}/reject`, data),
  merge: (id: number, targetEpicId: number) =>
    api.post(`/epics/${id}/merge`, { targetEpicId }),
};

// --- Memos ---
export const memosApi = {
  getByMeeting: (meetingId: number) => api.get(`/meetings/${meetingId}/memos`),
  generate: (meetingId: number) => api.post(`/meetings/${meetingId}/memos/generate`),
};

// --- Dashboard ---
export const dashboardApi = {
  getStats: () => api.get('/dashboard'),
  getCharts: () => api.get('/dashboard'),
};

// --- Knowledge Base ---
export const kbApi = {
  search: (query: string, types?: string[]) =>
    api.post('/kb/search', { query, content_types: types }),
};

// --- Data Loading ---
export const dataApi = {
  getBacklog: (params?: Record<string, string>) => api.get('/data/backlog', { params }),
  uploadBacklog: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/data/backlog/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadBacklog: () => api.get('/data/backlog/download', { responseType: 'blob' }),
  getArchitecture: () => api.get('/data/architecture'),
  uploadArchitecture: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/data/architecture/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// --- Audit ---
export const auditApi = {
  getTraces: (meetingId: number) => api.get(`/meetings/${meetingId}/traces`),
  getHistory: (meetingId: number, storyId?: number) =>
    api.get(`/meetings/${meetingId}/audit`, { params: storyId ? { storyId } : undefined }),
};

// --- Menu Access ---
export const menuAccessApi = {
  getMyAccess: () => api.get('/menu-access/me'),
  getAll: () => api.get('/menu-access'),
  getByRole: (roleId: number) => api.get(`/menu-access/role/${roleId}`),
  bulkUpdate: (roleId: number, access: Array<{ menuPath: string; tabName?: string; allowed: boolean }>) =>
    api.put(`/menu-access/role/${roleId}/bulk`, { rules: access }),
  update: (id: number, allowed: boolean) => api.put(`/menu-access/${id}`, { allowed }),
  delete: (id: number) => api.delete(`/menu-access/${id}`),
};

// --- Access Log ---
export const accessLogApi = {
  log: (l0: string, l1: string) => api.post('/access-log', { l0, l1 }),
  getAll: () => api.get('/access-log'),
  clear: () => api.delete('/access-log'),
};
