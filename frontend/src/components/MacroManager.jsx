import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Circle, Square, Play, StopCircle, Search, Trash2, Edit3,
  Plus, Zap, MousePointer, Keyboard, Clock, Monitor, Eye,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  XCircle, RefreshCw, Target, AppWindow
} from 'lucide-react';
import { LOCAL_API as API } from '../config.js';

// ── Step icon map ──
const STEP_ICONS = {
  click:       { icon: MousePointer, color: '#8be9fd' },
  scroll:      { icon: ChevronDown, color: '#6bc5d8' },
  key:         { icon: Keyboard, color: '#bd93f9' },
  type:        { icon: Keyboard, color: '#d4b8ff' },
  wait:        { icon: Clock, color: '#f1fa8c' },
  ocr_click:   { icon: Eye, color: '#50fa7b' },
  ui_click:    { icon: Target, color: '#50fa7b' },
  verify_text: { icon: Eye, color: '#8be9fd' },
  wait_for_text: { icon: Eye, color: '#f1fa8c' },
  screenshot:  { icon: Monitor, color: '#bd93f9' },
  ai_verify:   { icon: Zap, color: '#ff79c6' },
  focus_window: { icon: AppWindow, color: '#6bc5d8' },
  wait_settle: { icon: RefreshCw, color: '#f1fa8c' },
  verify_result: { icon: CheckCircle2, color: '#8be9fd' },
  verify_button: { icon: Target, color: '#50fa7b' },
};

const stepLabel = (type) => ({
  click: 'Click', scroll: 'Scroll', key: 'Key Press', type: 'Type Text',
  wait: 'Wait', ocr_click: 'OCR Click', ui_click: 'UI Click',
  verify_text: 'Verify Text', wait_for_text: 'Wait for Text',
  screenshot: 'Screenshot', ai_verify: 'AI Verify',
  focus_window: 'Focus Window', wait_settle: 'Wait Settle',
  verify_result: 'Verify Result', verify_button: 'Verify Button',
}[type] || type);

const formatDetail = (a) => {
  const p = a.params || {};
  switch (a.type) {
    case 'click': return `(${p.x || 0}, ${p.y || 0}) ${p.button || 'left'}${p.verify_label ? ` — "${p.verify_label}"` : ''}`;
    case 'scroll': return `(${p.x || 0}, ${p.y || 0}) dy=${p.dy || 0}`;
    case 'key': return `"${p.key || ''}"`;
    case 'type': return `"${(p.text || '').slice(0, 40)}"`;
    case 'wait': return `${p.seconds || 0}s`;
    case 'ocr_click': return `"${p.text || ''}" (${p.timeout || 10}s)`;
    case 'ui_click': return `"${p.name || ''}"`;
    case 'verify_text': return `"${p.expected || ''}"`;
    case 'wait_for_text': return `"${p.text || ''}" (${p.timeout || 60}s)`;
    case 'focus_window': return p.title || '';
    case 'wait_settle': return `${p.timeout || 3}s`;
    case 'ai_verify': return `"${(p.question || '').slice(0, 50)}"`;
    case 'screenshot': return p.label || 'capture';
    default: return JSON.stringify(p).slice(0, 60);
  }
};

// ── Step types for "add step" ──
const STEP_CATEGORIES = [
  { label: 'Input', types: ['click', 'key', 'type', 'scroll'] },
  { label: 'Smart', types: ['ocr_click', 'ui_click', 'focus_window'] },
  { label: 'Timing', types: ['wait', 'wait_settle'] },
  { label: 'Verify', types: ['verify_text', 'wait_for_text', 'verify_result', 'ai_verify', 'screenshot'] },
];

// ──────────────────────────────────────
// Step Row Component
// ──────────────────────────────────────
const StepRow = React.memo(({ action, index, onDelete }) => {
  const meta = STEP_ICONS[action.type] || { icon: Circle, color: '#8892a4' };
  const Icon = meta.icon;
  const isV = action.type?.startsWith('verify') || action.type === 'ai_verify' || action.type === 'screenshot';
  return (
    <div className={`macro-step-row${isV ? ' verification' : ''}`}>
      <span className="macro-step-num">{index + 1}</span>
      <span className="macro-step-icon"><Icon size={12} color={meta.color} /></span>
      <div className="macro-step-body">
        <span className="macro-step-type" style={{ color: meta.color }}>{stepLabel(action.type)}</span>
        <span className="macro-step-detail"> {formatDetail(action)}</span>
      </div>
      {onDelete && (
        <button className="macro-step-delete" title="Remove" onClick={() => onDelete(index)}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
});
StepRow.displayName = 'StepRow';

// ──────────────────────────────────────
// Playback Status Panel
// ──────────────────────────────────────
const PlaybackPanel = ({ state, onAbort }) => {
  if (!state || !state.active) return null;
  const pct = state.total_steps ? Math.round((state.current_step / state.total_steps) * 100) : 0;
  const hasErrs = (state.errors || []).length > 0;
  return (
    <div className="macro-playback-panel">
      <div className="macro-playback-header">
        <span className="macro-playback-name">▶ Playing: {state.name || 'macro'}</span>
        <button className="btn btn-danger-ghost btn-sm" onClick={onAbort}>
          <StopCircle size={13} /> Abort
        </button>
      </div>
      <div className="macro-progress-bar">
        <div
          className={`macro-progress-fill ${hasErrs ? 'has-errors' : 'success'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="macro-playback-stats">
        <span>Step {state.current_step}/{state.total_steps}</span>
        <span>{state.retries_used || 0} retries</span>
        <span>{state.elapsed || 0}s</span>
      </div>
      {state.current_action && (
        <div className="macro-playback-action">→ {state.current_action}</div>
      )}
      {state.errors?.length > 0 && (
        <div className="macro-playback-errors">
          {state.errors.slice(-3).map((e, i) => (
            <div key={i} className="macro-playback-error"><XCircle size={11} /> {e}</div>
          ))}
        </div>
      )}
      {state.verifications?.length > 0 && (
        <div className="macro-playback-verifications">
          {state.verifications.slice(-5).map((v, i) => (
            <div key={i} className={`macro-verification-row ${v.success ? 'pass' : 'fail'}`}>
              {v.success ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
              <span className="macro-verification-step">#{v.step}</span>
              {v.type} {v.label || v.expected || v.target || v.template || ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────
// Add Step Form
// ──────────────────────────────────────
const AddStepForm = ({ onAdd }) => {
  const [type, setType] = useState('click');
  const [params, setParams] = useState({ x: 0, y: 0 });
  const p = (k, v) => setParams(prev => ({ ...prev, [k]: v }));

  const handleAdd = () => {
    onAdd({ type, params: { ...params } });
    setParams(type === 'click' ? { x: 0, y: 0 } : {});
  };

  const renderParams = () => {
    switch (type) {
      case 'click':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">X</span>
            <input type="number" className="macro-param-input" value={params.x || ''} onChange={e => p('x', +e.target.value)} />
            <span className="macro-param-label">Y</span>
            <input type="number" className="macro-param-input" value={params.y || ''} onChange={e => p('y', +e.target.value)} />
            <span className="macro-param-label">Button</span>
            <select className="macro-param-input wide" value={params.button || 'left'} onChange={e => p('button', e.target.value)}>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="middle">Middle</option>
            </select>
          </div>
        );
      case 'key':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Key</span>
            <input type="text" className="macro-param-input wide" placeholder="enter, tab, f5..." value={params.key || ''} onChange={e => p('key', e.target.value)} />
          </div>
        );
      case 'type':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Text</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="text to type" value={params.text || ''} onChange={e => p('text', e.target.value)} />
          </div>
        );
      case 'wait':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Seconds</span>
            <input type="number" step="0.5" className="macro-param-input" value={params.seconds || ''} onChange={e => p('seconds', +e.target.value)} />
          </div>
        );
      case 'ocr_click':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Text</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="button text to find" value={params.text || ''} onChange={e => p('text', e.target.value)} />
            <span className="macro-param-label">Timeout</span>
            <input type="number" className="macro-param-input" value={params.timeout || 10} onChange={e => p('timeout', +e.target.value)} />
          </div>
        );
      case 'ui_click':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Name</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="element name/automation ID" value={params.name || ''} onChange={e => p('name', e.target.value)} />
          </div>
        );
      case 'focus_window':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Title</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="window title" value={params.title || ''} onChange={e => p('title', e.target.value)} />
          </div>
        );
      case 'wait_settle':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Timeout</span>
            <input type="number" step="0.5" className="macro-param-input" value={params.timeout || 3} onChange={e => p('timeout', +e.target.value)} />
          </div>
        );
      case 'verify_text':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Expected</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="text to verify" value={params.expected || ''} onChange={e => p('expected', e.target.value)} />
          </div>
        );
      case 'wait_for_text':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Text</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="text to wait for" value={params.text || ''} onChange={e => p('text', e.target.value)} />
            <span className="macro-param-label">Timeout</span>
            <input type="number" className="macro-param-input" value={params.timeout || 60} onChange={e => p('timeout', +e.target.value)} />
          </div>
        );
      case 'ai_verify':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Question</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="Does this look correct?" value={params.question || ''} onChange={e => p('question', e.target.value)} />
          </div>
        );
      case 'verify_result':
        return (
          <div className="macro-param-row">
            <span className="macro-param-label">Pattern</span>
            <input type="text" className="macro-param-input extra-wide" placeholder="regex pattern" value={params.pattern || ''} onChange={e => p('pattern', e.target.value)} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="macro-add-step">
      <div className="macro-type-categories">
        {STEP_CATEGORIES.map(cat => (
          <div key={cat.label}>
            <span className="macro-type-label">{cat.label}</span>
            <div className="macro-type-group">
              {cat.types.map(t => {
                const meta = STEP_ICONS[t] || {};
                return (
                  <button
                    key={t}
                    className={`macro-type-btn ${t === type ? 'selected' : ''}`}
                    style={t === type ? { color: meta.color, borderColor: meta.color } : {}}
                    onClick={() => { setType(t); setParams({}); }}
                  >
                    {stepLabel(t)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {renderParams()}
      <button className="btn btn-accent btn-sm" onClick={handleAdd}>
        <Plus size={12} /> Add Step
      </button>
    </div>
  );
};

// ──────────────────────────────────────
// Element Row (Discovery)
// ──────────────────────────────────────
const elementIcon = (type) => {
  const map = {
    Button: '🔘', Edit: '✏️', CheckBox: '☑️', RadioButton: '🔘',
    ComboBox: '📋', MenuItem: '📌', TabItem: '📑', ListItem: '📄',
    TreeItem: '🌲', Hyperlink: '🔗', Slider: '🎚️', Menu: '📋',
    MenuBar: '📋', ToolBar: '🔧', StatusBar: '📊', List: '📜',
  };
  return map[type] || '🔲';
};


// ══════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════
const MacroManager = () => {
  const [tab, setTab] = useState('macros');   // macros | record | discover | play
  const [macros, setMacros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  // Record state
  const [recording, setRecording] = useState(false);
  const [recName, setRecName] = useState('');
  const [recEvents, setRecEvents] = useState(0);
  const [recElapsed, setRecElapsed] = useState(0);
  const [recWindow, setRecWindow] = useState('');
  const recTimer = useRef(null);

  // Editing state
  const [editingMacro, setEditingMacro] = useState(null);
  const [editActions, setEditActions] = useState([]);
  const [showAddStep, setShowAddStep] = useState(false);

  // Discover state
  const [windows, setWindows] = useState([]);
  const [selectedWindow, setSelectedWindow] = useState('');
  const [discoverMode, setDiscoverMode] = useState('uia');  // uia | ocr
  const [elements, setElements] = useState([]);
  const [screenshot, setScreenshot] = useState('');
  const [selectedElement, setSelectedElement] = useState(null);
  const [uiaAvailable, setUiaAvailable] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  // Playback state
  const [playback, setPlayback] = useState(null);
  const playbackPoll = useRef(null);

  // ── Backend check ──
  const checkBackend = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/macros/list`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        setMacros(data.macros || data || []);
        setConnected(true);
        return true;
      }
    } catch { /* ignore */ }
    setConnected(false);
    return false;
  }, []);

  useEffect(() => {
    checkBackend();
    const id = setInterval(checkBackend, 10000);
    return () => clearInterval(id);
  }, [checkBackend]);

  // ── Load macros ──
  const loadMacros = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/macros/list`);
      if (res.ok) {
        const data = await res.json();
        setMacros(data.macros || data || []);
      }
    } catch { /* */ }
  }, []);

  // ── Recording controls ──
  const startRecord = async () => {
    if (!recName.trim()) {
      toast.error('Enter a macro name first');
      return;
    }
    try {
      const body = {};
      if (recWindow) body.target_window = recWindow;
      const res = await fetch(`${API}/api/macros/record/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'recording') {
        setRecording(true);
        setRecEvents(0);
        setRecElapsed(0);
        setTab('record');
        toast.success('Recording started — interact with your app');
        // Poll recording status
        recTimer.current = setInterval(async () => {
          try {
            const sr = await fetch(`${API}/api/macros/recording-status`);
            if (sr.ok) {
              const sd = await sr.json();
              setRecEvents(sd.event_count || 0);
              setRecElapsed(sd.elapsed || 0);
            }
          } catch { /* */ }
        }, 1000);
      } else {
        toast.error(data.message || 'Failed to start recording');
      }
    } catch (e) {
      toast.error(`Backend error: ${e.message}`);
    }
  };

  const stopRecord = async () => {
    if (recTimer.current) clearInterval(recTimer.current);
    try {
      const res = await fetch(`${API}/api/macros/record/stop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: recName }),
      });
      const data = await res.json();
      setRecording(false);
      if (data.status === 'saved') {
        toast.success(`Recorded "${recName}" (${data.action_count} steps, ${data.duration}s)`);
        setRecName('');
        loadMacros();
        setTab('macros');
      } else {
        toast.error(data.message || 'Failed to save recording');
      }
    } catch (e) {
      toast.error(`Stop error: ${e.message}`);
      setRecording(false);
    }
  };

  // ── Macro Actions ──
  const editMacro = async (name) => {
    try {
      const res = await fetch(`${API}/api/macros/${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setEditingMacro(data);
        setEditActions(data.actions || []);
        setShowAddStep(false);
        setTab('record');
      }
    } catch { toast.error('Failed to load macro'); }
  };

  const saveEditedMacro = async () => {
    if (!editingMacro) return;
    try {
      const res = await fetch(`${API}/api/macros/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingMacro.name, actions: editActions }),
      });
      const data = await res.json();
      if (data.status === 'saved') {
        toast.success(`Saved "${editingMacro.name}"`);
        setEditingMacro(null);
        loadMacros();
        setTab('macros');
      }
    } catch { toast.error('Failed to save'); }
  };

  const cancelEdit = () => {
    setEditingMacro(null);
    setEditActions([]);
    setShowAddStep(false);
  };

  const deleteMacro = async (name) => {
    try {
      await fetch(`${API}/api/macros/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast.success(`Deleted "${name}"`);
      loadMacros();
    } catch { toast.error('Failed to delete'); }
  };

  const deleteStep = (idx) => {
    setEditActions(prev => prev.filter((_, i) => i !== idx));
  };

  const addStep = (step) => {
    setEditActions(prev => [...prev, step]);
    toast.success(`Added ${stepLabel(step.type)} step`);
  };

  // ── Play macro ──
  const playMacro = async (name, smart = false) => {
    const endpoint = smart ? `${API}/api/macros/play-smart` : `${API}/api/macros/play`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.status === 'playing' || data.status === 'completed') {
        setTab('play');
        if (smart) {
          // Start polling playback status
          setPlayback({ active: true, name, current_step: 0, total_steps: data.total_steps || 0 });
          playbackPoll.current = setInterval(async () => {
            try {
              const sr = await fetch(`${API}/api/macros/playback-status`);
              if (sr.ok) {
                const sd = await sr.json();
                setPlayback(sd);
                if (!sd.active) {
                  clearInterval(playbackPoll.current);
                  loadMacros();
                  if (sd.errors?.length > 0) {
                    toast.error(`Finished with ${sd.errors.length} error(s)`);
                  } else {
                    toast.success('Playback completed!');
                  }
                }
              }
            } catch { /* */ }
          }, 500);
        } else {
          toast.success(`Played "${name}": ${data.actions_executed || 0} steps`);
          if (data.errors?.length > 0) {
            data.errors.forEach(e => toast.error(e, { duration: 4000 }));
          }
        }
      } else {
        toast.error(data.message || 'Playback failed');
      }
    } catch (e) {
      toast.error(`Play error: ${e.message}`);
    }
  };

  const abortPlayback = async () => {
    try {
      await fetch(`${API}/api/macros/abort`, { method: 'POST' });
      toast('Aborting playback...', { icon: '⏹' });
    } catch { /* */ }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (recTimer.current) clearInterval(recTimer.current);
      if (playbackPoll.current) clearInterval(playbackPoll.current);
    };
  }, []);

  // ── Discovery ──
  const loadWindows = async () => {
    try {
      const res = await fetch(`${API}/api/macros/ui-windows`);
      if (res.ok) {
        const data = await res.json();
        setWindows(data.windows || []);
        setUiaAvailable(data.uia_available || false);
        if (!data.uia_available) setDiscoverMode('ocr');
      }
    } catch { toast.error('Failed to list windows'); }
  };

  const discoverWindow = async () => {
    if (!selectedWindow) {
      toast.error('Select a target window first');
      return;
    }
    setDiscovering(true);
    setElements([]);
    setScreenshot('');
    setSelectedElement(null);

    try {
      if (discoverMode === 'uia') {
        const res = await fetch(`${API}/api/macros/discover-window`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ window_title: selectedWindow }),
        });
        const data = await res.json();
        if (data.error) {
          toast.error(data.error);
        } else {
          setElements(data.elements || []);
          setScreenshot(data.screenshot || '');
          toast.success(`Found ${data.count || 0} UI elements`);
        }
      } else {
        // OCR-based scan
        const res = await fetch(`${API}/api/macros/scan-screen`, { method: 'POST' });
        const data = await res.json();
        setElements((data.elements || data.buttons || []).map((el, i) => ({
          id: el.id || `ocr_${i}`,
          name: el.text || el.label || '',
          control_type: el.type || 'Text',
          region: { x: el.x, y: el.y, w: el.w, h: el.h },
          center: { x: (el.x||0) + (el.w||0)/2, y: (el.y||0) + (el.h||0)/2 },
          is_clickable: true,
          source: 'ocr',
        })));
        setScreenshot(data.screenshot || data.screen || '');
        toast.success(`Found ${(data.elements || data.buttons || []).length} elements via OCR`);
      }
    } catch (e) {
      toast.error(`Discovery failed: ${e.message}`);
    }
    setDiscovering(false);
  };

  const addElementToMacro = (element, stepType = 'ui_click') => {
    if (!editingMacro) {
      toast.error('Open a macro for editing first (click Edit on a macro)');
      return;
    }
    let step;
    if (stepType === 'ui_click' && element.source === 'uia') {
      step = { type: 'ui_click', params: { name: element.name, window: selectedWindow } };
    } else if (element.center) {
      step = { type: 'click', params: { x: element.center.x, y: element.center.y, verify_label: element.name } };
    } else {
      step = { type: 'ocr_click', params: { text: element.name, timeout: 10 } };
    }
    setEditActions(prev => [...prev, step]);
    toast.success(`Added "${element.name}" to macro`);
    setTab('record');
  };

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════
  return (
    <div className="macro-manager">
      <h3><Keyboard size={16} /> Macro Manager</h3>

      {/* Tab Navigation */}
      <div className="macro-tabs">
        <button className={`macro-tab ${tab === 'record' ? 'active' : ''}`} onClick={() => setTab('record')}>
          <Circle size={12} /> Record
          {recording && <span className="macro-tab-badge">REC</span>}
        </button>
        <button className={`macro-tab ${tab === 'macros' ? 'active' : ''}`} onClick={() => setTab('macros')}>
          <Square size={12} /> Macros
          {macros.length > 0 && <span className="macro-tab-badge">{macros.length}</span>}
        </button>
        <button className={`macro-tab ${tab === 'discover' ? 'active' : ''}`} onClick={() => { setTab('discover'); loadWindows(); }}>
          <Search size={12} /> Discover
        </button>
        <button className={`macro-tab ${tab === 'play' ? 'active' : ''}`} onClick={() => setTab('play')}>
          <Play size={12} /> Play
          {playback?.active && <span className="macro-tab-badge">▶</span>}
        </button>
      </div>

      {/* Tab Content */}
      <div className="macro-tab-content">

        {/* ── RECORD / EDIT TAB ── */}
        {tab === 'record' && (
          <>
            {/* Record bar */}
            {!editingMacro && (
              <div className="macro-record-bar">
                <input
                  type="text"
                  className="macro-name-input"
                  placeholder="Macro name..."
                  value={recName}
                  onChange={e => setRecName(e.target.value)}
                  disabled={recording}
                />
                {!recording ? (
                  <button className="btn btn-accent btn-sm" onClick={startRecord} disabled={!connected}>
                    <Circle size={12} /> Record
                  </button>
                ) : (
                  <>
                    <div className="macro-recording-badge">
                      <Circle size={8} /> REC {recEvents} events • {recElapsed}s
                    </div>
                    <button className="btn btn-danger-ghost btn-sm" onClick={stopRecord}>
                      <StopCircle size={12} /> Stop
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Editing an existing macro */}
            {editingMacro && (
              <>
                <div className="macro-record-bar">
                  <Edit3 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--accent-light)', fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>
                    {editingMacro.name}
                  </span>
                  <button className="btn btn-accent btn-sm" onClick={saveEditedMacro}>
                    Save
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>

                <div className="macro-step-panel">
                  <div className="macro-step-header">
                    <strong>{editActions.length} Steps</strong>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowAddStep(!showAddStep)}
                    >
                      <Plus size={12} /> {showAddStep ? 'Hide' : 'Add Step'}
                    </button>
                  </div>
                  <div className="macro-step-list">
                    {editActions.length === 0 ? (
                      <div className="macro-step-empty">No steps yet — click "Add Step" or go to Discover to add elements</div>
                    ) : (
                      editActions.map((a, i) => (
                        <StepRow key={i} action={a} index={i} onDelete={deleteStep} />
                      ))
                    )}
                  </div>
                </div>

                {showAddStep && <AddStepForm onAdd={addStep} />}
              </>
            )}

            {/* Live step preview during recording */}
            {recording && (
              <div className="macro-step-panel">
                <div className="macro-step-header">
                  <strong>Live Events: {recEvents}</strong>
                  <span style={{ color: '#ff5555', fontSize: '0.7rem' }}>Recording...</span>
                </div>
                <div className="macro-step-empty">
                  Events are being captured. Click Stop to save.
                </div>
              </div>
            )}

            {!editingMacro && !recording && (
              <div className="macro-step-empty">
                Start recording or edit an existing macro from the Macros tab.
              </div>
            )}
          </>
        )}

        {/* ── MACROS TAB ── */}
        {tab === 'macros' && (
          <div className="macro-card-list">
            {macros.length === 0 ? (
              <div className="macro-step-empty">No saved macros yet. Go to Record to create one.</div>
            ) : (
              macros.map(m => (
                <div key={m.name} className="macro-card">
                  <div className="macro-card-info">
                    <div className="macro-card-name">{m.name}</div>
                    <div className="macro-card-meta">
                      <span>{m.action_count} steps</span>
                      {m.duration > 0 && <span>{m.duration}s</span>}
                      {m.target_window && <span>🪟 {m.target_window}</span>}
                    </div>
                  </div>
                  <div className="macro-card-actions">
                    <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => editMacro(m.name)}>
                      <Edit3 size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" title="Play" onClick={() => playMacro(m.name, false)}>
                      <Play size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" title="Smart Play (with verification)" onClick={() => playMacro(m.name, true)}>
                      <Zap size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => deleteMacro(m.name)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── DISCOVER TAB ── */}
        {tab === 'discover' && (
          <>
            <div className="macro-discover-header">
              <select
                className="macro-window-select"
                value={selectedWindow}
                onChange={e => setSelectedWindow(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">— Select Target Window —</option>
                {windows.map((w, i) => (
                  <option key={i} value={w.title}>{w.title}</option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" onClick={loadWindows} title="Refresh windows">
                <RefreshCw size={13} />
              </button>
              <button
                className="btn btn-accent btn-sm"
                onClick={discoverWindow}
                disabled={!selectedWindow || discovering}
              >
                <Search size={12} /> {discovering ? 'Scanning...' : 'Discover'}
              </button>
            </div>

            <div className="macro-discover-modes">
              <button
                className={`macro-discover-mode-btn ${discoverMode === 'uia' ? 'active' : ''}`}
                onClick={() => setDiscoverMode('uia')}
                disabled={!uiaAvailable}
                title={uiaAvailable ? 'UI Automation API' : 'pywinauto not installed'}
              >
                <Target size={13} /> UI Automation
              </button>
              <button
                className={`macro-discover-mode-btn ${discoverMode === 'ocr' ? 'active' : ''}`}
                onClick={() => setDiscoverMode('ocr')}
              >
                <Eye size={13} /> Visual (OCR)
              </button>
            </div>

            {elements.length > 0 && (
              <div className="macro-discover-results">
                <div className="macro-discover-results-header">
                  <strong>{elements.length} Elements</strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {discoverMode === 'uia' ? 'Accessibility API' : 'OCR / Visual'}
                  </span>
                </div>

                {screenshot && (
                  <div className="macro-discover-screenshot">
                    <img src={`data:image/jpeg;base64,${screenshot}`} alt="App screenshot" />
                  </div>
                )}

                <div className="macro-element-list">
                  {elements.map((el, i) => (
                    <div
                      key={el.id || i}
                      className={`macro-element-row ${selectedElement?.id === el.id ? 'selected' : ''}`}
                      onClick={() => setSelectedElement(el)}
                    >
                      <span className="macro-element-icon">{elementIcon(el.control_type)}</span>
                      <div className="macro-element-body">
                        <span className="macro-element-type" style={{ color: el.is_clickable ? '#50fa7b' : '#8892a4' }}>
                          {el.control_type}
                        </span>
                        {el.name && (
                          <span className="macro-element-name"> — {el.name}</span>
                        )}
                      </div>
                      {el.region && (
                        <span className="macro-element-coords">
                          ({el.region.x}, {el.region.y})
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {selectedElement && (
                  <div className="macro-element-actions">
                    <div className="macro-element-actions-info">
                      <strong>{selectedElement.control_type}</strong>: {selectedElement.name || '(unnamed)'}
                      {selectedElement.automation_id && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>ID: {selectedElement.automation_id}</span>}
                    </div>
                    <div className="macro-element-actions-btns">
                      <button className="btn btn-accent btn-sm" onClick={() => addElementToMacro(selectedElement, 'ui_click')}>
                        <Plus size={11} /> Add as UI Click
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => addElementToMacro(selectedElement, 'click')}>
                        <Plus size={11} /> Add as Coord Click
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {elements.length === 0 && !discovering && (
              <div className="macro-step-empty">
                Select a window and click Discover to find interactive elements.
              </div>
            )}
          </>
        )}

        {/* ── PLAY TAB ── */}
        {tab === 'play' && (
          <>
            <PlaybackPanel state={playback} onAbort={abortPlayback} />

            {(!playback || !playback.active) && (
              <>
                {playback && !playback.active && (
                  <div className="macro-step-panel">
                    <div className="macro-step-header">
                      <strong>Last Run: {playback.name}</strong>
                      <span style={{
                        color: (playback.errors?.length || 0) > 0 ? 'var(--danger)' : 'var(--success)',
                        fontSize: '0.75rem'
                      }}>
                        {playback.current_action}
                      </span>
                    </div>
                    <div className="macro-step-list">
                      {(playback.errors || []).length > 0 && (
                        <>
                          {playback.errors.map((e, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 8px', color: 'var(--danger)', fontSize: '0.72rem' }}>
                              <AlertTriangle size={11} /> {e}
                            </div>
                          ))}
                        </>
                      )}
                      {(playback.verifications || []).map((v, i) => (
                        <div key={i} className={`macro-verification-row ${v.success ? 'pass' : 'fail'}`}>
                          {v.success ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          <span className="macro-verification-step">#{v.step}</span>
                          {v.type}: {v.label || v.expected || v.target || v.template || v.question || ''}
                        </div>
                      ))}
                      {(playback.errors || []).length === 0 && (playback.verifications || []).length === 0 && (
                        <div className="macro-step-empty">
                          {playback.current_step}/{playback.total_steps} steps completed in {playback.elapsed || 0}s
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                  Select a macro from the Macros tab and click ▶ (Play) or ⚡ (Smart Play) to begin.
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Status Bar */}
      <div className="macro-status-bar">
        <span className={`macro-status-dot ${recording ? 'recording' : connected ? 'connected' : 'disconnected'}`} />
        <span>{recording ? 'Recording' : connected ? 'Backend Connected' : 'Backend Offline'}</span>
        {macros.length > 0 && <span>• {macros.length} macro{macros.length !== 1 ? 's' : ''}</span>}
        {playback?.active && <span>• Playing: Step {playback.current_step}/{playback.total_steps}</span>}
      </div>
    </div>
  );
};

export default MacroManager;
