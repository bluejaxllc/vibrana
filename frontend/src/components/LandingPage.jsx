import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../App.css';

// ═══ TRANSLATIONS ═══
const i18n = {
    es: {
        nav: { features: 'Funciones', workflow: 'Cómo Funciona', entropy: 'Entropía', tech: 'Tecnología', install: 'Instalación', guide: 'Guía de Uso', launch: 'Iniciar App →' },
        hero: {
            badge: 'Plataforma de Análisis Biorresonancia NLS',
            title1: 'Visión más allá del',
            title2: 'Espectro',
            subtitle: 'Vibrana Overseer transforma tu dispositivo de biorresonancia NLS en una estación de trabajo inteligente — con captura OCR en tiempo real, detección automática de cambios y análisis de entropía impulsado por IA.',
            cta: 'Comenzar',
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
            { icon: '🔬', title: 'Monitoreo NLS en Vivo', desc: 'Captura de pantalla en tiempo real y transmisión de video desde tu dispositivo de biorresonancia NLS en HD a 30fps.', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' },
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
                'Cualquier punto Nivel 6 → Patología Detectada',
                'Más de 5 puntos Nivel 5 → Desorden Funcional',
                'Más de 10 puntos Nivel 4 → Estado Compensado',
                'Sin alertas → Estado Normal',
            ],
        },
        entropyLevels: [
            { level: 1, color: '#facc15', name: 'Normal', desc: 'Tejido saludable con resonancia óptima', status: '✅' },
            { level: 2, color: '#eab308', name: 'Normal', desc: 'Variación fisiológica menor, sin riesgo', status: '✅' },
            { level: 3, color: '#f97316', name: 'Estrés Leve', desc: 'Inicio de desbalance funcional', status: '⚠️' },
            { level: 4, color: '#ef4444', name: 'Compensado', desc: 'El cuerpo compensa un problema activo', status: '🟠' },
            { level: 5, color: '#8b5cf6', name: 'Desorden Funcional', desc: 'Compromiso notable de resonancia del tejido', status: '🔴' },
            { level: 6, color: '#1e1e1e', name: 'Patología', desc: 'Degeneración activa del tejido', status: '⛔' },
        ],
        techSection: { tag: 'Bajo el Capó', title1: 'Construido con', title2: 'Precisión' },
        tech: [
            { icon: '🐍', title: 'Python + Flask', desc: 'Backend robusto con API RESTful, SQLAlchemy ORM y autenticación JWT' },
            { icon: '👁️', title: 'OpenCV', desc: 'Visión por computadora para detección de puntos nidales, mapas de calor y análisis de cuadros' },
            { icon: '📖', title: 'Tesseract OCR', desc: 'Extracción de texto NLS con preprocesamiento CLAHE e inversión de fondo oscuro' },
            { icon: '⚛️', title: 'React + Vite', desc: 'Frontend ultrarrápido con actualizaciones en tiempo real, diseño glassmórfico y animaciones fluidas' },
        ],
        installSection: {
            tag: 'Instalación',
            title1: 'Configura tu Propia',
            title2: 'Instancia',
            desc: '¿Por qué instalar localmente? El Monitoreo en Vivo ocular necesita capturar la pantalla de tu dispositivo NLS. Si solo deseas subir y analizar reportes PDF, ¡puedes usar la versión web sin instalar nada!',
            prereqTitle: 'Requisitos Previos Básicos',
            prereqs: ['Python 3.10+ (Para el motor de visión y OCR)', 'Tesseract OCR (Debe instalarse en Windows para extraer texto)', 'Node.js 18+ (Para la interfaz web)', 'Git (Para descargar el código)', 'Clave API de Google Gemini (Para el análisis de IA)'],
            steps: [
                { num: '1', title: 'Descargar el Código', explanation: 'Primero, descargamos todo el código fuente desde GitHub a tu computadora y entramos a la carpeta del proyecto.', cmd: 'git clone https://github.com/bluejaxllc/vibrana.git\ncd vibrana' },
                { num: '2', title: 'Preparar el Cerebro (Backend)', explanation: 'El backend en Python maneja el procesamiento de imágenes (OpenCV) y la IA. Creamos un "entorno virtual" aislado para instalar las librerías necesarias sin afectar tu sistema.', cmd: 'cd backend\npython -m venv venv\nvenv\\Scripts\\activate    # En Windows\n# source venv/bin/activate  # En Mac/Linux\npip install -r requirements.txt' },
                { num: '3', title: 'Conectar la IA', explanation: 'Vibrana usa Gemini AI de Google para generar los reportes clínicos. Necesitamos guardar tu clave secreta en un archivo llamado .env para que el sistema pueda leerla.', cmd: '# Crear archivo .env dentro de la carpeta /backend\necho GEMINI_API_KEY=tu_clave_api_aqui > .env' },
                { num: '4', title: 'Encender el Motor de Análisis', explanation: 'Iniciamos el servidor Python. Este servidor se quedará ejecutándose en el fondo, procesando los cuadros de video.', cmd: 'python app.py\n# Manten esta ventana abierta' },
                { num: '5', title: 'Preparar la Interfaz (Frontend)', explanation: 'Abre otra ventana de terminal. El frontend está construido con React. Descargamos las dependencias visuales necesarias.', cmd: 'cd ../frontend\nnpm install' },
                { num: '6', title: 'Lanzar el Panel de Control', explanation: 'Iniciamos la interfaz de usuario. Esto abrirá un servidor local y podrás acceder a la plataforma desde tu navegador.', cmd: 'npm run dev\n# Abre http://localhost:5176' },
            ],
            note: '💡 Credenciales de administrador por defecto: admin / admin123',
            cloudNote: '☁️ Versión Web: Para subir PDFs puedes visitar vibrana.bluejax.ai directamente. La instalación local es solo para capturar video en vivo.',
        },
        guideSection: {
            tag: 'Guía de Uso',
            title1: 'Cómo Usar',
            title2: 'Cada Función',
            desc: 'Instrucciones detalladas para aprovechar todas las herramientas que Vibrana ofrece.',
        },
        guideItems: [
            {
                icon: '👥', title: 'Gestión de Pacientes', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', steps: [
                    'Haz clic en "Pacientes" en la barra lateral izquierda',
                    'Presiona "+ Nuevo Paciente" para crear un registro',
                    'Completa nombre, edad, género y notas clínicas',
                    'El paciente aparecerá en tu lista — haz clic en su nombre para ver su perfil',
                    'Desde el perfil puedes agregar escaneos, ver historial y generar reportes',
                ]
            },
            {
                icon: '🔬', title: 'Monitor NLS en Vivo', gradient: 'linear-gradient(135deg, #50fa7b, #2dd4bf)', steps: [
                    'Requiere instalación local (backend corriendo en tu PC)',
                    'Conecta tu dispositivo NLS y abre su software',
                    'En Vibrana, ve a "Monitor en Vivo" en la barra lateral',
                    'Selecciona el monitor donde está tu software NLS',
                    'Vibrana captura la pantalla a 30fps y detecta cambios automáticamente',
                    'Cuando cambia el órgano, el OCR lee los datos y los almacena',
                ]
            },
            {
                icon: '🤖', title: 'Grabador de Macros', gradient: 'linear-gradient(135deg, #ff5555, #ef4444)', steps: [
                    'Ve al panel de "Macros" en la barra lateral',
                    'Escribe un nombre para tu macro en el campo de texto',
                    'Presiona "Grabar" — cada clic, tecla y scroll se registra',
                    'El historial completo de eventos aparece en tiempo real debajo',
                    'Puedes eliminar eventos individuales con el ícono 🗑️',
                    'Agrega eventos manualmente (clic, tecla, espera, mover) con "+ Agregar Evento"',
                    'Presiona "Detener" para guardar el macro',
                    'Para editar un macro guardado, presiona el ícono ✏️ de lápiz',
                    'Reproduce macros con el botón ▶️',
                ]
            },
            {
                icon: '🧠', title: 'Análisis con IA (Gemini)', gradient: 'linear-gradient(135deg, #8be9fd, #3b82f6)', steps: [
                    'Sube una imagen o PDF de escaneo NLS desde el dashboard',
                    'La IA de Gemini analiza los puntos nidales y niveles de entropía',
                    'Recibe un reporte clínico con diagnóstico automático',
                    'Los reportes se guardan en el historial del paciente',
                    'Exporta a PDF para compartir con el paciente',
                ]
            },
            {
                icon: '📊', title: 'Panel de Analíticas', gradient: 'linear-gradient(135deg, #ff79c6, #ec4899)', steps: [
                    'Accede desde "Analíticas" en la barra lateral',
                    'Ve tendencias de entropía por paciente a lo largo del tiempo',
                    'Compara escaneos anteriores con el actual',
                    'Filtra por rango de fecha, órgano o nivel de entropía',
                    'Exporta datos a CSV para análisis externo',
                ]
            },
            {
                icon: '🔍', title: 'Modo Comparación', gradient: 'linear-gradient(135deg, #f1fa8c, #f59e0b)', steps: [
                    'Desde el perfil del paciente, selecciona dos escaneos',
                    'Activa "Modo Comparación" para ver ambos lado a lado',
                    'Las diferencias en entropía se resaltan visualmente',
                    'Útil para evaluar progreso terapéutico entre sesiones',
                ]
            },
        ],
        cta: { title1: '¿Listo para Transformar tu', title2: 'Flujo de Trabajo NLS?', desc: 'Comienza a capturar, analizar y reportar en minutos.', btn: 'Lanzar Vibrana' },
        footer: { tagline: 'Plataforma NLS Overseer', copy: `© ${new Date().getFullYear()} Vibrana. Hecho para profesionales de biorresonancia.` },
    },
    en: {
        nav: { features: 'Features', workflow: 'How It Works', entropy: 'Entropy', tech: 'Technology', install: 'Install', guide: 'User Guide', launch: 'Launch App →' },
        hero: {
            badge: 'NLS Bioresonance Analysis Platform',
            title1: 'See Beyond the',
            title2: 'Spectrum',
            subtitle: 'Vibrana Overseer transforms your NLS bioresonance device into an intelligent diagnostic workstation — with real-time OCR capture, automated change detection, and AI-powered entropy analysis.',
            cta: 'Get Started',
            explore: 'Explore Features ↓',
        },
        stats: [
            { value: 6, label: 'Entropy Levels', suffix: '' },
            { value: 30, label: 'FPS Streaming', suffix: '' },
            { value: 3, label: 'Sec Detection', prefix: '<', suffix: 's' },
            { value: 100, label: 'Organ Library', suffix: '+' },
        ],
        preview: {
            title: 'Vibrana Overseer — Live Session',
            items: ['📊 Dashboard', '🔬 Live Feed', '🔍 Auto Watcher', '📋 Patients', '📈 Analytics'],
            cards: ['Scans Today', 'Changes', 'OCR Reads'],
            feedLabel: 'NLS Feed — Active',
        },
        featuresSection: { tag: 'Capabilities', title1: 'Everything You Need for', title2: 'NLS Analysis', desc: 'A complete toolkit for bioresonance professionals — from real-time monitoring to automated analysis and patient reporting.' },
        features: [
            { icon: '🔬', title: 'Live NLS Monitoring', desc: 'Real-time screen capture and video feed from your NLS bioresonance device with HD streaming at 30fps.', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' },
            { icon: '🧠', title: 'Auto Change Detection', desc: 'Intelligent screen watcher uses frame differencing to auto-detect organ changes and trigger analysis instantly.', gradient: 'linear-gradient(135deg, #50fa7b, #2dd4bf)' },
            { icon: '📝', title: 'NLS-Aware OCR', desc: 'Smart text extraction reads organ codes, section names, entropy values, and compensatory reserve percentages.', gradient: 'linear-gradient(135deg, #8be9fd, #3b82f6)' },
            { icon: '🎯', title: 'Nidal Point Analysis', desc: 'Computer vision detects colored entropy markers (levels 1-6) and maps them with precision coordinates.', gradient: 'linear-gradient(135deg, #f1fa8c, #f59e0b)' },
            { icon: '📊', title: 'Analytics Dashboard', desc: 'Comprehensive patient analytics with entropy trends, scan history, comparative analysis, and exportable reports.', gradient: 'linear-gradient(135deg, #ff79c6, #ec4899)' },
            { icon: '🤖', title: 'Automation Engine', desc: 'Record and replay macros, run automated scan sequences across organs, and schedule batch analyses.', gradient: 'linear-gradient(135deg, #ff5555, #ef4444)' },
        ],
        workflowSection: { tag: 'Workflow', title1: 'From Screen to', title2: 'Insight', desc: 'Four simple steps to transform raw NLS data into actionable diagnostic intelligence.' },
        workflow: [
            { step: '01', title: 'Connect', desc: 'Link Vibrana to your NLS device screen. Auto-calibrate with one click.' },
            { step: '02', title: 'Scan', desc: 'Navigate organs in your NLS software. Vibrana watches and captures data automatically.' },
            { step: '03', title: 'Analyze', desc: 'AI-powered OCR reads readings, detects entropy points, and identifies pathologies.' },
            { step: '04', title: 'Report', desc: 'Generate PDF reports, export CSV data, and track patient progress over time.' },
        ],
        entropySection: {
            tag: 'Science',
            title1: 'The 6 Levels of',
            title2: 'Entropy',
            desc: 'Each nidal point on an organ is color-coded to represent its entropy level — from healthy tissue to active pathology.',
            diagnosis: 'Auto Diagnosis',
            diagnosisItems: [
                'Any Level 6 point → Pathology Detected',
                'More than 5 Level 5 points → Functional Disorder',
                'More than 10 Level 4 points → Compensated State',
                'No alerts → Normal State',
            ],
        },
        entropyLevels: [
            { level: 1, color: '#facc15', name: 'Normal', desc: 'Healthy tissue with optimal resonance', status: '✅' },
            { level: 2, color: '#eab308', name: 'Normal', desc: 'Minor physiological variation, no risk', status: '✅' },
            { level: 3, color: '#f97316', name: 'Mild Stress', desc: 'Early signs of functional imbalance', status: '⚠️' },
            { level: 4, color: '#ef4444', name: 'Compensated', desc: 'Body is actively compensating for an issue', status: '🟠' },
            { level: 5, color: '#8b5cf6', name: 'Functional Disorder', desc: 'Notable compromise in tissue resonance', status: '🔴' },
            { level: 6, color: '#1e1e1e', name: 'Pathology', desc: 'Active tissue degeneration', status: '⛔' },
        ],
        techSection: { tag: 'Under the Hood', title1: 'Built with', title2: 'Precision' },
        tech: [
            { icon: '🐍', title: 'Python + Flask', desc: 'Robust backend with RESTful API, SQLAlchemy ORM, and JWT authentication' },
            { icon: '👁️', title: 'OpenCV', desc: 'Computer vision for nidal point detection, heatmap generation, and frame analysis' },
            { icon: '📖', title: 'Tesseract OCR', desc: 'NLS-aware text extraction with CLAHE preprocessing and dark-background inversion' },
            { icon: '⚛️', title: 'React + Vite', desc: 'Blazing fast frontend with real-time updates, glassmorphic design, and smooth animations' },
        ],
        installSection: {
            tag: 'Installation',
            title1: 'Set Up Your Own',
            title2: 'Instance',
            desc: 'Why install locally? Live Monitor requires the application to run on the same computer as your NLS hardware to capture its screen. If you only want to upload and analyze PDF reports, you can just use the web version without installing anything!',
            prereqTitle: 'Core Prerequisites',
            prereqs: ['Python 3.10+ (For the vision engine & OCR)', 'Tesseract OCR (Must be installed on Windows to extract text)', 'Node.js 18+ (For the web interface)', 'Git (To download the code)', 'Google Gemini API Key (For AI clinical analysis)'],
            steps: [
                { num: '1', title: 'Download Source Code', explanation: 'First, we download the entire project from GitHub to your computer and navigate into the folder.', cmd: 'git clone https://github.com/bluejaxllc/vibrana.git\ncd vibrana' },
                { num: '2', title: 'Prepare the Brain (Backend)', explanation: 'The Python server handles image processing and AI. We create an isolated "virtual environment" to safely install required libraries.', cmd: 'cd backend\npython -m venv venv\nvenv\\Scripts\\activate    # On Windows\n# source venv/bin/activate  # On Mac/Linux\npip install -r requirements.txt' },
                { num: '3', title: 'Connect AI', explanation: 'Vibrana uses Google Gemini to generate clinical reports. We save your secret API key in a configuration file named .env so the system can access it.', cmd: '# Create a .env file inside the /backend folder\necho GEMINI_API_KEY=your_api_key_here > .env' },
                { num: '4', title: 'Power On Analysis Engine', explanation: 'We start the Python server. This program runs in the background, processing video frames and talking to the AI.', cmd: 'python app.py\n# Keep this window open' },
                { num: '5', title: 'Prepare the Interface', explanation: 'Open a new terminal window. The frontend is built with React. We download all the visual dependencies needed for the UI.', cmd: 'cd ../frontend\nnpm install' },
                { num: '6', title: 'Launch Dashboard', explanation: 'Start the web interface. This spins up a local server so you can access the platform from your browser.', cmd: 'npm run dev\n# Opens http://localhost:5176' },
            ],
            note: '💡 Default administrator credentials: admin / admin123',
            cloudNote: '☁️ Web Version: For simple PDF uploads, just visit vibrana.bluejax.ai. Local installation is only required for live video capture features.',
        },
        guideSection: {
            tag: 'User Guide',
            title1: 'How to Use',
            title2: 'Every Feature',
            desc: 'Detailed instructions to get the most out of every tool Vibrana offers.',
        },
        guideItems: [
            {
                icon: '👥', title: 'Patient Management', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', steps: [
                    'Click "Patients" in the left sidebar',
                    'Press "+ New Patient" to create a record',
                    'Fill in name, age, gender, and clinical notes',
                    'The patient appears in your list — click their name to view their profile',
                    'From the profile you can add scans, view history, and generate reports',
                ]
            },
            {
                icon: '🔬', title: 'Live NLS Monitor', gradient: 'linear-gradient(135deg, #50fa7b, #2dd4bf)', steps: [
                    'Requires local installation (backend running on your PC)',
                    'Connect your NLS device and open its software',
                    'In Vibrana, go to "Live Monitor" in the sidebar',
                    'Select the monitor where your NLS software is displayed',
                    'Vibrana captures the screen at 30fps and auto-detects changes',
                    'When the organ changes, OCR reads the data and stores it',
                ]
            },
            {
                icon: '🤖', title: 'Macro Recorder', gradient: 'linear-gradient(135deg, #ff5555, #ef4444)', steps: [
                    'Go to the "Macros" panel in the sidebar',
                    'Type a name for your macro in the text field',
                    'Press "Record" — every click, keystroke and scroll is captured',
                    'The full event history appears in real-time below',
                    'You can delete individual events with the 🗑️ trash icon',
                    'Manually add events (click, key, wait, move) with "+ Add Event"',
                    'Press "Stop" to save the macro',
                    'To edit a saved macro, click the ✏️ pencil icon',
                    'Replay macros with the ▶️ play button',
                ]
            },
            {
                icon: '🧠', title: 'AI Analysis (Gemini)', gradient: 'linear-gradient(135deg, #8be9fd, #3b82f6)', steps: [
                    'Upload an NLS scan image or PDF from the dashboard',
                    'Gemini AI analyzes nidal points and entropy levels',
                    'Receive a clinical report with automatic diagnosis',
                    'Reports are saved in the patient\'s history',
                    'Export to PDF to share with the patient',
                ]
            },
            {
                icon: '📊', title: 'Analytics Dashboard', gradient: 'linear-gradient(135deg, #ff79c6, #ec4899)', steps: [
                    'Access from "Analytics" in the sidebar',
                    'View entropy trends per patient over time',
                    'Compare previous scans with the current one',
                    'Filter by date range, organ, or entropy level',
                    'Export data to CSV for external analysis',
                ]
            },
            {
                icon: '🔍', title: 'Comparison Mode', gradient: 'linear-gradient(135deg, #f1fa8c, #f59e0b)', steps: [
                    'From the patient profile, select two scans',
                    'Activate "Comparison Mode" to see both side by side',
                    'Entropy differences are visually highlighted',
                    'Useful for evaluating therapeutic progress between sessions',
                ]
            },
        ],
        cta: { title1: 'Ready to Transform Your', title2: 'NLS Workflow?', desc: 'Start capturing, analyzing, and reporting in minutes.', btn: 'Launch Vibrana' },
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

// ═══ FLOATING PARTICLES ═══
const Particles = React.memo(() => {
    const [particles] = useState(() =>
        Array.from({ length: 40 }, (_, i) => ({
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

// ═══ MAIN COMPONENT ═══
const LandingPage = ({ onGetStarted }) => {
    const [scrollY, setScrollY] = useState(0);
    const [visibleSections, setVisibleSections] = useState(new Set());
    const [lang, setLang] = useState(() => localStorage.getItem('vibrana_lang') || 'es');
    const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
    const [theme, setTheme] = useState(() => localStorage.getItem('vibrana_theme') || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
    const heroRef = useRef(null);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('vibrana_theme', next);
    };

    const t = i18n[lang];
    const heroVisible = visibleSections.has('hero-trigger');
    const statsVisible = visibleSections.has('stats-trigger');

    useEffect(() => { localStorage.setItem('vibrana_lang', lang); }, [lang]);

    // Scroll handler
    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Mouse tracking for spotlight effect (hero only)
    useEffect(() => {
        const handleMouse = (e) => {
            if (!heroRef.current) return;
            const rect = heroRef.current.getBoundingClientRect();
            if (e.clientY > rect.bottom) return;
            setMousePos({
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight,
            });
        };
        window.addEventListener('mousemove', handleMouse, { passive: true });
        return () => window.removeEventListener('mousemove', handleMouse);
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

    const isVisible = id => visibleSections.has(id);

    // 3D tilt handler for feature cards
    const handleCardMouse = useCallback((e) => {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * -12;
        card.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${y}deg) translateY(-6px)`;
    }, []);

    const handleCardLeave = useCallback((e) => {
        e.currentTarget.style.transform = '';
    }, []);

    const [waveHeights] = useState(() =>
        [...Array(30)].map((_, i) => 20 + Math.sin(i * 0.5) * 15 + Math.random() * 10)
    );

    return (
        <div className="landing-page">
            <Particles />

            {/* ═══ MOUSE SPOTLIGHT ═══ */}
            <div className="mouse-spotlight" style={{
                background: `radial-gradient(600px circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(139,92,246,0.06), transparent 60%)`
            }} />

            {/* ═══ NAVBAR ═══ */}
            <nav className={`landing-nav ${scrollY > 50 ? 'scrolled' : ''}`}>
                <div className="landing-nav-inner">
                    <div className="landing-logo">
                        <span className="logo-icon">◇</span>
                        <span className="logo-text">Vibrana</span>
                    </div>
                    <div className="landing-nav-links">
                        <a href="#features">{t.nav.features}</a>
                        <a href="#workflow">{t.nav.workflow}</a>
                        <a href="#entropy">{t.nav.entropy}</a>
                        <a href="#technology">{t.nav.tech}</a>
                        <a href="#installation">{t.nav.install}</a>
                        <a href="#guide">{t.nav.guide}</a>
                        <button className="btn-lang-toggle" onClick={() => setLang(l => l === 'es' ? 'en' : 'es')}
                            title={lang === 'es' ? 'Switch to English' : 'Cambiar a Español'}>
                            {lang === 'es' ? 'EN' : 'ES'}
                        </button>
                        <button className="btn-lang-toggle" onClick={toggleTheme}
                            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                            style={{ fontSize: '1.1rem' }}>
                            {theme === 'dark' ? '☀' : '☾'}
                        </button>
                        <button className="btn-landing-primary" onClick={onGetStarted}>{t.nav.launch}</button>
                    </div>
                </div>
            </nav>

            {/* ═══ HERO ═══ */}
            <section className="landing-hero" ref={heroRef}>
                <div className="hero-bg-effects">
                    <div className="hero-orb hero-orb-1" style={{ transform: `translate(${mousePos.x * 30 - 15}px, ${scrollY * 0.15 + mousePos.y * 20 - 10}px)` }} />
                    <div className="hero-orb hero-orb-2" style={{ transform: `translate(${mousePos.x * -20 + 10}px, ${scrollY * 0.08 + mousePos.y * -15 + 7}px)` }} />
                    <div className="hero-orb hero-orb-3" style={{ transform: `translate(${mousePos.x * 15 - 7}px, ${scrollY * 0.12 + mousePos.y * 10 - 5}px)` }} />
                    <div className="hero-orb hero-orb-4" style={{ transform: `translate(${mousePos.x * -25 + 12}px, ${scrollY * 0.1 + mousePos.y * 18 - 9}px)` }} />
                    <div className="hero-grid-bg" />
                    <div className="hero-gradient-mesh" />
                </div>

                <div id="hero-trigger" className="reveal-trigger" />

                <div className={`hero-content ${heroVisible ? 'animate-in' : ''}`}>
                    <div className="hero-badge">
                        <span className="badge-dot" />
                        <span className="badge-pulse" />
                        {t.hero.badge}
                    </div>
                    <h1 className="hero-title">
                        <span className="hero-title-line">{t.hero.title1}</span>
                        <span className="hero-title-accent">{t.hero.title2}</span>
                    </h1>
                    <p className="hero-subtitle">{t.hero.subtitle}</p>
                    <div className="hero-actions">
                        <button className="btn-landing-hero" onClick={onGetStarted}>
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
                        {t.stats.map((stat, i) => (
                            <StatItem key={i} stat={stat} i={i} statsVisible={statsVisible} />
                        ))}
                    </div>
                </div>

                <div className="hero-preview" style={{ transform: `translateY(${scrollY * -0.05}px)` }}>
                    <div className="preview-window">
                        <div className="preview-glow" />
                        <div className="preview-titlebar">
                            <div className="preview-dots">
                                <span className="dot red" /><span className="dot yellow" /><span className="dot green" />
                            </div>
                            <span className="preview-title">{t.preview.title}</span>
                        </div>
                        <div className="preview-content">
                            <div className="preview-sidebar">
                                {t.preview.items.map((item, i) => (
                                    <div key={i} className={`preview-sidebar-item ${i === 0 ? 'active' : ''}`}>{item}</div>
                                ))}
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
                                <div className="preview-feed-bar">
                                    <div className="preview-live-dot" /><span>{t.preview.feedLabel}</span>
                                </div>
                                <div className="preview-wave">
                                    {[...Array(30)].map((_, i) => (
                                        <div key={i} className="wave-bar" style={{
                                            height: `${waveHeights[i]}px`,
                                            animationDelay: `${i * 0.05}s`
                                        }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scroll indicator */}
                <div className="scroll-indicator">
                    <div className="scroll-mouse">
                        <div className="scroll-wheel" />
                    </div>
                </div>
            </section>

            {/* ═══ FEATURES ═══ */}
            <section id="features" className={`landing-section reveal-section ${isVisible('features') ? 'visible' : ''}`}>
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">{t.featuresSection.tag}</span>
                        <h2>{t.featuresSection.title1}<br /><span className="text-accent">{t.featuresSection.title2}</span></h2>
                        <p className="section-desc">{t.featuresSection.desc}</p>
                    </div>
                    <div className="features-grid">
                        {t.features.map((feat, i) => (
                            <div key={i} className="feature-card"
                                style={{ animationDelay: `${i * 0.08}s` }}
                                onMouseMove={handleCardMouse} onMouseLeave={handleCardLeave}>
                                <div className="feature-icon" style={{ background: feat.gradient }}>{feat.icon}</div>
                                <h3>{feat.title}</h3>
                                <p>{feat.desc}</p>
                                <div className="feature-shine" />
                                <div className="feature-border-glow" />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ WORKFLOW ═══ */}
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
                                <div className="step-number">
                                    <span>{step.step}</span>
                                    <div className="step-ring" />
                                </div>
                                <div className="step-content">
                                    <h3>{step.title}</h3>
                                    <p>{step.desc}</p>
                                </div>
                                {i < t.workflow.length - 1 && <div className="step-connector"><div className="connector-fill" /></div>}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ ENTROPY LEVELS ═══ */}
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
                                <div key={i} className="diagnosis-rule" style={{ animationDelay: `${i * 0.1}s` }}>
                                    <span className="rule-arrow">→</span>
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ TECHNOLOGY ═══ */}
            <section id="technology" className={`landing-section reveal-section ${isVisible('technology') ? 'visible' : ''}`}>
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">{t.techSection.tag}</span>
                        <h2>{t.techSection.title1} <span className="text-accent">{t.techSection.title2}</span></h2>
                    </div>
                    <div className="tech-grid">
                        {t.tech.map((item, i) => (
                            <div key={i} className="tech-card" style={{ animationDelay: `${i * 0.1}s` }}>
                                <div className="tech-icon">{item.icon}</div>
                                <h4>{item.title}</h4>
                                <p>{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ INSTALLATION ═══ */}
            <section id="installation" className={`landing-section reveal-section ${isVisible('installation') ? 'visible' : ''}`}>
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">{t.installSection.tag}</span>
                        <h2>{t.installSection.title1} <span className="text-accent">{t.installSection.title2}</span></h2>
                        <p className="section-desc">{t.installSection.desc}</p>
                    </div>

                    {/* Prerequisites */}
                    <div className="install-prereqs">
                        <h4 className="install-prereqs-title">⚙️ {t.installSection.prereqTitle}</h4>
                        <div className="install-prereqs-grid">
                            {t.installSection.prereqs.map((p, i) => (
                                <div key={i} className="install-prereq-item">
                                    <span className="prereq-check">✓</span>
                                    {p}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Steps */}
                    <div className="install-steps">
                        {t.installSection.steps.map((step, i) => (
                            <div key={i} className="install-step" style={{ animationDelay: `${i * 0.1}s` }}>
                                <div className="install-step-header">
                                    <span className="install-step-num">{step.num}</span>
                                    <h5 className="install-step-title">{step.title}</h5>
                                </div>
                                {step.explanation && <p className="install-step-explanation" style={{ fontSize: '13px', color: '#94a3b8', marginTop: '0', marginBottom: '12px', lineHeight: '1.5' }}>{step.explanation}</p>}
                                <pre className="install-code-block"><code>{step.cmd}</code></pre>
                            </div>
                        ))}
                    </div>

                    {/* Notes */}
                    <div className="install-notes">
                        <p className="install-note">{t.installSection.note}</p>
                        <p className="install-note install-note-cloud">{t.installSection.cloudNote}</p>
                    </div>
                </div>
            </section>

            {/* ═══ USER GUIDE ═══ */}
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
                                <div className="guide-card-header">
                                    <div className="feature-icon" style={{ background: item.gradient }}>{item.icon}</div>
                                    <h3>{item.title}</h3>
                                </div>
                                <ol className="guide-steps">
                                    {item.steps.map((step, j) => (
                                        <li key={j}>{step}</li>
                                    ))}
                                </ol>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ CTA ═══ */}
            <section className={`landing-cta reveal-section ${isVisible('cta') ? 'visible' : ''}`} id="cta">
                <div className="cta-inner">
                    <div className="cta-glow" />
                    <div className="cta-rings">
                        <div className="cta-ring ring-1" />
                        <div className="cta-ring ring-2" />
                        <div className="cta-ring ring-3" />
                    </div>
                    <h2>{t.cta.title1}<br />{t.cta.title2}</h2>
                    <p>{t.cta.desc}</p>
                    <button className="btn-landing-hero" onClick={onGetStarted}>
                        <span className="btn-text">{t.cta.btn}</span>
                        <span className="btn-icon-wrap">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </span>
                        <span className="btn-shine" />
                    </button>
                </div>
            </section>

            {/* ═══ FOOTER ═══ */}
            <footer className="landing-footer">
                <div className="footer-inner">
                    <div className="footer-brand">
                        <span className="logo-icon">◇</span>
                        <span className="logo-text">Vibrana</span>
                        <span className="footer-tagline">{t.footer.tagline}</span>
                    </div>
                    <div className="footer-copy">{t.footer.copy}</div>
                </div>
            </footer>
        </div>
    );
};

const StatItem = ({ stat, i, statsVisible }) => {
    const count = useCountUp(stat.value, 1800, statsVisible);
    return (
        <div className={`hero-stat ${statsVisible ? 'pop-in' : ''}`} style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
            <span className="stat-value">{stat.prefix || ''}{count}<small>{stat.suffix}</small></span>
            <span className="stat-label">{stat.label}</span>
        </div>
    );
};

export default LandingPage;
