import { apiGet, apiPost, apiPut, apiDelete } from './helpers';

describe('Roles API', () => {
  let testRoleId: number;

  afterAll(async () => {
    if (testRoleId) await apiDelete(`/api/roles/${testRoleId}`).catch(() => {});
  });

  it('returns list of roles', async () => {
    const { status, body } = await apiGet('/api/roles');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows || body)).toBe(true);
  });

  it('creates a role', async () => {
    const { status, body } = await apiPost('/api/roles', {
      name: `TestRole-${Date.now()}`,
      description: 'A test role',
    });
    expect([200, 201]).toContain(status);
    if (body.id) testRoleId = body.id;
  });

  it('updates a role', async () => {
    if (!testRoleId) return;
    const { status } = await apiPut(`/api/roles/${testRoleId}`, {
      description: 'Updated description',
    });
    expect(status).toBe(200);
  });

  it('deletes a role', async () => {
    if (!testRoleId) return;
    const { status } = await apiDelete(`/api/roles/${testRoleId}`);
    expect(status).toBe(200);
  });
});
