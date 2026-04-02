import { useState } from 'react';
import { Radio, Input, Button, Space, App } from 'antd';
import { checksApi } from '../services/api';

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
  const { message } = App.useApp();

  const handleSave = async () => {
    setSaving(true);
    try {
      const notes = resolution === 'override' ? overrideText : resolution === 'dismiss' ? 'Dismissed' : 'Accepted';
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
    <div style={{ padding: '8px 0' }}>
      <Radio.Group value={resolution} onChange={e => setResolution(e.target.value)} style={{ marginBottom: 10 }}>
        <Space orientation="vertical">
          <Radio value="accept">Accept proposed resolution</Radio>
          <Radio value="override">Override with custom resolution</Radio>
          <Radio value="dismiss">Dismiss (not an issue)</Radio>
        </Space>
      </Radio.Group>

      {resolution === 'override' && (
        <div style={{ marginBottom: 10 }}>
          <Input.TextArea
            value={overrideText}
            onChange={e => setOverrideText(e.target.value)}
            placeholder="Enter your resolution..."
            rows={2}
          />
        </div>
      )}

      <Space>
        <Button
          type="primary"
          size="small"
          onClick={handleSave}
          loading={saving}
          disabled={resolution === 'override' && !overrideText.trim()}
        >
          Save
        </Button>
        <Button size="small" onClick={onClose}>Cancel</Button>
      </Space>
    </div>
  );
}
