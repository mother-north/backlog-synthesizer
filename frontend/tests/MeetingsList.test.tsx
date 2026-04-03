import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import MeetingsList from '../src/pages/MeetingsList';

vi.mock('../src/services/api', () => ({
  meetingsApi: {
    getAll: vi.fn().mockResolvedValue({ data: { rows: [
      { id: 1, title: 'Kickoff Meeting', status: 'in_review', created_at: '2025-07-14', story_count: 6, confirmed_count: 2, open_checks: 3 },
      { id: 2, title: 'Sprint Review', status: 'completed', created_at: '2025-07-21', story_count: 10, confirmed_count: 10, open_checks: 0 },
      { id: 3, title: 'New Upload', status: 'uploaded', created_at: '2025-07-28', story_count: 0, confirmed_count: 0, open_checks: 0 },
    ] } }),
    upload: vi.fn().mockResolvedValue({ data: { id: 99 } }),
    remove: vi.fn().mockResolvedValue({}),
  },
}));

function renderMeetings() {
  return render(
    <MemoryRouter>
      <App>
        <MeetingsList />
      </App>
    </MemoryRouter>
  );
}

describe('MeetingsList', () => {
  it('renders meetings table', async () => {
    renderMeetings();
    await waitFor(() => {
      expect(screen.getByText('Kickoff Meeting')).toBeInTheDocument();
    });
  });

  it('renders filter buttons', async () => {
    renderMeetings();
    await waitFor(() => {
      expect(screen.getByText(/In Review/)).toBeInTheDocument();
      expect(screen.getByText(/Completed/)).toBeInTheDocument();
      expect(screen.getByText(/Uploaded/)).toBeInTheDocument();
      expect(screen.getByText(/All/)).toBeInTheDocument();
    });
  });

  it('renders upload button', async () => {
    renderMeetings();
    await waitFor(() => {
      expect(screen.getByText('Upload Transcript')).toBeInTheDocument();
    });
  });

  it('renders page heading', async () => {
    renderMeetings();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Meetings');
    });
  });
});
