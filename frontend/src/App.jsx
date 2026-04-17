import React, { useState, useCallback, useEffect, useRef } from 'react';
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

function parsePageNum(fileName) {
  const m = fileName.match(/_page_(\d+)\.tif$/i);
  return m ? parseInt(m[1], 10) : null;
}

function buildDownloadName({
  originalBase, pageNum, totalPages,
  digitOnly, suffixEnabled, suffix, pageAtEnd, extension
}) {
  let base = originalBase;
  if (digitOnly) {
    const transformed = base.replace(/\D+/g, '_').replace(/^_+|_+$/g, '');
    base = transformed || originalBase;
  }

  const padLen = String(totalPages || 1).length;
  const pagePart = pageNum != null ? `_${String(pageNum).padStart(padLen, '0')}` : '';

  const cleanSuffix = String(suffix ?? '').replace(/[\\/:*?"<>|]/g, '').trim();
  const suffixPart = suffixEnabled && cleanSuffix ? `_${cleanSuffix}` : '';

  const tail = pageAtEnd ? `${suffixPart}${pagePart}` : `${pagePart}${suffixPart}`;
  return `${base}${tail}.${extension}`;
}

const App = () => {
  const [file, setFile] = useState(null);
  const [pdfInfo, setPdfInfo] = useState(null);
  const [mode, setMode] = useState('auto'); // auto, color, bw
  const [converting, setConverting] = useState(false);
  const [results, setResults] = useState([]);
  const [finalMode, setFinalMode] = useState(null);
  const [debugStats, setDebugStats] = useState(null);
  const [error, setError] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const [comparison, setComparison] = useState(null); // { tiffUrl, pdfUrl, previewUrl }
  const [dpi, setDpi] = useState(400); // 200, 300, 400, 600
  const [split, setSplit] = useState(true); // true: page by page, false: single file
  const [digitOnly, setDigitOnly] = useState(false);
  const [suffixEnabled, setSuffixEnabled] = useState(false);
  const [suffix, setSuffix] = useState('');
  const [pageAtEnd, setPageAtEnd] = useState(true);
  const [extension, setExtension] = useState('tiff');

  const [allPresets, setAllPresets] = useState([]);
  const [defaultEditable, setDefaultEditable] = useState(['mode', 'suffix']);
  const [currentPresetId, setCurrentPresetId] = useState(null);

  const applyPreset = (preset) => {
    if (!preset) return;
    const o = preset.options || {};
    if (o.mode !== undefined) setMode(o.mode);
    if (o.dpi !== undefined) setDpi(o.dpi);
    if (o.split !== undefined) setSplit(o.split);
    if (o.digitOnly !== undefined) setDigitOnly(o.digitOnly);
    if (o.suffixEnabled !== undefined) setSuffixEnabled(o.suffixEnabled);
    if (o.suffix !== undefined) setSuffix(o.suffix);
    if (o.pageAtEnd !== undefined) setPageAtEnd(o.pageAtEnd);
    if (o.extension !== undefined) setExtension(o.extension);
    setCurrentPresetId(preset.id);
  };

  useEffect(() => {
    axios.get(`${API_BASE}/api/presets`).then(res => {
      const all = res.data?.presets || [];
      setAllPresets(all);
      setDefaultEditable(res.data?.defaultEditable || ['mode', 'suffix']);

      const urlPreset = new URLSearchParams(window.location.search).get('preset');
      const configDefault = res.data?.defaultPreset ?? null;
      const target = urlPreset ?? configDefault;

      if (target === '__custom__') return;  // explicitly start in custom mode
      const initial = target
        ? all.find(p => p.id === target)
        : all.find(p => !p.hidden);
      if (initial) applyPreset(initial);
    }).catch(() => { /* presets unavailable — continue with custom-only UI */ });
  }, []);

  const visiblePresets = allPresets.filter(p => !p.hidden);
  const activePreset = currentPresetId ? allPresets.find(p => p.id === currentPresetId) : null;
  const editableFields = activePreset ? (activePreset.editable ?? defaultEditable) : null;
  const isLocked = (field) => {
    if (editableFields === null) return false;        // custom mode (no preset)
    if (editableFields === '*') return false;         // wildcard: all editable
    return !editableFields.includes(field);
  };

  const PRESET_RADIO_THRESHOLD = 5;
  const usePresetRadio = visiblePresets.length > 0 && visiblePresets.length <= PRESET_RADIO_THRESHOLD;

  const onSelectPreset = (value) => {
    if (value === '__custom__') {
      setCurrentPresetId(null);
    } else {
      applyPreset(allPresets.find(p => p.id === value));
    }
  };
  const currentPresetValue = currentPresetId ?? '__custom__';

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
        dpi: dpi,
        split: split
      });
      setResults(res.data.files);
      setFinalMode(res.data.mode);
      setDebugStats(res.data.debugStats);
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
    setFinalMode(null);
    setDebugStats(null);
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
  }, [mode, dpi, split]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  });
  const getDownloadName = (r) => buildDownloadName({
    originalBase: (pdfInfo?.filename ?? 'output').replace(/\.pdf$/i, ''),
    pageNum: parsePageNum(r.name),
    totalPages: pdfInfo?.pages ?? 1,
    digitOnly, suffixEnabled, suffix, pageAtEnd, extension,
  });

  const downloadAll = () => {
    results.forEach((r, idx) => {
      setTimeout(() => {
        const dlName = getDownloadName(r);
        const link = document.createElement('a');
        link.href = `${API_BASE}/api/download?file=${encodeURIComponent(r.relPath)}&name=${encodeURIComponent(dlName)}`;
        link.download = dlName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, idx * 500); // Slightly more delay to avoid browser blocking
    });
  };

  return (
    <div className="container">
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--primary)' }}>PDF to TIFF Converter</h1>
        <p style={{ color: 'var(--text-muted)' }}>Ghostscript Powered | Smooth Workflow</p>
      </header>



      <div className="glass-card">
        <div className="settings-row">
          {visiblePresets.length > 0 && (
            <div className="settings-group">
              <Settings size={18} color="var(--text-muted)" />
              <span className="settings-label">プリセット:</span>
              {usePresetRadio ? (
                <SegmentedControl
                  name="preset"
                  value={currentPresetValue}
                  onChange={onSelectPreset}
                  options={[
                    ...visiblePresets.map(p => ({ value: p.id, label: p.label })),
                    ...(activePreset && activePreset.hidden ? [{ value: activePreset.id, label: activePreset.label }] : []),
                    { value: '__custom__', label: 'カスタム' },
                  ]}
                />
              ) : (
                <select
                  className="preset-select"
                  value={currentPresetValue}
                  onChange={e => onSelectPreset(e.target.value)}
                >
                  {visiblePresets.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                  {activePreset && activePreset.hidden && (
                    <option value={activePreset.id}>{activePreset.label}</option>
                  )}
                  <option value="__custom__">カスタム</option>
                </select>
              )}
            </div>
          )}

          <div className="settings-group">
            <Settings size={18} color="var(--text-muted)" />
            <span className="settings-label">カラー設定:</span>
            <SegmentedControl
              name="mode"
              value={mode}
              onChange={setMode}
              disabled={isLocked('mode')}
              options={[
                { value: 'auto',  label: '自動判定' },
                { value: 'bw',    label: '白黒' },
                { value: 'color', label: 'カラー' },
              ]}
            />
          </div>

          <div className="settings-group">
            <FileDigit size={18} color="var(--text-muted)" />
            <span className="settings-label">解像度 (DPI):</span>
            <SegmentedControl
              name="dpi"
              value={dpi}
              onChange={v => setDpi(Number(v))}
              disabled={isLocked('dpi')}
              options={[
                { value: 200, label: '200 DPI' },
                { value: 300, label: '300 DPI' },
                { value: 400, label: '400 DPI' },
                { value: 600, label: '600 DPI' },
              ]}
            />
          </div>
          <div className="settings-group">
            <Settings size={18} color="var(--text-muted)" />
            <span className="settings-label">出力形式:</span>
            <SegmentedControl
              name="split"
              value={split}
              onChange={v => setSplit(v === 'true' || v === true)}
              disabled={isLocked('split')}
              options={[
                { value: true,  label: 'ページごとに分割' },
                { value: false, label: '1つのTIFFにまとめる' },
              ]}
            />
          </div>

          <div className="settings-group" style={{ alignItems: 'flex-start' }}>
            <Settings size={18} color="var(--text-muted)" style={{ marginTop: '2px' }} />
            <span className="settings-label" style={{ lineHeight: 1, marginTop: '3px' }}>ファイル名:</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <ToggleSwitch
                checked={digitOnly}
                onChange={setDigitOnly}
                disabled={isLocked('digitOnly')}
              >
                数字と "_" のみにする
              </ToggleSwitch>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minHeight: '28px' }}>
                <ToggleSwitch
                  checked={suffixEnabled}
                  onChange={setSuffixEnabled}
                  disabled={isLocked('suffixEnabled')}
                >
                  suffix を付ける:
                </ToggleSwitch>
                {suffixEnabled && (
                  <input
                    type="text"
                    value={suffix}
                    onChange={e => setSuffix(e.target.value)}
                    disabled={isLocked('suffix')}
                    placeholder="例: 1, v2, rev3"
                    className="text-field"
                  />
                )}
              </div>
              {suffixEnabled && split && (
                <ToggleSwitch
                  checked={!pageAtEnd}
                  onChange={v => setPageAtEnd(!v)}
                  disabled={isLocked('pageAtEnd')}
                >
                  suffix をページ番号の後に付ける
                </ToggleSwitch>
              )}
            </div>
          </div>

          <div className="settings-group">
            <Settings size={18} color="var(--text-muted)" />
            <span className="settings-label">拡張子:</span>
            <SegmentedControl
              name="extension"
              value={extension}
              onChange={setExtension}
              disabled={isLocked('extension')}
              options={[
                { value: 'tiff', label: '.tiff' },
                { value: 'tif',  label: '.tif' },
              ]}
            />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h2 style={{ fontSize: '18px' }}>変換結果 ({results.length} ファイル)</h2>
              {finalMode && (
                <div style={{
                  background: finalMode === 'color' ? '#fee2e2' : '#f1f5f9',
                  color: finalMode === 'color' ? '#991b1b' : '#334155',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <span>{finalMode === 'color' ? '🎨 カラー ' : '⚫️ 白黒 '}</span>
                  {debugStats && debugStats.length > 0 && (
                    <span style={{ fontSize: '10px', opacity: 0.7, borderLeft: '1px solid currentColor', paddingLeft: '10px', fontWeight: 400 }}>
                      Max: C:{Math.max(...debugStats.map(s => s.cyan)).toFixed(4)},
                      M:{Math.max(...debugStats.map(s => s.magenta)).toFixed(4)},
                      Y:{Math.max(...debugStats.map(s => s.yellow)).toFixed(4)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={downloadAll}>
              <Download size={18} style={{ marginRight: '8px' }} /> 一括ダウンロード
            </button>
          </div>
          <div className="result-list">
            {results.map((r, i) => (
              <div key={i} className="result-item">
                <img src={`${API_BASE}${r.preview}`} alt={r.name} className="result-thumb" />
                <div className="result-info">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }} title={getDownloadName(r)}>
                    {getDownloadName(r)}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setComparison({ tiffUrl: r.url, previewUrl: r.preview, page: i + 1 })}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)' }}
                    >
                      <Eye size={16} />
                    </button>
                    <a
                      href={`${API_BASE}/api/download?file=${encodeURIComponent(r.relPath)}&name=${encodeURIComponent(getDownloadName(r))}`}
                      download={getDownloadName(r)}
                      style={{ color: 'var(--primary)' }}
                    >
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

      <div className="security-notice" style={{ marginTop: '40px' }}>
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

      <footer style={{ marginTop: 'auto', paddingTop: '40px', paddingBottom: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        &copy; 2026 PDF-2-TIFF Converter Contributors | MIT Licensed
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

const SegmentedControl = ({ name, value, onChange, options, disabled }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const labels = ref.current.querySelectorAll('label');
    let max = 0;
    labels.forEach(l => { l.style.minWidth = ''; max = Math.max(max, l.offsetWidth); });
    labels.forEach(l => { l.style.minWidth = `${max}px`; });
  }, [options]);
  return (
    <div className="segmented" ref={ref} role="radiogroup">
      {options.map(o => (
        <label key={String(o.value)}>
          <input
            type="radio"
            name={name}
            value={String(o.value)}
            checked={String(value) === String(o.value)}
            onChange={() => onChange(o.value)}
            disabled={disabled}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
};

const ToggleSwitch = ({ checked, onChange, disabled, children }) => (
  <label className="switch">
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      disabled={disabled}
    />
    <span className="switch-knob" />
    <span>{children}</span>
  </label>
);

export default App;
