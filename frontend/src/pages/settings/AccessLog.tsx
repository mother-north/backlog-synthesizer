import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Popconfirm, App, Typography } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { accessLogApi } from '../../services/api';

const { Text } = Typography;

interface LogEntry {
  id: number;
  entity_type: string;
  action: string;
  new_value: any;
  user_id: number;
  user_email?: string;
  created_at: string;
}

export default function AccessLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { message } = App.useApp();

  useEffect(() => { fetchLog(); }, []);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const res = await accessLogApi.getAll();
      setEntries(res.data?.rows || res.data || []);
    } catch {
      message.error('Failed to fetch activity log');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await accessLogApi.clear();
      setEntries([]);
      message.success('Activity log cleared');
    } catch {
      message.error('Failed to clear activity log');
    } finally {
      setClearing(false);
    }
  };

  const uniqueActions = useMemo(() =>
    [...new Set(entries.map(e => e.action))].sort().map(v => ({ text: v, value: v })),
    [entries]
  );
  const uniqueTypes = useMemo(() =>
    [...new Set(entries.map(e => e.entity_type))].sort().map(v => ({ text: v, value: v })),
    [entries]
  );

  const columns: ColumnType<LogEntry>[] = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'time',
      width: 180,
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
      render: (d: string) => new Date(d).toLocaleString(),
    },
    {
      title: 'Entity',
      dataIndex: 'entity_type',
      key: 'entity',
      width: 120,
      filters: uniqueTypes,
      onFilter: (value, record) => record.entity_type === value,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 180,
      sorter: (a, b) => a.action.localeCompare(b.action),
      filters: uniqueActions,
      onFilter: (value, record) => record.action === value,
    },
    {
      title: 'Details',
      dataIndex: 'new_value',
      key: 'details',
      ellipsis: true,
      render: (v: any) => {
        if (!v) return '—';
        const str = typeof v === 'string' ? v : JSON.stringify(v);
        return <Text code style={{ fontSize: 11 }}>{str.slice(0, 120)}{str.length > 120 ? '...' : ''}</Text>;
      },
    },
    {
      title: 'User',
      dataIndex: 'user_email',
      key: 'user',
      width: 200,
      render: (v: string, record: LogEntry) => v || `User #${record.user_id || '—'}`,
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">
        <a>Settings</a> <span>&gt;</span> Activity Log
      </div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Activity Log</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={fetchLog} loading={loading}>
            Refresh
          </Button>
          <Popconfirm
            title="Clear all log entries?"
            description="This will permanently delete all activity log records."
            onConfirm={handleClear}
            okText="Clear"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button danger icon={<DeleteOutlined />} loading={clearing}>
              Clear
            </Button>
          </Popconfirm>
        </div>
      </div>

      <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-100)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--gray-600)' }}>
        Tracks all system activity: story confirmations, check resolutions, pipeline runs, data uploads, and page views.
        {entries.length > 0 && (
          <span style={{ marginLeft: 8 }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}, newest first
          </span>
        )}
      </div>

      <Table
        loading={loading}
        dataSource={entries}
        columns={columns}
        rowKey="id"
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} entries` }}
        locale={{ emptyText: 'No activity log entries yet' }}
      />
    </div>
  );
}
