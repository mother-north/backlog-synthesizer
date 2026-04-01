import { useEffect, useState } from 'react';
import { Progress } from 'antd';
import {
  CheckCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

interface PipelineStep {
  agent: string;
  status: 'done' | 'running' | 'pending' | 'error' | 'waiting';
  message: string;
}

const AGENT_LABELS: Record<string, string> = {
  parser: 'Extracting requirements from transcript',
  retriever: 'Searching knowledge base for related context',
  crossref: 'Checking against backlog and architecture',
  synthesizer: 'Generating candidate stories',
  validator: 'Validating grounding and citations',
};

const AGENT_ORDER = ['parser', 'retriever', 'crossref', 'synthesizer', 'validator'];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  done: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  running: <LoadingOutlined style={{ color: '#3d8bfd' }} spin />,
  pending: <ClockCircleOutlined style={{ color: '#9a9aad' }} />,
  waiting: <ClockCircleOutlined style={{ color: '#9a9aad' }} />,
  error: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
};

interface PipelineProgressProps {
  meetingId: number;
  initialSteps?: PipelineStep[];
  onComplete?: () => void;
}

export default function PipelineProgress({ meetingId, initialSteps, onComplete }: PipelineProgressProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(
    initialSteps || AGENT_ORDER.map(agent => ({
      agent,
      status: 'pending' as const,
      message: AGENT_LABELS[agent],
    }))
  );

  useEffect(() => {
    const eventSource = new EventSource(`/api/meetings/${meetingId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Complete event
        if (data.type === 'complete') {
          setSteps(prev => prev.map(s => ({ ...s, status: 'done' as const, message: AGENT_LABELS[s.agent] + ' — done' })));
          if (onComplete) setTimeout(() => onComplete(), 1000);
          eventSource.close();
          return;
        }

        // Error event
        if (data.type === 'error') {
          eventSource.close();
          return;
        }

        // Full progress array from DB poll
        if (Array.isArray(data) && data.length > 0 && data[0]?.agent) {
          setSteps(data.map((s: any) => ({
            agent: s.agent,
            status: s.status || 'pending',
            message: s.message || AGENT_LABELS[s.agent] || s.agent,
          })));

          const allDone = data.every((s: any) => s.status === 'done');
          if (allDone && onComplete) {
            setTimeout(() => onComplete(), 1000);
            eventSource.close();
          }
          return;
        }

        // Single agent event
        if (data.agent) {
          setSteps(prev => prev.map(s =>
            s.agent === data.agent
              ? { ...s, status: data.status, message: data.message || AGENT_LABELS[s.agent] || s.agent }
              : s
          ));
        }
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [meetingId, onComplete]);

  const doneCount = steps.filter(s => s.status === 'done').length;
  const runningStep = steps.find(s => s.status === 'running');
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--blue-100)',
      borderRadius: 8,
      padding: 20,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Processing Pipeline</div>
        {runningStep && (
          <div style={{ fontSize: 13, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LoadingOutlined spin />
            {runningStep.message}
          </div>
        )}
      </div>

      {steps.map(step => (
        <div
          key={step.agent}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 0',
            borderBottom: '1px solid var(--gray-100)',
            opacity: step.status === 'pending' ? 0.5 : 1,
            fontWeight: step.status === 'running' ? 600 : 400,
          }}
        >
          <span style={{ width: 20, display: 'flex', justifyContent: 'center' }}>
            {STATUS_ICONS[step.status] || STATUS_ICONS.pending}
          </span>
          <span style={{ flex: 1, fontSize: 13 }}>{step.message}</span>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            background: step.status === 'done' ? '#f6ffed' : step.status === 'running' ? '#e8f0fe' : 'transparent',
            color: step.status === 'done' ? '#52c41a' : step.status === 'running' ? '#0033A0' : '#9a9aad',
          }}>
            {step.status}
          </span>
        </div>
      ))}

      <Progress
        percent={percent}
        strokeColor="#0033A0"
        style={{ marginTop: 16 }}
        format={() => `${doneCount}/${steps.length} steps`}
      />
    </div>
  );
}
