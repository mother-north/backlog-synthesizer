import { useState } from 'react';
import { Form, Input, Button, App } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';

export default function Profile() {
  const [loading, setLoading] = useState(false);
  const [passwordForm] = Form.useForm();
  const { message } = App.useApp();
  const user = useAuthStore(s => s.user);

  const handleChangePassword = async (values: { currentPassword: string; newPassword: string }) => {
    setLoading(true);
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      message.success('Password changed successfully');
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="bs-breadcrumbs">Settings &gt; User Profile</div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">User Profile</h1>
      </div>

      <div style={{ maxWidth: 500 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Account Info</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <div><span style={{ color: 'var(--text-sec)', width: 100, display: 'inline-block' }}>Name:</span> {user?.displayName}</div>
            <div><span style={{ color: 'var(--text-sec)', width: 100, display: 'inline-block' }}>Email:</span> {user?.email}</div>
            <div><span style={{ color: 'var(--text-sec)', width: 100, display: 'inline-block' }}>Roles:</span> {user?.roles?.join(', ')}</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>
            <LockOutlined style={{ marginRight: 8 }} />
            Change Password
          </div>
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handleChangePassword}
          >
            <Form.Item
              name="currentPassword"
              label="Current Password"
              rules={[{ required: true, message: 'Enter your current password' }]}
            >
              <Input.Password placeholder="Current password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="New Password"
              rules={[
                { required: true, message: 'Enter a new password' },
                { min: 6, message: 'Password must be at least 6 characters' },
              ]}
            >
              <Input.Password placeholder="New password" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="Confirm New Password"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Confirm your new password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="Confirm new password" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                Change Password
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}
