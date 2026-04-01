import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Popconfirm, App, Typography } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { accessLogApi } from '../../services/api';

const { Text } = Typography;

interface LogEntry {
  id: number;
  action: string;       // menu path (e.g. "Meetings" or "Settings > Users")
  new_value: { ip?: string } | null;
  user_email: string;
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

  const uniqueUsers = useMemo(() =>
    [...new Set(entries.map(e => e.user_email).filter(Boolean))].sort().map(v => ({ text: v, value: v })),
    [entries]
  );
  const uniqueMenus = useMemo(() =>
    [...new Set(entries.map(e => e.action).filter(Boolean))].sort().map(v => ({ text: v, value: v })),
    [entries]
  );
  const uniqueIps = useMemo(() =>
    [...new Set(entries.map(e => e.new_value?.ip).filter(Boolean))].sort().map(v => ({ text: v!, value: v! })),
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
      title: 'User',
      dataIndex: 'user_email',
      key: 'user',
      width: 240,
      sorter: (a, b) => (a.user_email || '').localeCompare(b.user_email || ''),
      filters: uniqueUsers,
      filterSearch: true,
      onFilter: (value, record) => record.user_email === value,
    },
    {
      title: 'IP Address',
      key: 'ip',
      width: 140,
      filters: uniqueIps,
      onFilter: (value, record) => record.new_value?.ip === value,
      render: (_: unknown, record: LogEntry) => {
        const ip = record.new_value?.ip;
        return ip ? <Text code style={{ fontSize: 12 }}>{ip}</Text> : '—';
      },
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      sorter: (a, b) => (a.action || '').localeCompare(b.action || ''),
      filters: uniqueMenus,
      filterSearch: true,
      onFilter: (value, record) => record.action === value,
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
        Tracks user navigation events. Admin-only view.
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
