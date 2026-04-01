import { useState, useEffect } from 'react';
import { Table, Button, Upload, Select, Input, Tag, Skeleton, Empty, App } from 'antd';
import { UploadOutlined, DownloadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { dataApi } from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';

interface BacklogItem {
  id: number;
  external_id: string;
  type: string;
  title: string;
  epic_id: string;
  status: string;
}

const TYPE_COLORS: Record<string, string> = {
  epic: 'purple', story: 'blue', bug: 'red', improvement: 'green', task: 'default',
};

export default function BacklogData() {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const { message } = App.useApp();

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (typeFilter !== 'all') params.type = typeFilter;
      if (search) params.search = search;
      const res = await dataApi.getBacklog(params);
      setItems(res.data);
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
      message.success(`Backlog data uploaded - ${res.data.count || 0} items loaded`);
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
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backlog.json';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('Failed to download backlog');
    }
  };

  const columns: ColumnsType<BacklogItem> = [
    { title: 'ID', dataIndex: 'external_id', key: 'id', width: 100 },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color={TYPE_COLORS[type] || 'default'}>{type}</Tag>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: (a, b) => a.title.localeCompare(b.title),
    },
    { title: 'Epic', dataIndex: 'epic_id', key: 'epic', render: (v: string) => v || '-' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag>{status}</Tag>,
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
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onPressEnter={fetchData}
          style={{ width: 200 }}
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
          pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} items` }}
        />
      )}

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
