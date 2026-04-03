import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from 'antd';
import StoryCard from '../src/components/StoryCard';

vi.mock('../src/services/api', () => ({
  storiesApi: { update: vi.fn().mockResolvedValue({}), confirm: vi.fn(), reject: vi.fn() },
  dataApi: { getBacklog: vi.fn().mockResolvedValue({ data: [] }) },
  epicsApi: { approve: vi.fn(), reject: vi.fn() },
}));

const epics = [
  { id: 1, title: 'Risk Assessment', external_id: 'ERIS-001', is_proposed: false },
  { id: 2, title: 'New Epic', external_id: 'NEW-001', is_proposed: true },
];

const baseStory = {
  id: 1, title: 'Test Story', description: 'A test story', type: 'feature',
  status: 'generated', confidence: 'high', grounding_status: 'valid',
  acceptance_criteria: ['AC1', 'AC2'], source_citation: 'We need this',
  speaker: 'Sarah (PM)', priority: 'high', epic_id: 1, checks: [],
  feature_tags: ['auth'],
};

function renderCard(overrides = {}) {
  return render(
    <App>
      <StoryCard
        story={{ ...baseStory, ...overrides } as any}
        epics={epics}
        onUpdate={vi.fn()}
        userRoles={['Admin']}
      />
    </App>
  );
}

describe('StoryCard', () => {
  it('renders description', () => {
    renderCard();
    expect(screen.getByText('A test story')).toBeInTheDocument();
  });

  it('renders acceptance criteria', () => {
    renderCard();
    expect(screen.getByText('AC1')).toBeInTheDocument();
    expect(screen.getByText('AC2')).toBeInTheDocument();
  });

  it('renders source citation with speaker', () => {
    renderCard();
    expect(screen.getByText('Sarah (PM)')).toBeInTheDocument();
  });

  it('renders grounding status', () => {
    renderCard();
    expect(screen.getByText(/Valid/)).toBeInTheDocument();
  });

  it('renders confidence', () => {
    renderCard();
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('shows epic selector when not confirmed', () => {
    renderCard({ status: 'generated' });
    // Epic dropdown should be present (ant-select element)
    expect(document.querySelector('.ant-select')).toBeTruthy();
  });

  it('shows read-only epic when confirmed', () => {
    renderCard({ status: 'confirmed' });
    expect(screen.queryByText(/Select epic/)).not.toBeInTheDocument();
    expect(screen.getByText('Risk Assessment')).toBeInTheDocument();
  });

  it('shows criticality for non-confirmed story', () => {
    renderCard({ status: 'generated', priority: 'critical' });
    // Should render as dropdown since not confirmed
    expect(document.querySelector('.ant-select')).toBeTruthy();
  });

  it('shows edit button when not confirmed', () => {
    renderCard({ status: 'generated' });
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('hides edit button when confirmed', () => {
    renderCard({ status: 'confirmed' });
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('renders checks when present', () => {
    renderCard({
      checks: [{ id: 1, check_type: 'overlap', details: 'Overlaps with ERIS-042', proposed_resolution: 'Merge', routed_to: 'PM', status: 'open' }],
    });
    expect(screen.getByText(/1 open/)).toBeInTheDocument();
  });
});
