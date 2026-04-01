import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Checkbox, App } from 'antd';
import { useAuthStore } from '../store/auth';

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user } = useAuthStore();
  const [form] = Form.useForm();
  const { message } = App.useApp();

  useEffect(() => {
    if (user) navigate('/');

    const remembered = localStorage.getItem('bs_rememberEmail');
    if (remembered) {
      form.setFieldValue('email', remembered);
      form.setFieldValue('rememberMe', true);
    }
  }, [user, navigate, form]);

  const handleSubmit = async (values: LoginForm) => {
    setLoading(true);
    try {
      await login(values.email, values.password, values.rememberMe);
      message.success('Welcome to Backlog Synthesizer');
      navigate('/');
    } catch {
      message.error('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    }}>
      {/* Header stripe */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #0a1a3a, #0033A0, #3d8bfd, #0033A0, #0a1a3a)' }} />

      {/* Login card */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '32px 36px',
        width: 380,
        boxShadow: '0 8px 40px rgba(0,51,160,.12)',
      }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--primary)' }}>Backlog Synthesizer</div>
          <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>Enter your credentials to sign in</div>
        </div>

        <Form
          form={form}
          name="login"
          initialValues={{ rememberMe: true }}
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="email"
            label={<span style={{ color: 'var(--text-sec)', fontSize: 12 }}>Email</span>}
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input
              placeholder="name@company.com"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ color: 'var(--text-sec)', fontSize: 12 }}>Password</span>}
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password
              placeholder="Enter password"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </Form.Item>

          <Form.Item name="rememberMe" valuePropName="checked" style={{ marginBottom: 20 }}>
            <Checkbox style={{ color: 'var(--text-sec)' }}>Remember me</Checkbox>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 42,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
