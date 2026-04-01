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
  status: 'done' | 'running' | 'pending' | 'error';
  message: string;
}

const AGENT_LABELS: Record<string, string> = {
  parser: 'Extracting requirements from transcript',
  retriever: 'Searching knowledge base for related context',
  crossref: 'Checking against backlog and architecture',
  synthesizer: 'Generating candidate stories',
  validator: 'Validating grounding and citations',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  done: <CheckCircleOutlined style={{ color: 'var(--success)' }} />,
  running: <LoadingOutlined style={{ color: 'var(--accent)' }} spin />,
  pending: <ClockCircleOutlined style={{ color: 'var(--gray-400)' }} />,
  error: <CloseCircleOutlined style={{ color: 'var(--error)' }} />,
};

interface PipelineProgressProps {
  meetingId: number;
  initialSteps?: PipelineStep[];
  onComplete?: () => void;
}

export default function PipelineProgress({ meetingId, initialSteps, onComplete }: PipelineProgressProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(
    initialSteps || Object.keys(AGENT_LABELS).map(agent => ({
      agent,
      status: 'pending' as const,
      message: AGENT_LABELS[agent],
    }))
  );

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || (import.meta.env.BASE_URL + 'api');
    const eventSource = new EventSource(`${baseUrl}/meetings/${meetingId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          setSteps(data);
          const allDone = data.every((s: PipelineStep) => s.status === 'done');
          if (allDone && onComplete) {
            onComplete();
            eventSource.close();
          }
        } else if (data.agent) {
          setSteps(prev => prev.map(s =>
            s.agent === data.agent ? { ...s, status: data.status, message: data.message || s.message } : s
          ));
          if (data.status === 'done') {
            // Check if this was the last step
            setSteps(prev => {
              const allDone = prev.every(s => s.status === 'done');
              if (allDone && onComplete) {
                setTimeout(() => onComplete(), 500);
                eventSource.close();
              }
              return prev;
            });
          }
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
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="bs-pipeline-progress">
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Processing Pipeline</div>
      {steps.map(step => (
        <div key={step.agent} className={`bs-pipeline-step ${step.status}`}>
          <span style={{ width: 20, display: 'flex', justifyContent: 'center' }}>
            {STATUS_ICONS[step.status]}
          </span>
          <span style={{ flex: 1 }}>{step.message}</span>
          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{step.status}</span>
        </div>
      ))}
      <Progress percent={percent} strokeColor="var(--primary)" style={{ marginTop: 12 }} />
    </div>
  );
}
