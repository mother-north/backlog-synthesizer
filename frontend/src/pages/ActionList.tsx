import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Skeleton, Empty, App } from 'antd';
import {
  BellOutlined,
  LinkOutlined,
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

function formatType(type: string): string {
  return (type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export default function ActionList() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
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

  const columns: ColumnsType<Action> = [
    {
      title: 'ID',
      key: 'id',
      width: 70,
      render: (_: unknown, record: Action) => (
        <span style={{ fontFamily: 'monospace', color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>
          {record.check_id || record.story_id || '—'}
        </span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      filters: Array.from(new Set(actions.map(a => a.type))).filter(Boolean).map(v => ({ text: formatType(v), value: v })),
      onFilter: (value, record) => record.type === value,
      render: (type: string) => <Tag color={type === 'confirmation' ? 'blue' : type === 'overlap' || type === 'priority' ? 'warning' : type === 'architecture' || type === 'no_epic' ? 'error' : 'default'}>{formatType(type)}</Tag>,
    },
    {
      title: 'Story',
      dataIndex: 'item',
      key: 'story',
      ellipsis: true,
      render: (title: string, record: Action) => record.story_id ? (
        <a onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${record.meeting_id}#stories`); }}
          style={{ fontWeight: 500 }}>
          {title || `Story #${record.story_id}`}
        </a>
      ) : (
        <span style={{ fontWeight: 500 }}>{title || '—'}</span>
      ),
    },
    {
      title: 'Meeting',
      key: 'meeting',
      width: 200,
      ellipsis: true,
      filters: Array.from(new Map(actions.map(a => [a.meeting_id, a.meeting || `Meeting #${a.meeting_id}`]))).map(([id, title]) => ({ text: title, value: id })),
      onFilter: (value, record) => record.meeting_id === value,
      render: (_: unknown, record: Action) => (
        <a onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${record.meeting_id}`); }}
          style={{ fontSize: 12 }}>
          <LinkOutlined style={{ marginRight: 4 }} />{record.meeting || `Meeting #${record.meeting_id}`}
        </a>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'routed_to',
      key: 'role',
      width: 100,
      filters: Array.from(new Set(actions.map(a => a.routed_to))).filter(Boolean).map(v => ({ text: v, value: v })),
      onFilter: (value, record) => record.routed_to === value,
      render: (role: string) => <Tag color="blue">{role}</Tag>,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'date',
      width: 100,
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
      render: (date: string) => date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
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

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : actions.length === 0 ? (
        <Empty
          image={<BellOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No pending actions - you're all caught up!"
        />
      ) : (
        <Table
          dataSource={actions}
          columns={columns}
          rowKey={(record) => `${record.type}-${record.check_id || ''}-${record.story_id || ''}-${record.meeting_id}`}
          onRow={(record) => ({
            onClick: () => navigate(`/meetings/${record.meeting_id}#stories`),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} actions` }}
        />
      )}
    </div>
  );
}
