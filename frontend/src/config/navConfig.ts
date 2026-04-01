import type { ReactNode } from 'react';
import {
  FileTextOutlined,
  UnorderedListOutlined,
  BellOutlined,
  DashboardOutlined,
  SearchOutlined,
  DatabaseOutlined,
  CloudUploadOutlined,
  FileMarkdownOutlined,
  SettingOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { createElement } from 'react';

export interface TabItem {
  tabName: string;
  label: string;
}

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  children?: NavItem[];
  tabs?: TabItem[];
  badge?: boolean; // show action count badge
}

export interface MenuAccessItem {
  menuPath: string;
  tabName: string | null;
  label: string;
  group: string;
  isRoute: boolean;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  {
    key: '/meetings',
    label: 'Meetings',
    icon: createElement(FileTextOutlined),
  },
  {
    key: '/stories',
    label: 'All Stories',
    icon: createElement(UnorderedListOutlined),
  },
  {
    key: '/actions',
    label: 'Action List',
    icon: createElement(BellOutlined),
    badge: true,
  },
  {
    key: '/dashboard',
    label: 'Dashboard',
    icon: createElement(DashboardOutlined),
  },
  {
    key: '/kb',
    label: 'Knowledge Base',
    icon: createElement(SearchOutlined),
  },
  {
    key: 'data',
    label: 'Data',
    icon: createElement(DatabaseOutlined),
    children: [
      { key: '/data/backlog', label: 'Backlog Data', icon: createElement(CloudUploadOutlined) },
      { key: '/data/architecture', label: 'Architecture Doc', icon: createElement(FileMarkdownOutlined) },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: createElement(SettingOutlined),
    children: [
      { key: '/settings/users', label: 'Users', icon: createElement(TeamOutlined) },
      { key: '/settings/roles', label: 'Roles', icon: createElement(SafetyCertificateOutlined) },
      { key: '/settings/access', label: 'Access Control', icon: createElement(LockOutlined) },
    ],
  },
];

export function getMenuAccessItems(): MenuAccessItem[] {
  const items: MenuAccessItem[] = [];

  for (const nav of ALL_NAV_ITEMS) {
    if (nav.children) {
      for (const child of nav.children) {
        const tabName = child.key.split('/').pop() ?? null;
        items.push({ menuPath: child.key, tabName, label: child.label, group: nav.label, isRoute: true });
        if (child.tabs) {
          for (const tab of child.tabs) {
            items.push({ menuPath: child.key, tabName: tab.tabName, label: `${child.label} > ${tab.label}`, group: nav.label, isRoute: false });
          }
        }
      }
    } else {
      const tabName = nav.key.split('/').pop() ?? null;
      items.push({ menuPath: nav.key, tabName, label: nav.label, group: nav.label, isRoute: true });
      if (nav.tabs) {
        for (const tab of nav.tabs) {
          items.push({ menuPath: nav.key, tabName: tab.tabName, label: `${nav.label} > ${tab.label}`, group: nav.label, isRoute: false });
        }
      }
    }
  }

  return items;
}
