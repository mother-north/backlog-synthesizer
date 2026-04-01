import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Button, Tag, Skeleton, Table, Select, Input, Timeline, App, Empty, Checkbox } from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  WarningOutlined,
  SearchOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { meetingsApi, storiesApi, checksApi, epicsApi, memosApi, auditApi } from '../services/api';
import { statusColors } from '../theme';
import { useAuthStore } from '../store/auth';
import StoryCard from '../components/StoryCard';
import EpicProposal from '../components/EpicProposal';
import CheckPanel from '../components/CheckPanel';
import PipelineProgress from '../components/PipelineProgress';
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

export default function MeetingView() {
  const { id } = useParams<{ id: string }>();
  const meetingId = Number(id);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const userRoles = user?.roles || [];

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [expandedStory, setExpandedStory] = useState<number | null>(null);
  const [collapsedEpics, setCollapsedEpics] = useState<Set<number>>(new Set());

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

  const fetchData = useCallback(async () => {
    try {
      const [meetingRes, storiesRes, epicsRes, checksRes] = await Promise.all([
        meetingsApi.getById(meetingId),
        storiesApi.getByMeeting(meetingId),
        epicsApi.getByMeeting(meetingId),
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

  // Group stories by epic
  const storiesByEpic = stories.reduce<Record<number | string, Story[]>>((acc, story) => {
    const key = story.epic_id || 'orphan';
    if (!acc[key]) acc[key] = [];
    acc[key].push(story);
    return acc;
  }, {});

  const proposedEpics = epics.filter(e => e.is_proposed);
  const existingEpics = epics.filter(e => !e.is_proposed);

  // Confirmable stories for bulk
  const confirmableStories = stories.filter(s =>
    s.status === 'awaiting_confirmation' &&
    (!s.checks || s.checks.filter(c => c.status === 'open').length === 0) &&
    s.epic_id
  );

  // Checks filtering
  const filteredChecks = checks.filter(c => {
    if (checkStatusFilter !== 'all' && c.status !== checkStatusFilter) return false;
    if (checkRoleFilter === 'mine' && !userRoles.includes(c.routed_to)) return false;
    if (checkRoleFilter !== 'all' && checkRoleFilter !== 'mine' && c.routed_to !== checkRoleFilter) return false;
    return true;
  });

  const checksColumns: ColumnsType<Check> = [
    {
      title: 'Type',
      dataIndex: 'check_type',
      key: 'check_type',
      render: (type: string) => <Tag>{type}</Tag>,
    },
    {
      title: 'Story',
      dataIndex: 'story_title',
      key: 'story',
    },
    {
      title: 'Role',
      dataIndex: 'routed_to',
      key: 'role',
      render: (role: string) => <Tag color="blue">{role}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
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
      render: (_, record) => (
        record.status === 'open' && userRoles.includes(record.routed_to) ? (
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
        <h1 style={{ flex: 1, fontSize: 20, fontWeight: 700, margin: 0 }}>{meeting.title}</h1>
        <Tag
          color={meeting.status === 'completed' ? 'success' : meeting.status === 'in_review' ? 'warning' : 'processing'}
          style={{ fontSize: 13, padding: '4px 12px' }}
        >
          {formatStatus(meeting.status)}
        </Tag>
      </div>

      {/* Pipeline progress */}
      {isProcessing && (
        <PipelineProgress
          meetingId={meetingId}
          initialSteps={meeting.pipeline_progress as any || undefined}
          onComplete={fetchData}
        />
      )}

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
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

                {/* Proposed epics */}
                {proposedEpics.map(epic => (
                  <EpicProposal
                    key={epic.id}
                    epic={epic}
                    existingEpics={existingEpics}
                    onUpdate={fetchData}
                  />
                ))}

                {/* Stories grouped by epic */}
                {stories.length === 0 ? (
                  <Empty description={isProcessing ? "Stories will appear after processing completes" : "No stories generated for this meeting"} />
                ) : (
                  <>
                    {/* Existing epics with stories */}
                    {epics.filter(e => storiesByEpic[e.id]).map(epic => (
                      <div key={epic.id} className="bs-epic-section">
                        <div
                          className={`bs-epic-header${epic.is_proposed ? ' proposed' : ''}`}
                          onClick={() => {
                            setCollapsedEpics(prev => {
                              const next = new Set(prev);
                              next.has(epic.id) ? next.delete(epic.id) : next.add(epic.id);
                              return next;
                            });
                          }}
                        >
                          {collapsedEpics.has(epic.id) ? <RightOutlined /> : <DownOutlined />}
                          <span>Epic: {epic.title}</span>
                          {epic.external_id && <Tag>{epic.external_id}</Tag>}
                          {epic.is_proposed && <Tag color="orange">Proposed</Tag>}
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400, color: 'var(--text-sec)' }}>
                            {storiesByEpic[epic.id]?.length || 0} stories
                          </span>
                        </div>
                        {!collapsedEpics.has(epic.id) && (
                          <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 8 }}>
                            {storiesByEpic[epic.id]?.map(story => (
                              <StoryCard
                                key={story.id}
                                story={story}
                                epics={epics}
                                expanded={expandedStory === story.id}
                                onToggle={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
                                onUpdate={fetchData}
                                userRoles={userRoles}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Orphan stories */}
                    {storiesByEpic['orphan'] && (
                      <div className="bs-epic-section">
                        <div className="bs-epic-header" style={{ background: '#fff1f0', borderColor: '#ffccc7', color: '#cf1322' }}>
                          <WarningOutlined />
                          <span>No Epic Assigned</span>
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400 }}>
                            {storiesByEpic['orphan'].length} stories
                          </span>
                        </div>
                        <div style={{ border: '1px solid #ffccc7', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 8 }}>
                          {storiesByEpic['orphan'].map(story => (
                            <StoryCard
                              key={story.id}
                              story={story}
                              epics={epics}
                              expanded={expandedStory === story.id}
                              onToggle={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
                              onUpdate={fetchData}
                              userRoles={userRoles}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
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
                  <Empty description="No epics found for this meeting" />
                ) : (
                  <Table
                    dataSource={epics}
                    rowKey="id"
                    pagination={false}
                    columns={[
                      { title: 'ID', dataIndex: 'external_id', key: 'id', width: 100, render: (v: string) => v || '-' },
                      { title: 'Title', dataIndex: 'title', key: 'title' },
                      { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (v: string) => <Tag color={v === 'active' ? 'green' : v === 'proposed' ? 'blue' : 'default'}>{v}</Tag> },
                      { title: 'Proposed', dataIndex: 'is_proposed', key: 'proposed', width: 100, render: (v: boolean) => v ? <Tag color="blue">Yes</Tag> : 'No' },
                      { title: 'Stories', key: 'stories', width: 80, render: (_: unknown, record: any) => stories.filter(s => s.epic_id === record.id).length },
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
                        expandedRowRender: (record) =>
                          resolvingCheckId === record.id ? (
                            <CheckPanel
                              check={record}
                              onClose={() => setResolvingCheckId(null)}
                              onResolved={() => { setResolvingCheckId(null); fetchData(); }}
                            />
                          ) : null,
                        expandedRowKeys: resolvingCheckId ? [resolvingCheckId] : [],
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
                      children: (
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
    </div>
  );
}
