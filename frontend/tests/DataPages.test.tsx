import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('../src/services/api', () => ({
  dataApi: {
    getBacklog: vi.fn().mockResolvedValue({ data: { rows: [
      { id: 1, external_id: 'ERIS-001', title: 'Risk Engine', type: 'epic', status: 'open', priority: 'high' },
    ], total: 1 } }),
    getArchitecture: vi.fn().mockResolvedValue({ data: [
      { id: 1, content: '# Architecture\n\n## Overview\nSystem architecture doc.', version: 1, created_at: '2025-01-01' },
    ] }),
    uploadBacklog: vi.fn().mockResolvedValue({}),
    uploadArchitecture: vi.fn().mockResolvedValue({}),
    downloadBacklog: vi.fn().mockResolvedValue({ data: new Blob() }),
  },
  menuAccessApi: { getMyAccess: vi.fn().mockResolvedValue({ data: { rows: [] } }) },
  accessLogApi: { log: vi.fn().mockResolvedValue({}) },
}));

import BacklogData from '../src/pages/data/BacklogData';
import ArchitectureData from '../src/pages/data/ArchitectureData';

function wrap(component: React.ReactNode) {
  return render(<MemoryRouter><App>{component}</App></MemoryRouter>);
}

describe('BacklogData', () => {
  it('renders backlog heading', async () => {
    wrap(<BacklogData />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Backlog Data');
    });
  });

  it('renders backlog items', async () => {
    wrap(<BacklogData />);
    await waitFor(() => {
      expect(screen.getByText('ERIS-001')).toBeInTheDocument();
      expect(screen.getByText('Risk Engine')).toBeInTheDocument();
    });
  });
});

describe('ArchitectureData', () => {
  it('renders architecture heading', async () => {
    wrap(<ArchitectureData />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Architecture');
    });
  });
});
