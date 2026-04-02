import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Dropdown } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/auth';
import { menuAccessApi, accessLogApi } from '../services/api';
import { ALL_NAV_ITEMS, NavItem, getMenuAccessItems } from '../config/navConfig';

function filterNavItems(items: NavItem[], allowedPaths: Set<string>): NavItem[] {
  return items.reduce<NavItem[]>((acc, item) => {
    if (item.children) {
      const visibleChildren = item.children.filter(c => allowedPaths.has(c.key));
      if (visibleChildren.length > 0) {
        acc.push({ ...item, children: visibleChildren });
      }
    } else if (allowedPaths.has(item.key)) {
      acc.push(item);
    }
    return acc;
  }, []);
}

const SIDEBAR_KEY = 'bs_sidebarOpen';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) !== 'false'
  );
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [allowedPaths, setAllowedPaths] = useState<Set<string> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, menuVersion } = useAuthStore();

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  };

  // Fetch menu access
  useEffect(() => {
    menuAccessApi.getMyAccess().then(res => {
      const menuAccess = res.data.menuAccess as { menuPath: string; tabName: string | null; allowed: boolean }[];
      if (menuAccess.length === 0) {
        setAllowedPaths(null);
        return;
      }
      const ruleMap = new Map(menuAccess.map(a => [`${a.menuPath}::${String(a.tabName)}`, a.allowed]));
      const visible = new Set<string>();
      getMenuAccessItems().filter(m => m.isRoute).forEach(m => {
        const rule = ruleMap.get(`${m.menuPath}::${String(m.tabName)}`);
        if (rule === true) visible.add(m.menuPath);
      });
      setAllowedPaths(visible);
    }).catch(() => setAllowedPaths(null));
  }, [user, menuVersion]);


  const navItems = allowedPaths === null
    ? ALL_NAV_ITEMS
    : filterNavItems(ALL_NAV_ITEMS, allowedPaths);

  // Auto-open parent menu of active route
  useEffect(() => {
    const parentKey = navItems.find(i => i.children?.some(c => location.pathname === c.key || location.pathname.startsWith(c.key + '/')))?.key;
    if (parentKey) {
      setOpenMenus(prev => prev[parentKey] ? prev : { ...prev, [parentKey]: true });
    }
  }, [location.pathname, navItems]);

  const handleNavClick = (key: string) => {
    const clicked = navItems.find(i => i.key === key);
    if (clicked?.children) {
      setOpenMenus(prev => ({ ...prev, [key]: !prev[key] }));
      return;
    }
    if (clicked) {
      accessLogApi.log(clicked.label, clicked.label).catch(() => {});
    } else {
      const parent = navItems.find(i => i.children?.some(c => c.key === key));
      const child = parent?.children?.find(c => c.key === key);
      if (parent && child) {
        accessLogApi.log(parent.label, child.label).catch(() => {});
      }
    }
    navigate(key);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (key: string) => location.pathname === key || location.pathname.startsWith(key + '/');

  const userMenuItems = [
    {
      key: 'profile',
      label: 'User Profile',
      onClick: () => navigate('/settings/profile'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      label: 'Sign out',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="bs-header">
        <div className="bs-header-stripe" />
        <div className="bs-header-inner">
          <div className="bs-brand">
            <div
              className="bs-menu-toggle"
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Hide menu' : 'Show menu'}
            >
              {sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            </div>
            <div className="bs-header-title">
              <strong>Backlog Synthesizer</strong>
            </div>
          </div>
          <div className="bs-header-right">
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div className="bs-user-btn">
                <UserOutlined style={{ fontSize: 16 }} />
                <span>{displayName}</span>
                <span style={{ opacity: 0.5, fontSize: 10 }}>&#9662;</span>
              </div>
            </Dropdown>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="bs-layout">
        {/* Sidebar */}
        <nav className={`bs-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          <div className="bs-nav-section">
            {navItems.map((item, idx) => {
              // Insert section labels before Data and Settings groups
              const showDataLabel = item.key === 'data';
              const showSettingsLabel = item.key === 'settings';
              // Insert a separator before Data section
              const isFirstDataOrSettings = showDataLabel || showSettingsLabel;

              return (
                <div key={item.key}>
                  {isFirstDataOrSettings && idx > 0 && (
                    <div className="bs-nav-label">{item.label}</div>
                  )}
                  {!item.children ? (
                    <div
                      className={`bs-nav-item${isActive(item.key) ? ' active' : ''}`}
                      onClick={() => handleNavClick(item.key)}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                    </div>
                  ) : (
                    <>
                      {!isFirstDataOrSettings && (
                        <div
                          className={`bs-nav-item${item.children.some(c => isActive(c.key)) ? ' active' : ''}`}
                          onClick={() => handleNavClick(item.key)}
                        >
                          <span className="nav-icon">{item.icon}</span>
                          <span>{item.label}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>
                            {openMenus[item.key] ? '\u25B4' : '\u25BE'}
                          </span>
                        </div>
                      )}
                      {(openMenus[item.key] || isFirstDataOrSettings) && (
                        <div className={isFirstDataOrSettings ? '' : 'bs-nav-sub'}>
                          {item.children.map((child) => (
                            <div
                              key={child.key}
                              className={`bs-nav-item${isActive(child.key) ? ' active' : ''}`}
                              onClick={() => handleNavClick(child.key)}
                            >
                              <span className="nav-icon">{child.icon}</span>
                              <span>{child.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <main className="bs-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
