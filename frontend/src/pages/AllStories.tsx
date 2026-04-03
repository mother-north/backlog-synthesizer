import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Table, Radio, Tag, Skeleton, Empty, App, Modal, Button, Tooltip } from 'antd';
import { UnorderedListOutlined, WarningOutlined, CheckCircleOutlined, LinkOutlined } from '@ant-design/icons';
import ConfirmDialog from '../components/ConfirmDialog';
import type { ColumnsType } from 'antd/es/table';
import { storiesApi, epicsApi, meetingsApi } from '../services/api';
import { statusColors } from '../theme';
import { useAuthStore } from '../store/auth';
import StoryCard from '../components/StoryCard';

interface Epic {
  id: number;
  title: string;
  external_id?: string;
  is_proposed?: boolean;
}

interface Check {
  id: number;
  check_type: string;
  details: string;
  proposed_resolution: string;
  routed_to: string;
  status: string;
  resolution_notes?: string;
  story_id?: number;
}

interface Story {
  id: number;
  title: string;
  description: string;
  type: string;
  status: string;
  confidence: string;
  grounding_status: string;
  grounding_issues?: string[];
  acceptance_criteria: string[];
  source_citation: string;
  speaker: string;
  priority?: string | null;
  created_at: string;
  meeting_id: number;
  meeting_title?: string;
  epic_id: number | null;
  epic_title?: string;
  epic_external_id?: string;
  open_checks: number;
  checks: Check[];
  feature_tags?: string[];
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function AllStories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [allChecks, setAllChecks] = useState<Check[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const urlEpicId = searchParams.get('epic_id');
  const savedView = localStorage.getItem('stories_view') || 'pending';
  const [view, setView] = useState<string>(urlEpicId ? 'all' : urlStatus === 'confirmed' ? 'processed' : urlStatus === 'rejected' ? 'processed' : urlStatus === 'generated' ? 'pending' : urlStatus ? 'all' : savedView);
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null);
  const [showStoryReject, setShowStoryReject] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const user = useAuthStore(s => s.user);
  const userRoles = user?.roles || [];

  const handleViewChange = (v: string) => {
    setView(v);
    localStorage.setItem('stories_view', v);
    // Clear URL params when switching manually
    if (urlStatus) navigate('/stories', { replace: true });
  };

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      storiesApi.getAll(),
      epicsApi.getAll(),
    ]).then(([storiesRes, epicsRes]) => {
      const allStories = storiesRes.data?.rows || storiesRes.data || [];
      setStories(allStories);
      setEpics(epicsRes.data?.rows || epicsRes.data || []);
    }).catch(() => {
      message.error('Failed to load stories');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const [storyTranscript, setStoryTranscript] = useState<string | undefined>();

  // Load checks + transcript for selected story
  const loadStoryDetails = (storyId: number) => {
    storiesApi.getById(storyId).then(res => {
      const storyData = res.data;
      if (storyData?.checks) setAllChecks(storyData.checks);
      // Load transcript from the story's meeting
      if (storyData?.meeting_id) {
        meetingsApi.getById(storyData.meeting_id).then(mRes => {
          const meeting = mRes.data?.rows?.[0] || mRes.data;
          setStoryTranscript(meeting?.transcript);
        }).catch((e) => console.warn('API error:', e));
      }
    }).catch((e) => console.warn('API error:', e));
  };

  useEffect(() => {
    if (selectedStoryId) {
      loadStoryDetails(selectedStoryId);
    } else {
      setStoryTranscript(undefined);
    }
  }, [selectedStoryId]);

  const handleStoryUpdate = () => {
    fetchData();
    if (selectedStoryId) loadStoryDetails(selectedStoryId);
  };

  const PENDING_STATUSES = ['generated', 'under_review', 'awaiting_confirmation', 'pending_decision'];
  const PROCESSED_STATUSES = ['confirmed', 'rejected', 'ready_to_push'];

  const filteredStories = stories.filter(s => {
    if (urlEpicId && s.epic_id !== Number(urlEpicId)) return false;
    if (view === 'pending') return PENDING_STATUSES.includes(s.status);
    if (view === 'processed') return PROCESSED_STATUSES.includes(s.status);
    return true;
  });

  const storiesWithChecks = filteredStories.map(s => ({
    ...s,
    checks: allChecks.filter(c => c.story_id === s.id),
  }));

  const selectedStory = storiesWithChecks.find(s => s.id === selectedStoryId);

  const columns: ColumnsType<Story> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70,
      sorter: (a, b) => a.id - b.id,
      render: (id: number) => <span style={{ fontFamily: 'monospace', color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>{id}</span>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (title: string) => <span style={{ fontWeight: 500 }}>{title}</span>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      filters: Array.from(new Set(filteredStories.map(s => s.type))).filter(Boolean).map(v => ({ text: v, value: v })),
      onFilter: (value, record) => record.type === value,
      render: (type: string) => <Tag color={type === 'feature' ? 'blue' : type === 'bug' ? 'red' : type === 'nfr' ? 'purple' : type === 'improvement' ? 'green' : type === 'tech_debt' ? 'orange' : 'default'}>{type}</Tag>,
    },
    {
      title: 'Crit.',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      filters: [
        { text: 'Critical', value: 'critical' },
        { text: 'High', value: 'high' },
        { text: 'Medium', value: 'medium' },
        { text: 'Low', value: 'low' },
      ],
      onFilter: (value, record) => record.priority === value,
      render: (p: string) => <Tag color={p === 'critical' ? 'red' : p === 'high' ? 'orange' : p === 'medium' ? 'blue' : p === 'low' ? 'default' : 'default'}>{p || '—'}</Tag>,
    },
    {
      title: 'Epic',
      key: 'epic',
      ellipsis: true,
      filters: Array.from(new Set(filteredStories.map(s => s.epic_title))).filter(Boolean).map(v => ({ text: v as string, value: v as string })),
      onFilter: (value, record) => record.epic_title === value,
      render: (_: unknown, record: Story) => {
        const epic = epics.find(e => e.id === record.epic_id);
        return epic ? (
          <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
            {epic.external_id && <Tag color={epic.is_proposed ? 'orange' : 'blue'} style={{ marginRight: 4 }}>{epic.external_id}</Tag>}
            {epic.title}
          </span>
        ) : (
          <span style={{ color: 'var(--gray-400)' }}>—</span>
        );
      },
    },
    {
      title: 'Meeting',
      key: 'meeting',
      width: 200,
      ellipsis: true,
      filters: Array.from(new Set(filteredStories.map(s => s.meeting_title))).filter(Boolean).map(v => ({ text: v as string, value: v as string })),
      onFilter: (value, record) => record.meeting_title === value,
      render: (_: unknown, record: Story) => (
        <a onClick={(e) => { e.stopPropagation(); navigate(`/meetings/${record.meeting_id}`); }}
          style={{ fontSize: 12 }}>
          <LinkOutlined style={{ marginRight: 4 }} />{record.meeting_title || `Meeting #${record.meeting_id}`}
        </a>
      ),
    },
    {
      title: 'Checks',
      key: 'open_checks',
      width: 110,
      sorter: (a, b) => (a.open_checks || 0) - (b.open_checks || 0),
      render: (_: unknown, record: Story) => {
        const open = record.open_checks || 0;
        return open > 0 ? (
          <Tag color="warning"><WarningOutlined /> {open}</Tag>
        ) : (
          <Tag color="success"><CheckCircleOutlined /> 0</Tag>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      filters: Array.from(new Set(filteredStories.map(s => s.status))).filter(Boolean).map(v => ({ text: formatStatus(v), value: v })),
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
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">Stories</div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">
          Stories
          {urlEpicId && (() => {
            const epic = epics.find(e => e.id === Number(urlEpicId));
            return epic ? (
              <Tag color="blue" style={{ marginLeft: 12, fontSize: 13, verticalAlign: 'middle' }}>
                {epic.external_id ? `${epic.external_id} ` : ''}{epic.title}
                <a style={{ marginLeft: 6, color: 'inherit' }} onClick={() => navigate('/stories')}>x</a>
              </Tag>
            ) : null;
          })()}
        </h1>
        <Radio.Group value={view} onChange={e => handleViewChange(e.target.value)} buttonStyle="solid" size="middle">
          <Radio.Button value="pending">In Review ({stories.filter(s => PENDING_STATUSES.includes(s.status)).length})</Radio.Button>
          <Radio.Button value="processed">Processed ({stories.filter(s => PROCESSED_STATUSES.includes(s.status)).length})</Radio.Button>
          <Radio.Button value="all">All ({stories.length})</Radio.Button>
        </Radio.Group>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : filteredStories.length === 0 ? (
        <Empty
          image={<UnorderedListOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description={view === 'pending' ? 'No stories in review' : view === 'processed' ? 'No processed stories yet' : 'No stories generated yet'}
        >
          <span style={{ color: 'var(--text-sec)' }}>{view === 'pending' ? 'All stories have been reviewed' : 'Upload a meeting transcript to get started'}</span>
        </Empty>
      ) : (
        <Table
          dataSource={filteredStories}
          columns={columns}
          rowKey="id"
          onRow={(record) => ({
            onClick: () => setSelectedStoryId(record.id),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} stories` }}
        />
      )}

      {/* Story Detail Modal */}
      <Modal
        title={(() => {
          if (!selectedStory) return '';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{selectedStory.title}</span>
              <Tag color={selectedStory.status === 'confirmed' || selectedStory.status === 'ready_to_push' ? 'success' : selectedStory.status === 'rejected' ? 'error' : selectedStory.status === 'processing' ? 'processing' : 'warning'}>
                {selectedStory.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </Tag>
            </div>
          );
        })()}
        open={!!selectedStoryId}
        onCancel={() => { setSelectedStoryId(null); setAllChecks([]); }}
        footer={(() => {
          if (!selectedStory) return <Button onClick={() => { setSelectedStoryId(null); setAllChecks([]); }}>Close</Button>;
          const openChecks = selectedStory.checks?.filter((c: Check) => c.status === 'open').length || 0;
          const canConfirm = openChecks === 0 && selectedStory.epic_id && selectedStory.status !== 'confirmed' && selectedStory.status !== 'rejected' && selectedStory.status !== 'ready_to_push';
          const canReject = selectedStory.status !== 'confirmed' && selectedStory.status !== 'rejected' && selectedStory.status !== 'ready_to_push';
          const showActions = selectedStory.status !== 'confirmed' && selectedStory.status !== 'rejected' && selectedStory.status !== 'ready_to_push';
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {showActions && (
                  <>
                    <Tooltip title={!canConfirm ? (openChecks > 0 ? `${openChecks} open checks` : !selectedStory.epic_id ? 'No epic assigned' : '') : ''}>
                      <Button type="primary" icon={<CheckCircleOutlined />} disabled={!canConfirm}
                        onClick={() => {
                          storiesApi.confirm(selectedStory.id).then(() => {
                            message.success(`Story "${selectedStory.title}" confirmed`);
                            fetchData();
                          }).catch(() => message.error('Failed to confirm'));
                        }}>
                        Confirm
                      </Button>
                    </Tooltip>
                    <Button danger disabled={!canReject}
                      onClick={() => setShowStoryReject(true)}>
                      Reject
                    </Button>
                  </>
                )}
              </div>
              <Button onClick={() => { setSelectedStoryId(null); setAllChecks([]); }}>Close</Button>
            </div>
          );
        })()}
        width={800}
        destroyOnHidden
      >
        {selectedStory ? (
          <StoryCard
            story={selectedStory}
            epics={epics}
            expanded={true}
            onToggle={() => {}}
            onUpdate={handleStoryUpdate}
            userRoles={userRoles}
            transcript={storyTranscript}
          />
        ) : null}
        <ConfirmDialog
          open={showStoryReject}
          title="Reject Story"
          message={`Reject "${selectedStory?.title}"?`}
          onConfirm={(input) => {
            if (selectedStory && input) {
              storiesApi.reject(selectedStory.id, input).then(() => {
                message.success(`Story "${selectedStory.title}" rejected`);
                fetchData();
              }).catch(() => message.error('Failed to reject'));
            }
            setShowStoryReject(false);
          }}
          onCancel={() => setShowStoryReject(false)}
          confirmText="Reject Story"
          danger
          requireInput
          inputLabel="Rationale"
          inputPlaceholder="Why is this story being rejected?"
        />
      </Modal>
    </div>
  );
}
