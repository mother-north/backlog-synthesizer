import { apiGet, apiPut, apiPost } from './helpers';

describe('Stories API', () => {
  it('returns list of stories', async () => {
    const { status, body } = await apiGet('/api/stories');
    expect(status).toBe(200);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('filters by status', async () => {
    const { body } = await apiGet('/api/stories?status=confirmed');
    for (const s of body.rows) {
      expect(s.status).toBe('confirmed');
    }
  });

  it('includes epic info', async () => {
    const { body } = await apiGet('/api/stories');
    const withEpic = body.rows.find((s: any) => s.epic_id);
    if (withEpic) {
      expect(withEpic.epic_title).toBeDefined();
    }
  });

  it('returns story by ID with checks', async () => {
    const { body: list } = await apiGet('/api/stories');
    if (list.rows.length > 0) {
      const { status, body } = await apiGet(`/api/stories/${list.rows[0].id}`);
      expect(status).toBe(200);
      expect(Array.isArray(body.checks)).toBe(true);
    }
  });

  it('updates story priority', async () => {
    const { body: list } = await apiGet('/api/stories');
    const story = list.rows.find((s: any) => s.status === 'generated');
    if (story) {
      const { status, body } = await apiPut(`/api/stories/${story.id}`, { priority: 'high' });
      expect(status).toBe(200);
      expect(body.priority).toBe('high');
    }
  });

  it('rejects confirm without epic', async () => {
    const { body: list } = await apiGet('/api/stories');
    const noEpic = list.rows.find((s: any) => !s.epic_id && !['confirmed', 'rejected'].includes(s.status));
    if (noEpic) {
      const { status } = await apiPost(`/api/stories/${noEpic.id}/confirm`);
      expect(status).toBe(400);
    }
  });
});
