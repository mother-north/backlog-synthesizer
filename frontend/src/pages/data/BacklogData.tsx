import { useState, useEffect } from 'react';
import { Table, Button, Upload, Select, Input, Tag, Skeleton, Empty, App, Modal, Descriptions } from 'antd';
import { UploadOutlined, DownloadOutlined, CloudUploadOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
// table types handled by antd internally
import { dataApi } from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';

interface BacklogItem {
  id: number;
  external_id: string;
  type: string;
  title: string;
  description: string | null;
  epic_id: string | null;
  status: string;
  priority: string | null;
  labels: string[] | null;
  acceptance_criteria: string[] | null;
  dependencies: string[] | null;
}

const TYPE_COLORS: Record<string, string> = {
  epic: 'purple', story: 'blue', bug: 'red', improvement: 'green', task: 'default',
};

const STATUS_COLORS: Record<string, string> = {
  backlog: 'default', in_progress: 'processing', done: 'success', blocked: 'error',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'red', high: 'orange', medium: 'blue', low: 'default',
};

export default function BacklogData() {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [viewItem, setViewItem] = useState<BacklogItem | null>(null);
  const { message } = App.useApp();

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (typeFilter !== 'all') params.type = typeFilter;
      if (search) params.search = search;
      const res = await dataApi.getBacklog(params);
      setItems(res.data?.rows || res.data || []);
    } catch {
      message.error('Failed to load backlog data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [typeFilter]);

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const res = await dataApi.uploadBacklog(pendingFile);
      message.success(`Backlog data uploaded - ${res.data.count || res.data.inserted || 0} items loaded`);
      setPendingFile(null);
      fetchData();
    } catch {
      message.error('Failed to upload backlog data');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await dataApi.downloadBacklog();
      const blob = new Blob([typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backlog.json';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download backlog');
    }
  };

  // Derive unique values for column filters
  const epicOptions = Array.from(new Set(items.map(i => i.epic_id).filter(Boolean))) as string[];
  const statusOptions = Array.from(new Set(items.map(i => i.status).filter(Boolean)));
  const priorityOptions = Array.from(new Set(items.map(i => i.priority).filter(Boolean))) as string[];

  const columns: ColumnsType<BacklogItem> = [
    {
      title: 'ID',
      dataIndex: 'external_id',
      key: 'id',
      width: 100,
      sorter: (a, b) => (a.external_id || '').localeCompare(b.external_id || ''),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      filters: ['epic', 'story', 'bug', 'improvement', 'task'].map(t => ({ text: t, value: t })),
      onFilter: (value, record) => record.type === value,
      render: (type: string) => <Tag color={TYPE_COLORS[type] || 'default'}>{type}</Tag>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: (a, b) => (a.title || '').localeCompare(b.title || ''),
      ellipsis: true,
    },
    {
      title: 'Epic',
      dataIndex: 'epic_id',
      key: 'epic',
      width: 110,
      filters: epicOptions.map(e => ({ text: e, value: e })),
      onFilter: (value, record) => record.epic_id === value,
      render: (v: string) => v || <span style={{ color: 'var(--gray-400)' }}>—</span>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      filters: priorityOptions.map(p => ({ text: p, value: p })),
      onFilter: (value, record) => record.priority === value,
      render: (p: string) => p ? <Tag color={PRIORITY_COLORS[p] || 'default'}>{p}</Tag> : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      filters: statusOptions.map(s => ({ text: s, value: s })),
      onFilter: (value, record) => record.status === value,
      render: (status: string) => <Tag color={STATUS_COLORS[status] || 'default'}>{status}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: BacklogItem) => (
        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setViewItem(record)} />
      ),
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">
        <a>Data</a> <span>&gt;</span> Backlog Data
      </div>
      <div className="bs-page-header">
        <div>
          <h1 className="bs-page-title">Backlog Data</h1>
          {items.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>Items: {items.length}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Upload
            accept=".json"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              setPendingFile(file);
              setShowConfirm(true);
              return false;
            }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>Upload JSON</Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={items.length === 0}>
            Download
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input
          placeholder="Search by title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onPressEnter={fetchData}
          style={{ width: 250 }}
          allowClear
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 150 }}
          options={[
            { value: 'all', label: 'Type: All' },
            { value: 'epic', label: 'Epic' },
            { value: 'story', label: 'Story' },
            { value: 'bug', label: 'Bug' },
            { value: 'improvement', label: 'Improvement' },
            { value: 'task', label: 'Task' },
          ]}
        />
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : items.length === 0 ? (
        <Empty
          image={<CloudUploadOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No backlog loaded"
        >
          <Upload
            accept=".json"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => { setPendingFile(file); setShowConfirm(true); return false; }}
          >
            <Button type="primary">Upload Backlog JSON</Button>
          </Upload>
        </Empty>
      ) : (
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} items` }}
          onRow={(record) => ({
            onDoubleClick: () => setViewItem(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}

      {/* View Item Detail Modal */}
      <Modal
        title={viewItem ? `${viewItem.external_id}: ${viewItem.title}` : ''}
        open={!!viewItem}
        onCancel={() => setViewItem(null)}
        footer={<Button onClick={() => setViewItem(null)}>Close</Button>}
        width={700}
        destroyOnHidden
      >
        {viewItem && (
          <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="ID">{viewItem.external_id}</Descriptions.Item>
            <Descriptions.Item label="Type">
              <Tag color={TYPE_COLORS[viewItem.type] || 'default'}>{viewItem.type}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Title" span={2}>{viewItem.title}</Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>
              {viewItem.description || <span style={{ color: 'var(--gray-400)' }}>No description</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Epic">{viewItem.epic_id || '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_COLORS[viewItem.status] || 'default'}>{viewItem.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Priority">
              {viewItem.priority ? <Tag color={PRIORITY_COLORS[viewItem.priority]}>{viewItem.priority}</Tag> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Labels">
              {viewItem.labels && viewItem.labels.length > 0
                ? viewItem.labels.map(l => <Tag key={l} style={{ marginBottom: 2 }}>{l}</Tag>)
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Acceptance Criteria" span={2}>
              {viewItem.acceptance_criteria && viewItem.acceptance_criteria.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {viewItem.acceptance_criteria.map((ac, i) => <li key={i}>{ac}</li>)}
                </ul>
              ) : <span style={{ color: 'var(--gray-400)' }}>None</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Dependencies" span={2}>
              {viewItem.dependencies && viewItem.dependencies.length > 0
                ? viewItem.dependencies.map(d => <Tag key={d} color="blue">{d}</Tag>)
                : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <ConfirmDialog
        open={showConfirm}
        title="Upload Backlog Data"
        message="Replace all backlog data? This cannot be undone."
        onConfirm={() => { setShowConfirm(false); handleUpload(); }}
        onCancel={() => { setShowConfirm(false); setPendingFile(null); }}
        confirmText="Upload"
        danger
        loading={uploading}
      />
    </div>
  );
}
