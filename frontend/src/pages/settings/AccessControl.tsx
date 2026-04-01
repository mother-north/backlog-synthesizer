import { useState, useEffect } from 'react';
import { Table, Checkbox, Button, App, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { menuAccessApi, rolesApi } from '../../services/api';
import { ALL_NAV_ITEMS, getMenuAccessItems } from '../../config/navConfig';
import { useAuthStore } from '../../store/auth';

const { Text } = Typography;

interface Role {
  id: number;
  name: string;
}

const ROUTE_ITEMS = getMenuAccessItems().filter(m => m.isRoute);

export default function AccessControl() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();
  const { bumpMenuVersion } = useAuthStore();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const rolesResponse = await rolesApi.getAll();
      const rolesList = rolesResponse.data?.rows || rolesResponse.data || [];
      setRoles(rolesList);

      const accessResponse = await menuAccessApi.getAll();
      const accessData = accessResponse.data?.rows || accessResponse.data || [];

      const perms: Record<string, Record<string, boolean>> = {};
      rolesList.forEach((role: Role) => {
        ROUTE_ITEMS.forEach((menu) => {
          const key = `${menu.menuPath}:${menu.tabName}`;
          if (!perms[key]) perms[key] = {};

          const hasRule = accessData.some(
            (a: any) =>
              a.role_id === role.id &&
              a.menu_path === menu.menuPath &&
              ((menu.tabName === null && a.tab_name === null) || a.tab_name === menu.tabName)
          );
          const hasAccess = hasRule && accessData.some(
            (a: any) =>
              a.role_id === role.id &&
              a.menu_path === menu.menuPath &&
              ((menu.tabName === null && a.tab_name === null) || a.tab_name === menu.tabName) &&
              a.allowed === true
          );
          perms[key][role.name] = hasRule ? hasAccess : true;
        });
      });

      setPermissions(perms);
    } catch {
      message.error('Failed to load access data');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (menuKey: string, roleName: string, checked: boolean) => {
    setPermissions(prev => ({ ...prev, [menuKey]: { ...prev[menuKey], [roleName]: checked } }));
  };

  const handleGroupToggle = (childKeys: string[], roleName: string, checked: boolean) => {
    setPermissions(prev => {
      const next = { ...prev };
      childKeys.forEach(k => { next[k] = { ...next[k], [roleName]: checked }; });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const role of roles) {
        const access = ROUTE_ITEMS.map(menu => ({
          menuPath: menu.menuPath,
          tabName: menu.tabName ?? undefined,
          allowed: permissions[`${menu.menuPath}:${menu.tabName}`]?.[role.name] || false,
        }));
        await menuAccessApi.bulkUpdate(role.id, access);
      }
      message.success('Permissions saved successfully');
      bumpMenuVersion();
    } catch {
      message.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  // Build dataSource — groups with toggle-all headers + indented children
  const dataSource: any[] = [];

  for (const nav of ALL_NAV_ITEMS) {
    if (nav.children) {
      const childKeys = nav.children.map(child => {
        const tabName = child.key.split('/').pop() ?? null;
        return `${child.key}:${tabName}`;
      });
      dataSource.push({ key: `__header__${nav.key}`, label: nav.label, isHeader: true, childKeys });
      for (const child of nav.children) {
        const tabName = child.key.split('/').pop() ?? null;
        dataSource.push({ key: `${child.key}:${tabName}`, label: child.label, menuPath: child.key, tabName, isHeader: false, indent: 1 });
      }
    } else {
      const routeKey = `${nav.key}:null`;
      dataSource.push({ key: `__header__${nav.key}`, label: nav.label, isHeader: true, childKeys: [routeKey] });
      dataSource.push({ key: routeKey, label: nav.label, menuPath: nav.key, tabName: null, isHeader: false, indent: 1 });
    }
  }

  const columns = [
    {
      title: 'Menu Item',
      dataIndex: 'label',
      key: 'label',
      fixed: 'left' as const,
      width: 240,
      render: (_: any, record: any) => {
        if (record.isHeader) {
          return <Text strong style={{ color: 'var(--blue-700)', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>{record.label}</Text>;
        }
        return <div style={{ paddingLeft: record.indent * 20 }}>{record.label}</div>;
      },
    },
    ...roles.map(role => ({
      title: role.name,
      key: role.name,
      width: 120,
      align: 'center' as const,
      render: (_: any, record: any) => {
        if (record.isHeader) {
          const keys = record.childKeys as string[];
          const checkedCount = keys.filter(k => permissions[k]?.[role.name] !== false).length;
          return (
            <Checkbox
              checked={checkedCount === keys.length}
              indeterminate={checkedCount > 0 && checkedCount < keys.length}
              onChange={e => handleGroupToggle(keys, role.name, e.target.checked)}
            />
          );
        }
        return (
          <Checkbox
            checked={permissions[record.key]?.[role.name] !== false}
            onChange={e => handleCheckboxChange(record.key, role.name, e.target.checked)}
          />
        );
      },
    })),
  ];

  return (
    <div>
      <div className="bs-breadcrumbs">
        <a>Settings</a> <span>&gt;</span> Access Control
      </div>
      <div className="bs-page-header">
        <h1 className="bs-page-title">Access Control</h1>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          Save Changes
        </Button>
      </div>

      <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-100)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--gray-600)' }}>
        Configure which roles have access to each menu item. New items are enabled by default — uncheck to restrict. The sidebar menu updates instantly after saving.
      </div>

      <Table
        loading={loading}
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        scroll={{ x: 'max-content' }}
        bordered
        size="middle"
      />
    </div>
  );
}
