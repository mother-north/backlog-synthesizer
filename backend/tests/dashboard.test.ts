import { apiGet } from './helpers';

describe('Dashboard API', () => {
  it('returns dashboard metrics', async () => {
    const { status, body } = await apiGet('/api/dashboard');
    expect(status).toBe(200);
    expect(body.meetings).toBeDefined();
    expect(body.stories).toBeDefined();
  });

  it('meetings stats have expected fields', async () => {
    const { body } = await apiGet('/api/dashboard');
    expect(body.meetings).toHaveProperty('total');
    expect(body.meetings).toHaveProperty('in_review');
    expect(body.meetings).toHaveProperty('completed');
  });

  it('stories stats have expected fields', async () => {
    const { body } = await apiGet('/api/dashboard');
    expect(body.stories).toHaveProperty('total');
    expect(body.stories).toHaveProperty('confirmed');
    expect(body.stories).toHaveProperty('rejected');
  });
});
