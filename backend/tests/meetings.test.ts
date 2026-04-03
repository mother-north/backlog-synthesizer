import { apiGet, apiDelete, uploadMeeting } from './helpers';

describe('Meetings API', () => {
  it('returns list of meetings', async () => {
    const { status, body } = await apiGet('/api/meetings');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  it('each meeting has required fields', async () => {
    const { body } = await apiGet('/api/meetings');
    if (body.rows.length > 0) {
      const m = body.rows[0];
      expect(m.id).toBeDefined();
      expect(m.title).toBeDefined();
      expect(m.status).toBeDefined();
      expect(m).toHaveProperty('story_count');
      expect(m).toHaveProperty('confirmed_count');
    }
  });

  it('returns meeting by ID', async () => {
    const { body: list } = await apiGet('/api/meetings');
    if (list.rows.length > 0) {
      const { status, body } = await apiGet(`/api/meetings/${list.rows[0].id}`);
      expect(status).toBe(200);
      expect(body.id).toBe(list.rows[0].id);
    }
  });

  it('returns 404 for non-existent meeting', async () => {
    const { status } = await apiGet('/api/meetings/99999');
    expect(status).toBe(404);
  });

  it('uploads pasted text and deletes', async () => {
    const { status, body } = await uploadMeeting('Test Meeting', '**Sarah:** We need tests.');
    expect([200, 201]).toContain(status);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('uploaded');

    // Cleanup
    const { status: delStatus } = await apiDelete(`/api/meetings/${body.id}`);
    expect(delStatus).toBe(200);

    // Verify deleted
    const { status: checkStatus } = await apiGet(`/api/meetings/${body.id}`);
    expect(checkStatus).toBe(404);
  });
});
