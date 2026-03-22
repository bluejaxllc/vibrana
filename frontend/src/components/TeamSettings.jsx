import React, { useState, useEffect, useCallback } from 'react';
import { API } from '../config';

const TeamSettings = () => {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newTeamName, setNewTeamName] = useState('');
    const [activeTeam, setActiveTeam] = useState(null);
    const [members, setMembers] = useState([]);
    const [inviteUsername, setInviteUsername] = useState('');
    const [inviting, setInviting] = useState(false);

    const fetchTeams = useCallback(async () => {
        try {
            const res = await fetch(`${API}/teams`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            const teamsList = Array.isArray(data) ? data : [];
            setTeams(teamsList);
            if (teamsList.length > 0 && !activeTeam) {
                setActiveTeam(data[0]);
                fetchMembers(data[0].team_id);
            }
            setLoading(false);
        } catch (err) {
            console.error('Error fetching teams:', err);
            setLoading(false);
        }
    }, [activeTeam]);

    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);
    const fetchMembers = async (teamId) => {
        try {
            const res = await fetch(`${API}/teams/${teamId}/members`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            setMembers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error fetching members:', err);
        }
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!inviteUsername.trim() || !activeTeam) return;
        setInviting(true);
        try {
            const res = await fetch(`${API}/teams/${activeTeam.team_id}/invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}`
                },
                body: JSON.stringify({ username: inviteUsername })
            });
            const data = await res.json();
            if (res.ok) {
                setInviteUsername('');
                fetchMembers(activeTeam.team_id);
            } else {
                alert(data.error || 'Error al invitar');
            }
        } catch (err) {
            console.error('Error inviting member:', err);
        } finally {
            setInviting(false);
        }
    };

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        if (!newTeamName.trim()) return;
        try {
            const res = await fetch(`${API}/teams`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}`
                },
                body: JSON.stringify({ name: newTeamName })
            });
            if (res.ok) {
                setNewTeamName('');
                fetchTeams();
            }
        } catch (err) {
            console.error('Error creating team:', err);
        }
    };

    if (loading) return <div className="p-4">Cargando equipos...</div>;

    return (
        <div className="team-settings p-6">
            <div className="section-header mb-6">
                <h1>Colaboración en Equipo</h1>
                <p className="subtitle">Gestionar equipos de diagnóstico y acceso compartido de pacientes</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Team List & Creation */}
                <div className="card glass p-4">
                    <h3>Tus Equipos</h3>
                    <div className="team-list mt-4 space-y-2">
                        {teams.map(t => (
                            <div
                                key={t.id}
                                className={`team-item p-3 rounded-lg border cursor-pointer transition-all ${activeTeam?.id === t.team_id ? 'border-accent bg-accent/10' : 'border-subtle hover:bg-white/5'}`}
                                onClick={() => {
                                    setActiveTeam(t);
                                    fetchMembers(t.team_id);
                                }}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold">{t.team_name}</span>
                                    <span className="text-xs opacity-60 uppercase">{t.role}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <form onSubmit={handleCreateTeam} className="mt-6 flex gap-2">
                        <input
                            type="text"
                            className="input-vibrana flex-1"
                            placeholder="Nombre de Nuevo Equipo..."
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                        />
                        <button type="submit" className="btn-vibrana">Crear</button>
                    </form>
                </div>

                {/* Team Members */}
                {activeTeam && (
                    <div className="card glass p-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3>Miembros de {activeTeam.team_name}</h3>
                        </div>

                        <form onSubmit={handleInvite} className="mb-6 flex gap-2">
                            <input
                                type="text"
                                className="input-vibrana flex-1"
                                placeholder="Invitar por usuario..."
                                value={inviteUsername}
                                onChange={(e) => setInviteUsername(e.target.value)}
                            />
                            <button type="submit" className="btn-vibrana" disabled={inviting}>
                                {inviting ? '...' : 'Invitar'}
                            </button>
                        </form>

                        <div className="member-list space-y-3">
                            {members.map(m => (
                                <div key={m.id} className="member-item flex items-center justify-between p-2 border-b border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs">
                                            {m.username.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">{m.username}</div>
                                            <div className="text-xs opacity-50">Se unió {new Date(m.joined_at).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${m.role === 'owner' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                        {m.role}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamSettings;
