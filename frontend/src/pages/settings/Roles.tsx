import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space, Skeleton, App, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { rolesApi } from '../../services/api';

interface Role {
  id: number;
  name: string;
  description?: string;
}

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await rolesApi.getAll();
      setRoles(res.data);
    } catch {
      message.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (values: { name: string; description?: string }) => {
    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, values);
        message.success('Role updated');
      } else {
        await rolesApi.create(values);
        message.success('Role created');
      }
      setModalOpen(false);
      setEditingRole(null);
      form.resetFields();
      fetchData();
    } catch {
      message.error('Failed to save role');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await rolesApi.delete(id);
      message.success('Role deleted');
      fetchData();
    } catch {
      message.error('Failed to delete role');
    }
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    form.setFieldsValue(role);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingRole(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns: ColumnsType<Role> = [
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Description', dataIndex: 'description', key: 'desc', render: (v: string) => v || '-' },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Delete this role?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">
        <a>Settings</a> <span>&gt;</span> Roles
      </div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Roles</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Role</Button>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <Table
          dataSource={roles}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20, showTotal: (total) => `${total} roles` }}
        />
      )}

      <Modal
        title={editingRole ? 'Edit Role' : 'Create Role'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingRole(null); }}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Role Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
