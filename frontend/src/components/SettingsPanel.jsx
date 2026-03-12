import React, { useState, useEffect } from 'react';
import { Users, Shield, Clock, LogOut, UserCheck, UserX, Settings, Mail, PlayCircle, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

const SettingsPanel = ({ user, token, onLogout }) => {
    const [users, setUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [config, setConfig] = useState({});
    const [activeTab, setActiveTab] = useState('profile');
    const [saving, setSaving] = useState(false);

    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API}/users`, { headers: authHeaders });
            const data = await res.json();
            setUsers(data);
        } catch { console.error('Failed to fetch users'); }
    };

    const fetchAuditLogs = async () => {
        try {
            const res = await fetch(`${API}/audit?limit=30`, { headers: authHeaders });
            const data = await res.json();
            setAuditLogs(data);
        } catch { console.error('Failed to fetch audit logs'); }
    };

    const fetchConfig = async () => {
        try {
            const res = await fetch(`${API}/api/config`, { headers: authHeaders });
            const data = await res.json();
            setConfig(data);
        } catch { console.error('Failed to fetch config'); }
    };

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'audit') fetchAuditLogs();
        if (activeTab === 'system') fetchConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const updateConfig = async (updates) => {
        setSaving(true);
        try {
            const res = await fetch(`${API}/api/config`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(updates)
            });
            if (res.ok) {
                toast.success('Configuración del sistema actualizada');
                fetchConfig();
            } else {
                toast.error('Error al actualizar configuración');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setSaving(false); }
    };

    const toggleUser = async (userId) => {
        try {
            const res = await fetch(`${API}/users/${userId}/toggle`, {
                method: 'POST',
                headers: authHeaders
            });
            if (res.ok) {
                toast.success('Estado de usuario actualizado');
                fetchUsers();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Error al actualizar usuario');
            }
        } catch { toast.error('Error al actualizar usuario'); }
    };

    const getRoleBadge = (role) => {
        const colors = { admin: '#ff5555', practitioner: '#bd93f9', viewer: '#8be9fd' };
        return (
            <span className="role-badge" style={{ background: `${colors[role]}22`, color: colors[role], border: `1px solid ${colors[role]}44` }}>
                {role}
            </span>
        );
    };

    return (
        <div className="settings-panel">
            <div className="settings-tabs">
                <button className={`cv-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                    <Shield size={14} /> Perfil
                </button>
                {user?.role === 'admin' && (
                    <button className={`cv-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                        <Users size={14} /> Usuarios
                    </button>
                )}
                {user?.role === 'admin' && (
                    <button className={`cv-tab ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>
                        <Settings size={14} /> Sistema
                    </button>
                )}
                <button className={`cv-tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
                    <Clock size={14} /> Auditoría
                </button>
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && user && (
                <div className="settings-content">
                    <div className="profile-card-settings">
                        <div className="profile-avatar">{user.full_name?.[0] || user.username[0]}</div>
                        <div>
                            <h3>{user.full_name || user.username}</h3>
                            <p>{user.email}</p>
                            {getRoleBadge(user.role)}
                        </div>
                    </div>
                    <div className="profile-details">
                        <div className="detail-row"><span>Usuario</span><span>{user.username}</span></div>
                        <div className="detail-row"><span>Rol</span><span>{user.role}</span></div>
                        <div className="detail-row"><span>Miembro desde</span><span>{new Date(user.created_at).toLocaleDateString()}</span></div>
                        <div className="detail-row"><span>Último acceso</span><span>{user.last_login ? new Date(user.last_login).toLocaleString() : 'N/A'}</span></div>
                    </div>
                    <button className="btn btn-danger-ghost btn-sm" onClick={onLogout} style={{ marginTop: 16 }}>
                        <LogOut size={14} /> Cerrar Sesión
                    </button>
                </div>
            )}

            {/* Users Tab (Admin only) */}
            {activeTab === 'users' && (
                <div className="settings-content">
                    <div className="user-list-admin">
                        {users.map(u => (
                            <div key={u.id} className={`user-row ${!u.is_active ? 'inactive' : ''}`}>
                                <div className="user-row-info">
                                    <strong>{u.full_name || u.username}</strong>
                                    <small>{u.email}</small>
                                </div>
                                {getRoleBadge(u.role)}
                                {u.id !== user?.id && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => toggleUser(u.id)}
                                        title={u.is_active ? 'Desactivar' : 'Activar'}
                                    >
                                        {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* System Tab (Admin only) */}
            {activeTab === 'system' && (
                <div className="settings-content">
                    <div className="system-settings-grid">
                        <div className="setting-card">
                            <div className="setting-title"><PlayCircle size={14} /> Modo Simulación</div>
                            <p className="setting-desc">Habilitar datos de biorresonancia aleatorizados para pruebas sin dispositivo NLS en vivo.</p>
                            <label className="switch-container">
                                <input
                                    type="checkbox"
                                    checked={config.simulation_mode === 'true'}
                                    onChange={(e) => updateConfig({ simulation_mode: e.target.checked ? 'true' : 'false' })}
                                    disabled={saving}
                                />
                                <span className="slider round"></span>
                                <span style={{ marginLeft: 35, fontSize: '0.8rem' }}>
                                    {config.simulation_mode === 'true' ? 'Activo' : 'Desactivado'}
                                </span>
                            </label>
                        </div>

                        <div className="setting-card">
                            <div className="setting-title"><Mail size={14} /> Configuración SMTP</div>
                            <p className="setting-desc">Servidor de correo saliente para reportes de salud.</p>
                            <div className="config-form">
                                <input
                                    type="text"
                                    placeholder="Servidor SMTP"
                                    className="cv-input-field"
                                    value={config.smtp_host || ''}
                                    onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })}
                                />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        type="text"
                                        placeholder="Puerto"
                                        className="cv-input-field"
                                        style={{ width: 80 }}
                                        value={config.smtp_port || ''}
                                        onChange={(e) => setConfig({ ...config, smtp_port: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Username"
                                        className="cv-input-field"
                                        value={config.smtp_user || ''}
                                        onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })}
                                    />
                                </div>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    className="cv-input-field"
                                    value={config.smtp_pass || ''}
                                    onChange={(e) => setConfig({ ...config, smtp_pass: e.target.value })}
                                />
                                <button
                                    className="btn btn-accent btn-sm"
                                    onClick={() => updateConfig({
                                        smtp_host: config.smtp_host,
                                        smtp_port: config.smtp_port,
                                        smtp_user: config.smtp_user,
                                        smtp_pass: config.smtp_pass
                                    })}
                                    disabled={saving}
                                >
                                    {saving ? 'Guardando...' : 'Guardar Configuración SMTP'}
                                </button>
                            </div>
                        </div>

                        <div className="setting-card">
                            <div className="setting-title"><MessageCircle size={14} style={{ color: '#25D366' }} /> Integración WhatsApp</div>
                            <p className="setting-desc">Ingrese su URL de Webhook Entrante de GoHighLevel para enrutar mensajes a pacientes.</p>
                            <div className="config-form">
                                <input
                                    type="text"
                                    placeholder="https://services.leadconnectorhq.com/hooks/..."
                                    className="cv-input-field"
                                    value={config.ghl_whatsapp_webhook || ''}
                                    onChange={(e) => setConfig({ ...config, ghl_whatsapp_webhook: e.target.value })}
                                />
                                <button
                                    className="btn btn-accent btn-sm"
                                    onClick={() => updateConfig({
                                        ghl_whatsapp_webhook: config.ghl_whatsapp_webhook
                                    })}
                                    disabled={saving}
                                >
                                    {saving ? 'Guardando...' : 'Guardar Webhook'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Audit Tab */}
            {activeTab === 'audit' && (
                <div className="settings-content">
                    <div className="audit-list">
                        {auditLogs.length === 0 ? (
                            <p className="no-data">Sin eventos de auditoría aún.</p>
                        ) : (
                            auditLogs.map(log => (
                                <div key={log.id} className="audit-item">
                                    <div className="audit-action">{log.action}</div>
                                    <div className="audit-meta">
                                        <span>{log.username || 'System'}</span>
                                        <span>{log.entity_type}{log.entity_id ? ` #${log.entity_id.substring(0, 8)}` : ''}</span>
                                        <small>{new Date(log.timestamp).toLocaleString()}</small>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPanel;
