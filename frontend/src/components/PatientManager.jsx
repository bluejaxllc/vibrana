import React, { useState, useEffect } from 'react';
import { Search, Trash2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

const PatientManager = ({ onSelectPatient, onViewProfile, selectedPatientId, teamId }) => {
    const [patients, setPatients] = useState([]);
    const [newPatient, setNewPatient] = useState({ name: '', age: '', gender: 'Male', phone_number: '', opt_in_whatsapp: false });
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (teamId) fetchPatients();
        else setPatients([]);
    }, [teamId]);

    const fetchPatients = async () => {
        try {
            const url = teamId ? `${API}/patients?team_id=${teamId}` : `${API}/patients`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            setPatients(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Failed to fetch patients", err);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newPatient.name.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`${API}/patients`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}`
                },
                body: JSON.stringify({ ...newPatient, team_id: teamId })
            });
            const created = await res.json();
            setPatients([created, ...patients]);
            setNewPatient({ name: '', age: '', gender: 'Male', phone_number: '', opt_in_whatsapp: false });
            if (onSelectPatient) onSelectPatient(created);
            toast.success(`Patient "${created.name}" added`);
        } catch (err) {
            console.error("Failed to create patient", err);
            toast.error('Failed to add patient');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e, patientId, patientName) => {
        e.stopPropagation();
        if (!confirm(`Delete patient "${patientName}"? This will also delete all their scans.`)) return;
        try {
            await fetch(`${API}/patients/${patientId}`, { method: 'DELETE' });
            setPatients(patients.filter(p => p.id !== patientId));
            toast.success(`Patient "${patientName}" deleted`);
        } catch {
            toast.error('Failed to delete patient');
        }
    };

    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="patient-manager">
            <h3>Patient Management</h3>

            {/* Search */}
            <div className="patient-search">
                <Search size={14} className="search-icon" />
                <input
                    type="text"
                    placeholder="Search patients..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Create Form */}
            <form onSubmit={handleCreate} className="patient-form" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <input
                    type="text"
                    placeholder="Name"
                    value={newPatient.name}
                    onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                    required
                    style={{ flex: 1 }}
                />
                <input
                    type="number"
                    placeholder="Age"
                    value={newPatient.age}
                    onChange={e => setNewPatient({ ...newPatient, age: e.target.value })}
                    required
                    style={{ width: '65px' }}
                />
                <select
                    value={newPatient.gender}
                    onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
                >
                    <option>Male</option>
                    <option>Female</option>
                </select>
                <input
                    type="text"
                    placeholder="Phone Number (e.g. +1...)"
                    value={newPatient.phone_number}
                    onChange={e => setNewPatient({ ...newPatient, phone_number: e.target.value })}
                    style={{ flex: 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#8892a4' }}>
                    <input
                        type="checkbox"
                        checked={newPatient.opt_in_whatsapp}
                        onChange={e => setNewPatient({ ...newPatient, opt_in_whatsapp: e.target.checked })}
                    />
                    WhatsApp
                </label>
                <button type="submit" disabled={loading} className="btn btn-sm btn-analyze">
                    {loading ? '...' : '+ Add'}
                </button>
            </form>

            {/* Patient List */}
            <div className="patient-list">
                <h4>Patients ({filteredPatients.length})</h4>
                {filteredPatients.length === 0 ? (
                    <p className="no-data">
                        {searchQuery ? 'No matching patients.' : 'No patients yet.'}
                    </p>
                ) : (
                    <ul>
                        {filteredPatients.map(p => (
                            <li
                                key={p.id}
                                onClick={() => onSelectPatient && onSelectPatient(p)}
                                className={p.id === selectedPatientId ? 'selected' : ''}
                            >
                                <div className="patient-info">
                                    <strong>{p.name}</strong>
                                    <small>{p.age}y, {p.gender} • {p.scan_count ?? 0} scans</small>
                                </div>
                                <div className="patient-actions">
                                    {onViewProfile && (
                                        <button
                                            className="btn btn-ghost"
                                            onClick={(e) => { e.stopPropagation(); onViewProfile(p.id); }}
                                            title="View Profile"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-danger-ghost"
                                        onClick={(e) => handleDelete(e, p.id, p.name)}
                                        title="Delete Patient"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default PatientManager;
