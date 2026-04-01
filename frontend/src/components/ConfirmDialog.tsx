import { Modal, Input } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: (input?: string) => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  requireInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  requireInput = false,
  inputLabel,
  inputPlaceholder,
  loading = false,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');

  const handleConfirm = () => {
    onConfirm(requireInput ? inputValue : undefined);
    setInputValue('');
  };

  const handleCancel = () => {
    onCancel();
    setInputValue('');
  };

  return (
    <Modal
      open={open}
      title={
        <span>
          <ExclamationCircleOutlined style={{ color: danger ? 'var(--error)' : 'var(--warning)', marginRight: 8 }} />
          {title}
        </span>
      }
      onOk={handleConfirm}
      onCancel={handleCancel}
      okText={confirmText}
      cancelText={cancelText}
      okButtonProps={{
        danger,
        disabled: requireInput && !inputValue.trim(),
        loading,
      }}
      destroyOnClose
    >
      <p style={{ marginBottom: requireInput ? 16 : 0 }}>{message}</p>
      {requireInput && (
        <div>
          {inputLabel && <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-sec)' }}>{inputLabel}</label>}
          <Input.TextArea
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={inputPlaceholder || 'Enter rationale...'}
            rows={3}
          />
        </div>
      )}
    </Modal>
  );
}
