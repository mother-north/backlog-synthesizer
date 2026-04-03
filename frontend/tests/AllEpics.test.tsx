import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import AllEpics from '../src/pages/AllEpics';

vi.mock('../src/services/api', () => ({
  epicsApi: {
    getAll: vi.fn().mockResolvedValue({ data: { rows: [
      { id: 1, external_id: 'ERIS-001', title: 'Risk Assessment', is_proposed: false, status: 'active', story_count: 5 },
      { id: 2, external_id: 'NEW-001', title: 'New Feature Area', is_proposed: true, status: 'proposed', story_count: 2, proposed_by_meeting: 1, proposed_by_meeting_title: 'Meeting 1' },
    ] } }),
    approve: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
  },
}));

function renderEpics() {
  return render(
    <MemoryRouter>
      <App>
        <AllEpics />
      </App>
    </MemoryRouter>
  );
}

describe('AllEpics', () => {
  it('renders epics table', async () => {
    renderEpics();
    await waitFor(() => {
      expect(screen.getByText('Risk Assessment')).toBeInTheDocument();
      expect(screen.getByText('New Feature Area')).toBeInTheDocument();
    });
  });

  it('shows approve/reject for proposed epics', async () => {
    renderEpics();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
  });

  it('renders page heading', async () => {
    renderEpics();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Epics');
    });
  });

  it('shows external IDs', async () => {
    renderEpics();
    await waitFor(() => {
      expect(screen.getByText('ERIS-001')).toBeInTheDocument();
      expect(screen.getByText('NEW-001')).toBeInTheDocument();
    });
  });
});
