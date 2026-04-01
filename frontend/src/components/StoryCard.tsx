import { useState } from 'react';
import { Tag, Select, Button, Input, Space, Badge, Tooltip, App } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { storiesApi } from '../services/api';
import { statusColors, confidenceColors, groundingColors } from '../theme';
import CheckPanel from './CheckPanel';
import ConfirmDialog from './ConfirmDialog';

interface Check {
  id: number;
  check_type: string;
  details: string;
  proposed_resolution: string;
  routed_to: string;
  status: string;
  resolution_notes?: string;
}

interface Epic {
  id: number;
  title: string;
  external_id?: string;
  is_proposed?: boolean;
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
  checks: Check[];
  feature_tags?: string[];
}

interface StoryCardProps {
  story: Story;
  epics: Epic[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate: () => void;
  userRoles: string[];
}

const TYPE_COLORS: Record<string, string> = {
  feature: 'blue',
  bug: 'red',
  improvement: 'green',
  task: 'default',
  nfr: 'purple',
  tech_debt: 'orange',
};

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function StoryCard({ story, epics, expanded, onToggle, onUpdate, userRoles }: StoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(story.description);
  const [editCriteria, setEditCriteria] = useState(story.acceptance_criteria?.join('\n') || '');
  const [editEpicId, setEditEpicId] = useState(story.epic_id);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<'confirm' | 'reject' | 'escalate' | 'save' | null>(null);
  const [resolvingCheckId, setResolvingCheckId] = useState<number | null>(null);
  const { message } = App.useApp();

  const openChecks = story.checks?.filter(c => c.status === 'open') || [];
  const hasNoEpic = !story.epic_id;
  const canConfirm = openChecks.length === 0 && !hasNoEpic && story.status !== 'confirmed' && story.status !== 'rejected';

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await storiesApi.update(story.id, {
        description: editDesc,
        acceptance_criteria: editCriteria.split('\n').filter(c => c.trim()),
        epic_id: editEpicId || undefined,
      });
      message.info('Story updated - re-checking...');
      setEditing(false);
      onUpdate();
      setTimeout(() => message.success('Re-check complete'), 1500);
    } catch {
      message.error('Failed to update story');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    try {
      await storiesApi.confirm(story.id);
      message.success(`Story "${story.title}" confirmed`);
      onUpdate();
    } catch {
      message.error('Failed to confirm story');
    }
    setConfirmDialog(null);
  };

  const handleReject = async (rationale?: string) => {
    try {
      await storiesApi.reject(story.id, rationale || '');
      message.error(`Story "${story.title}" rejected`);
      onUpdate();
    } catch {
      message.error('Failed to reject story');
    }
    setConfirmDialog(null);
  };

  const handleEscalate = async () => {
    try {
      await storiesApi.escalate(story.id);
      message.warning('Story flagged for escalation');
      onUpdate();
    } catch {
      message.error('Failed to escalate story');
    }
    setConfirmDialog(null);
  };

  return (
    <div className="bs-story-card">
      <div className="bs-story-card-header" onClick={onToggle}>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>
          {expanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        <span
          className="status-badge"
          style={{
            background: `${statusColors[story.status] || 'var(--gray-400)'}20`,
            color: statusColors[story.status] || 'var(--gray-400)',
          }}
        >
          {formatStatus(story.status)}
        </span>
        <span style={{ flex: 1, fontWeight: 500 }}>{story.title}</span>
        <Tag color={TYPE_COLORS[story.type] || 'default'}>{story.type}</Tag>
        <Tooltip title={`Confidence: ${story.confidence}`}>
          <span className="confidence-dot" style={{ background: confidenceColors[story.confidence] || 'var(--gray-400)' }} />
        </Tooltip>
        <Tooltip title={`Grounding: ${story.grounding_status}`}>
          {story.grounding_status === 'valid' ? (
            <CheckCircleOutlined style={{ color: groundingColors.valid }} />
          ) : story.grounding_status === 'warning' ? (
            <WarningOutlined style={{ color: groundingColors.warning }} />
          ) : (
            <CloseCircleOutlined style={{ color: groundingColors.invalid }} />
          )}
        </Tooltip>
        {openChecks.length > 0 && (
          <Badge count={openChecks.length} size="small" color="var(--warning)">
            <WarningOutlined style={{ color: 'var(--warning)' }} />
          </Badge>
        )}
      </div>

      {expanded && (
        <div className="bs-story-card-body" style={{ paddingTop: 16 }}>
          {/* Epic assignment */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-sec)', display: 'block', marginBottom: 4 }}>Epic</label>
            {editing ? (
              <Select
                value={editEpicId}
                onChange={setEditEpicId}
                style={{ width: 300 }}
                placeholder="Select epic..."
                allowClear
                options={epics.map(e => ({
                  value: e.id,
                  label: `${e.title}${e.is_proposed ? ' (proposed)' : ''}${e.external_id ? ` (${e.external_id})` : ''}`,
                }))}
              />
            ) : (
              <span>
                {story.epic ? (
                  <>
                    {story.epic.title}
                    {story.epic.external_id && <span style={{ color: 'var(--text-sec)' }}> ({story.epic.external_id})</span>}
                    {story.epic.is_proposed && <Tag color="orange" style={{ marginLeft: 8 }}>Proposed</Tag>}
                  </>
                ) : (
                  <Tag color="red" icon={<ExclamationCircleOutlined />}>No Epic Assigned</Tag>
                )}
              </span>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-sec)' }}>Description</label>
              {!editing && (
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>Edit</Button>
              )}
            </div>
            {editing ? (
              <Input.TextArea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                rows={3}
              />
            ) : (
              <p style={{ color: 'var(--text)', lineHeight: 1.6 }}>{story.description}</p>
            )}
          </div>

          {/* Acceptance Criteria */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-sec)', display: 'block', marginBottom: 4 }}>Acceptance Criteria</label>
            {editing ? (
              <Input.TextArea
                value={editCriteria}
                onChange={e => setEditCriteria(e.target.value)}
                rows={4}
                placeholder="One criterion per line"
              />
            ) : (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {story.acceptance_criteria?.map((c, i) => (
                  <li key={i} style={{ lineHeight: 1.8, color: 'var(--text)' }}>{c}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Source Citation */}
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--blue-50)', borderRadius: 6, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 4 }}>Source Citation</div>
            <p style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--gray-800)', margin: 0 }}>"{story.source_citation}"</p>
            <Button type="link" size="small" icon={<LinkOutlined />} style={{ paddingLeft: 0, marginTop: 4 }}>
              View in transcript
            </Button>
          </div>

          {/* Edit actions */}
          {editing && (
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={() => setConfirmDialog('save')}
                >
                  Save Changes
                </Button>
                <Button icon={<CloseOutlined />} onClick={() => { setEditing(false); setEditDesc(story.description); setEditCriteria(story.acceptance_criteria?.join('\n') || ''); setEditEpicId(story.epic_id); }}>
                  Cancel
                </Button>
              </Space>
            </div>
          )}

          {/* Checks section */}
          {story.checks && story.checks.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
                Checks ({openChecks.length} open)
              </div>
              {story.checks.map(check => (
                <div key={check.id}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    <Tag color={check.status === 'open' ? 'warning' : check.status === 'resolved' ? 'success' : 'default'}>
                      {check.check_type}
                    </Tag>
                    <span style={{ flex: 1 }}>{check.details}</span>
                    <Tag>{check.routed_to}</Tag>
                    <span className="status-badge" style={{
                      background: `${statusColors[check.status] || 'var(--gray-400)'}20`,
                      color: statusColors[check.status] || 'var(--gray-400)',
                    }}>
                      {check.status}
                    </span>
                    {check.status === 'open' && userRoles.includes(check.routed_to) && (
                      <Button size="small" type="primary" onClick={() => setResolvingCheckId(check.id)}>
                        Resolve
                      </Button>
                    )}
                  </div>
                  {resolvingCheckId === check.id && (
                    <CheckPanel
                      check={check}
                      onClose={() => setResolvingCheckId(null)}
                      onResolved={() => { setResolvingCheckId(null); onUpdate(); }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Grounding section */}
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--gray-50)', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)' }}>Grounding</span>
              <span style={{ color: groundingColors[story.grounding_status] || 'var(--gray-400)', fontWeight: 600 }}>
                {story.grounding_status === 'valid' ? <><CheckCircleOutlined /> Valid</> :
                 story.grounding_status === 'warning' ? <><WarningOutlined /> Warning</> :
                 <><CloseCircleOutlined /> Invalid</>}
              </span>
            </div>
            {story.grounding_issues && story.grounding_issues.length > 0 && (
              <ul style={{ paddingLeft: 20, marginTop: 8, marginBottom: 0, fontSize: 13 }}>
                {story.grounding_issues.map((issue, i) => (
                  <li key={i} style={{ color: 'var(--error)' }}>{issue}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Action buttons */}
          {!editing && (
            <Space>
              <Tooltip title={!canConfirm ? (openChecks.length > 0 ? `${openChecks.length} open checks` : hasNoEpic ? 'No epic assigned' : '') : ''}>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!canConfirm}
                  onClick={() => setConfirmDialog('confirm')}
                >
                  Confirm
                </Button>
              </Tooltip>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => setConfirmDialog('reject')}
                disabled={story.status === 'confirmed' || story.status === 'rejected'}
              >
                Reject
              </Button>
              <Button
                icon={<ExclamationCircleOutlined />}
                onClick={() => setConfirmDialog('escalate')}
                disabled={story.status === 'confirmed' || story.status === 'rejected'}
              >
                Flag for Escalation
              </Button>
            </Space>
          )}

          {/* Confirm dialogs */}
          <ConfirmDialog
            open={confirmDialog === 'confirm'}
            title="Confirm Story"
            message="Confirm this story as ready to push?"
            onConfirm={handleConfirm}
            onCancel={() => setConfirmDialog(null)}
            confirmText="Confirm Story"
          />
          <ConfirmDialog
            open={confirmDialog === 'reject'}
            title="Reject Story"
            message="Reject this story?"
            onConfirm={(input) => handleReject(input)}
            onCancel={() => setConfirmDialog(null)}
            confirmText="Reject Story"
            danger
            requireInput
            inputLabel="Rationale (required)"
            inputPlaceholder="Enter reason for rejection..."
          />
          <ConfirmDialog
            open={confirmDialog === 'escalate'}
            title="Flag for Escalation"
            message="Flag this story for escalation? It will be marked as pending decision."
            onConfirm={handleEscalate}
            onCancel={() => setConfirmDialog(null)}
            confirmText="Escalate"
          />
          <ConfirmDialog
            open={confirmDialog === 'save'}
            title="Save Changes"
            message="Save changes? System will re-check for conflicts."
            onConfirm={handleSaveEdit}
            onCancel={() => setConfirmDialog(null)}
            confirmText="Save"
            loading={saving}
          />
        </div>
      )}
    </div>
  );
}
