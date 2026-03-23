import React, { useState, useEffect, useRef } from 'react';
import { LogIn, UserPlus, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

const LoginPage = ({ onLogin }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [showLicenseInput, setShowLicenseInput] = useState(false);
    const [licenseKey, setLicenseKey] = useState('');
    const [licenseLoading, setLicenseLoading] = useState(false);
    const [form, setForm] = useState({
        username: '',
        password: '',
        email: '',
        full_name: ''
    });
    const [loading, setLoading] = useState(false);
    const canvasRef = useRef(null);
    const cardRef = useRef(null);

    // Particle background effect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animId;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Particles
        const particles = Array.from({ length: 60 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            r: Math.random() * 2 + 0.5,
            alpha: Math.random() * 0.5 + 0.1,
        }));

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(139, 92, 246, ${0.08 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            // Draw particles
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(139, 92, 246, ${p.alpha})`;
                ctx.fill();
            });

            animId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
        };
    }, []);

    // Card mouse glow effect
    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;

        const handleMove = (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--glow-x', `${x}px`);
            card.style.setProperty('--glow-y', `${y}px`);
        };

        card.addEventListener('mousemove', handleMove);
        return () => card.removeEventListener('mousemove', handleMove);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const endpoint = isRegistering ? '/auth/register' : '/auth/login';
        const body = isRegistering
            ? form
            : { username: form.username, password: form.password };

        try {
            const res = await fetch(`${API}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Autenticación fallida');
                return;
            }

            localStorage.setItem('vibrana_token', data.token);
            localStorage.setItem('vibrana_user', JSON.stringify(data.user));
            toast.success(`Bienvenido, ${data.user.full_name || data.user.username}!`);
            onLogin(data.user, data.token);
        } catch {
            toast.error('Error de conexión al servidor');
        } finally {
            setLoading(false);
        }
    };

    const updateField = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleActivateLicense = async () => {
        if (!licenseKey.trim()) return toast.error('Ingrese una clave de licencia');
        setLicenseLoading(true);
        try {
            const res = await fetch(`${API}/auth/activate-license`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: licenseKey.trim() })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`✅ Licencia activada: ${data.tier || 'Pro'}`);
                setShowLicenseInput(false);
            } else {
                toast.error(data.error || 'Clave de licencia inválida');
            }
        } catch {
            toast.error('Error al verificar licencia');
        } finally {
            setLicenseLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Particle canvas */}
            <canvas ref={canvasRef} className="login-particles" />

            {/* Floating orbs */}
            <div className="login-orb login-orb-1" />
            <div className="login-orb login-orb-2" />
            <div className="login-orb login-orb-3" />

            <div className="login-card" ref={cardRef}>
                {/* Glow border */}
                <div className="login-card-glow" />

                <div className="login-logo">
                    <div className="login-icon-wrap">
                        <Shield size={40} />
                        <div className="login-icon-ring" />
                    </div>
                    <h1>Vibrana Overseer</h1>
                    <p>Plataforma de Análisis de Biorresonancia NLS</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group login-field-anim" style={{ animationDelay: '0.1s' }}>
                        <label>Usuario</label>
                        <input
                            type="text"
                            value={form.username}
                            onChange={e => updateField('username', e.target.value)}
                            placeholder="Ingrese usuario"
                            required
                            autoFocus
                        />
                    </div>

                    {isRegistering && (
                        <>
                            <div className="form-group login-field-anim" style={{ animationDelay: '0.15s' }}>
                                <label>Correo Electrónico</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={e => updateField('email', e.target.value)}
                                    placeholder="correo@clinica.com"
                                    required
                                />
                            </div>
                            <div className="form-group login-field-anim" style={{ animationDelay: '0.2s' }}>
                                <label>Nombre Completo</label>
                                <input
                                    type="text"
                                    value={form.full_name}
                                    onChange={e => updateField('full_name', e.target.value)}
                                    placeholder="Dr. Nombre"
                                />
                            </div>
                        </>
                    )}

                    <div className="form-group login-field-anim" style={{ animationDelay: '0.2s' }}>
                        <label>Contraseña</label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={e => updateField('password', e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-login" disabled={loading}>
                        {loading ? (
                            <span className="login-spinner" />
                        ) : (
                            isRegistering
                                ? <><UserPlus size={16} /> Crear Cuenta</>
                                : <><LogIn size={16} /> Iniciar Sesión</>
                        )}
                    </button>
                </form>

                <div className="login-toggle">
                    <span>{isRegistering ? '¿Ya tienes una cuenta?' : '¿No tienes una cuenta?'}</span>
                    <button onClick={() => setIsRegistering(!isRegistering)}>
                        {isRegistering ? 'Iniciar Sesión' : 'Registrarse'}
                    </button>
                </div>

                {!isRegistering && (
                    <div className="login-forgot">
                        <button className="btn-link" onClick={() => toast('Contacte al administrador de su clínica para restablecer su contraseña.', { icon: '📧' })}>
                            ¿Olvidaste tu contraseña?
                        </button>
                    </div>
                )}

                <div className="login-license-section">
                    {showLicenseInput ? (
                        <div className="license-input-group">
                            <input
                                type="text"
                                value={licenseKey}
                                onChange={e => setLicenseKey(e.target.value)}
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                                className="license-input"
                            />
                            <button className="btn btn-sm btn-analyze" onClick={handleActivateLicense} disabled={licenseLoading}>
                                {licenseLoading ? '...' : 'Activar'}
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setShowLicenseInput(false)}>✕</button>
                        </div>
                    ) : (
                        <button className="btn-link" onClick={() => setShowLicenseInput(true)}>
                            🔑 Activar Clave de Licencia
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
