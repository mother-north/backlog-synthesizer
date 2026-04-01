import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Modal, Input, Upload, Tag, Skeleton, App, Empty } from 'antd';
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
  stories_count?: number;
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
  const navigate = useNavigate();
  const { message } = App.useApp();

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
        <span>
          {record.confirmed_count ?? '-'} / {record.stories_count ?? '-'}
        </span>
      ),
    },
    {
      title: 'Open Checks',
      dataIndex: 'open_checks',
      key: 'open_checks',
      render: (count: number | undefined) =>
        count === undefined || count === null ? '-' :
        count === 0 ? <Tag color="success">0</Tag> :
        <Tag color="warning">{count}</Tag>,
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">Meetings</div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Meetings</h1>
        <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
          Upload Transcript
        </Button>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : meetings.length === 0 ? (
        <Empty
          image={<FileTextOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No meetings yet"
        >
          <Button type="primary" onClick={() => setUploadOpen(true)}>Upload Your First Transcript</Button>
        </Empty>
      ) : (
        <Table
          dataSource={meetings}
          columns={columns}
          rowKey="id"
          onRow={(record) => ({
            onClick: () => navigate(`/meetings/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} meetings` }}
        />
      )}

      {/* Upload Modal */}
      <Modal
        title="Upload Meeting Transcript"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setUploadOpen(false)}>Cancel</Button>,
          <Button key="process" type="primary" loading={uploading} onClick={() => setShowConfirm(true)}>
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
