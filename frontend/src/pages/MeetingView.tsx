import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Button, Tag, Skeleton, Table, Input, Timeline, App, Empty, Checkbox, Modal, Tooltip, Radio } from 'antd';
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  DeleteOutlined,
  WarningOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { marked } from 'marked';
import { meetingsApi, storiesApi, checksApi, epicsApi, memosApi, auditApi } from '../services/api';
import { statusColors } from '../theme';
import { useAuthStore } from '../store/auth';
import StoryCard from '../components/StoryCard';
// EpicProposal moved to Epics tab
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
  proposed_by_meeting?: number;
  proposal_justification?: string;
  story_count?: number;
  status?: string;
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
  resolution_notes?: string;
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
  created_at: string;
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
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null);
  // collapsedEpics removed — stories now in table

  // Memo
  const [generatingMemo, setGeneratingMemo] = useState(false);
  const [showMemoConfirm, setShowMemoConfirm] = useState(false);

  // Story reject dialog
  const [showStoryReject, setShowStoryReject] = useState(false);
  // Trace JSON preview
  const [viewTraceJson, setViewTraceJson] = useState<AgentTrace | null>(null);

  // Meeting actions
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReevaluateConfirm, setShowReevaluateConfirm] = useState(false);

  // Bulk confirm
  const [selectedStories, setSelectedStories] = useState<number[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  // Transcript search & citation highlights
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [showStoryCitations, setShowStoryCitations] = useState(true);

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

  // Citation ranges — computed once when stories or transcript change (positions only)
  const citationRanges = useMemo(() => {
    if (!meeting?.transcript || stories.length === 0) return [];
    const transcript = meeting.transcript;

    // Build normalized transcript with position mapping back to original
    const normMap: number[] = []; // normMap[normIdx] = originalIdx
    let normChars: string[] = [];
    let i = 0;
    while (i < transcript.length) {
      // Skip ** (markdown bold)
      if (transcript[i] === '*' && transcript[i + 1] === '*') { i += 2; continue; }
      let ch = transcript[i];
      // Normalize characters
      if (ch === '\u2014' || ch === '\u2013' || ch === '\u0014') ch = '-';
      else if (ch === '\u2018' || ch === '\u2019') ch = "'";
      else if (ch === '\u201C' || ch === '\u201D') ch = '"';
      normMap.push(i);
      normChars.push(ch);
      i++;
    }
    const normTranscript = normChars.join('');

    // Normalize citation text (same rules, no position mapping needed)
    const normCit = (t: string) => t
      .replace(/\*\*/g, '')
      .replace(/[\u0014\u2014\u2013]/g, '-')
      .replace(/[\u2018\u2019\u0060]/g, "'")
      .replace(/[\u201C\u201D]/g, '"');
    const stripQuotes = (t: string) => t.replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, '').trim();

    const ranges: { start: number; end: number; storyId: number }[] = [];
    for (const s of stories) {
      if (!s.source_citation || s.source_citation.length < 10) continue;
      const clean = normCit(stripQuotes(s.source_citation));
      let normIdx = -1;
      for (const len of [80, 40, 25]) {
        const snippet = clean.slice(0, len).trim();
        if (!snippet) continue;
        normIdx = normTranscript.indexOf(snippet);
        if (normIdx !== -1) break;
        normIdx = normTranscript.toLowerCase().indexOf(snippet.toLowerCase());
        if (normIdx !== -1) break;
      }
      if (normIdx === -1) continue;
      // Find end in normalized space
      const fullNormIdx = normTranscript.indexOf(clean, normIdx);
      const normEnd = fullNormIdx !== -1 ? fullNormIdx + clean.length : normIdx + Math.min(clean.length, 200);
      // Map back to original positions
      const origStart = normMap[normIdx] ?? normIdx;
      const origEnd = (normMap[Math.min(normEnd, normMap.length - 1)] ?? normEnd) + 1;
      ranges.push({ start: origStart, end: Math.min(origEnd, transcript.length), storyId: s.id });
    }
    // Sort by start, remove overlaps (first match wins)
    ranges.sort((a, b) => a.start - b.start);
    const deduped: typeof ranges = [];
    for (const r of ranges) {
      if (deduped.length === 0 || r.start >= deduped[deduped.length - 1].end) {
        deduped.push(r);
      }
    }
    return deduped;
  }, [meeting?.transcript, stories.map(s => `${s.id}:${s.source_citation?.slice(0, 20)}`).join(',')]);

  // storiesByEpic removed — stories now in flat table with Epic column

  // proposedEpics/existingEpics — shown in Epics tab

  // Confirmable stories for bulk
  const confirmableStories = storiesWithChecks.filter(s =>
    s.status === 'awaiting_confirmation' &&
    s.checks.filter(c => c.status === 'open').length === 0 &&
    s.epic_id
  );



  const traceColumns: ColumnsType<AgentTrace> = [
    { title: 'Date/Time', dataIndex: 'created_at', key: 'date', width: 160, render: (d: string) => d ? new Date(d).toLocaleString() : '—' },
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
        {meeting.status === 'uploaded' && (
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
        {meeting.status !== 'processing' && meeting.status !== 'uploaded' && (
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setShowReevaluateConfirm(true)}
          >
            Re-evaluate
          </Button>
        )}
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete
        </Button>
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
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                  <Radio.Group value={showStoryCitations ? 'show' : 'hide'} onChange={e => setShowStoryCitations(e.target.value === 'show')} buttonStyle="solid" size="middle">
                    <Radio.Button value="show">Show Stories</Radio.Button>
                    <Radio.Button value="hide">Hide Stories</Radio.Button>
                  </Radio.Group>
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
                    ) : showStoryCitations && citationRanges.length > 0 ? (
                      (() => {
                        const t = meeting.transcript;
                        const parts: React.ReactNode[] = [];
                        let pos = 0;
                        for (const range of citationRanges) {
                          if (range.start > pos) {
                            parts.push(<span key={`t-${pos}`}>{t.slice(pos, range.start)}</span>);
                          }
                          const story = storiesWithChecks.find(s => s.id === range.storyId);
                          const bg = story?.status === 'confirmed' || story?.status === 'ready_to_push'
                            ? '#d9f7be' : story?.status === 'rejected' ? '#ffa39e' : '#fff7e6';
                          const borderColor = story?.status === 'confirmed' || story?.status === 'ready_to_push'
                            ? '#52c41a' : story?.status === 'rejected' ? '#ff4d4f' : '#faad14';
                          const citText = t.slice(range.start, range.end);
                          const lastSpaceIdx = citText.lastIndexOf(' ', citText.length - 1);
                          const mainText = lastSpaceIdx > 0 ? citText.slice(0, lastSpaceIdx + 1) : citText;
                          const tailText = lastSpaceIdx > 0 ? citText.slice(lastSpaceIdx + 1) : '';
                          parts.push(
                            <mark key={`c-${range.storyId}`} onClick={() => setSelectedStoryId(range.storyId)}
                              style={{ background: bg, borderRadius: 3, padding: '1px 2px', borderBottom: `2px solid ${borderColor}`, cursor: 'pointer' }}>
                              {mainText}<span style={{ whiteSpace: 'nowrap' }}>{tailText}<span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 4, fontSize: 11, fontWeight: 600, color: borderColor, fontStyle: 'normal', verticalAlign: 'middle' }}>
                                <EyeOutlined /> #{range.storyId}
                              </span></span>
                            </mark>
                          );
                          pos = range.end;
                        }
                        if (pos < t.length) {
                          parts.push(<span key={`t-${pos}`}>{t.slice(pos)}</span>);
                        }
                        return <>{parts}</>;
                      })()
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
            label: `New Stories (${stories.length})`,
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
                    onRow={(record) => ({
                      onClick: () => setSelectedStoryId(record.id),
                      style: { cursor: 'pointer' },
                    })}
                    columns={[
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
                        title: 'Criticality',
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
                        filters: [
                          ...epics
                            .filter(e => storiesWithChecks.some(s => s.epic_id === e.id))
                            .map(e => ({ text: `${e.external_id ? e.external_id + ' ' : ''}${e.title}`, value: e.id })),
                          ...(storiesWithChecks.some(s => !s.epic_id) ? [{ text: 'No Epic', value: 0 }] : []),
                        ],
                        onFilter: (value, record) => value === 0 ? !record.epic_id : record.epic_id === value,
                        render: (_: unknown, record: any) => {
                          const epic = epics.find(e => e.id === record.epic_id);
                          return epic ? (
                            <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                              {epic.external_id && <Tag color={epic.is_proposed ? 'orange' : 'blue'} style={{ marginRight: 4 }}>{epic.external_id}</Tag>}
                              {epic.title}
                            </span>
                          ) : (
                            <Tag color="error">No Epic</Tag>
                          );
                        },
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
            label: `New Epics (${epics.filter(e => e.is_proposed && e.proposed_by_meeting === meetingId).length})`,
            children: (
              <div>
                {epics.filter(e => e.is_proposed && e.proposed_by_meeting === meetingId).length === 0 ? (
                  <Empty description="No new epics proposed for this meeting" />
                ) : (
                  <Table
                    dataSource={epics.filter(e => e.is_proposed && e.proposed_by_meeting === meetingId)}
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
                      { title: 'Status', dataIndex: 'status', key: 'status', width: 120,
                        render: (status: string) => (
                        <Tag color={status === 'proposed' ? 'orange' : status === 'active' ? 'green' : status === 'rejected' ? 'red' : 'default'}>
                          {status}
                        </Tag>
                      )},
                      { title: 'Stories', key: 'meeting_stories', width: 100,
                        render: (_: unknown, record: any) => {
                          const count = storiesWithChecks.filter(s => s.epic_id === record.id).length;
                          return count > 0 ? <Tag color="blue">{count}</Tag> : <span style={{ color: 'var(--gray-400)' }}>0</span>;
                        }},
                      { title: 'Actions', key: 'actions', width: 180, render: (_: unknown, record: any) => record.status === 'proposed' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button size="small" type="primary" onClick={() => epicsApi.approve(record.id).then(() => { message.success('Epic approved'); fetchData(); })}>Approve</Button>
                          <Button size="small" danger onClick={() => epicsApi.reject(record.id, { action: 'reject', rationale: 'Rejected' }).then(() => { message.success('Epic rejected'); fetchData(); })}>Reject</Button>
                        </div>
                      ) : (
                        <Tag color={record.status === 'active' ? 'success' : 'error'}>{record.status}</Tag>
                      )},
                    ]}
                  />
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
                  <div className="bs-memo-content" style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
                    <div
                      style={{ lineHeight: 1.8 }}
                      dangerouslySetInnerHTML={{ __html: marked.parse(memos[0]?.content || '') as string }}
                    />
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
                    columns={[
                      ...traceColumns,
                      {
                        title: '',
                        key: 'json',
                        width: 80,
                        render: (_: unknown, record: AgentTrace) => (
                          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewTraceJson(record)}>
                            JSON
                          </Button>
                        ),
                      },
                    ]}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    style={{ marginBottom: 24 }}
                  />
                )}

                <div style={{ fontWeight: 600, marginBottom: 12 }}>History</div>
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
                            {(entry as any).user_email && <span style={{ marginLeft: 8 }}>by <strong>{(entry as any).user_email}</strong></span>}
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

                {/* JSON Preview Modal */}
                <Modal
                  title={viewTraceJson ? `${viewTraceJson.agent_name} — Output` : ''}
                  open={!!viewTraceJson}
                  onCancel={() => setViewTraceJson(null)}
                  footer={<Button onClick={() => setViewTraceJson(null)}>Close</Button>}
                  width={600}
                  destroyOnHidden
                >
                  {viewTraceJson && (
                    <pre style={{ background: 'var(--gray-50)', padding: 16, borderRadius: 8, fontSize: 12, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(viewTraceJson.output_summary, null, 2)}
                    </pre>
                  )}
                </Modal>
              </div>
            ),
          },
        ]}
      />

      {/* Story Detail Modal */}
      <Modal
        title={(() => {
          const s = storiesWithChecks.find(s => s.id === selectedStoryId);
          if (!s) return '';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{s.title}</span>
              <Tag color={s.status === 'confirmed' || s.status === 'ready_to_push' ? 'success' : s.status === 'rejected' ? 'error' : s.status === 'processing' ? 'processing' : 'warning'}>
                {s.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </Tag>
            </div>
          );
        })()}
        open={!!selectedStoryId}
        onCancel={() => setSelectedStoryId(null)}
        footer={(() => {
          const story = storiesWithChecks.find(s => s.id === selectedStoryId);
          if (!story) return <Button onClick={() => setSelectedStoryId(null)}>Close</Button>;
          const openChecks = story.checks?.filter((c: any) => c.status === 'open').length || 0;
          const canConfirm = openChecks === 0 && story.epic_id && story.status !== 'confirmed' && story.status !== 'rejected' && story.status !== 'ready_to_push';
          const canReject = story.status !== 'confirmed' && story.status !== 'rejected' && story.status !== 'ready_to_push';
          const showActions = canConfirm || canReject;
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {showActions && (
                  <>
                    <Tooltip title={!canConfirm ? (openChecks > 0 ? `${openChecks} open checks` : !story.epic_id ? 'No epic assigned' : '') : ''}>
                      <Button type="primary" icon={<CheckCircleOutlined />} disabled={!canConfirm}
                        onClick={() => {
                          storiesApi.confirm(story.id).then(() => {
                            message.success(`Story "${story.title}" confirmed`);
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
              <Button onClick={() => setSelectedStoryId(null)}>Close</Button>
            </div>
          );
        })()}
        width={800}
        destroyOnHidden
      >
        {(() => {
          const story = storiesWithChecks.find(s => s.id === selectedStoryId);
          return story ? (
            <StoryCard
              story={story}
              epics={epics}
              expanded={true}
              onToggle={() => {}}
              onUpdate={() => { fetchData(); }}
              userRoles={userRoles}
              transcript={meeting?.transcript}
            />
          ) : null;
        })()}
        <ConfirmDialog
          open={showStoryReject}
          title="Reject Story"
          message={`Reject "${storiesWithChecks.find(s => s.id === selectedStoryId)?.title}"?`}
          onConfirm={(input) => {
            const story = storiesWithChecks.find(s => s.id === selectedStoryId);
            if (story && input) {
              storiesApi.reject(story.id, input).then(() => {
                message.success(`Story "${story.title}" rejected`);
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

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Meeting"
        message={`Delete "${meeting.title}" and all associated stories, checks, and memos? This cannot be undone.`}
        onConfirm={async () => {
          try {
            await meetingsApi.remove(meetingId);
            message.success('Meeting deleted');
            navigate('/meetings');
          } catch {
            message.error('Failed to delete meeting');
          }
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Delete"
        danger
      />

      {/* Re-evaluate Confirm */}
      <ConfirmDialog
        open={showReevaluateConfirm}
        title="Re-evaluate Meeting"
        message={`Re-evaluate "${meeting.title}"? All existing stories, checks, and memos will be cleared and the pipeline will re-run.`}
        onConfirm={async () => {
          try {
            await meetingsApi.reevaluate(meetingId);
            message.success('Re-evaluation started');
            fetchData();
          } catch {
            message.error('Failed to start re-evaluation');
          }
          setShowReevaluateConfirm(false);
        }}
        onCancel={() => setShowReevaluateConfirm(false)}
        confirmText="Re-evaluate"
        danger
      />
    </div>
  );
}
