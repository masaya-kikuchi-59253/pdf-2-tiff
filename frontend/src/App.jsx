import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import {
  FileUp,
  Settings,
  CheckCircle2,
  Loader2,
  Download,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  FileDigit,
  Eye,
  X,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = window.location.port === '5173' ? 'http://localhost:3001' : '';

const App = () => {
  const [file, setFile] = useState(null);
  const [pdfInfo, setPdfInfo] = useState(null);
  const [mode, setMode] = useState('auto'); // auto, color, bw
  const [converting, setConverting] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const [comparison, setComparison] = useState(null); // { tiffUrl, pdfUrl, previewUrl }
  const [dpi, setDpi] = useState(400); // 200, 300, 400, 600

  const handleStartConvert = async (directPath = null) => {
    const p = directPath || pdfInfo?.path;
    if (!p) return;

    setShowWarning(false);
    setConverting(true);
    setResults([]);
    setError(null);

    try {
      const res = await axios.post(`${API_BASE}/api/convert`, {
        pdfPath: p,
        mode: mode,
        dpi: dpi
      });
      setResults(res.data.files);
    } catch (err) {
      setError("変換に失敗しました。Ghostscriptが正しく構成されているか確認してください。");
    } finally {
      setConverting(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPdfInfo(null);
    setResults([]);
    setError(null);

    const formData = new FormData();
    formData.append('pdf', selectedFile);

    try {
      const res = await axios.post(`${API_BASE}/api/pdf-info`, formData);
      setPdfInfo(res.data);
      if (res.data.pages >= 10) {
        setShowWarning(true);
      } else {
        handleStartConvert(res.data.path);
      }
    } catch (err) {
      setError("PDFの解析に失敗しました。");
    }
  }, [mode, dpi]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  });
  const downloadAll = () => {
    results.forEach((r, idx) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = `${API_BASE}${r.url}`;
        link.download = r.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, idx * 300); // Small delay to avoid browser blocking multiple downloads
    });
  };

  return (
    <div className="container">
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--primary)' }}>PDF to TIFF Converter</h1>
        <p style={{ color: 'var(--text-muted)' }}>Ghostscript Powered | Smooth Workflow</p>
      </header>

      <div className="security-notice">
        <ShieldCheck size={18} />
        <div>
          <strong>社内で安全にご利用いただけます</strong>
          <ul>
            <li>本サービスは社内ネットワーク内で完結しており、データが社外に出ることはありません。</li>
            <li>アップロードされた PDF は変換後すぐにサーバーから自動削除されます。</li>
            <li>変換後の TIFF も一定時間後に自動クリーンアップされます。</li>
          </ul>
        </div>
      </div>

      <div className="glass-card">
        <div className="settings-row">
          <div className="settings-group">
            <Settings size={18} color="var(--text-muted)" />
            <span className="settings-label">カラー設定:</span>
            <div className="radio-group">
              {['auto', 'color', 'bw'].map(m => (
                <label key={m} className="radio-label">
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  <span style={{ fontSize: '14px' }}>
                    {m === 'auto' ? '自動判定' : m === 'color' ? 'カラー' : '白黒'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="settings-group">
            <FileDigit size={18} color="var(--text-muted)" />
            <span className="settings-label">解像度 (DPI):</span>
            <div className="radio-group">
              {[200, 300, 400, 600].map(d => (
                <label key={d} className="radio-label">
                  <input
                    type="radio"
                    name="dpi"
                    value={d}
                    checked={dpi === d}
                    onChange={() => setDpi(d)}
                  />
                  <span style={{ fontSize: '14px' }}>{d} DPI</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div {...getRootProps()} className="upload-area">
          <input {...getInputProps()} />
          {converting ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Loader2 className="animate-spin" size={48} color="var(--primary)" />
              <p style={{ fontSize: '16px', fontWeight: 500 }}>変換中...</p>
            </div>
          ) : file ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <FileDigit size={32} color="var(--primary)" />
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontWeight: 600 }}>{file.name}</p>
                {pdfInfo && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pdfInfo.pages} ページ</p>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <FileUp size={48} color="var(--text-muted)" />
              <p style={{ fontSize: '16px', fontWeight: 500 }}>
                {isDragActive ? "ここにドロップ！" : "PDFをドラッグ＆ドロップ、またはクリックして選択"}
              </p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showWarning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card"
            style={{ border: '1px solid #f59e0b', background: '#fffbeb' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <AlertTriangle color="#d97706" />
              <h3 style={{ color: '#92400e' }}>警告: ページ数が多いです</h3>
            </div>
            <p style={{ color: '#92400e', marginBottom: '16px' }}>
              {pdfInfo?.pages} ページあります。変換には時間がかかる可能性がありますが、続行しますか？
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary" onClick={handleStartConvert}>はい、変換する</button>
              <button className="btn" style={{ background: '#eee' }} onClick={() => setShowWarning(false)}>キャンセル</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="glass-card" style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {results.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px' }}>変換結果 ({results.length} ファイル)</h2>
            <button className="btn btn-primary" onClick={downloadAll}>
              <Download size={18} style={{ marginRight: '8px' }} /> 一括ダウンロード
            </button>
          </div>
          <div className="result-list">
            {results.map((r, i) => (
              <div key={i} className="result-item">
                <img src={`${API_BASE}${r.preview}`} alt={r.name} className="result-thumb" />
                <div className="result-info">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                    {r.name}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setComparison({ tiffUrl: r.url, previewUrl: r.preview, page: i + 1 })}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)' }}
                    >
                      <Eye size={16} />
                    </button>
                    <a href={`${API_BASE}${r.url}`} download={r.name} style={{ color: 'var(--primary)' }}>
                      <Download size={16} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {comparison && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="comparison-overlay"
          >
            <div className="comparison-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3>比較ビュー - Page {comparison.page}</h3>
                <button
                  onClick={() => setComparison(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={24} />
                </button>
              </div>
              <div className="comparison-view">
                <div className="comparison-panel">
                  <p style={{ marginBottom: '8px', fontWeight: 600 }}>オリジナル (PDF)</p>
                  <div className="comparison-img-wrapper">
                    <iframe
                      src={`${URL.createObjectURL(file)}#page=${comparison.page}`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                  </div>
                </div>
                <div className="comparison-panel">
                  <p style={{ marginBottom: '8px', fontWeight: 600 }}>変換後 (TIFF Preview)</p>
                  <div className="comparison-img-wrapper" style={{ display: 'flex', justifyContent: 'center' }}>
                    <img src={`${API_BASE}${comparison.previewUrl}`} className="comparison-img" alt="TIFF Preview" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer style={{ marginTop: 'auto', paddingTop: '40px', paddingBottom: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        &copy; 2026 Ghostscript PDF-2-TIFF Converter | Windows Server Ready
      </footer>

      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default App;
