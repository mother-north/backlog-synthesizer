import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import Dashboard from '../src/pages/Dashboard';

// Mock the API
vi.mock('../src/services/api', () => ({
  dashboardApi: {
    getStats: vi.fn().mockResolvedValue({
      data: {
        meetings: { total: 10, processing: 1, in_review: 3, completed: 6 },
        stories: { total: 50, confirmed: 20, rejected: 5 },
        checksByRole: [{ routed_to: 'PM', count: 3 }],
        storiesByMeeting: [{ meeting: 'Meeting 1', count: 8 }],
        checkTypes: [{ type: 'overlap', count: 5 }],
        recentActivity: [],
      },
    }),
    getCharts: vi.fn().mockResolvedValue({
      data: {
        stories_by_meeting: [],
        confirmation_rate: [],
        check_types: [],
      },
    }),
  },
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <App>
        <Dashboard />
      </App>
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  it('renders meeting stats', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Total meetings
      expect(screen.getByText('3')).toBeInTheDocument();  // In Review
      expect(screen.getByText('6')).toBeInTheDocument();  // Completed
    });
  });

  it('renders story stats', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument(); // Total stories
      expect(screen.getByText('20')).toBeInTheDocument(); // Confirmed
      expect(screen.getByText('5')).toBeInTheDocument();  // Rejected
    });
  });

  it('renders section headers', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Meetings')).toBeInTheDocument();
      expect(screen.getByText('Stories')).toBeInTheDocument();
    });
  });

  it('renders card labels', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText('Total').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('In Review').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Confirmed')).toBeInTheDocument();
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });
  });
});
