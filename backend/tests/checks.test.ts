import { apiGet } from './helpers';

describe('Checks API', () => {
  it('returns list of checks', async () => {
    const { status, body } = await apiGet('/api/checks');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('filters by status', async () => {
    const { body } = await apiGet('/api/checks?status=open');
    for (const c of body.rows) {
      expect(c.status).toBe('open');
    }
  });

  it('includes story_title', async () => {
    const { body } = await apiGet('/api/checks');
    if (body.rows.length > 0) {
      expect(body.rows[0]).toHaveProperty('story_title');
    }
  });

  it('returns action count', async () => {
    const { status, body } = await apiGet('/api/checks/actions/count');
    expect(status).toBe(200);
    expect(typeof body.count).toBe('number');
  });
});
