import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import '../App.css';

// ═══ TRANSLATIONS ═══
const i18n = {
    es: {
        nav: { features: 'Funciones', workflow: 'Cómo Funciona', entropy: 'Entropía', tech: 'Tecnología', install: 'Instalación', guide: 'Guía de Uso', launch: 'Instalar Local →' },
        hero: {
            badge: 'Plataforma de Análisis Biorresonancia NLS',
            title1: 'Visión más allá del',
            title2: 'Espectro',
            subtitle: 'Vibrana Overseer transforma tu dispositivo de biorresonancia NLS en una estación de trabajo inteligente — con captura OCR en tiempo real, detección automática de cambios y análisis de entropía impulsado por IA.',
            cta: 'Instalación Local',
            explore: 'Explorar Funciones ↓',
        },
        stats: [
            { value: 6, label: 'Niveles Entropía', suffix: '' },
            { value: 30, label: 'FPS Transmisión', suffix: '' },
            { value: 3, label: 'Seg Detección', prefix: '<', suffix: 's' },
            { value: 100, label: 'Biblioteca Órganos', suffix: '+' },
        ],
        preview: {
            title: 'Vibrana Overseer — Sesión en Vivo',
            items: ['📊 Panel', '🔬 En Vivo', '🔍 Auto Watcher', '📋 Pacientes', '📈 Analíticas'],
            cards: ['Escaneos Hoy', 'Cambios', 'Lecturas OCR'],
            feedLabel: 'Feed NLS — Activo',
        },
        featuresSection: {
            tag: 'Capacidades',
            title1: 'Todo lo que necesitas para',
            title2: 'Análisis NLS',
            desc: 'Un conjunto completo de herramientas para profesionales de biorresonancia — desde monitoreo en tiempo real hasta análisis automatizado y reportes de pacientes.',
        },
        features: [
            { icon: '🔬', title: 'Monitoreo NLS en Vivo', desc: 'Captura de pantalla en tiempo real and transmisión de video desde tu dispositivo de biorresonancia NLS en HD a 30fps.', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' },
            { icon: '🧠', title: 'Detección Auto de Cambios', desc: 'Vigilante inteligente que usa diferenciación de cuadros para auto-detectar cambios de órgano y disparar análisis al instante.', gradient: 'linear-gradient(135deg, #50fa7b, #2dd4bf)' },
            { icon: '📝', title: 'OCR Inteligente NLS', desc: 'Extracción de texto inteligente que lee códigos de órganos, nombres de secciones, valores de entropía y porcentajes de reserva compensatoria.', gradient: 'linear-gradient(135deg, #8be9fd, #3b82f6)' },
            { icon: '🎯', title: 'Análisis de Puntos Nidales', desc: 'Visión por computadora detecta marcadores de entropía coloreados (niveles 1-6) y los mapea con coordenadas precisas.', gradient: 'linear-gradient(135deg, #f1fa8c, #f59e0b)' },
            { icon: '📊', title: 'Panel de Analíticas', desc: 'Analíticas completas de pacientes con tendencias de entropía, historial de escaneos, análisis comparativo y reportes exportables.', gradient: 'linear-gradient(135deg, #ff79c6, #ec4899)' },
            { icon: '🤖', title: 'Motor de Automatización', desc: 'Graba y reproduce macros, ejecuta secuencias automatizadas de escaneo por órgano y programa análisis por lotes.', gradient: 'linear-gradient(135deg, #ff5555, #ef4444)' },
        ],
        workflowSection: {
            tag: 'Flujo de Trabajo',
            title1: 'De la Pantalla al',
            title2: 'Diagnóstico',
            desc: 'Cuatro simples pasos para transformar datos NLS en inteligencia diagnóstica accionable.',
        },
        workflow: [
            { step: '01', title: 'Conectar', desc: 'Vincula Vibrana a la pantalla de tu dispositivo NLS. Auto-calibra con un clic.' },
            { step: '02', title: 'Escanear', desc: 'Navega entre órganos en tu software NLS. Vibrana vigila y captura datos automáticamente.' },
            { step: '03', title: 'Analizar', desc: 'OCR impulsado por IA lee lecturas, detecta puntos de entropía e identifica patologías.' },
            { step: '04', title: 'Reportar', desc: 'Genera reportes PDF, exporta datos CSV y rastrea el progreso del paciente.' },
        ],
        entropySection: {
            tag: 'Ciencia',
            title1: 'Los 6 Niveles de',
            title2: 'Entropía',
            desc: 'Cada punto nidal sobre un órgano tiene un color que representa su nivel de entropía — desde tejido sano hasta patología activa.',
            diagnosis: 'Diagnóstico Automático',
            diagnosisItems: [
                'Detecta automáticamente el color del marcador nidal',
                'Analiza las coordenadas en el mapa del órgano',
                'IA sugiere patologías basadas en niveles 5 y 6',
                'Generate resumen de reserva compensatoria'
            ]
        },
        entropyLevels: [
            { level: 1, name: 'Normal', status: 'Óptimo', color: '#fff', desc: 'Función celular perfecta. Sin entropía detectada.' },
            { level: 2, name: 'Estándar', status: 'Saludable', color: '#f1fa8c', desc: 'Actividad metabólica normal. Equilibrio homeostático.' },
            { level: 3, name: 'Reactivo', status: 'Funcional', color: '#ffb86c', desc: 'Respuesta adaptativa inicial. Estrés celular leve.' },
            { level: 4, name: 'Sobrecarga', status: 'Crónico', color: '#ff5555', desc: 'Entropía significativa. Posible degeneración tisular.' },
            { level: 5, name: 'Crítico', status: 'Patológico', color: '#8b5cf6', desc: 'Alta desorganización. Estructura bajo falla severa.' },
            { level: 6, name: 'Falla', status: 'Severo', color: '#000', desc: 'Entropía máxima. Ruptura de sistemas biológicos.' },
        ],
        techSection: { tag: 'Stack', title1: 'Potenciado por', title2: 'Inteligencia de Vanguardia' },
        tech: [
            { icon: '⚛', title: 'React 19', desc: 'Interfaz ultra-rápida con componentes concurrentes.' },
            { icon: '🔥', title: 'Python Flask', desc: 'Backend robusto para procesamiento pesado de señales.' },
            { icon: '👁', title: 'OpenCV', desc: 'Visión por computadora para monitoreo en tiempo real.' },
            { icon: '🧠', title: 'Gemini 3.1', desc: 'IA avanzada para interpretación diagnóstica profunda.' },
        ],
        installSection: {
            tag: 'Instalación',
            title1: 'Configuración en',
            title2: 'Localhost',
            desc: 'Para usar el Monitor en Vivo y la Captura de Pantalla NLS, Vibrana debe ejecutarse localmente para acceder a tus periféricos de video y hardware.',
            prereqTitle: 'Prerrequisitos',
            prereqs: ['Node.js 20+', 'Python 3.10+', 'Git', 'Cámara/Tarjeta Capturadora NLS'],
            steps: [
                { num: '1', title: 'Clonar Repositorio', cmd: 'git clone https://github.com/BlueJaxLLC/Vibrana.git\ncd Vibrana' },
                { num: '2', title: 'Configurar Backend', explanation: 'Instala dependencias y configura tu Gemini API Key en el archivo .env', cmd: 'cd backend\npip install -r requirements.txt\ncp .env.example .env' },
                { num: '3', title: 'Configurar Frontend', explanation: 'Instala módulos de React y prepara el entorno de desarrollo', cmd: 'cd ../frontend\nnpm install' },
                { num: '4', title: 'Iniciar Servidores', explanation: 'Ejecuta ambos comandos en terminales separadas', cmd: '# Terminal 1 (Backend)\npython app.py\n\n# Terminal 2 (Frontend)\nnpm run dev' },
                { num: '5', title: 'Calibración NLS', explanation: 'Abre http://localhost:5173, inicia sesión (admin/admin123) y ve a Live Monitor.', cmd: 'Selecciona tu entrada de video NLS y calibra la región de interés.' },
            ],
            note: '⚠ El "Live Monitor" y "Screen Capture" NO funcionarán en esta versión web de demostración por razones de seguridad del navegador.',
            cloudNote: 'Esta página web sirve como hub central, biblioteca de diagnósticos y portal de analíticas, pero el "Cerebro de Captura" debe vivir en tu PC.',
        },
        guideSection: {
            tag: 'Aprender',
            title1: 'Guía de inicio',
            title2: 'Rápido',
            desc: 'Domina Vibrana Overseer en minutos con estos flujos de trabajo profesionales.'
        },
        guideItems: [
            { icon: '📊', title: 'Primer Escaneo', steps: ['Inicia Servidor Local', 'Conecta NLS vía USB', 'Abre Live Monitor', 'Calibra Ventana NLS'], gradient: 'linear-gradient(135deg, #8b5cf6, #3b82f6)' },
            { icon: '🤖', title: 'Uso de Macros', steps: ['Graba Secuencia NLS', 'Auto-Captura Órganos', 'Espera Análisis de Entropía', 'Revisa Hallazgos de IA'], gradient: 'linear-gradient(135deg, #50fa7b, #3dd668)' },
        ],
        cta: { title1: '¿Listo para ver', title2: 'lo invisible?', desc: 'Potencia tu consulta NLS hoy mismo. Descarga e instala Vibrana Overseer en tu estación de trabajo.', btn: 'Ver Guía de Instalación' },
        footer: { tagline: 'Plataforma NLS Overseer', copy: `© ${new Date().getFullYear()} Vibrana. Construido para profesionales de biorresonancia.` },
    },
    en: {
        nav: { features: 'Features', workflow: 'Workflow', entropy: 'Entropy', tech: 'Tech Stack', install: 'Setup', guide: 'User Guide', launch: 'Install Local →' },
        hero: {
            badge: 'NLS Bioresonance Analysis Platform',
            title1: 'Vision Beyond the',
            title2: 'Spectrum',
            subtitle: 'Vibrana Overseer transforms your NLS bioresonance device into an intelligent workstation — featuring real-time OCR, automatic change detection, and AI-powered entropy analysis.',
            cta: 'Local Setup',
            explore: 'Explore Features ↓',
        },
        stats: [
            { value: 6, label: 'Entropy Levels', suffix: '' },
            { value: 30, label: 'Stream FPS', suffix: '' },
            { value: 3, label: 'Detection Sec', prefix: '<', suffix: 's' },
            { value: 100, label: 'Organ Library', suffix: '+' },
        ],
        preview: {
            title: 'Vibrana Overseer — Live Session',
            items: ['📊 Dashboard', '🔬 Live View', '🔍 Auto Watcher', '📋 Patients', '📈 Analytics'],
            cards: ['Scans Today', 'Changes', 'OCR Readings'],
            feedLabel: 'NLS Feed — Active',
        },
        featuresSection: {
            tag: 'Capabilities',
            title1: 'Everything you need for',
            title2: 'NLS Analysis',
            desc: 'A complete set of tools for bioresonance practitioners — from real-time monitoring to automated analysis and patient reporting.',
        },
        features: [
            { icon: '🔬', title: 'Live NLS Monitoring', desc: 'Real-time screen capture and video streaming from your NLS bioresonance software in HD @ 30fps.', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' },
            { icon: '🧠', title: 'Auto Change Detection', desc: 'Intelligent watcher using frame differentiation to auto-detect organ changes and trigger instant analysis.', gradient: 'linear-gradient(135deg, #50fa7b, #2dd4bf)' },
            { icon: '📝', title: 'Smart NLS OCR', desc: 'Intelligent text extraction that reads organ codes, section names, entropy values, and reserve percentages.', gradient: 'linear-gradient(135deg, #8be9fd, #3b82f6)' },
            { icon: '🎯', title: 'Nidal Point Analysis', desc: 'Computer vision detects colored entropy markers (levels 1-6) and maps them with precise coordinates.', gradient: 'linear-gradient(135deg, #f1fa8c, #f59e0b)' },
            { icon: '📊', title: 'Analytics Dashboard', desc: 'Comprehensive patient analytics with entropy trends, scan history, comparative analysis, and exportable reports.', gradient: 'linear-gradient(135deg, #ff79c6, #ec4899)' },
            { icon: '🤖', title: 'Automation Engine', desc: 'Record and playback macros, run automated scan sequences by organ, and schedule batch analysis.', gradient: 'linear-gradient(135deg, #ff5555, #ef4444)' },
        ],
        workflowSection: {
            tag: 'Workflow',
            title1: 'From Screen to',
            title2: 'Diagnosis',
            desc: 'Four simple steps to transform NLS data into actionable diagnostic intelligence.',
        },
        workflow: [
            { step: '01', title: 'Connect', desc: 'Link Vibrana to your NLS device screen. Auto-calibrate with one click.' },
            { step: '02', title: 'Scan', desc: 'Navigate between organs in your NLS software. Vibrana watches and captures data automatically.' },
            { step: '03', title: 'Analyze', desc: 'AI-powered OCR reads findings, detects entropy points, and identifies pathologies.' },
            { step: '04', title: 'Report', desc: 'Generate PDF reports, export CSV data, and track patient progress over time.' },
        ],
        entropySection: {
            tag: 'Science',
            title1: 'The 6 Levels of',
            title2: 'Entropy',
            desc: 'Every nidal point over an organ has a color representing its entropy level — from healthy tissue to active pathology.',
            diagnosis: 'Automatic Diagnosis',
            diagnosisItems: [
                'Auto-detects nidal marker color',
                'Analyses coordinates on organ map',
                'AI suggests pathologies based on levels 5 and 6',
                'Generates compensatory reserve summary'
            ]
        },
        entropyLevels: [
            { level: 1, name: 'Normal', status: 'Optimal', color: '#fff', desc: 'Perfect cellular function. No entropy detected.' },
            { level: 2, name: 'Standard', status: 'Healthy', color: '#f1fa8c', desc: 'Normal metabolic activity. Homeostatic balance.' },
            { level: 3, name: 'Reactive', status: 'Functional', color: '#ffb86c', desc: 'Initial adaptive response. Mild cellular stress.' },
            { level: 4, name: 'Overload', status: 'Chronic', color: '#ff5555', desc: 'Significant entropy. Possible tissue degeneration.' },
            { level: 5, name: 'Critical', status: 'Pathological', color: '#8b5cf6', desc: 'High disorganization. Structure under severe failure.' },
            { level: 6, name: 'Failure', status: 'Severe', color: '#000', desc: 'Maximum entropy. Biological systems breakdown.' },
        ],
        techSection: { tag: 'Stack', title1: 'Powered by', title2: 'Cutting Edge Intelligence' },
        tech: [
            { icon: '⚛', title: 'React 19', desc: 'Ultra-fast interface with concurrent components.' },
            { icon: '🔥', title: 'Python Flask', desc: 'Robust backend for heavy signal processing.' },
            { icon: '👁', title: 'OpenCV', desc: 'Computer vision for real-time monitoring.' },
            { icon: '🧠', title: 'Gemini 3.1', desc: 'Advanced AI for deep diagnostic interpretation.' },
        ],
        installSection: {
            tag: 'Installation',
            title1: 'Localhost',
            title2: 'Setup Guide',
            desc: 'To use Live Monitoring and NLS Screen Capture, Vibrana must run locally to access your video peripherals and hardware.',
            prereqTitle: 'Prerequisites',
            prereqs: ['Node.js 20+', 'Python 3.10+', 'Git', 'NLS Camera/Capture Card'],
            steps: [
                { num: '1', title: 'Clone Repository', cmd: 'git clone https://github.com/BlueJaxLLC/Vibrana.git\ncd Vibrana' },
                { num: '2', title: 'Configure Backend', explanation: 'Install dependencies and set your Gemini API Key in the .env file', cmd: 'cd backend\npip install -r requirements.txt\ncp .env.example .env' },
                { num: '3', title: 'Configure Frontend', explanation: 'Install React modules and prepare development environment', cmd: 'cd ../frontend\nnpm install' },
                { num: '4', title: 'Start Servers', explanation: 'Run both commands in separate terminal windows', cmd: '# Terminal 1 (Backend)\npython app.py\n\n# Terminal 2 (Frontend)\nnpm run dev' },
                { num: '5', title: 'NLS Calibration', explanation: 'Open http://localhost:5173, login (admin/admin123) and go to Live Monitor.', cmd: 'Select your NLS video input and calibrate the region of interest.' },
            ],
            note: '⚠ "Live Monitor" and "Screen Capture" will NOT work on this demonstration web version for browser security reasons.',
            cloudNote: 'This web page serves as a central hub for analytics and reports, but the "Capture Brain" must live on your local machine.',
        },
        guideSection: {
            tag: 'Learning',
            title1: 'Quick Start',
            title2: 'Guide',
            desc: 'Master Vibrana Overseer in minutes with these professional workflows.'
        },
        guideItems: [
            { icon: '📊', title: 'Your First Scan', steps: ['Launch Local Server', 'Connect NLS via USB', 'Open Live Monitor', 'Calibrate NLS Window'], gradient: 'linear-gradient(135deg, #8b5cf6, #3b82f6)' },
            { icon: '🤖', title: 'Using Macros', steps: ['Record NLS Sequence', 'Auto-Capture Organs', 'Wait for Entropy Analysis', 'Review AI Findings'], gradient: 'linear-gradient(135deg, #50fa7b, #3dd668)' },
        ],
        cta: { title1: 'Ready to see', title2: 'the invisible?', desc: 'Power up your NLS consultation today. Download and install Vibrana Overseer on your workstation.', btn: 'View Installation Guide' },
        footer: { tagline: 'NLS Overseer Platform', copy: `© ${new Date().getFullYear()} Vibrana. Built for bioresonance professionals.` },
    },
};

// ═══ ANIMATED COUNTER HOOK ═══
const useCountUp = (end, duration = 2000, trigger = false) => {
    const [count, setCount] = useState(0);
    const counting = useRef(false);
    useEffect(() => {
        if (!trigger || counting.current) return;
        counting.current = true;
        const start = 0;
        const startTime = performance.now();
        const step = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            setCount(Math.round(start + (end - start) * ease));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [trigger, end, duration]);
    return count;
};

// ═══ FLOATING PARTICLES (Memoized) ═══
const Particles = memo(() => {
    const [particles] = useState(() =>
        [...Array(40)].map((_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 2 + Math.random() * 4,
            dur: 15 + Math.random() * 25,
            delay: Math.random() * 10,
            opacity: 0.1 + Math.random() * 0.3,
        }))
    );

    return (
        <div className="particles-container" aria-hidden="true">
            {particles.map(p => (
                <div key={p.id} className="particle" style={{
                    left: `${p.x}%`, top: `${p.y}%`,
                    width: p.size, height: p.size,
                    animationDuration: `${p.dur}s`,
                    animationDelay: `${p.delay}s`,
                    opacity: p.opacity,
                }} />
            ))}
        </div>
    );
});

// ═══ SUB-COMPONENTS ═══

const StatItem = memo(({ stat, i, statsVisible }) => {
    const count = useCountUp(stat.value, 1800, statsVisible);
    return (
        <div className={`hero-stat ${statsVisible ? 'pop-in' : ''}`} style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
            <span className="stat-value">{stat.prefix || ''}{count}<small>{stat.suffix}</small></span>
            <span className="stat-label">{stat.label}</span>
        </div>
    );
});

const LandingNav = memo(({ t, lang, setLang, theme, toggleTheme, onInstall }) => {
    const [scrolled, setScrolled] = useState(false);
    
    useEffect(() => {
        const handleScroll = () => {
            const isScrolled = window.scrollY > 50;
            if (isScrolled !== scrolled) setScrolled(isScrolled);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [scrolled]);

    return (
        <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
            <div className="landing-nav-inner">
                <div className="landing-logo">
                    <span className="logo-icon">◇</span>
                    <span className="logo-text">Vibrana</span>
                </div>
                <div className="landing-nav-links">
                    <a href="#features">{t.nav.features}</a>
                    <a href="#workflow">{t.nav.workflow}</a>
                    <a href="#entropy">{t.nav.entropy}</a>
                    <a href="#installation">{t.nav.install}</a>
                    <button className="btn-lang-toggle" onClick={() => setLang(l => l === 'es' ? 'en' : 'es')}>
                        {lang === 'es' ? 'EN' : 'ES'}
                    </button>
                    <button className="btn-lang-toggle" onClick={toggleTheme}>
                        {theme === 'dark' ? '☀' : '☾'}
                    </button>
                    <button className="btn-landing-primary" onClick={onInstall}>{t.nav.launch}</button>
                </div>
            </div>
        </nav>
    );
});

const HeroSection = memo(({ t, heroRef, heroVisible, statsVisible, onInstall, waveHeights }) => (
    <section className="landing-hero" ref={heroRef}>
        <div className="hero-bg-effects">
            <div className="hero-orb hero-orb-1" />
            <div className="hero-orb hero-orb-2" />
            <div className="hero-orb hero-orb-3" />
            <div className="hero-orb hero-orb-4" />
            <div className="hero-grid-bg" />
            <div className="hero-gradient-mesh" />
        </div>

        <div id="hero-trigger" className="reveal-trigger" />

        <div className={`hero-content ${heroVisible ? 'animate-in' : ''}`}>
            <div className="hero-badge">
                <span className="badge-dot" /><span className="badge-pulse" />{t.hero.badge}
            </div>
            <h1 className="hero-title">
                <span className="hero-title-line">{t.hero.title1}</span>
                <span className="hero-title-accent">{t.hero.title2}</span>
            </h1>
            <p className="hero-subtitle">{t.hero.subtitle}</p>
            <div className="hero-actions">
                <button className="btn-landing-hero" onClick={onInstall}>
                    <span className="btn-text">{t.hero.cta}</span>
                    <span className="btn-icon-wrap">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </span>
                    <span className="btn-shine" />
                </button>
                <a href="#features" className="btn-landing-ghost">{t.hero.explore}</a>
            </div>

            <div id="stats-trigger" className="reveal-trigger" />
            <div className="hero-stats">
                {t.stats.map((stat, i) => <StatItem key={i} stat={stat} i={i} statsVisible={statsVisible} />)}
            </div>
        </div>

        <div className="hero-preview">
            <div className="preview-window">
                <div className="preview-glow" />
                <div className="preview-titlebar">
                    <div className="preview-dots"><span className="dot red" /><span className="dot yellow" /><span className="dot green" /></div>
                    <span className="preview-title">{t.preview.title}</span>
                </div>
                <div className="preview-content">
                    <div className="preview-sidebar">
                        {t.preview.items.map((item, i) => <div key={i} className={`preview-sidebar-item ${i === 0 ? 'active' : ''}`}>{item}</div>)}
                    </div>
                    <div className="preview-main">
                        <div className="preview-row">
                            {['gradient-purple', 'gradient-green', 'gradient-blue'].map((cls, i) => (
                                <div key={i} className={`preview-card-mini ${cls}`}>
                                    <span className="mini-label">{t.preview.cards[i]}</span>
                                    <span className="mini-value">{[24, 12, 48][i]}</span>
                                </div>
                            ))}
                        </div>
                        <div className="preview-feed-bar"><div className="preview-live-dot" /><span>{t.preview.feedLabel}</span></div>
                        <div className="preview-wave">
                            {[...Array(30)].map((_, i) => (
                                <div key={i} className="wave-bar" style={{ height: `${waveHeights[i]}px`, animationDelay: `${i * 0.05}s` }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="scroll-indicator"><div className="scroll-mouse"><div className="scroll-wheel" /></div></div>
    </section>
));

const FeaturesSection = memo(({ t, isVisible, onCardMouse, onCardLeave }) => (
    <section id="features" className={`landing-section reveal-section ${isVisible('features') ? 'visible' : ''}`}>
        <div className="section-inner">
            <div className="section-header">
                <span className="section-tag">{t.featuresSection.tag}</span>
                <h2>{t.featuresSection.title1}<br /><span className="text-accent">{t.featuresSection.title2}</span></h2>
                <p className="section-desc">{t.featuresSection.desc}</p>
            </div>
            <div className="features-grid">
                {t.features.map((feat, i) => (
                    <div key={i} className="feature-card" style={{ animationDelay: `${i * 0.08}s` }} onMouseMove={onCardMouse} onMouseLeave={onCardLeave}>
                        <div className="feature-icon" style={{ background: feat.gradient }}>{feat.icon}</div>
                        <h3>{feat.title}</h3>
                        <p>{feat.desc}</p>
                        <div className="feature-shine" /><div className="feature-border-glow" />
                    </div>
                ))}
            </div>
        </div>
    </section>
));

const WorkflowSection = memo(({ t, isVisible }) => (
    <section id="workflow" className={`landing-section reveal-section ${isVisible('workflow') ? 'visible' : ''}`}>
        <div className="section-inner">
            <div className="section-header">
                <span className="section-tag">{t.workflowSection.tag}</span>
                <h2>{t.workflowSection.title1} <span className="text-accent">{t.workflowSection.title2}</span></h2>
                <p className="section-desc">{t.workflowSection.desc}</p>
            </div>
            <div className="workflow-steps">
                {t.workflow.map((step, i) => (
                    <div key={i} className="workflow-step" style={{ animationDelay: `${i * 0.15}s` }}>
                        <div className="step-number"><span>{step.step}</span><div className="step-ring" /></div>
                        <div className="step-content"><h3>{step.title}</h3><p>{step.desc}</p></div>
                        {i < t.workflow.length - 1 && <div className="step-connector"><div className="connector-fill" /></div>}
                    </div>
                ))}
            </div>
        </div>
    </section>
));

const EntropySection = memo(({ t, isVisible }) => (
    <section id="entropy" className={`landing-section reveal-section ${isVisible('entropy') ? 'visible' : ''}`}>
        <div className="section-inner">
            <div className="section-header">
                <span className="section-tag">{t.entropySection.tag}</span>
                <h2>{t.entropySection.title1} <span className="text-accent">{t.entropySection.title2}</span></h2>
                <p className="section-desc">{t.entropySection.desc}</p>
            </div>
            <div className="entropy-levels-grid">
                {t.entropyLevels.map((lvl, i) => (
                    <div key={i} className={`entropy-level-card level-${lvl.level}`} style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="entropy-level-header">
                            <div className="entropy-color-dot" style={{ background: lvl.color, boxShadow: `0 0 16px ${lvl.color}88, 0 0 40px ${lvl.color}33` }} />
                            <span className="entropy-level-num">{lvl.level}</span>
                            <span className="entropy-level-status">{lvl.status}</span>
                        </div>
                        <h4 className="entropy-level-name">{lvl.name}</h4>
                        <p className="entropy-level-desc">{lvl.desc}</p>
                        <div className="entropy-bar" style={{ background: `linear-gradient(90deg, ${lvl.color}44, ${lvl.color})`, width: `${(lvl.level / 6) * 100}%` }} />
                    </div>
                ))}
            </div>
            <div className="entropy-diagnosis-box">
                <h4>🩺 {t.entropySection.diagnosis}</h4>
                <div className="diagnosis-rules">
                    {t.entropySection.diagnosisItems.map((item, i) => (
                        <div key={i} className="diagnosis-rule" style={{ animationDelay: `${i * 0.1}s` }}><span className="rule-arrow">→</span><span>{item}</span></div>
                    ))}
                </div>
            </div>
        </div>
    </section>
));

const InstallSection = memo(({ t, isVisible }) => (
    <section id="installation" className={`landing-section reveal-section ${isVisible('installation') ? 'visible' : ''}`}>
        <div className="section-inner">
            <div className="section-header">
                <span className="section-tag">{t.installSection.tag}</span>
                <h2>{t.installSection.title1} <span className="text-accent">{t.installSection.title2}</span></h2>
                <p className="section-desc">{t.installSection.desc}</p>
            </div>

            <div className="install-prereqs">
                <h4 className="install-prereqs-title">⚙️ {t.installSection.prereqTitle}</h4>
                <div className="install-prereqs-grid">
                    {t.installSection.prereqs.map((p, i) => <div key={i} className="install-prereq-item"><span className="prereq-check">✓</span>{p}</div>)}
                </div>
            </div>

            <div className="install-steps">
                {t.installSection.steps.map((step, i) => (
                    <div key={i} className="install-step" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="install-step-header"><span className="install-step-num">{step.num}</span><h5 className="install-step-title">{step.title}</h5></div>
                        {step.explanation && <p className="install-step-explanation">{step.explanation}</p>}
                        <pre className="install-code-block"><code>{step.cmd}</code></pre>
                    </div>
                ))}
            </div>

            <div className="install-notes">
                <p className="install-note">{t.installSection.note}</p>
                <p className="install-note install-note-cloud">{t.installSection.cloudNote}</p>
            </div>
        </div>
    </section>
));

const TechSection = memo(({ t, isVisible }) => (
    <section id="technology" className={`landing-section reveal-section ${isVisible('technology') ? 'visible' : ''}`}>
        <div className="section-inner">
            <div className="section-header">
                <span className="section-tag">{t.techSection.tag}</span>
                <h2>{t.techSection.title1} <span className="text-accent">{t.techSection.title2}</span></h2>
            </div>
            <div className="tech-grid">
                {t.tech.map((item, i) => (
                    <div key={i} className="tech-card" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="tech-icon">{item.icon}</div><h4>{item.title}</h4><p>{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    </section>
));

const GuideSection = memo(({ t, isVisible }) => (
    <section id="guide" className={`landing-section reveal-section ${isVisible('guide') ? 'visible' : ''}`}>
        <div className="section-inner">
            <div className="section-header">
                <span className="section-tag">{t.guideSection.tag}</span>
                <h2>{t.guideSection.title1} <span className="text-accent">{t.guideSection.title2}</span></h2>
                <p className="section-desc">{t.guideSection.desc}</p>
            </div>
            <div className="guide-cards">
                {t.guideItems.map((item, i) => (
                    <div key={i} className="guide-card" style={{ animationDelay: `${i * 0.08}s` }}>
                        <div className="guide-card-header"><div className="feature-icon" style={{ background: item.gradient }}>{item.icon}</div><h3>{item.title}</h3></div>
                        <ol className="guide-steps">{item.steps.map((step, j) => <li key={j}>{step}</li>)}</ol>
                    </div>
                ))}
            </div>
        </div>
    </section>
));

const CTASection = memo(({ t, isVisible, onInstall }) => (
    <section className={`landing-cta reveal-section ${isVisible('cta') ? 'visible' : ''}`} id="cta">
        <div className="cta-inner">
            <div className="cta-glow" /><div className="cta-rings"><div className="cta-ring ring-1" /><div className="cta-ring ring-2" /><div className="cta-ring ring-3" /></div>
            <h2>{t.cta.title1}<br />{t.cta.title2}</h2>
            <p>{t.cta.desc}</p>
            <button className="btn-landing-hero" onClick={onInstall}>
                <span className="btn-text">{t.cta.btn}</span>
                <span className="btn-icon-wrap"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg></span>
                <span className="btn-shine" />
            </button>
        </div>
    </section>
));

const LandingFooter = memo(({ t }) => (
    <footer className="landing-footer">
        <div className="footer-inner">
            <div className="footer-brand"><span className="logo-icon">◇</span><span className="logo-text">Vibrana</span><span className="footer-tagline">{t.footer.tagline}</span></div>
            <div className="footer-copy">{t.footer.copy}</div>
        </div>
    </footer>
));

// ═══ MAIN COMPONENT ═══
const LandingPage = ({ onGetStarted }) => {
    const [visibleSections, setVisibleSections] = useState(new Set());
    const [lang, setLang] = useState(() => localStorage.getItem('vibrana_lang') || 'es');
    const [theme, setTheme] = useState(() => localStorage.getItem('vibrana_theme') || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
    const heroRef = useRef(null);

    const toggleTheme = useCallback(() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('vibrana_theme', next);
    }, [theme]);

    const handleInstallRedirect = useCallback((e) => {
        if (e) e.preventDefault();
        const section = document.getElementById('installation');
        if (section) section.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const t = i18n[lang];
    const heroVisible = visibleSections.has('hero-trigger');
    const statsVisible = visibleSections.has('stats-trigger');

    useEffect(() => { localStorage.setItem('vibrana_lang', lang); }, [lang]);

    // High-performance Animation Bridge (Bypasses React for mouse/scroll vars)
    useEffect(() => {
        let rafId;
        const state = { sx: 0, mx: 0.5, my: 0.5 };
        const root = document.documentElement;

        const updateVars = () => {
            root.style.setProperty('--v-scroll-y', state.sx);
            root.style.setProperty('--v-mouse-x', state.mx);
            root.style.setProperty('--v-mouse-y', state.my);
            rafId = requestAnimationFrame(updateVars);
        };

        const onScroll = () => { state.sx = window.scrollY; };
        const onMouse = (e) => {
            state.mx = e.clientX / window.innerWidth;
            state.my = e.clientY / window.innerHeight;
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('mousemove', onMouse, { passive: true });
        rafId = requestAnimationFrame(updateVars);

        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('mousemove', onMouse);
            cancelAnimationFrame(rafId);
        };
    }, []);

    // Intersection observer for scroll-reveal
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => entries.forEach(e => {
                if (e.isIntersecting) setVisibleSections(prev => new Set([...prev, e.target.id]));
            }),
            { threshold: 0.12 }
        );
        document.querySelectorAll('.reveal-section, .reveal-trigger').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const isVisible = useCallback(id => visibleSections.has(id), [visibleSections]);

    const handleCardMouse = useCallback((e) => {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
        const y = ((e.clientY - rect.top) / rect.height - 0.1) * -12;
        card.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${y}deg) translateY(-6px)`;
    }, []);

    const handleCardLeave = useCallback((e) => { e.currentTarget.style.transform = ''; }, []);

    const [waveHeights] = useState(() => [...Array(30)].map((_, i) => 20 + Math.sin(i * 0.5) * 15 + Math.random() * 10));

    return (
        <div className="landing-page">
            <Particles />
            <div className="mouse-spotlight" />

            <LandingNav t={t} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} onInstall={handleInstallRedirect} />
            
            <HeroSection t={t} heroRef={heroRef} heroVisible={heroVisible} statsVisible={statsVisible} onInstall={handleInstallRedirect} waveHeights={waveHeights} />
            
            <FeaturesSection t={t} isVisible={isVisible} onCardMouse={handleCardMouse} onCardLeave={handleCardLeave} />
            <WorkflowSection t={t} isVisible={isVisible} />
            <EntropySection t={t} isVisible={isVisible} />
            <InstallSection t={t} isVisible={isVisible} />
            <TechSection t={t} isVisible={isVisible} />
            <GuideSection t={t} isVisible={isVisible} />
            <CTASection t={t} isVisible={isVisible} onInstall={handleInstallRedirect} />
            
            <LandingFooter t={t} />
        </div>
    );
};

export default LandingPage;
