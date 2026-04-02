import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Modal, Input, Upload, Tag, Skeleton, App, Empty, Radio } from 'antd';
import { UploadOutlined, InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { meetingsApi } from '../services/api';
// theme colors used inline
import ConfirmDialog from '../components/ConfirmDialog';

interface Meeting {
  id: number;
  title: string;
  created_at: string;
  status: string;
  story_count?: number;
  confirmed_count?: number;
  open_checks?: number;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function MeetingsList() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const savedView = localStorage.getItem('meetings_view') || 'all';
  const [view, setView] = useState<string>(savedView);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const handleViewChange = (v: string) => {
    setView(v);
    localStorage.setItem('meetings_view', v);
  };

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await meetingsApi.getAll();
      setMeetings(res.data?.rows || res.data || []);
    } catch {
      message.error('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMeetings(); }, []);

  const handleUpload = async () => {
    if (!uploadTitle.trim()) {
      message.error('Please enter a meeting title');
      return;
    }
    if (!uploadFile && !pasteText.trim()) {
      message.error('Please upload a file or paste transcript text');
      return;
    }
    setUploading(true);
    try {
      const res = await meetingsApi.upload(uploadTitle, uploadFile || undefined, pasteText || undefined);
      message.info(`Processing meeting "${uploadTitle}"...`);
      setUploadOpen(false);
      setUploadTitle('');
      setUploadFile(null);
      setPasteText('');
      fetchMeetings();
      navigate(`/meetings/${res.data.id}`);
    } catch {
      message.error('Failed to upload transcript');
    } finally {
      setUploading(false);
    }
  };

  const columns: ColumnsType<Meeting> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      sorter: (a, b) => a.id - b.id,
      render: (id: number) => <span style={{ fontFamily: 'monospace', color: 'var(--text-sec)' }}>{id}</span>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (title: string) => <span style={{ fontWeight: 500 }}>{title}</span>,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'date',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
      render: (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: Array.from(new Set(meetings.map(m => m.status))).filter(Boolean).map(v => ({ text: formatStatus(v), value: v })),
      onFilter: (value, record) => record.status === value,
      render: (status: string) => (
        <Tag
          color={status === 'completed' ? 'success' : status === 'in_review' ? 'warning' : status === 'processing' ? 'processing' : 'default'}
          style={status === 'processing' ? { animation: 'pulse 2s infinite' } : undefined}
        >
          {formatStatus(status)}
        </Tag>
      ),
    },
    {
      title: 'Stories',
      key: 'stories',
      render: (_, record) => (
        <a onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${record.id}#stories`); }}>
          {record.confirmed_count ?? 0} / {record.story_count ?? 0}
        </a>
      ),
    },
    {
      title: 'Open Checks',
      dataIndex: 'open_checks',
      key: 'open_checks',
      render: (count: number | undefined, record: any) =>
        count === undefined || count === null ? '-' :
        count === 0 ? <Tag color="success">0</Tag> :
        <a onClick={(e: any) => { e.stopPropagation(); navigate(`/meetings/${record.id}#stories`); }}><Tag color="warning" style={{ cursor: 'pointer' }}>{count}</Tag></a>,
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">Meetings</div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Meetings</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Radio.Group value={view} onChange={e => handleViewChange(e.target.value)} buttonStyle="solid" size="middle">
            <Radio.Button value="in_review">In Review ({meetings.filter(m => m.status === 'in_review' || m.status === 'processing').length})</Radio.Button>
            <Radio.Button value="uploaded">Uploaded ({meetings.filter(m => m.status === 'uploaded').length})</Radio.Button>
            <Radio.Button value="all">All ({meetings.length})</Radio.Button>
          </Radio.Group>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            Upload Transcript
          </Button>
        </div>
      </div>

      {(() => {
        const filtered = meetings.filter(m => {
          if (view === 'in_review') return m.status === 'in_review' || m.status === 'processing';
          if (view === 'uploaded') return m.status === 'uploaded';
          return true;
        });
        return loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : filtered.length === 0 ? (
        <Empty
          image={<FileTextOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description={meetings.length === 0 ? "No meetings yet" : `No ${view === 'in_review' ? 'meetings in review' : view === 'uploaded' ? 'uploaded meetings' : 'meetings'}`}
        >
          {meetings.length === 0 && <Button type="primary" onClick={() => setUploadOpen(true)}>Upload Your First Transcript</Button>}
        </Empty>
      ) : (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          onRow={(record) => ({
            onClick: () => navigate(`/meetings/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} items` }}
        />
      );
      })()}

      {/* Upload Modal */}
      <Modal
        title="Upload Meeting Transcript"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setUploadOpen(false)}>Cancel</Button>,
          <Button key="process" type="primary" loading={uploading} onClick={() => {
            if (!uploadTitle.trim()) { message.error('Please enter a meeting title'); return; }
            if (!uploadFile && !pasteText.trim()) { message.error('Please upload a file or paste transcript text'); return; }
            setShowConfirm(true);
          }}>
            Process
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-sec)' }}>Meeting Title</label>
          <Input
            value={uploadTitle}
            onChange={e => setUploadTitle(e.target.value)}
            placeholder="e.g., Sprint Planning - March 31"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-sec)' }}>Upload .md file</label>
          <Upload.Dragger
            accept=".md,.txt"
            maxCount={1}
            beforeUpload={(file) => { setUploadFile(file); return false; }}
            onRemove={() => setUploadFile(null)}
            fileList={uploadFile ? [{ uid: '-1', name: uploadFile.name, status: 'done' }] : []}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Drop .md file here or click to browse</p>
          </Upload.Dragger>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-sec)' }}>Or paste transcript text</label>
          <Input.TextArea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={6}
            placeholder="Paste meeting transcript here..."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={showConfirm}
        title="Process Transcript"
        message={`Start processing "${uploadTitle}"? The agent pipeline will analyze the transcript and generate candidate stories.`}
        onConfirm={() => { setShowConfirm(false); handleUpload(); }}
        onCancel={() => setShowConfirm(false)}
        confirmText="Process"
      />
    </div>
  );
}
