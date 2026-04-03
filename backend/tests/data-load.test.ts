import { apiGet } from './helpers';

describe('Data Load API', () => {
  describe('Backlog', () => {
    it('returns paginated backlog items', async () => {
      const { status, body } = await apiGet('/api/data/backlog');
      expect(status).toBe(200);
      expect(Array.isArray(body.rows || body)).toBe(true);
    });

    it('filters by type', async () => {
      const { status, body } = await apiGet('/api/data/backlog?type=epic');
      expect(status).toBe(200);
      const rows = body.rows || body;
      for (const item of rows) {
        expect(item.type).toBe('epic');
      }
    });

    it('searches by keyword', async () => {
      const { status } = await apiGet('/api/data/backlog?search=test');
      expect(status).toBe(200);
    });

    it('respects limit', async () => {
      const { status, body } = await apiGet('/api/data/backlog?limit=2');
      expect(status).toBe(200);
      const rows = body.rows || body;
      expect(rows.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Architecture', () => {
    it('returns architecture document', async () => {
      const { status, body } = await apiGet('/api/data/architecture');
      expect(status).toBe(200);
    });
  });
});
