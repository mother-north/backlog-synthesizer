import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Skeleton, App, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { usersApi, rolesApi } from '../../services/api';

interface User {
  id: number;
  email: string;
  displayName?: string;
  roles: string[];
  created_at: string;
}

interface Role {
  id: number;
  name: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const { message } = App.useApp();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([usersApi.getAll(), rolesApi.getAll()]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (values: { email: string; password?: string; displayName?: string; roles: string[] }) => {
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id, { email: values.email, displayName: values.displayName, roles: values.roles });
        message.success('User updated');
      } else {
        await usersApi.create({ email: values.email, password: values.password!, displayName: values.displayName, roles: values.roles });
        message.success('User created');
      }
      setModalOpen(false);
      setEditingUser(null);
      form.resetFields();
      fetchData();
    } catch {
      message.error('Failed to save user');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await usersApi.delete(id);
      message.success('User deleted');
      fetchData();
    } catch {
      message.error('Failed to delete user');
    }
  };

  const handleResetPassword = async (values: { password: string }) => {
    if (!resetPasswordModal) return;
    try {
      await usersApi.resetPassword(resetPasswordModal.id, values.password);
      message.success('Password reset');
      setResetPasswordModal(null);
      resetForm.resetFields();
    } catch {
      message.error('Failed to reset password');
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue({ email: user.email, displayName: user.displayName, roles: user.roles });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns: ColumnsType<User> = [
    { title: 'Email', dataIndex: 'email', key: 'email', sorter: (a, b) => a.email.localeCompare(b.email) },
    { title: 'Display Name', dataIndex: 'displayName', key: 'name', render: (v: string) => v || '-' },
    {
      title: 'Roles',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: string[]) => roles?.map(r => <span key={r} style={{ marginRight: 4 }}>{r}</span>),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created',
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Button size="small" icon={<KeyOutlined />} onClick={() => setResetPasswordModal(record)} />
          <Popconfirm title="Delete this user?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">
        <a>Settings</a> <span>&gt;</span> Users
      </div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Users</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add User</Button>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20, showTotal: (total) => `${total} users` }}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        title={editingUser ? 'Edit User' : 'Create User'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingUser(null); }}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="displayName" label="Display Name">
            <Input />
          </Form.Item>
          <Form.Item name="roles" label="Roles" rules={[{ required: true }]}>
            <Select
              mode="multiple"
              options={roles.map(r => ({ value: r.name, label: r.name }))}
              placeholder="Select roles..."
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title={`Reset Password: ${resetPasswordModal?.email}`}
        open={!!resetPasswordModal}
        onCancel={() => { setResetPasswordModal(null); resetForm.resetFields(); }}
        onOk={() => resetForm.submit()}
        destroyOnClose
      >
        <Form form={resetForm} layout="vertical" onFinish={handleResetPassword}>
          <Form.Item name="password" label="New Password" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
