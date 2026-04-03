import { apiGet } from './helpers';

describe('Epics API', () => {
  it('returns list of epics', async () => {
    const { status, body } = await apiGet('/api/epics');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('each epic has required fields', async () => {
    const { body } = await apiGet('/api/epics');
    if (body.rows.length > 0) {
      const e = body.rows[0];
      expect(e.id).toBeDefined();
      expect(e.title).toBeDefined();
      expect(e).toHaveProperty('is_proposed');
      expect(e).toHaveProperty('story_count');
    }
  });

  it('returns 404 for non-existent epic', async () => {
    const { status } = await apiGet('/api/epics/99999');
    expect(status).toBe(404);
  });
});
