import { useState } from 'react';
import { Input, Checkbox, Button, Skeleton, Empty, Tag, App } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { kbApi } from '../services/api';

interface SearchResult {
  id: number;
  content_type: string;
  content_text: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

const CONTENT_TYPES = [
  { value: 'meeting_summary', label: 'Meetings' },
  { value: 'decision', label: 'Decisions' },
  { value: 'story', label: 'Stories' },
  { value: 'architecture', label: 'Architecture' },
];

const TYPE_ICONS: Record<string, string> = {
  meeting_summary: 'Meeting Summary',
  decision: 'Decision',
  story: 'Story',
  architecture: 'Architecture',
};

export default function KnowledgeBase() {
  const [query, setQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['meeting_summary', 'decision', 'story', 'architecture']);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { message } = App.useApp();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await kbApi.search(query, selectedTypes);
      setResults(res.data);
    } catch {
      message.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="bs-breadcrumbs">Knowledge Base</div>
      <h1 className="bs-page-title" style={{ marginBottom: 20 }}>Knowledge Base</h1>

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <Input
            placeholder="Search knowledge base..."
            prefix={<SearchOutlined />}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onPressEnter={handleSearch}
            style={{ flex: 1 }}
            size="large"
          />
          <Button type="primary" size="large" onClick={handleSearch} loading={loading}>
            Search
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {CONTENT_TYPES.map(ct => (
            <Checkbox
              key={ct.value}
              checked={selectedTypes.includes(ct.value)}
              onChange={e => {
                setSelectedTypes(prev =>
                  e.target.checked ? [...prev, ct.value] : prev.filter(t => t !== ct.value)
                );
              }}
            >
              {ct.label}
            </Checkbox>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !searched ? (
        <Empty
          image={<SearchOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="Knowledge base is empty"
        >
          <span style={{ color: 'var(--text-sec)' }}>Process meetings to build the knowledge base</span>
        </Empty>
      ) : results.length === 0 ? (
        <Empty description="No results found for your search" />
      ) : (
        <div>
          {results.map(result => (
            <div
              key={result.id}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Tag color="blue">{TYPE_ICONS[result.content_type] || result.content_type}</Tag>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                  {Math.round(result.similarity * 100)}% match
                </span>
              </div>
              <p style={{ color: 'var(--text)', lineHeight: 1.6, margin: 0, fontSize: 14 }}>
                {result.content_text?.slice(0, 300)}{result.content_text?.length > 300 ? '...' : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
