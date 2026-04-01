import { useState } from 'react';
import { Button, Space, Tag, Select, App } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MergeCellsOutlined,
} from '@ant-design/icons';
import { epicsApi } from '../services/api';
import ConfirmDialog from './ConfirmDialog';

interface Epic {
  id: number;
  title: string;
  external_id?: string;
  is_proposed?: boolean;
  proposal_justification?: string;
  story_count?: number;
}

interface EpicProposalProps {
  epic: Epic;
  existingEpics: Epic[];
  onUpdate: () => void;
}

export default function EpicProposal({ epic, existingEpics, onUpdate }: EpicProposalProps) {
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'merge' | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const handleApprove = async () => {
    setLoading(true);
    try {
      await epicsApi.approve(epic.id);
      message.success(`Epic "${epic.title}" approved - ${epic.story_count || 0} stories assigned`);
      onUpdate();
    } catch {
      message.error('Failed to approve epic');
    } finally {
      setLoading(false);
      setDialog(null);
    }
  };

  const handleReject = async (rationale?: string) => {
    setLoading(true);
    try {
      await epicsApi.reject(epic.id, { action: 'reject', rationale });
      message.warning(`Epic "${epic.title}" rejected`);
      onUpdate();
    } catch {
      message.error('Failed to reject epic');
    } finally {
      setLoading(false);
      setDialog(null);
    }
  };

  const handleMerge = async () => {
    if (!mergeTarget) return;
    setLoading(true);
    try {
      await epicsApi.merge(epic.id, mergeTarget);
      const target = existingEpics.find(e => e.id === mergeTarget);
      message.success(`Merged into "${target?.title}" - ${epic.story_count || 0} stories reassigned`);
      onUpdate();
    } catch {
      message.error('Failed to merge epic');
    } finally {
      setLoading(false);
      setDialog(null);
    }
  };

  return (
    <div style={{ padding: 16, background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Tag color="orange">Proposed Epic</Tag>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{epic.title}</span>
        {epic.story_count !== undefined && (
          <Tag>{epic.story_count} stories</Tag>
        )}
      </div>

      {epic.proposal_justification && (
        <p style={{ fontSize: 13, color: 'var(--gray-800)', marginBottom: 12, fontStyle: 'italic', lineHeight: 1.6 }}>
          "{epic.proposal_justification}"
        </p>
      )}

      <Space wrap>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => setDialog('approve')}
          loading={loading}
        >
          Approve Epic
        </Button>
        <Space.Compact>
          <Select
            placeholder="Merge into..."
            style={{ width: 200 }}
            onChange={(v) => setMergeTarget(v)}
            options={existingEpics.filter(e => !e.is_proposed && e.id !== epic.id).map(e => ({
              value: e.id,
              label: `${e.title}${e.external_id ? ` (${e.external_id})` : ''}`,
            }))}
          />
          <Button
            icon={<MergeCellsOutlined />}
            onClick={() => setDialog('merge')}
            disabled={!mergeTarget}
          >
            Merge
          </Button>
        </Space.Compact>
        <Button
          danger
          icon={<CloseCircleOutlined />}
          onClick={() => setDialog('reject')}
        >
          Reject Epic
        </Button>
      </Space>

      <ConfirmDialog
        open={dialog === 'approve'}
        title="Approve Epic"
        message={`Approve new epic "${epic.title}"? ${epic.story_count || 0} stories will be assigned.`}
        onConfirm={handleApprove}
        onCancel={() => setDialog(null)}
        confirmText="Approve"
        loading={loading}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        title="Reject Epic"
        message={`Reject epic "${epic.title}"? Choose what happens to ${epic.story_count || 0} stories.`}
        onConfirm={handleReject}
        onCancel={() => setDialog(null)}
        confirmText="Reject Epic"
        danger
        requireInput
        inputLabel="Rationale"
        inputPlaceholder="Why is this epic being rejected?"
        loading={loading}
      />
      <ConfirmDialog
        open={dialog === 'merge'}
        title="Merge Epic"
        message={`Merge into ${existingEpics.find(e => e.id === mergeTarget)?.title || 'selected epic'}? ${epic.story_count || 0} stories will be reassigned.`}
        onConfirm={handleMerge}
        onCancel={() => setDialog(null)}
        confirmText="Merge"
        loading={loading}
      />
    </div>
  );
}
