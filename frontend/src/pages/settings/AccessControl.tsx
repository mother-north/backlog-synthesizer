import { useState, useEffect } from 'react';
import { Table, Select, Switch, Button, Skeleton, App } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { menuAccessApi, rolesApi } from '../../services/api';
import { getMenuAccessItems } from '../../config/navConfig';
import { useAuthStore } from '../../store/auth';

interface Role {
  id: number;
  name: string;
}

interface AccessRule {
  menuPath: string;
  tabName: string | null;
  label: string;
  group: string;
  allowed: boolean;
}

export default function AccessControl() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();
  const { bumpMenuVersion } = useAuthStore();

  useEffect(() => {
    rolesApi.getAll().then(res => {
      const list = res.data?.rows || res.data || [];
      setRoles(list);
      if (list.length > 0) setSelectedRole(list[0].id);
    }).catch(() => {
      message.error('Failed to load roles');
    }).finally(() => setLoading(false));
  }, [message]);

  useEffect(() => {
    if (!selectedRole) return;
    setLoading(true);
    menuAccessApi.getByRole(selectedRole).then(res => {
      const dbRules = (res.data?.rows || res.data || []) as Array<{ menu_path: string; tab_name: string | null; allowed: boolean }>;
      const ruleMap = new Map(dbRules.map(r => [`${r.menu_path}::${String(r.tab_name)}`, r.allowed]));
      const menuItems = getMenuAccessItems();
      const merged: AccessRule[] = menuItems.map(item => ({
        ...item,
        allowed: ruleMap.get(`${item.menuPath}::${String(item.tabName)}`) ?? true,
      }));
      setRules(merged);
    }).catch(() => {
      message.error('Failed to load access rules');
    }).finally(() => setLoading(false));
  }, [selectedRole, message]);

  const handleToggle = (index: number, allowed: boolean) => {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, allowed } : r));
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await menuAccessApi.bulkUpdate(
        selectedRole,
        rules.map(r => ({ menuPath: r.menuPath, tabName: r.tabName || undefined, allowed: r.allowed }))
      );
      message.success('Access rules saved');
      bumpMenuVersion();
    } catch {
      message.error('Failed to save access rules');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<AccessRule> = [
    { title: 'Section', dataIndex: 'group', key: 'group' },
    { title: 'Menu Item', dataIndex: 'label', key: 'label' },
    { title: 'Path', dataIndex: 'menuPath', key: 'path', render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
    {
      title: 'Allowed',
      key: 'allowed',
      render: (_, record, index) => (
        <Switch
          checked={record.allowed}
          onChange={(v) => handleToggle(index, v)}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">
        <a>Settings</a> <span>&gt;</span> Access Control
      </div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Access Control</h1>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 8, fontSize: 13, color: 'var(--text-sec)' }}>Role:</label>
        <Select
          value={selectedRole}
          onChange={setSelectedRole}
          style={{ width: 200 }}
          options={roles.map(r => ({ value: r.id, label: r.name }))}
        />
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <Table
          dataSource={rules}
          columns={columns}
          rowKey={(r) => `${r.menuPath}::${r.tabName}`}
          pagination={false}
          size="small"
        />
      )}
    </div>
  );
}
