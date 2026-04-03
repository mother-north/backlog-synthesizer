import { apiGet, apiPut, apiGetNoAuth, apiPostNoAuth } from './helpers';

describe('Auth API', () => {
  describe('POST /api/auth/login', () => {
    it('returns tokens with valid credentials', async () => {
      const { status, body } = await apiPostNoAuth('/api/auth/login', {
        email: 'admin@backlog-synthesizer.com', password: 'admin123',
      });
      expect(status).toBe(200);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.email).toBe('admin@backlog-synthesizer.com');
    });

    it('rejects invalid password', async () => {
      const { status } = await apiPostNoAuth('/api/auth/login', {
        email: 'admin@backlog-synthesizer.com', password: 'wrong',
      });
      expect(status).toBe(401);
    });

    it('rejects non-existent email', async () => {
      const { status } = await apiPostNoAuth('/api/auth/login', {
        email: 'nobody@example.com', password: 'test',
      });
      expect(status).toBe(401);
    });
  });

  describe('Protected endpoints', () => {
    it('rejects requests without token', async () => {
      const { status } = await apiGetNoAuth('/api/meetings');
      expect(status).toBe(401);
    });

    it('accepts valid token', async () => {
      const { status } = await apiGet('/api/meetings');
      expect(status).toBe(200);
    });
  });
});
