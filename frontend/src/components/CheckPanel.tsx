import { useState } from 'react';
import { Radio, Input, Button, Space, App } from 'antd';
import { checksApi } from '../services/api';
import ConfirmDialog from './ConfirmDialog';

interface Check {
  id: number;
  check_type: string;
  details: string;
  proposed_resolution: string;
  routed_to: string;
  status: string;
}

interface CheckPanelProps {
  check: Check;
  onClose: () => void;
  onResolved: () => void;
}

export default function CheckPanel({ check, onClose, onResolved }: CheckPanelProps) {
  const [resolution, setResolution] = useState<'accept' | 'override' | 'dismiss'>('accept');
  const [overrideText, setOverrideText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { message } = App.useApp();

  const handleSave = async () => {
    setSaving(true);
    try {
      const notes = resolution === 'override' ? overrideText : resolution === 'dismiss' ? 'Dismissed - not an issue' : 'Accepted proposed resolution';
      await checksApi.resolve(check.id, { resolution, notes });
      message.success('Check resolved');
      onResolved();
    } catch {
      message.error('Failed to resolve check');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bs-check-panel">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          Check: {check.check_type} - "{check.details}"
        </div>
        {check.proposed_resolution && (
          <div style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 8 }}>
            <strong>Proposed:</strong> {check.proposed_resolution}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-sec)', display: 'block', marginBottom: 8 }}>Resolution</label>
        <Radio.Group value={resolution} onChange={e => setResolution(e.target.value)}>
          <Space direction="vertical">
            <Radio value="accept">Accept proposed resolution</Radio>
            <Radio value="override">Override with custom resolution</Radio>
            <Radio value="dismiss">Dismiss (not an issue)</Radio>
          </Space>
        </Radio.Group>
      </div>

      {resolution === 'override' && (
        <div style={{ marginBottom: 12 }}>
          <Input.TextArea
            value={overrideText}
            onChange={e => setOverrideText(e.target.value)}
            placeholder="Enter your resolution..."
            rows={3}
          />
        </div>
      )}

      <Space>
        <Button
          type="primary"
          onClick={() => setShowConfirm(true)}
          loading={saving}
          disabled={resolution === 'override' && !overrideText.trim()}
        >
          Save Resolution
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </Space>

      <ConfirmDialog
        open={showConfirm}
        title="Save Resolution"
        message="Save this resolution?"
        onConfirm={() => { setShowConfirm(false); handleSave(); }}
        onCancel={() => setShowConfirm(false)}
        confirmText="Save"
      />
    </div>
  );
}
