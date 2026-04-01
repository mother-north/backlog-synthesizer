import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Select, Tag, Skeleton, Empty, App } from 'antd';
import {
  WarningOutlined,
  PlusCircleOutlined,
  CheckCircleOutlined,
  SwapOutlined,
  LinkOutlined,
  BellOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { checksApi } from '../services/api';
import { useAuthStore } from '../store/auth';

interface Action {
  type: string;
  item: string;
  story_id?: number;
  check_id?: number;
  meeting_id: number;
  meeting: string;
  created_at: string;
  routed_to: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  priority: <WarningOutlined style={{ color: 'var(--warning)' }} />,
  new_epic: <PlusCircleOutlined style={{ color: 'var(--accent)' }} />,
  confirmation: <CheckCircleOutlined style={{ color: 'var(--success)' }} />,
  overlap: <SwapOutlined style={{ color: 'var(--warning)' }} />,
  dependency: <LinkOutlined style={{ color: 'var(--accent)' }} />,
  architecture: <WarningOutlined style={{ color: 'var(--error)' }} />,
  no_epic: <WarningOutlined style={{ color: 'var(--error)' }} />,
};

export default function ActionList() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [meetingFilter, setMeetingFilter] = useState<string>('all');
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { message } = App.useApp();

  useEffect(() => {
    setLoading(true);
    checksApi.getActions().then(res => {
      setActions(res.data?.rows || res.data || []);
    }).catch(() => {
      message.error('Failed to load actions');
    }).finally(() => setLoading(false));
  }, [message]);

  const filtered = actions.filter(a => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    if (meetingFilter !== 'all' && String(a.meeting_id) !== meetingFilter) return false;
    return true;
  });

  const meetingOptions = Array.from(new Map(actions.map(a => [a.meeting_id, a.meeting || `Meeting ${a.meeting_id}`])));

  const columns: ColumnsType<Action> = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      filters: Array.from(new Set(filtered.map(a => a.type))).filter(Boolean).map(v => ({ text: (v || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), value: v })),
      onFilter: (value, record) => record.type === value,
      render: (type: string) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {TYPE_ICONS[type] || <WarningOutlined />}
          <span>{(type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
        </span>
      ),
    },
    {
      title: 'Story / Item',
      dataIndex: 'item',
      key: 'story',
      render: (title: string) => <span style={{ fontWeight: 500 }}>{title || '-'}</span>,
    },
    {
      title: 'Meeting',
      dataIndex: 'meeting',
      key: 'meeting',
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'date',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
      render: (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
    {
      title: 'Role',
      dataIndex: 'routed_to',
      key: 'role',
      filters: Array.from(new Set(filtered.map(a => a.routed_to))).filter(Boolean).map(v => ({ text: v, value: v })),
      onFilter: (value, record) => record.routed_to === value,
      render: (role: string) => <Tag color="blue">{role}</Tag>,
    },
    {
      title: '',
      key: 'go',
      width: 60,
      render: () => <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>Go</span>,
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">Action List</div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">
          Action List
          {user?.roles && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-sec)', marginLeft: 8 }}>(showing: {user.roles.join(', ')})</span>}
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 180 }}
          options={[
            { value: 'all', label: 'Type: All' },
            ...Array.from(new Set(actions.map(a => a.type).filter(Boolean))).map(t => ({
              value: t,
              label: (t || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            })),
          ]}
        />
        <Select
          value={meetingFilter}
          onChange={setMeetingFilter}
          style={{ width: 200 }}
          options={[
            { value: 'all', label: 'Meeting: All' },
            ...meetingOptions.map(([id, title]) => ({ value: String(id), label: title })),
          ]}
        />
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : filtered.length === 0 ? (
        <Empty
          image={<BellOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No pending actions - you're all caught up!"
        />
      ) : (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey={(record) => `${record.type}-${record.check_id || ''}-${record.story_id || ''}-${record.meeting_id}-${record.created_at}`}
          onRow={(record) => ({
            onClick: () => navigate(`/meetings/${record.meeting_id}?story=${record.story_id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} items` }}
        />
      )}
    </div>
  );
}
