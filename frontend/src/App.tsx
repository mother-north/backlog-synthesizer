import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from './store/auth';
import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import MeetingsList from './pages/MeetingsList';
import MeetingView from './pages/MeetingView';
import AllStories from './pages/AllStories';
import ActionList from './pages/ActionList';
import Dashboard from './pages/Dashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import BacklogData from './pages/data/BacklogData';
import ArchitectureData from './pages/data/ArchitectureData';
import Users from './pages/settings/Users';
import Roles from './pages/settings/Roles';
import AccessControl from './pages/settings/AccessControl';
import AccessLog from './pages/settings/AccessLog';

function App() {
  const { initializeAuth, isLoading } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg)' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/meetings" replace />} />
        <Route path="meetings" element={<MeetingsList />} />
        <Route path="meetings/:id" element={<MeetingView />} />
        <Route path="stories" element={<AllStories />} />
        <Route path="actions" element={<ActionList />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="kb" element={<KnowledgeBase />} />
        <Route path="data/backlog" element={<BacklogData />} />
        <Route path="data/architecture" element={<ArchitectureData />} />
        <Route path="settings/users" element={<Users />} />
        <Route path="settings/roles" element={<Roles />} />
        <Route path="settings/access" element={<AccessControl />} />
        <Route path="settings/access-log" element={<AccessLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
