import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import KnowledgeBase from '../src/pages/KnowledgeBase';

vi.mock('../src/services/api', () => ({
  kbApi: { search: vi.fn().mockResolvedValue({ data: { results: [] } }) },
}));

function renderKB() {
  return render(<MemoryRouter><App><KnowledgeBase /></App></MemoryRouter>);
}

describe('KnowledgeBase', () => {
  it('renders search input', () => {
    renderKB();
    expect(screen.getByPlaceholderText(/search/i) || screen.getByRole('searchbox') || document.querySelector('input')).toBeTruthy();
  });

  it('renders page heading', () => {
    renderKB();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Knowledge Base');
  });
});
