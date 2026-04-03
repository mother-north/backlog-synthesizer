import { apiGet, apiPost, apiPut, apiDelete } from './helpers';

describe('Users API', () => {
  let testUserId: number;

  afterAll(async () => {
    if (testUserId) await apiDelete(`/api/users/${testUserId}`).catch(() => {});
  });

  it('returns list of users', async () => {
    const { status, body } = await apiGet('/api/users');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows || body)).toBe(true);
  });

  it('creates a user', async () => {
    const { status, body } = await apiPost('/api/users', {
      email: `test-${Date.now()}@example.com`,
      password: 'testpass123',
      displayName: 'Test User',
      roles: ['Analyst'],
    });
    expect([200, 201]).toContain(status);
    expect(body.id).toBeDefined();
    testUserId = body.id;
  });

  it('gets user by ID', async () => {
    if (!testUserId) return;
    const { status, body } = await apiGet(`/api/users/${testUserId}`);
    expect(status).toBe(200);
    expect(body.display_name).toBe('Test User');
  });

  it('updates user', async () => {
    if (!testUserId) return;
    const { status, body } = await apiPut(`/api/users/${testUserId}`, {
      displayName: 'Updated Name',
    });
    expect(status).toBe(200);
  });

  it('resets password', async () => {
    if (!testUserId) return;
    const { status } = await apiPut(`/api/users/${testUserId}/password`, {
      password: 'newpass456',
    });
    expect(status).toBe(200);
  });

  it('rejects short password on create', async () => {
    const { status } = await apiPost('/api/users', {
      email: 'short@example.com',
      password: '12',
      roles: [],
    });
    expect(status).toBe(400);
  });

  it('deletes user', async () => {
    if (!testUserId) return;
    const { status } = await apiDelete(`/api/users/${testUserId}`);
    expect(status).toBe(200);
  });
});
