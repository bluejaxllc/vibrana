import React, { useState, useEffect } from 'react';
import { Book, ChevronDown, ChevronRight } from 'lucide-react';

import { API } from '../config.js';

const APIDocsViewer = () => {
    const [spec, setSpec] = useState(null);
    const [expandedPaths, setExpandedPaths] = useState({});

    useEffect(() => {
        fetch(`${API}/api/docs`)
            .then(r => r.json())
            .then(setSpec)
            .catch(() => console.error('Failed to load API docs'));
    }, []);

    const togglePath = (path) => {
        setExpandedPaths(prev => ({ ...prev, [path]: !prev[path] }));
    };

    const getMethodColor = (method) => {
        const colors = { get: '#50fa7b', post: '#bd93f9', put: '#ffb86c', delete: '#ff5555', patch: '#f1fa8c' };
        return colors[method] || '#8be9fd';
    };

    if (!spec) return <div className="api-docs"><p className="no-data">Loading API documentation...</p></div>;

    const paths = Object.entries(spec.paths || {});

    // Group by tag
    const grouped = {};
    paths.forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, details]) => {
            const tag = details.tags?.[0] || 'Other';
            if (!grouped[tag]) grouped[tag] = [];
            grouped[tag].push({ path, method, ...details });
        });
    });

    return (
        <div className="api-docs">
            <div className="api-docs-header">
                <h3><Book size={16} /> {spec.info?.title || 'API Documentation'}</h3>
                <span className="api-version">v{spec.info?.version}</span>
            </div>
            <p className="api-desc">{spec.info?.description}</p>

            <div className="api-stats">
                <span>{paths.length} endpoints</span>
                <span>{Object.keys(grouped).length} groups</span>
            </div>

            {Object.entries(grouped).sort().map(([tag, endpoints]) => (
                <div key={tag} className="api-group">
                    <div className="api-group-header" onClick={() => togglePath(tag)}>
                        {expandedPaths[tag] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{tag}</span>
                        <span className="api-count">{endpoints.length}</span>
                    </div>

                    {expandedPaths[tag] && (
                        <div className="api-group-endpoints">
                            {endpoints.map((ep, i) => (
                                <div key={i} className="api-endpoint">
                                    <span className="api-method" style={{
                                        background: `${getMethodColor(ep.method)}22`,
                                        color: getMethodColor(ep.method),
                                        border: `1px solid ${getMethodColor(ep.method)}44`
                                    }}>
                                        {ep.method.toUpperCase()}
                                    </span>
                                    <span className="api-path">{ep.path}</span>
                                    <span className="api-summary">{ep.summary}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default APIDocsViewer;
