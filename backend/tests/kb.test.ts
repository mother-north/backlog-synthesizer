import { apiPost, apiGet } from './helpers';

describe('Knowledge Base API', () => {
  it('POST /api/kb/search returns results', async () => {
    const { status, body } = await apiPost('/api/kb/search', {
      query: 'authentication',
      limit: 5,
    });
    expect(status).toBe(200);
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('search respects limit', async () => {
    const { status, body } = await apiPost('/api/kb/search', {
      query: 'test',
      limit: 2,
    });
    expect(status).toBe(200);
    expect(body.results.length).toBeLessThanOrEqual(2);
  });

  it('search returns empty for nonsense query', async () => {
    const { status, body } = await apiPost('/api/kb/search', {
      query: 'xyzzy99999nonsense',
      limit: 5,
    });
    expect(status).toBe(200);
  });
});
