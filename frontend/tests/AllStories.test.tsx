import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import AllStories from '../src/pages/AllStories';

vi.mock('../src/services/api', () => ({
  storiesApi: {
    getAll: vi.fn().mockResolvedValue({ data: { rows: [
      { id: 1, title: 'Story A', type: 'feature', status: 'generated', confidence: 'high', epic_id: 1, epic_title: 'Risk Assessment', meeting_id: 1, meeting_title: 'Meeting 1', source_citation: 'q', speaker: 'Sarah', acceptance_criteria: [], priority: 'high', open_checks: 0 },
      { id: 2, title: 'Story B', type: 'bug', status: 'confirmed', confidence: 'medium', epic_id: 2, epic_title: 'Review Queue', meeting_id: 1, meeting_title: 'Meeting 1', source_citation: 'q', speaker: 'Mike', acceptance_criteria: [], priority: 'medium', open_checks: 0 },
    ] } }),
    getById: vi.fn().mockResolvedValue({ data: { checks: [] } }),
    confirm: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
  },
  epicsApi: {
    getAll: vi.fn().mockResolvedValue({ data: { rows: [
      { id: 1, title: 'Risk Assessment', external_id: 'ERIS-001' },
      { id: 2, title: 'Review Queue', external_id: 'ERIS-002' },
    ] } }),
  },
  meetingsApi: {
    getById: vi.fn().mockResolvedValue({ data: { transcript: 'test' } }),
  },
}));

vi.mock('../src/store/auth', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { user: { roles: ['Admin'], displayName: 'Admin', email: 'admin@test.com' } };
    return selector ? selector(state) : state;
  }),
}));

function renderStories(route = '/stories') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App>
        <AllStories />
      </App>
    </MemoryRouter>
  );
}

describe('AllStories', () => {
  it('renders stories in default view (In Review = generated)', async () => {
    renderStories();
    await waitFor(() => {
      // Story A is 'generated' — should show in default "In Review" view
      expect(screen.getByText('Story A')).toBeInTheDocument();
    });
  });

  it('renders filter radio buttons', async () => {
    renderStories();
    await waitFor(() => {
      expect(screen.getByText(/In Review/)).toBeInTheDocument();
      expect(screen.getByText(/Processed/)).toBeInTheDocument();
      expect(screen.getByText(/All/)).toBeInTheDocument();
    });
  });

  it('renders page heading', async () => {
    renderStories();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Stories');
    });
  });
});
