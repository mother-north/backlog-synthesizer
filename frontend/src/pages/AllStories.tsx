import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Select, Tag, Skeleton, Tooltip, Empty, App } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { storiesApi } from '../services/api';
import { statusColors, confidenceColors, groundingColors } from '../theme';

interface Story {
  id: number;
  title: string;
  type: string;
  status: string;
  confidence: string;
  grounding_status: string;
  meeting_id: number;
  meeting_title?: string;
  meeting_date?: string;
  open_checks: number;
  epic_title?: string;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const TYPE_COLORS: Record<string, string> = {
  feature: 'blue', bug: 'red', improvement: 'green', task: 'default', nfr: 'purple', tech_debt: 'orange',
};

export default function AllStories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const navigate = useNavigate();
  const { message } = App.useApp();

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (typeFilter !== 'all') params.type = typeFilter;
    storiesApi.getAll(params).then(res => {
      setStories(res.data?.rows || res.data || []);
    }).catch(() => {
      message.error('Failed to load stories');
    }).finally(() => setLoading(false));
  }, [statusFilter, typeFilter, message]);

  const columns: ColumnsType<Story> = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      filters: Array.from(new Set(stories.map(s => s.status))).filter(Boolean).map(v => ({ text: formatStatus(v), value: v })),
      onFilter: (value, record) => record.status === value,
      render: (status: string) => (
        <span className="status-badge" style={{
          background: `${statusColors[status] || 'var(--gray-400)'}20`,
          color: statusColors[status] || 'var(--gray-400)',
        }}>
          {formatStatus(status)}
        </span>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (title: string) => <span style={{ fontWeight: 500 }}>{title}</span>,
    },
    {
      title: 'Meeting',
      dataIndex: 'meeting_title',
      key: 'meeting',
      filters: Array.from(new Set(stories.map(s => s.meeting_title))).filter(Boolean).map(v => ({ text: v as string, value: v as string })),
      onFilter: (value, record) => record.meeting_title === value,
    },
    {
      title: 'Date',
      dataIndex: 'meeting_date',
      key: 'date',
      sorter: (a, b) => new Date(a.meeting_date || '').getTime() - new Date(b.meeting_date || '').getTime(),
      render: (date: string) => date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      filters: Array.from(new Set(stories.map(s => s.type))).filter(Boolean).map(v => ({ text: v, value: v })),
      onFilter: (value, record) => record.type === value,
      render: (type: string) => <Tag color={TYPE_COLORS[type] || 'default'}>{type}</Tag>,
    },
    {
      title: 'Confidence',
      dataIndex: 'confidence',
      key: 'confidence',
      filters: Array.from(new Set(stories.map(s => s.confidence))).filter(Boolean).map(v => ({ text: v, value: v })),
      onFilter: (value, record) => record.confidence === value,
      render: (c: string) => (
        <Tooltip title={c}>
          <span className="confidence-dot" style={{ background: confidenceColors[c] || 'var(--gray-400)' }} />
        </Tooltip>
      ),
    },
    {
      title: 'Grounding',
      dataIndex: 'grounding_status',
      key: 'grounding',
      render: (g: string) => (
        <Tooltip title={g}>
          {g === 'valid' ? <CheckCircleOutlined style={{ color: groundingColors.valid }} /> :
           g === 'warning' ? <WarningOutlined style={{ color: groundingColors.warning }} /> :
           <CloseCircleOutlined style={{ color: groundingColors.invalid }} />}
        </Tooltip>
      ),
    },
    {
      title: 'Checks',
      dataIndex: 'open_checks',
      key: 'checks',
      render: (count: number) =>
        count === 0 ? <span style={{ color: 'var(--gray-400)' }}>0</span> :
        <Tag color="warning">{count}</Tag>,
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">All Stories</div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">All Stories</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 180 }}
          options={[
            { value: 'all', label: 'All Statuses' },
            { value: 'generated', label: 'Generated' },
            { value: 'under_review', label: 'Under Review' },
            { value: 'awaiting_confirmation', label: 'Awaiting Confirmation' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'pending_decision', label: 'Pending Decision' },
          ]}
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: 'All Types' },
            { value: 'feature', label: 'Feature' },
            { value: 'bug', label: 'Bug' },
            { value: 'improvement', label: 'Improvement' },
            { value: 'task', label: 'Task' },
            { value: 'nfr', label: 'NFR' },
            { value: 'tech_debt', label: 'Tech Debt' },
          ]}
        />
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : stories.length === 0 ? (
        <Empty
          image={<UnorderedListOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No stories generated yet"
        >
          <span style={{ color: 'var(--text-sec)' }}>Upload a meeting transcript to get started</span>
        </Empty>
      ) : (
        <Table
          dataSource={stories}
          columns={columns}
          rowKey="id"
          onRow={(record) => ({
            onClick: () => navigate(`/meetings/${record.meeting_id}?story=${record.id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} items` }}
        />
      )}
    </div>
  );
}
