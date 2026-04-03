import { apiGet } from './helpers';

describe('Menu Access API', () => {
  it('returns all access rules', async () => {
    const { status, body } = await apiGet('/api/menu-access');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows || body)).toBe(true);
  });

  it('returns current user access', async () => {
    const { status, body } = await apiGet('/api/menu-access/me');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows || body)).toBe(true);
  });

  it('returns access by role', async () => {
    // Get first role ID
    const { body: roles } = await apiGet('/api/roles');
    const roleList = roles.rows || roles;
    if (roleList.length > 0) {
      const { status } = await apiGet(`/api/menu-access/role/${roleList[0].id}`);
      expect(status).toBe(200);
    }
  });
});
