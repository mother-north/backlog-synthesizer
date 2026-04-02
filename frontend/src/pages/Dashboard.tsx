import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Skeleton, Empty, App } from 'antd';
import {
  FileTextOutlined,
  UnorderedListOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { dashboardApi } from '../services/api';

interface Stats {
  meetings: { total: number; processing: number; in_review: number; completed: number };
  stories: { total: number; confirmed: number; rejected: number; pending: number; avg_review_days: number };
  checks_by_role: Record<string, number>;
}

interface Charts {
  stories_by_meeting: Array<{ meeting: string; count: number }>;
  confirmation_rate: Array<{ date: string; rate: number }>;
  check_types: Array<{ type: string; count: number }>;
}

const PIE_COLORS = ['#0033A0', '#3d8bfd', '#52c41a', '#faad14', '#ff4d4f', '#9a9aad'];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [loading, setLoading] = useState(true);
  const { message } = App.useApp();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboardApi.getStats(),
      dashboardApi.getCharts(),
    ]).then(([statsRes, chartsRes]) => {
      setStats(statsRes.data);
      setCharts(chartsRes.data);
    }).catch(() => {
      message.error('Failed to load dashboard data');
    }).finally(() => setLoading(false));
  }, [message]);

  if (loading) {
    return (
      <div>
        <div className="bs-breadcrumbs">Dashboard</div>
        <h1 className="bs-page-title" style={{ marginBottom: 20 }}>Dashboard</h1>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <div className="bs-breadcrumbs">Dashboard</div>
        <h1 className="bs-page-title" style={{ marginBottom: 20 }}>Dashboard</h1>
        <Empty
          image={<DashboardOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No data yet"
        >
          <span style={{ color: 'var(--text-sec)' }}>Upload meetings and backlog data to see metrics</span>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <div className="bs-breadcrumbs">Dashboard</div>
      <h1 className="bs-page-title" style={{ marginBottom: 20 }}>Dashboard</h1>

      {/* Meetings stats */}
      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-sec)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Meetings</div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { label: 'Total', value: Number(stats.meetings?.total) || 0, icon: <FileTextOutlined />, color: 'var(--primary)', view: 'all' },
          { label: 'In Review', value: Number(stats.meetings?.in_review) || 0, icon: <WarningOutlined />, color: 'var(--warning)', view: 'in_review' },
          { label: 'Completed', value: Number(stats.meetings?.completed) || 0, icon: <CheckCircleOutlined />, color: 'var(--success)', view: 'all' },
          { label: 'Processing', value: Number(stats.meetings?.processing) || 0, icon: <ClockCircleOutlined />, color: 'var(--accent)', view: 'in_review' },
        ].map(card => (
          <Col span={3} key={card.label}>
            <div className="bs-stat-card" style={{ cursor: 'pointer' }}
              onClick={() => {
                localStorage.setItem('meetings_view', card.view);
                navigate('/meetings');
              }}
            >
              <div style={{ color: card.color, marginBottom: 4 }}>{card.icon}</div>
              <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
              <div className="stat-label">{card.label}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Stories stats */}
      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-sec)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Stories</div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { label: 'Total', value: Number(stats.stories?.total) || 0, icon: <UnorderedListOutlined />, color: 'var(--gray-600)', status: '' },
          { label: 'In Review', value: Number(stats.stories?.total || 0) - Number(stats.stories?.confirmed || 0) - Number(stats.stories?.rejected || 0), icon: <WarningOutlined />, color: 'var(--warning)', status: 'generated' },
          { label: 'Confirmed', value: Number(stats.stories?.confirmed) || 0, icon: <CheckCircleOutlined />, color: 'var(--success)', status: 'confirmed' },
          { label: 'Rejected', value: Number(stats.stories?.rejected) || 0, icon: <CloseCircleOutlined />, color: 'var(--error)', status: 'rejected' },
        ].map(card => (
          <Col span={3} key={card.label}>
            <div className="bs-stat-card" style={{ cursor: 'pointer' }}
              onClick={() => navigate(card.status ? `/stories?status=${card.status}` : '/stories')}
            >
              <div style={{ color: card.color, marginBottom: 4 }}>{card.icon}</div>
              <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
              <div className="stat-label">{card.label}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Open Checks by Role */}
      {stats.checks_by_role && Object.keys(stats.checks_by_role).length > 0 && (
        <div style={{ marginBottom: 24, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Open Checks by Role</div>
          <div style={{ display: 'flex', gap: 24 }}>
            {Object.entries(stats.checks_by_role).map(([role, count]) => (
              <span key={role} style={{ fontSize: 14 }}>
                <strong>{role}:</strong> {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      {charts && (
        <Row gutter={16}>
          {/* Stories by Meeting */}
          {charts.stories_by_meeting && charts.stories_by_meeting.length > 0 && (
            <Col span={12} style={{ marginBottom: 16 }}>
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Stories by Meeting</div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={charts.stories_by_meeting}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" />
                    <XAxis dataKey="meeting" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Col>
          )}

          {/* Confirmation Rate */}
          {charts.confirmation_rate && charts.confirmation_rate.length > 0 && (
            <Col span={12} style={{ marginBottom: 16 }}>
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Confirmation Rate Over Time</div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={charts.confirmation_rate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-200)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip formatter={(value: any) => `${value}%`} />
                    <Line type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={2} dot={{ fill: 'var(--primary)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Col>
          )}

          {/* Check Types Distribution */}
          {charts.check_types && charts.check_types.length > 0 && (
            <Col span={12} style={{ marginBottom: 16 }}>
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Check Types Distribution</div>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={charts.check_types}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(props: any) => `${props.type}: ${props.count}`}
                    >
                      {charts.check_types.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Col>
          )}
        </Row>
      )}
    </div>
  );
}
