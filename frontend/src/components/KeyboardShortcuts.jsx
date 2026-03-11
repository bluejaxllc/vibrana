import React, { useState, useEffect, useCallback } from 'react';
import { Keyboard, X } from 'lucide-react';

const SHORTCUTS = [
    { keys: ['Ctrl', 'K'], action: 'Open keyboard shortcuts', id: 'shortcuts' },
    { keys: ['Ctrl', 'S'], action: 'Save / trigger scan', id: 'scan' },
    { keys: ['Ctrl', 'E'], action: 'Export patient data', id: 'export' },
    { keys: ['Ctrl', 'F'], action: 'Focus search', id: 'search' },
    { keys: ['Ctrl', 'N'], action: 'New patient', id: 'new_patient' },
    { keys: ['Ctrl', 'D'], action: 'Toggle dark/light theme', id: 'theme' },
    { keys: ['Ctrl', '1'], action: 'Go to Dashboard', id: 'dashboard' },
    { keys: ['Ctrl', '2'], action: 'Go to Analytics', id: 'analytics' },
    { keys: ['Ctrl', '3'], action: 'Go to Settings', id: 'settings' },
    { keys: ['Ctrl', '4'], action: 'Go to API Docs', id: 'api_docs' },
    { keys: ['Escape'], action: 'Close modal / panel', id: 'close' },
    { keys: ['F11'], action: 'Toggle fullscreen', id: 'fullscreen' },
];

const KeyboardShortcuts = ({ onAction }) => {
    const [visible, setVisible] = useState(false);

    const handleKeyDown = useCallback((e) => {
        // Ctrl+K — open shortcuts panel
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            setVisible(v => !v);
            return;
        }

        // Escape — close
        if (e.key === 'Escape') {
            setVisible(false);
            onAction?.('close');
            return;
        }

        // F11 — fullscreen
        if (e.key === 'F11') {
            e.preventDefault();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => { });
            } else {
                document.exitFullscreen().catch(() => { });
            }
            return;
        }

        // Ctrl shortcuts
        if (e.ctrlKey) {
            const keyMap = {
                's': 'scan',
                'e': 'export',
                'f': 'search',
                'n': 'new_patient',
                'd': 'theme',
                '1': 'dashboard',
                '2': 'analytics',
                '3': 'settings',
                '4': 'api_docs'
            };
            const action = keyMap[e.key];
            if (action) {
                e.preventDefault();

                // Navigation shortcuts
                if (action === 'dashboard') window.location.href = '/';
                else if (action === 'analytics') window.location.href = '/analytics';
                else if (action === 'settings') window.location.href = '/settings';
                else if (action === 'api_docs') window.location.href = '/api-docs';
                else onAction?.(action);
            }
        }
    }, [onAction]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    if (!visible) return null;

    return (
        <div className="shortcuts-overlay" onClick={() => setVisible(false)}>
            <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
                <div className="shortcuts-header">
                    <h3><Keyboard size={16} /> Keyboard Shortcuts</h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setVisible(false)}>
                        <X size={14} />
                    </button>
                </div>
                <div className="shortcuts-list">
                    {SHORTCUTS.map(s => (
                        <div key={s.id} className="shortcut-row">
                            <div className="shortcut-keys">
                                {s.keys.map((k, i) => (
                                    <React.Fragment key={i}>
                                        <kbd>{k}</kbd>
                                        {i < s.keys.length - 1 && <span>+</span>}
                                    </React.Fragment>
                                ))}
                            </div>
                            <span className="shortcut-action">{s.action}</span>
                        </div>
                    ))}
                </div>
                <p className="shortcuts-hint">Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to toggle</p>
            </div>
        </div>
    );
};

export default KeyboardShortcuts;
