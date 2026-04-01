import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Button, Tag, Skeleton, Table, Select, Input, Timeline, App, Empty, Checkbox, Modal, Descriptions } from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  WarningOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { meetingsApi, storiesApi, checksApi, epicsApi, memosApi, auditApi, dataApi } from '../services/api';
import { statusColors } from '../theme';
import { useAuthStore } from '../store/auth';
import StoryCard from '../components/StoryCard';
// EpicProposal moved to Epics tab
import CheckPanel from '../components/CheckPanel';
// PipelineProgress replaced with inline ProcessingStatus
import ConfirmDialog from '../components/ConfirmDialog';

interface Meeting {
  id: number;
  title: string;
  status: string;
  created_at: string;
  file_name?: string;
  transcript?: string;
  meeting_quality?: { requirements: number; ambiguous: number; actionability: string; recommendation: string };
  pipeline_progress?: Array<{ agent: string; status: string; message: string }>;
  uploaded_by_name?: string;
}

interface Epic {
  id: number;
  title: string;
  external_id?: string;
  is_proposed?: boolean;
  proposal_justification?: string;
  story_count?: number;
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
  epic_id: number | null;
  epic?: Epic;
  checks: Array<{
    id: number;
    check_type: string;
    details: string;
    proposed_resolution: string;
    routed_to: string;
    status: string;
    resolution_notes?: string;
  }>;
}

interface Check {
  id: number;
  check_type: string;
  details: string;
  proposed_resolution: string;
  routed_to: string;
  status: string;
  story_title?: string;
  story_id?: number;
}

interface Memo {
  id: number;
  version: number;
  content: string;
  generated_at: string;
}

interface AgentTrace {
  id: number;
  agent_name: string;
  output_summary: Record<string, unknown>;
  duration_ms: number;
  llm_prompt_tokens: number;
  llm_completion_tokens: number;
}

interface AuditEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  user_id?: number;
  created_at: string;
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const AGENT_LABELS: Record<string, string> = {
  parser: 'Extracting requirements',
  retriever: 'Searching knowledge base',
  crossref: 'Checking backlog & architecture',
  synthesizer: 'Generating stories',
  validator: 'Validating citations',
};
const AGENT_ORDER = ['parser', 'retriever', 'crossref', 'synthesizer', 'validator'];

function ProcessingStatus({ meetingId, onComplete }: { meetingId: number; onComplete: () => void }) {
  const [steps, setSteps] = useState<Array<{ agent: string; status: string; message: string }>>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const poll = async () => {
      try {
        const res = await meetingsApi.getById(meetingId);
        const m = res.data?.rows?.[0] || res.data;
        const progress = m?.pipeline_progress || [];
        if (Array.isArray(progress) && progress.length > 0) {
          setSteps([...progress.map((s: any) => ({ ...s }))]);
        }
        if (m?.status && m.status !== 'processing') {
          clearInterval(timer);
          onComplete();
        }
      } catch { /* ignore */ }
    };
    poll();
    timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [meetingId, onComplete]);

  const doneCount = steps.filter(s => s.status === 'done').length;
  const runningStep = steps.find(s => s.status === 'running');
  const total = AGENT_ORDER.length;

  return (
    <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-100)', borderRadius: 8, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
      <LoadingOutlined spin style={{ fontSize: 18, color: 'var(--primary)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          Processing — Step {doneCount + (runningStep ? 1 : 0)} of {total}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>
          {runningStep
            ? (runningStep.message || AGENT_LABELS[runningStep.agent] || runningStep.agent)
            : doneCount === 0
              ? 'Starting pipeline...'
              : doneCount >= total
                ? 'Completing...'
                : `Starting ${AGENT_LABELS[AGENT_ORDER[doneCount]] || AGENT_ORDER[doneCount]}...`}
        </div>
      </div>
    </div>
  );
}

export default function MeetingView() {
  const { id } = useParams<{ id: string }>();
  const meetingId = Number(id);
  const navigate = useNavigate();
  const location = window.location;
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes('Admin');
  const canResolve = (routedTo: string) => isAdmin || userRoles.includes(routedTo);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    const hash = location.hash.replace('#', '');
    return ['info', 'stories', 'epics', 'checks', 'audit', 'memo'].includes(hash) ? hash : 'info';
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };
  const [expandedStory, setExpandedStory] = useState<number | null>(null);
  // collapsedEpics removed — stories now in table

  // Checks tab filters
  const [checkStatusFilter, setCheckStatusFilter] = useState<string>('all');
  const [checkRoleFilter, setCheckRoleFilter] = useState<string>('all');
  const [resolvingCheckId, setResolvingCheckId] = useState<number | null>(null);

  // Memo
  const [generatingMemo, setGeneratingMemo] = useState(false);
  const [showMemoConfirm, setShowMemoConfirm] = useState(false);

  // Bulk confirm
  const [selectedStories, setSelectedStories] = useState<number[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  // Transcript search
  const [transcriptSearch, setTranscriptSearch] = useState('');

  // Listen for "View in transcript" from StoryCard
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab) handleTabChange(detail.tab);
      if (detail?.search) setTranscriptSearch(detail.search);
    };
    window.addEventListener('switchTab', handler);
    return () => window.removeEventListener('switchTab', handler);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [meetingRes, storiesRes, epicsRes, checksRes] = await Promise.all([
        meetingsApi.getById(meetingId),
        storiesApi.getByMeeting(meetingId),
        epicsApi.getAll(),
        checksApi.getByMeeting(meetingId),
      ]);
      setMeeting(meetingRes.data?.rows?.[0] || meetingRes.data);
      setStories(storiesRes.data?.rows || storiesRes.data || []);
      setEpics(epicsRes.data?.rows || epicsRes.data || []);
      setChecks(checksRes.data?.rows || checksRes.data || []);
    } catch {
      message.error('Failed to load meeting data');
    } finally {
      setLoading(false);
    }
  }, [meetingId, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchMemos = async () => {
    try {
      const res = await memosApi.getByMeeting(meetingId);
      setMemos(res.data?.rows || res.data || []);
    } catch { /* empty */ }
  };

  const fetchAudit = async () => {
    try {
      const [tracesRes, auditRes] = await Promise.all([
        auditApi.getTraces(meetingId),
        auditApi.getHistory(meetingId),
      ]);
      setTraces(tracesRes.data?.rows || tracesRes.data || []);
      setAuditLog(auditRes.data?.rows || auditRes.data || []);
    } catch { /* empty */ }
  };

  useEffect(() => {
    if (activeTab === 'memo') fetchMemos();
    if (activeTab === 'audit') fetchAudit();
  }, [activeTab, meetingId]);

  const handleGenerateMemo = async () => {
    setGeneratingMemo(true);
    try {
      await memosApi.generate(meetingId);
      const nextVersion = memos.length + 1;
      message.success(`Decision memo v${nextVersion} generated`);
      fetchMemos();
    } catch {
      message.error('Failed to generate memo');
    } finally {
      setGeneratingMemo(false);
    }
  };

  const handleBulkConfirm = async () => {
    try {
      await storiesApi.bulkConfirm(selectedStories);
      message.success(`${selectedStories.length} stories confirmed`);
      setSelectedStories([]);
      fetchData();
    } catch {
      message.error('Failed to bulk confirm');
    }
    setShowBulkConfirm(false);
  };

  // Enrich stories with their checks
  const storiesWithChecks = stories.map(story => ({
    ...story,
    checks: checks.filter(c => c.story_id === story.id),
  }));

  // storiesByEpic removed — stories now in flat table with Epic column

  // proposedEpics/existingEpics — shown in Epics tab

  // Confirmable stories for bulk
  const confirmableStories = storiesWithChecks.filter(s =>
    s.status === 'awaiting_confirmation' &&
    s.checks.filter(c => c.status === 'open').length === 0 &&
    s.epic_id
  );

  // Checks filtering
  const filteredChecks = checks.filter(c => {
    if (checkStatusFilter !== 'all' && c.status !== checkStatusFilter) return false;
    if (checkRoleFilter === 'mine' && !canResolve(c.routed_to)) return false;
    if (checkRoleFilter !== 'all' && checkRoleFilter !== 'mine' && c.routed_to !== checkRoleFilter) return false;
    return true;
  });

  // Backlog item preview
  const [viewBacklogItem, setViewBacklogItem] = useState<any>(null);

  const fetchBacklogItem = async (externalId: string) => {
    try {
      const res = await dataApi.getBacklog({ search: externalId });
      const items = res.data?.rows || res.data || [];
      const match = items.find((i: any) => i.external_id === externalId);
      if (match) setViewBacklogItem(match);
      else message.warning(`Backlog item ${externalId} not found`);
    } catch {
      message.error('Failed to load backlog item');
    }
  };

  // Parse ERIS-XXX references from check details
  const renderDetailsWithBacklogLinks = (details: string) => {
    if (!details) return '-';
    const parts = details.split(/(ERIS-\d+)/g);
    return (
      <span>
        {parts.map((part, i) =>
          /^ERIS-\d+$/.test(part) ? (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <Tag color="blue" style={{ margin: 0, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  fetchBacklogItem(part);
                }}>
                {part} <EyeOutlined style={{ fontSize: 10, marginLeft: 2 }} />
              </Tag>
            </span>
          ) : <span key={i}>{part}</span>
        )}
      </span>
    );
  };

  const checksColumns: ColumnsType<Check> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      sorter: (a, b) => a.id - b.id,
      render: (id: number) => <span style={{ fontFamily: 'monospace', color: 'var(--text-sec)' }}>{id}</span>,
    },
    {
      title: 'Type',
      dataIndex: 'check_type',
      key: 'check_type',
      width: 140,
      filters: Array.from(new Set(checks.map(c => c.check_type))).filter(Boolean).map(v => ({ text: v, value: v })),
      onFilter: (value, record) => record.check_type === value,
      render: (type: string) => <Tag>{type}</Tag>,
    },
    {
      title: 'Story',
      key: 'story',
      width: 200,
      ellipsis: true,
      render: (_: unknown, record: Check) => {
        const story = stories.find(s => s.id === record.story_id);
        return story ? (
          <span style={{ fontSize: 13 }}>{story.title}</span>
        ) : (
          <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>Story #{record.story_id}</span>
        );
      },
      filters: Array.from(new Set(checks.map(c => c.story_id))).filter(Boolean).map(sid => {
        const story = stories.find(s => s.id === sid);
        return { text: story?.title || `Story #${sid}`, value: sid as number };
      }),
      onFilter: (value, record) => record.story_id === value,
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
      render: (details: string) => renderDetailsWithBacklogLinks((details || '').slice(0, 120) + ((details || '').length > 120 ? '...' : '')),
    },
    {
      title: 'Role',
      dataIndex: 'routed_to',
      key: 'role',
      width: 100,
      render: (role: string) => <Tag color="blue">{role}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => (
        <span className="status-badge" style={{
          background: `${statusColors[status] || 'var(--gray-400)'}20`,
          color: statusColors[status] || 'var(--gray-400)',
        }}>
          {formatStatus(status)}
        </span>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 90,
      render: (_, record) => (
        record.status === 'open' && canResolve(record.routed_to) ? (
          <Button size="small" type="primary" onClick={() => setResolvingCheckId(record.id)}>
            Resolve
          </Button>
        ) : record.status === 'open' ? (
          <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>Not your role</span>
        ) : null
      ),
    },
  ];

  const traceColumns: ColumnsType<AgentTrace> = [
    { title: 'Agent', dataIndex: 'agent_name', key: 'agent', render: (n: string) => <Tag>{n}</Tag> },
    {
      title: 'Output Summary',
      dataIndex: 'output_summary',
      key: 'output',
      render: (summary: Record<string, unknown>) => JSON.stringify(summary)?.slice(0, 80) + '...',
    },
    { title: 'Duration', dataIndex: 'duration_ms', key: 'duration', render: (ms: number) => `${(ms / 1000).toFixed(1)}s` },
    {
      title: 'Tokens',
      key: 'tokens',
      render: (_, r) => `${(r.llm_prompt_tokens || 0) + (r.llm_completion_tokens || 0)}`,
    },
  ];

  if (loading) {
    return (
      <div>
        <div className="bs-breadcrumbs"><a onClick={() => navigate('/meetings')}>Meetings</a> <span>&gt;</span> Loading...</div>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  if (!meeting) {
    return <Empty description="Meeting not found" />;
  }

  const isProcessing = meeting.status === 'processing';

  return (
    <div>
      {/* Breadcrumbs */}
      <div className="bs-breadcrumbs">
        <a onClick={() => navigate('/meetings')}>Meetings</a>
        <span>&gt;</span>
        {meeting.title}
        {activeTab !== 'stories' && <><span>&gt;</span> {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</>}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/meetings')}>Meetings</Button>
        <span style={{ fontFamily: 'monospace', color: 'var(--text-sec)', fontSize: 14 }}>#{meeting.id}</span>
        <h1 style={{ flex: 1, fontSize: 20, fontWeight: 700, margin: 0 }}>{meeting.title}</h1>
        <Tag
          color={meeting.status === 'completed' ? 'success' : meeting.status === 'in_review' ? 'warning' : meeting.status === 'processing' ? 'processing' : 'default'}
          style={{ fontSize: 13, padding: '4px 12px' }}
        >
          {formatStatus(meeting.status)}
        </Tag>
        {(meeting.status === 'uploaded') && (
          <Button
            type="primary"
            onClick={async () => {
              try {
                await meetingsApi.trigger(meetingId);
                message.success('Pipeline started');
                fetchData();
              } catch {
                message.error('Failed to start pipeline');
              }
            }}
          >
            Process Meeting
          </Button>
        )}
        {meeting.status === 'in_review' && (
          <Button
            danger
            onClick={async () => {
              try {
                await meetingsApi.reevaluate(meetingId);
                message.success('Re-evaluation started — all stories and checks cleared');
                fetchData();
              } catch {
                message.error('Failed to start re-evaluation');
              }
            }}
          >
            Re-evaluate
          </Button>
        )}
      </div>

      {/* Pipeline progress — simple polling status */}
      {isProcessing && <ProcessingStatus meetingId={meetingId} onComplete={fetchData} />}

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'info',
            label: 'Meeting Info',
            children: (
              <div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px 16px', fontSize: 14 }}>
                    <span style={{ color: 'var(--text-sec)', fontWeight: 500 }}>Title:</span>
                    <span>{meeting.title}</span>
                    <span style={{ color: 'var(--text-sec)', fontWeight: 500 }}>Uploaded:</span>
                    <span>{new Date(meeting.created_at).toLocaleString()} {meeting.uploaded_by_name ? `by ${meeting.uploaded_by_name}` : ''}</span>
                    <span style={{ color: 'var(--text-sec)', fontWeight: 500 }}>File:</span>
                    <span>{meeting.file_name || 'Pasted text'}</span>
                    <span style={{ color: 'var(--text-sec)', fontWeight: 500 }}>Status:</span>
                    <span>
                      <Tag color={meeting.status === 'completed' ? 'success' : meeting.status === 'in_review' ? 'warning' : 'processing'}>
                        {formatStatus(meeting.status)}
                      </Tag>
                    </span>
                  </div>
                </div>

                <div style={{ fontWeight: 600, marginBottom: 8 }}>Transcript</div>
                <div style={{ marginBottom: 8 }}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder="Search transcript..."
                    value={transcriptSearch}
                    onChange={e => setTranscriptSearch(e.target.value)}
                    allowClear
                    style={{ width: 300 }}
                  />
                </div>
                <div style={{
                  background: 'var(--white)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 20,
                  maxHeight: 500,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.8,
                  fontSize: 14,
                }}>
                  {meeting.transcript ? (
                    transcriptSearch ? (
                      <span dangerouslySetInnerHTML={{
                        __html: meeting.transcript.replace(
                          new RegExp(`(${transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                          '<mark style="background:#ffd591">$1</mark>'
                        ),
                      }} />
                    ) : (
                      meeting.transcript
                    )
                  ) : (
                    <Empty description="Transcript not available" />
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'stories',
            label: `Stories (${stories.length})`,
            children: (
              <div>
                {/* Bulk confirm */}
                {confirmableStories.length > 0 && (
                  <div style={{ marginBottom: 16, padding: 12, background: 'var(--blue-50)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Checkbox
                      checked={selectedStories.length === confirmableStories.length && confirmableStories.length > 0}
                      indeterminate={selectedStories.length > 0 && selectedStories.length < confirmableStories.length}
                      onChange={(e) => {
                        setSelectedStories(e.target.checked ? confirmableStories.map(s => s.id) : []);
                      }}
                    >
                      Select All Confirmable ({confirmableStories.length})
                    </Checkbox>
                    <Button
                      type="primary"
                      size="small"
                      disabled={selectedStories.length === 0}
                      onClick={() => setShowBulkConfirm(true)}
                    >
                      Bulk Confirm ({selectedStories.length})
                    </Button>
                  </div>
                )}

                {/* Stories table */}
                {storiesWithChecks.length === 0 ? (
                  <Empty description={isProcessing ? "Stories will appear after processing completes" : "No stories generated for this meeting"} />
                ) : (
                  <Table
                    dataSource={storiesWithChecks}
                    rowKey="id"
                    size="middle"
                    pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total} stories` }}
                    expandable={{
                      expandedRowRender: (story) => (
                        <StoryCard
                          story={story}
                          epics={epics}
                          expanded={true}
                          onToggle={() => {}}
                          onUpdate={fetchData}
                          userRoles={userRoles}
                          transcript={meeting?.transcript}
                        />
                      ),
                      expandedRowKeys: expandedStory ? [expandedStory] : [],
                      onExpand: (expanded, record) => setExpandedStory(expanded ? record.id : null),
                    }}
                    columns={[
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
                        ellipsis: true,
                        sorter: (a, b) => (a.title || '').localeCompare(b.title || ''),
                        render: (title: string) => <span style={{ fontWeight: 500 }}>{title}</span>,
                      },
                      {
                        title: 'Type',
                        dataIndex: 'type',
                        key: 'type',
                        width: 100,
                        filters: Array.from(new Set(storiesWithChecks.map(s => s.type))).filter(Boolean).map(v => ({ text: v, value: v })),
                        onFilter: (value, record) => record.type === value,
                        render: (type: string) => <Tag color={type === 'feature' ? 'blue' : type === 'bug' ? 'red' : type === 'nfr' ? 'purple' : type === 'improvement' ? 'green' : 'default'}>{type}</Tag>,
                      },
                      {
                        title: 'Epic',
                        key: 'epic',
                        width: 160,
                        filters: [
                          ...epics.map(e => ({ text: e.title, value: e.id })),
                          { text: 'No Epic', value: 0 },
                        ],
                        onFilter: (value, record) => value === 0 ? !record.epic_id : record.epic_id === value,
                        render: (_: unknown, record: any) => {
                          const epic = epics.find(e => e.id === record.epic_id);
                          return epic ? (
                            <span style={{ fontSize: 12 }}>
                              {epic.external_id && <Tag color={epic.is_proposed ? 'orange' : 'blue'} style={{ marginRight: 4 }}>{epic.external_id}</Tag>}
                              {epic.title}
                            </span>
                          ) : (
                            <Tag color="error">No Epic</Tag>
                          );
                        },
                      },
                      {
                        title: 'Confidence',
                        dataIndex: 'confidence',
                        key: 'confidence',
                        width: 100,
                        filters: [{ text: 'high', value: 'high' }, { text: 'medium', value: 'medium' }, { text: 'low', value: 'low' }],
                        onFilter: (value, record) => record.confidence === value,
                        render: (conf: string) => (
                          <Tag color={conf === 'high' ? 'green' : conf === 'medium' ? 'orange' : 'red'}>{conf}</Tag>
                        ),
                      },
                      {
                        title: 'Open Checks',
                        key: 'open_checks',
                        width: 110,
                        sorter: (a, b) => (a.checks?.filter((c: any) => c.status === 'open').length || 0) - (b.checks?.filter((c: any) => c.status === 'open').length || 0),
                        render: (_: unknown, record: any) => {
                          const open = record.checks?.filter((c: any) => c.status === 'open').length || 0;
                          return open > 0 ? (
                            <Tag color="warning"><WarningOutlined /> {open}</Tag>
                          ) : record.checks?.length > 0 ? (
                            <Tag color="success"><CheckCircleOutlined /> 0</Tag>
                          ) : (
                            <span style={{ color: 'var(--gray-400)' }}>—</span>
                          );
                        },
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        key: 'status',
                        width: 130,
                        filters: Array.from(new Set(storiesWithChecks.map(s => s.status))).filter(Boolean).map(v => ({ text: formatStatus(v), value: v })),
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
                    ]}
                  />
                )}

                <ConfirmDialog
                  open={showBulkConfirm}
                  title="Bulk Confirm"
                  message={`Confirm ${selectedStories.length} stories?`}
                  onConfirm={handleBulkConfirm}
                  onCancel={() => setShowBulkConfirm(false)}
                  confirmText="Confirm All"
                />
              </div>
            ),
          },
          {
            key: 'epics',
            label: `Epics (${epics.length})`,
            children: (
              <div>
                {epics.length === 0 ? (
                  <Empty description="No epics found. Upload backlog data to seed epics, or run the pipeline to generate epic proposals." />
                ) : (
                  <Table
                    dataSource={[...epics].sort((a, b) => {
                      // Proposed first, then by story count in this meeting
                      if (a.is_proposed && !b.is_proposed) return -1;
                      if (!a.is_proposed && b.is_proposed) return 1;
                      const aCount = storiesWithChecks.filter(s => s.epic_id === a.id).length;
                      const bCount = storiesWithChecks.filter(s => s.epic_id === b.id).length;
                      return bCount - aCount;
                    })}
                    rowKey="id"
                    pagination={false}
                    size="middle"
                    columns={[
                      { title: 'ID', dataIndex: 'external_id', key: 'id', width: 100,
                        render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '-'}</span> },
                      { title: 'Title', dataIndex: 'title', key: 'title', sorter: (a: any, b: any) => (a.title || '').localeCompare(b.title || ''),
                        render: (v: string, record: any) => (
                        <div>
                          <div style={{ fontWeight: 500 }}>{v}</div>
                          {record.proposal_justification && (
                            <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 4 }}>{record.proposal_justification}</div>
                          )}
                        </div>
                      )},
                      { title: 'Source', key: 'source', width: 120,
                        filters: [{ text: 'Backlog', value: 'backlog' }, { text: 'Proposed', value: 'proposed' }],
                        onFilter: (value: any, record: any) => value === 'proposed' ? record.is_proposed : !record.is_proposed,
                        render: (_: unknown, record: any) => (
                        <Tag color={record.is_proposed ? 'orange' : 'green'}>
                          {record.is_proposed ? 'Proposed' : 'Backlog'}
                        </Tag>
                      )},
                      { title: 'All Stories', dataIndex: 'story_count', key: 'all_stories', width: 100,
                        sorter: (a: any, b: any) => (a.story_count || 0) - (b.story_count || 0),
                        render: (v: number) => v || 0 },
                      { title: 'This Meeting', key: 'meeting_stories', width: 110,
                        sorter: (a: any, b: any) => {
                          const aCount = storiesWithChecks.filter(s => s.epic_id === a.id).length;
                          const bCount = storiesWithChecks.filter(s => s.epic_id === b.id).length;
                          return aCount - bCount;
                        },
                        render: (_: unknown, record: any) => {
                          const count = storiesWithChecks.filter(s => s.epic_id === record.id).length;
                          return count > 0 ? <Tag color="blue">{count}</Tag> : <span style={{ color: 'var(--gray-400)' }}>0</span>;
                        }},
                      { title: 'Actions', key: 'actions', width: 180, render: (_: unknown, record: any) => record.is_proposed ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button size="small" type="primary" onClick={() => epicsApi.approve(record.id).then(() => { message.success('Epic approved'); fetchData(); })}>Approve</Button>
                          <Button size="small" danger onClick={() => epicsApi.reject(record.id, { action: 'reject', rationale: 'Rejected' }).then(() => { message.success('Epic rejected'); fetchData(); })}>Reject</Button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-sec)', fontSize: 12 }}>—</span>
                      )},
                    ]}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'checks',
            label: `Checks (${checks.filter((c: any) => c.status === 'open').length} open)`,
            children: (
              <div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <Select
                    value={checkStatusFilter}
                    onChange={setCheckStatusFilter}
                    style={{ width: 150 }}
                    options={[
                      { value: 'all', label: 'All Statuses' },
                      { value: 'open', label: 'Open' },
                      { value: 'resolved', label: 'Resolved' },
                      { value: 'dismissed', label: 'Dismissed' },
                    ]}
                  />
                  <Select
                    value={checkRoleFilter}
                    onChange={setCheckRoleFilter}
                    style={{ width: 150 }}
                    options={[
                      { value: 'all', label: 'All Roles' },
                      { value: 'mine', label: 'My Roles' },
                      ...Array.from(new Set(checks.map(c => c.routed_to))).map(r => ({ value: r, label: r })),
                    ]}
                  />
                </div>
                {filteredChecks.length === 0 ? (
                  <Empty description="No checks found - all stories passed validation" />
                ) : (
                  <>
                    <Table
                      dataSource={filteredChecks}
                      columns={checksColumns}
                      rowKey="id"
                      pagination={{ pageSize: 20, showTotal: (total) => `${total} checks` }}
                      expandable={{
                        expandedRowRender: (record) => (
                          <div style={{ padding: '8px 0' }}>
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontWeight: 500, marginBottom: 4 }}>Details</div>
                              <div style={{ color: 'var(--text-sec)', fontSize: 13 }}>{renderDetailsWithBacklogLinks(record.details || 'No details')}</div>
                            </div>
                            {record.proposed_resolution && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontWeight: 500, marginBottom: 4 }}>Proposed Resolution</div>
                                <div style={{ color: 'var(--text-sec)', fontSize: 13 }}>{record.proposed_resolution}</div>
                              </div>
                            )}
                            {resolvingCheckId === record.id ? (
                              <CheckPanel
                                check={record}
                                onClose={() => setResolvingCheckId(null)}
                                onResolved={() => { setResolvingCheckId(null); fetchData(); }}
                              />
                            ) : (
                              canResolve(record.routed_to) && record.status === 'open' && (
                                <Button type="primary" size="small" onClick={() => setResolvingCheckId(record.id)}>
                                  Resolve This Check
                                </Button>
                              )
                            )}
                          </div>
                        ),
                      }}
                    />
                  </>
                )}
              </div>
            ),
          },
          {
            key: 'memo',
            label: 'Memo',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    {memos.length > 0 && (
                      <span style={{ color: 'var(--text-sec)', fontSize: 13 }}>
                        Version: {memos[0]?.version} | Generated: {new Date(memos[0]?.generated_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={generatingMemo}
                    onClick={() => setShowMemoConfirm(true)}
                  >
                    {memos.length > 0 ? 'Regenerate' : 'Generate Memo'}
                  </Button>
                </div>

                {memos.length === 0 ? (
                  <Empty description="No memo generated yet. Click Generate to create one." />
                ) : (
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
                    <div
                      style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}
                      dangerouslySetInnerHTML={{ __html: memos[0]?.content?.replace(/\n/g, '<br/>') || '' }}
                    />
                  </div>
                )}

                {/* Meeting Quality */}
                {meeting.meeting_quality && (
                  <div style={{ marginTop: 16, padding: 16, background: 'var(--blue-50)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Meeting Quality</div>
                    <div style={{ display: 'flex', gap: 24, marginBottom: 8 }}>
                      <span>Requirements: {meeting.meeting_quality.requirements}</span>
                      <span>Ambiguous: {meeting.meeting_quality.ambiguous}</span>
                      <span>Actionability: {meeting.meeting_quality.actionability}</span>
                    </div>
                    {meeting.meeting_quality.recommendation && (
                      <p style={{ fontStyle: 'italic', color: 'var(--gray-600)', margin: 0 }}>
                        "{meeting.meeting_quality.recommendation}"
                      </p>
                    )}
                  </div>
                )}

                {/* Version History */}
                {memos.length > 1 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Version History</div>
                    {memos.map(m => (
                      <div key={m.id} style={{ fontSize: 13, color: 'var(--text-sec)', padding: '4px 0' }}>
                        v{m.version} - {new Date(m.generated_at).toLocaleString()}
                      </div>
                    ))}
                  </div>
                )}

                <ConfirmDialog
                  open={showMemoConfirm}
                  title="Generate Memo"
                  message={`Generate decision memo${memos.length > 0 ? ` (version ${memos.length + 1})` : ''}?`}
                  onConfirm={() => { setShowMemoConfirm(false); handleGenerateMemo(); }}
                  onCancel={() => setShowMemoConfirm(false)}
                  confirmText="Generate"
                />
              </div>
            ),
          },
          {
            key: 'audit',
            label: 'Audit Trail',
            children: (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Pipeline Execution</div>
                {traces.length === 0 ? (
                  <Empty description="No trace data available" />
                ) : (
                  <Table
                    dataSource={traces}
                    columns={traceColumns}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    style={{ marginBottom: 24 }}
                  />
                )}

                <div style={{ fontWeight: 600, marginBottom: 12 }}>Story History</div>
                {auditLog.length === 0 ? (
                  <Empty description="No audit entries" />
                ) : (
                  <Timeline
                    items={auditLog.map(entry => ({
                      color: entry.action === 'confirmed' ? 'green' : entry.action === 'rejected' ? 'red' : 'blue',
                      content: (
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>
                            {new Date(entry.created_at).toLocaleString()}
                          </div>
                          <div>
                            <Tag>{entry.entity_type}</Tag>
                            {entry.action} (ID: {entry.entity_id})
                          </div>
                        </div>
                      ),
                    }))}
                  />
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Backlog Item Preview Modal */}
      <Modal
        title={viewBacklogItem ? `${viewBacklogItem.external_id}: ${viewBacklogItem.title}` : ''}
        open={!!viewBacklogItem}
        onCancel={() => setViewBacklogItem(null)}
        footer={<Button onClick={() => setViewBacklogItem(null)}>Close</Button>}
        width={700}
        destroyOnHidden
      >
        {viewBacklogItem && (
          <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
            <Descriptions.Item label="ID">{viewBacklogItem.external_id}</Descriptions.Item>
            <Descriptions.Item label="Type"><Tag color={viewBacklogItem.type === 'epic' ? 'purple' : viewBacklogItem.type === 'bug' ? 'red' : viewBacklogItem.type === 'story' ? 'blue' : 'default'}>{viewBacklogItem.type}</Tag></Descriptions.Item>
            <Descriptions.Item label="Title" span={2}>{viewBacklogItem.title}</Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>{viewBacklogItem.description || <span style={{ color: 'var(--gray-400)' }}>No description</span>}</Descriptions.Item>
            <Descriptions.Item label="Epic">{viewBacklogItem.epic_id || '—'}</Descriptions.Item>
            <Descriptions.Item label="Status"><Tag>{viewBacklogItem.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Priority">{viewBacklogItem.priority ? <Tag color={viewBacklogItem.priority === 'critical' ? 'red' : viewBacklogItem.priority === 'high' ? 'orange' : 'blue'}>{viewBacklogItem.priority}</Tag> : '—'}</Descriptions.Item>
            <Descriptions.Item label="Labels">
              {viewBacklogItem.labels && viewBacklogItem.labels.length > 0
                ? viewBacklogItem.labels.map((l: string) => <Tag key={l} style={{ marginBottom: 2 }}>{l}</Tag>)
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Acceptance Criteria" span={2}>
              {viewBacklogItem.acceptance_criteria && viewBacklogItem.acceptance_criteria.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {viewBacklogItem.acceptance_criteria.map((ac: string, i: number) => <li key={i}>{ac}</li>)}
                </ul>
              ) : <span style={{ color: 'var(--gray-400)' }}>None</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Dependencies" span={2}>
              {viewBacklogItem.dependencies && viewBacklogItem.dependencies.length > 0
                ? viewBacklogItem.dependencies.map((d: string) => <Tag key={d} color="blue">{d}</Tag>)
                : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
