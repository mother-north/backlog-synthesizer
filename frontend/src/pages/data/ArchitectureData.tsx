import { useState, useEffect } from 'react';
import { Button, Upload, Skeleton, Empty, App } from 'antd';
import { UploadOutlined, FileMarkdownOutlined } from '@ant-design/icons';
import { dataApi } from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';

interface ArchDoc {
  id: number;
  file_name: string;
  content: string;
  version: number;
  uploaded_at: string;
  uploaded_by_name?: string;
}

export default function ArchitectureData() {
  const [doc, setDoc] = useState<ArchDoc | null>(null);
  const [versions, setVersions] = useState<ArchDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const { message } = App.useApp();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await dataApi.getArchitecture();
      if (Array.isArray(res.data) && res.data.length > 0) {
        setVersions(res.data);
        setDoc(res.data[0]);
      } else if (res.data && !Array.isArray(res.data)) {
        setDoc(res.data);
        setVersions([res.data]);
      }
    } catch {
      // No doc yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      await dataApi.uploadArchitecture(pendingFile);
      message.success('Architecture document uploaded');
      setPendingFile(null);
      fetchData();
    } catch {
      message.error('Failed to upload architecture document');
    } finally {
      setUploading(false);
    }
  };

  // Simple markdown-to-html rendering (headings, bold, lists, code blocks)
  const renderMarkdown = (text: string) => {
    return text
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code style="background:#f4f7fc;padding:2px 6px;border-radius:3px">$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div>
      <div className="bs-breadcrumbs">
        <a>Data</a> <span>&gt;</span> Architecture Document
      </div>
      <div className="bs-page-header">
        <div>
          <h1 className="bs-page-title">Architecture Document</h1>
          {doc && (
            <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>
              Last uploaded: {new Date(doc.uploaded_at).toLocaleDateString()} | File: {doc.file_name}
            </span>
          )}
        </div>
        <Upload
          accept=".md,.txt"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => {
            setPendingFile(file);
            setShowConfirm(true);
            return false;
          }}
        >
          <Button type="primary" icon={<UploadOutlined />} loading={uploading}>Upload New Version</Button>
        </Upload>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 15 }} />
      ) : !doc ? (
        <Empty
          image={<FileMarkdownOutlined style={{ fontSize: 48, color: 'var(--gray-400)' }} />}
          description="No architecture document loaded"
        >
          <Upload
            accept=".md,.txt"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => { setPendingFile(file); setShowConfirm(true); return false; }}
          >
            <Button type="primary">Upload Architecture Doc</Button>
          </Upload>
        </Empty>
      ) : (
        <>
          <div style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 24,
            lineHeight: 1.8,
            maxHeight: 600,
            overflow: 'auto',
          }}>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }} />
          </div>

          {/* Version History */}
          {versions.length > 1 && (
            <div style={{ marginTop: 16, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Version History</div>
              {versions.map(v => (
                <div key={v.id} style={{ fontSize: 13, color: 'var(--text-sec)', padding: '4px 0' }}>
                  v{v.version} - {new Date(v.uploaded_at).toLocaleDateString()} - {v.file_name}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Upload Architecture Document"
        message="Upload new version? Previous version will be archived."
        onConfirm={() => { setShowConfirm(false); handleUpload(); }}
        onCancel={() => { setShowConfirm(false); setPendingFile(null); }}
        confirmText="Upload"
        loading={uploading}
      />
    </div>
  );
}
