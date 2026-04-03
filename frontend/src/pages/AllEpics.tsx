import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Skeleton, Empty, App, Button } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { epicsApi } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';

interface Epic {
  id: number;
  external_id?: string;
  title: string;
  description?: string;
  status: string;
  is_proposed: boolean;
  proposed_by_meeting?: number;
  proposed_by_meeting_title?: string;
  proposal_justification?: string;
  story_count: number;
  approved_by_name?: string;
  approved_at?: string;
}

export default function AllEpics() {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingEpic, setRejectingEpic] = useState<Epic | null>(null);
  const navigate = useNavigate();
  const { message } = App.useApp();

  const fetchData = () => {
    setLoading(true);
    epicsApi.getAll().then(res => {
      setEpics(res.data?.rows || res.data || []);
    }).catch(() => {
      message.error('Failed to load epics');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const columns: ColumnsType<Epic> = [
    {
      title: 'ID',
      dataIndex: 'external_id',
      key: 'id',
      width: 100,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{v || '—'}</span>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (v: string, record: Epic) => (
        <div>
          <span style={{ fontWeight: 500 }}>{v}</span>
          {record.proposal_justification && (
            <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2 }}>{record.proposal_justification}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Source',
      key: 'source',
      width: 120,
      filters: [
        { text: 'Backlog', value: 'backlog' },
        { text: 'Proposed', value: 'proposed' },
      ],
      onFilter: (value, record) => value === 'proposed' ? record.is_proposed : !record.is_proposed,
      render: (_: unknown, record: Epic) => (
        <Tag color={record.is_proposed ? 'orange' : 'green'}>
          {record.is_proposed ? 'Proposed' : 'Backlog'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      filters: [
        { text: 'Active', value: 'active' },
        { text: 'Proposed', value: 'proposed' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : status === 'proposed' ? 'orange' : status === 'rejected' ? 'error' : 'default'}>
          {status || 'active'}
        </Tag>
      ),
    },
    {
      title: <span style={{ whiteSpace: 'nowrap' }}>Stories</span>,
      dataIndex: 'story_count',
      key: 'stories',
      width: 80,
      sorter: (a, b) => (a.story_count || 0) - (b.story_count || 0),
      render: (v: number, record: Epic) => v ? (
        <a onClick={() => navigate(`/stories?epic_id=${record.id}`)}>{v}</a>
      ) : 0,
    },
    {
      title: 'Meeting',
      key: 'meeting',
      width: 180,
      ellipsis: true,
      render: (_: unknown, record: Epic) => record.proposed_by_meeting ? (
        <a onClick={() => navigate(`/meetings/${record.proposed_by_meeting}#epics`)}>
          {record.proposed_by_meeting_title || `Meeting #${record.proposed_by_meeting}`}
        </a>
      ) : <span style={{ color: 'var(--gray-400)' }}>—</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: Epic) => record.is_proposed && record.status === 'proposed' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" type="primary" onClick={() => {
            epicsApi.approve(record.id).then(() => { message.success('Epic approved'); fetchData(); })
              .catch(() => message.error('Failed to approve'));
          }}>Approve</Button>
          <Button size="small" danger onClick={() => setRejectingEpic(record)}>Reject</Button>
        </div>
      ) : record.status ? (
        <Tag color={record.status === 'active' ? 'success' : record.status === 'rejected' ? 'error' : 'default'}>{record.status}</Tag>
      ) : null,
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">Epics</div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Epics</h1>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : epics.length === 0 ? (
        <Empty
          image={<AppstoreOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No epics yet"
        >
          <span style={{ color: 'var(--text-sec)' }}>Upload backlog data or run the pipeline to generate epics</span>
        </Empty>
      ) : (
        <Table
          dataSource={epics}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} epics` }}
        />
      )}

      <ConfirmDialog
        open={!!rejectingEpic}
        title="Reject Epic"
        message={`Reject "${rejectingEpic?.title}"? Stories under this epic will be unassigned.`}
        onConfirm={(input) => {
          if (rejectingEpic && input) {
            epicsApi.reject(rejectingEpic.id, { action: 'reject', rationale: input }).then(() => {
              message.success(`Epic "${rejectingEpic.title}" rejected`);
              fetchData();
            }).catch(() => message.error('Failed to reject'));
          }
          setRejectingEpic(null);
        }}
        onCancel={() => setRejectingEpic(null)}
        confirmText="Reject Epic"
        danger
        requireInput
        inputLabel="Rationale"
        inputPlaceholder="Why is this epic being rejected?"
      />
    </div>
  );
}
