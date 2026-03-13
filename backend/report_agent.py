"""
Vibrana AI Report Agent — Gemini-Powered NLS Bioresonance Report Generator

Gathers all patient scan data, diagnostic logs, and practitioner notes,
then uses Google Gemini to synthesize a professional bilingual diagnostic report.
"""
import os
import json
from datetime import datetime
from database import SessionLocal
from models import Patient, ScanResult, DiagnosticLog, ApiUsageLog

# ──────────────────────────────────────
# Gemini API Configuration
# ──────────────────────────────────────
GEMINI_MODEL = 'gemini-2.5-flash'
GEMINI_URL = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent'

def get_gemini_key():
    """Get API key dynamically — survives Flask debug reloads."""
    key = os.environ.get('GEMINI_API_KEY', '')
    if not key:
        # Try loading from .env file as fallback
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith('GEMINI_API_KEY='):
                        key = line.strip().split('=', 1)[1].strip('"').strip("'")
                        os.environ['GEMINI_API_KEY'] = key
                        break
    return key


# ──────────────────────────────────────
# Body System Mapping
# ──────────────────────────────────────
BODY_SYSTEMS = {
    "Digestivo": {
        "name_es": "Sistema Digestivo",
        "name_en": "Digestive System",
        "organs": ["Hígado", "Páncreas", "Estómago", "Intestino", "Vesícula", "Colon"],
        "icon": "🫁"
    },
    "Cardiovascular": {
        "name_es": "Sistema Cardiovascular",
        "name_en": "Cardiovascular System",
        "organs": ["Corazón"],
        "icon": "❤️"
    },
    "Respiratorio": {
        "name_es": "Sistema Respiratorio",
        "name_en": "Respiratory System",
        "organs": ["Pulmón"],
        "icon": "🫁"
    },
    "Urinario": {
        "name_es": "Sistema Urinario",
        "name_en": "Urinary System",
        "organs": ["Riñón", "Vejiga"],
        "icon": "🫘"
    },
    "Endocrino": {
        "name_es": "Sistema Endocrino",
        "name_en": "Endocrine System",
        "organs": ["Tiroides", "Hipófisis", "Suprarrenal"],
        "icon": "⚙️"
    },
    "Nervioso": {
        "name_es": "Sistema Nervioso",
        "name_en": "Nervous System",
        "organs": ["Cerebro"],
        "icon": "🧠"
    },
    "Musculoesquelético": {
        "name_es": "Sistema Musculoesquelético",
        "name_en": "Musculoskeletal System",
        "organs": ["Columna", "Articulación", "Rodilla"],
        "icon": "🦴"
    },
    "Linfático": {
        "name_es": "Sistema Linfático",
        "name_en": "Lymphatic System",
        "organs": ["Bazo"],
        "icon": "🩸"
    },
    "Reproductivo": {
        "name_es": "Sistema Reproductivo",
        "name_en": "Reproductive System",
        "organs": ["Próstata", "Útero"],
        "icon": "🔬"
    },
    "Sensorial": {
        "name_es": "Sistema Sensorial",
        "name_en": "Sensory System",
        "organs": ["Ojo", "Oído", "Retina"],
        "icon": "👁️"
    },
}


def classify_organ_system(organ_name: str) -> str:
    """Classify an organ name into a body system."""
    for system_key, system_info in BODY_SYSTEMS.items():
        for keyword in system_info["organs"]:
            if keyword.lower() in organ_name.lower():
                return system_key
    return "Otro"


# ──────────────────────────────────────
# Data Gathering
# ──────────────────────────────────────
def gather_patient_data(patient_id: str) -> dict:
    """
    Collect all available data for a patient:
    - Patient demographics
    - All scan results with entropy analysis
    - All diagnostic logs
    - Organized by body system
    """
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return {"error": "Patient not found"}

        scans = db.query(ScanResult).filter(
            ScanResult.patient_id == patient_id
        ).order_by(ScanResult.timestamp.asc()).all()

        diag_logs = db.query(DiagnosticLog).filter(
            DiagnosticLog.patient_id == patient_id
        ).order_by(DiagnosticLog.timestamp.asc()).all()

        # Organize scans by body system
        systems_data = {}
        for scan in scans:
            system = classify_organ_system(scan.organ_name)
            if system not in systems_data:
                systems_data[system] = {
                    "system_info": BODY_SYSTEMS.get(system, {"name_es": system, "name_en": system, "icon": "🔬"}),
                    "organs": {},
                    "total_scans": 0,
                    "critical_count": 0,
                    "warning_count": 0,
                }

            organ = scan.organ_name
            if organ not in systems_data[system]["organs"]:
                systems_data[system]["organs"][organ] = {
                    "scans": [],
                    "latest_status": None,
                    "trend": "stable",
                }

            scan_data = scan.to_dict()
            scan_data["system"] = system
            systems_data[system]["organs"][organ]["scans"].append(scan_data)
            systems_data[system]["organs"][organ]["latest_status"] = scan.status
            systems_data[system]["total_scans"] += 1

            if "Pathol" in (scan.status or ""):
                systems_data[system]["critical_count"] += 1
            elif "Comprom" in (scan.status or "") or "Stress" in (scan.status or ""):
                systems_data[system]["warning_count"] += 1

        # Calculate trends per organ
        for system_key, system_data in systems_data.items():
            for organ_name, organ_data in system_data["organs"].items():
                organ_scans = organ_data["scans"]
                if len(organ_scans) >= 2:
                    first_half = organ_scans[:len(organ_scans) // 2]
                    second_half = organ_scans[len(organ_scans) // 2:]

                    def avg_entropy(scans_list):
                        total_high = 0
                        total_points = 0
                        for s in scans_list:
                            counts = s.get("counts", {})
                            total_high += int(counts.get("5", 0)) + int(counts.get("6", 0))
                            total_points += s.get("total_points", 0)
                        return total_high / max(len(scans_list), 1)

                    first_avg = avg_entropy(first_half)
                    second_avg = avg_entropy(second_half)

                    if second_avg < first_avg * 0.7:
                        organ_data["trend"] = "improving"
                    elif second_avg > first_avg * 1.3:
                        organ_data["trend"] = "worsening"
                    else:
                        organ_data["trend"] = "stable"

        # Session timeline
        sessions = {}
        for scan in scans:
            date_key = scan.timestamp.strftime("%Y-%m-%d") if scan.timestamp else "unknown"
            if date_key not in sessions:
                sessions[date_key] = {"date": date_key, "scan_count": 0, "organs": []}
            sessions[date_key]["scan_count"] += 1
            sessions[date_key]["organs"].append(scan.organ_name)

        return {
            "patient": patient.to_dict(),
            "total_scans": len(scans),
            "total_diagnostic_logs": len(diag_logs),
            "session_count": len(sessions),
            "sessions": list(sessions.values()),
            "systems": systems_data,
            "diagnostic_logs_summary": [
                {
                    "date": d.timestamp.isoformat() if d.timestamp else None,
                    "organ": d.organ_detected,
                    "severity": d.severity,
                    "summary": d.summary_text,
                }
                for d in diag_logs[-20:]  # Last 20 logs
            ],
        }
    finally:
        db.close()


# ──────────────────────────────────────
# AI Prompt Builder
# ──────────────────────────────────────
def build_ai_prompt(patient_data: dict, language: str = "es") -> str:
    """Build the Gemini prompt with all patient context."""

    patient = patient_data["patient"]
    systems = patient_data["systems"]

    # Build organ summary table
    organ_lines = []
    for system_key, system_data in systems.items():
        system_name = system_data["system_info"].get("name_es", system_key)
        icon = system_data["system_info"].get("icon", "🔬")
        organ_lines.append(f"\n### {icon} {system_name}")

        for organ_name, organ_data in system_data["organs"].items():
            latest = organ_data["scans"][-1] if organ_data["scans"] else {}
            counts = latest.get("counts", {})
            status = organ_data["latest_status"] or "Unknown"
            trend = organ_data["trend"]
            num_scans = len(organ_data["scans"])

            trend_icon = {"improving": "📈", "worsening": "📉", "stable": "➡️"}.get(trend, "➡️")

            organ_lines.append(
                f"- **{organ_name}**: {status} | "
                f"L1:{counts.get('1',0)} L2:{counts.get('2',0)} L3:{counts.get('3',0)} "
                f"L4:{counts.get('4',0)} L5:{counts.get('5',0)} L6:{counts.get('6',0)} | "
                f"Tendencia: {trend_icon} {trend} | Escaneos: {num_scans}"
            )

    organ_summary = "\n".join(organ_lines)

    # Session timeline
    session_lines = []
    for s in patient_data.get("sessions", []):
        session_lines.append(f"- {s['date']}: {s['scan_count']} órganos ({', '.join(s['organs'][:5])}{'...' if len(s['organs']) > 5 else ''})")
    session_summary = "\n".join(session_lines) if session_lines else "Sin sesiones registradas."

    lang_instruction = ""
    if language == "es":
        lang_instruction = "Escribe el reporte completo en ESPAÑOL. Usa terminología médica clara pero accesible."
    else:
        lang_instruction = "Write the complete report in ENGLISH. Use clear but accessible medical terminology."

    prompt = f"""Eres un especialista certificado en biorresonancia y análisis NLS (Non-Linear Systems) Metatron Hunter. 
Tu tarea es generar un REPORTE DIAGNÓSTICO PROFESIONAL completo basado en los datos de escaneo del paciente.

{lang_instruction}

## Datos del Paciente
- **Nombre:** {patient["name"]}
- **Edad:** {patient["age"]} años
- **Género:** {patient["gender"]}
- **Notas clínicas:** {patient.get("notes", "N/A")}
- **Total de escaneos:** {patient_data["total_scans"]}
- **Sesiones realizadas:** {patient_data["session_count"]}

## Historial de Sesiones
{session_summary}

## Datos de Escaneo por Sistema Corporal
La escala de entropía NLS va de 1 a 6:
- Nivel 1-2: Funcionamiento normal/óptimo 
- Nivel 3: Estrés funcional leve
- Nivel 4: Estrés significativo / disfunción
- Nivel 5: Estado comprometido
- Nivel 6: Estado patológico / daño activo

{organ_summary}

## Instrucciones para el Reporte

Genera un reporte JSON con la siguiente estructura EXACTA:

```json
{{
  "titulo": "Reporte de Análisis Biorresonancia NLS",
  "fecha_generacion": "YYYY-MM-DD",
  "resumen_ejecutivo": "Párrafo de 3-5 oraciones resumiendo los hallazgos principales y el estado general del paciente.",
  "estado_general": "bueno|aceptable|precaucion|critico",
  "puntuacion_salud": 85,
  "hallazgos_principales": [
    {{
      "sistema": "Nombre del sistema",
      "hallazgo": "Descripción clara del hallazgo",
      "severidad": "normal|leve|moderado|severo|critico",
      "organos_afectados": ["órgano1", "órgano2"]
    }}
  ],
  "analisis_por_sistema": [
    {{
      "sistema": "Nombre del sistema corporal",
      "icono": "emoji",
      "estado": "normal|comprometido|patologico",
      "descripcion": "Análisis narrativo detallado de 2-4 oraciones sobre la función de este sistema.",
      "organos": [
        {{
          "nombre": "Nombre del órgano",
          "estado": "Normal|Estrés|Comprometido|Patológico",
          "entropia_predominante": 3,
          "tendencia": "mejorando|estable|empeorando",
          "observacion": "Observación clínica específica para este órgano."
        }}
      ]
    }}
  ],
  "correlaciones_clinicas": [
    "Correlación 1: Explicar cómo diferentes hallazgos se relacionan entre sí.",
    "Correlación 2: Por ejemplo, estrés hepático + estrés renal = posible sobrecarga de desintoxicación."
  ],
  "recomendaciones": [
    {{
      "prioridad": "alta|media|baja",
      "categoria": "seguimiento|tratamiento|estilo_de_vida|nutricion",
      "descripcion": "Recomendación específica y actionable."
    }}
  ],
  "proximo_control": "Sugerencia de cuándo realizar el próximo escaneo.",
  "nota_legal": "Este reporte es generado por análisis de biorresonancia NLS y no constituye un diagnóstico médico. Consulte a su médico para decisiones clínicas."
}}
```

IMPORTANTE:
- Responde ÚNICAMENTE con el JSON válido, sin markdown ni bloques de código.
- Basa tu análisis EXCLUSIVAMENTE en los datos proporcionados.
- Sé preciso con los nombres de órganos — usa exactamente los que aparecen en los datos.
- Genera correlaciones clínicas inteligentes entre sistemas (e.g., si el hígado y los riñones están estresados, menciona la posible sobrecarga de desintoxicación).
- La puntuación de salud debe ser de 0-100, calculada según la proporción de entropías altas vs bajas.
- Incluye al menos 3 recomendaciones relevantes.
"""
    return prompt


# ──────────────────────────────────────
# Gemini API Call
# ──────────────────────────────────────
async def call_gemini(prompt: str) -> dict:
    """Call Gemini API and parse JSON response."""
    import aiohttp

    if not get_gemini_key():
        # Fallback: generate a structured report without AI
        return generate_fallback_report(prompt)

    url = f"{GEMINI_URL}?key={get_gemini_key()}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
        }
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    print(f"[AI Report] Gemini API error ({resp.status}): {error_text[:200]}")
                    return generate_fallback_report(prompt)

                data = await resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]

                # Parse JSON from response
                text = text.strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0]

                return json.loads(text)
    except Exception as e:
        print(f"[AI Report] Gemini call failed: {e}")
        return generate_fallback_report(prompt)


def check_and_log_api_usage(service_name="gemini-flash", limit=1000) -> bool:
    """Checks if the daily limit for the specified service has been reached. Logs the call if allowed."""
    try:
        db = SessionLocal()
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Count usage for today
        usage_count = db.query(ApiUsageLog).filter(
            ApiUsageLog.service == service_name,
            ApiUsageLog.timestamp >= today_start
        ).count()

        if usage_count >= limit:
            print(f"[API Tracker] {service_name} daily limit ({limit}) reached!")
            db.close()
            return False

        # Log new usage
        new_log = ApiUsageLog(service=service_name, tokens_used=1)
        db.add(new_log)
        db.commit()
        db.close()
        return True
    except Exception as e:
        print(f"[API Tracker] Error: {e}")
        return True  # Fail open to not block production on db error


def call_gemini_sync(prompt: str) -> dict:
    """Synchronous wrapper for call_gemini."""
    import requests

    api_key = get_gemini_key()
    print(f"[AI Report] Gemini key loaded: {bool(api_key)} {'- ' + api_key[:8] + '...' if api_key else ''}")
    if not api_key:
        return generate_fallback_report(prompt)
        
    if not check_and_log_api_usage(GEMINI_MODEL, 1000):
        return {
            "status": "error",
            "message": "ERROR: Quota diaria de escaneos AI agotada (Límite: 1000/día).",
            "scorecard": [],
            "report_markdown": "# Límite de Uso de IA Alcanzado\nHa excedido su límite diario de escaneos usando el motor de Inteligencia Artificial. Por favor, intente de nuevo mañana."
        }

    url = f"{GEMINI_URL}?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 65536,
            "responseMimeType": "application/json",
        }
    }

    try:
        resp = requests.post(url, json=payload, timeout=120)
        if resp.status_code != 200:
            error_msg = f"Gemini API error ({resp.status_code}): {resp.text[:200]}"
            print(f"[AI Report] {error_msg}")
            fallback = generate_fallback_report(prompt)
            fallback['_gemini_error'] = error_msg
            fallback['_gemini_status'] = resp.status_code
            return fallback

        data = resp.json()
        
        # Check for truncation via finishReason
        finish_reason = data.get("candidates", [{}])[0].get("finishReason", "")
        if finish_reason == "MAX_TOKENS":
            print(f"[AI Report] WARNING: Gemini response was truncated (MAX_TOKENS)")
        
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        text = text.strip()
        
        # Robust JSON extraction
        import re
        match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.DOTALL)
        if match:
            text = match.group(1)
        elif text.startswith('{') and text.endswith('}'):
             pass # It's already just the JSON
        else:
            # Fallback in case of weird formatting but hoping it's raw JSON
            text = text.strip("` \n")
            if text.startswith("json\n"):
                text = text[5:]

        try:
            return json.loads(text)
        except json.JSONDecodeError as je:
            print(f"[AI Report] JSON parse failed: {je}. Attempting repair...")
            repaired = _repair_truncated_json(text)
            if repaired:
                print(f"[AI Report] JSON repair succeeded!")
                repaired['_repaired'] = True
                return repaired
            raise  # re-raise if repair failed
    except Exception as e:
        error_msg = f"Gemini call failed: {type(e).__name__}: {e}"
        print(f"[AI Report] {error_msg}")
        fallback = generate_fallback_report(prompt)
        fallback['_gemini_error'] = error_msg
        return fallback


def _repair_truncated_json(text: str) -> dict:
    """Attempt to repair truncated JSON by closing open structures."""
    try:
        # Track nesting
        in_string = False
        escape_next = False
        stack = []
        
        for ch in text:
            if escape_next:
                escape_next = False
                continue
            if ch == '\\' and in_string:
                escape_next = True
                continue
            if ch == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch in ('{', '['):
                stack.append(ch)
            elif ch == '}' and stack and stack[-1] == '{':
                stack.pop()
            elif ch == ']' and stack and stack[-1] == '[':
                stack.pop()
        
        # Close the string if we're in one
        repaired = text
        if in_string:
            repaired += '"'
        
        # Close any open structures in reverse order
        for opener in reversed(stack):
            if opener == '{':
                # Remove trailing comma if present
                repaired = repaired.rstrip().rstrip(',')
                repaired += '}'
            elif opener == '[':
                repaired = repaired.rstrip().rstrip(',')
                repaired += ']'
        
        return json.loads(repaired)
    except Exception as e:
        print(f"[AI Report] JSON repair also failed: {e}")
        return None

def call_gemini_sync_text(prompt: str) -> str:
    """Synchronous wrapper for call_gemini returning raw text."""
    import requests

    if not get_gemini_key():
        return "ERROR: Gemini API key not found."

    if not check_and_log_api_usage(GEMINI_MODEL, 1000):
        return "ERROR: Quota diaria de escaneos AI agotada (Límite: 1000/día)."

    url = f"{GEMINI_URL}?key={get_gemini_key()}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096
        }
    }

    try:
        resp = requests.post(url, json=payload, timeout=30)
        if resp.status_code != 200:
            print(f"[AI Report] Gemini API error ({resp.status_code}): {resp.text[:200]}")
            return f"ERROR: Gemini API error ({resp.status_code})"

        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return text.strip()
    except Exception as e:
        print(f"[AI Report] Gemini text call failed: {e}")
        return f"ERROR: {str(e)}"

# ──────────────────────────────────────
# Fallback Report (No API Key)
# ──────────────────────────────────────
def generate_fallback_report(prompt: str) -> dict:
    """Generate a structured report using rule-based analysis when Gemini is unavailable."""
    return {
        "titulo": "Reporte de Análisis Biorresonancia NLS",
        "fecha_generacion": datetime.now().strftime("%Y-%m-%d"),
        "resumen_ejecutivo": "Reporte generado sin AI — se requiere clave de API de Gemini para análisis narrativo completo. Los datos numéricos están disponibles en la sección de análisis por sistema.",
        "estado_general": "pendiente",
        "puntuacion_salud": 0,
        "hallazgos_principales": [],
        "analisis_por_sistema": [],
        "correlaciones_clinicas": ["Configure GEMINI_API_KEY para obtener correlaciones clínicas inteligentes."],
        "recomendaciones": [
            {
                "prioridad": "alta",
                "categoria": "seguimiento",
                "descripcion": "Configure la variable de entorno GEMINI_API_KEY para habilitar el análisis AI completo."
            }
        ],
        "proximo_control": "Pendiente de análisis AI.",
        "nota_legal": "Este reporte es generado por análisis de biorresonancia NLS y no constituye un diagnóstico médico.",
        "_fallback": True,
    }


# ──────────────────────────────────────
# Main Report Generator
# ──────────────────────────────────────
def generate_narrative_report(patient_id: str, language: str = "es") -> dict:
    """
    Full AI-powered report generation pipeline:
    1. Gather all patient data
    2. Build comprehensive prompt
    3. Send to Gemini
    4. Return structured report with metadata
    """
    # Step 1: Gather data
    patient_data = gather_patient_data(patient_id)
    if "error" in patient_data:
        return patient_data

    if patient_data["total_scans"] == 0:
        return {
            "patient": patient_data["patient"],
            "report": {
                "titulo": "Reporte de Análisis Biorresonancia NLS",
                "fecha_generacion": datetime.now().strftime("%Y-%m-%d"),
                "resumen_ejecutivo": "No hay datos de escaneo disponibles para este paciente. Programe una sesión de biorresonancia para comenzar el análisis.",
                "estado_general": "sin_datos",
                "puntuacion_salud": 0,
                "hallazgos_principales": [],
                "analisis_por_sistema": [],
                "recomendaciones": [{"prioridad": "alta", "categoria": "seguimiento", "descripcion": "Programar sesión inicial de escaneo NLS."}],
            },
            "metadata": {"ai_generated": False, "scans_analyzed": 0}
        }

    # Step 2: Build prompt
    prompt = build_ai_prompt(patient_data, language)

    # Step 3: Call Gemini
    print(f"[AI Report] Generating report for patient {patient_id} ({patient_data['total_scans']} scans)...")
    report = call_gemini_sync(prompt)

    # Step 4: Wrap with metadata
    is_fallback = report.get("_fallback", False)

    return {
        "patient": patient_data["patient"],
        "report": report,
        "raw_data": {
            "systems_summary": {
                system_key: {
                    "name": sd["system_info"].get("name_es", system_key),
                    "icon": sd["system_info"].get("icon", "🔬"),
                    "total_scans": sd["total_scans"],
                    "critical": sd["critical_count"],
                    "warnings": sd["warning_count"],
                    "organs": list(sd["organs"].keys()),
                }
                for system_key, sd in patient_data["systems"].items()
            },
            "sessions": patient_data["sessions"],
        },
        "metadata": {
            "ai_generated": not is_fallback,
            "model": GEMINI_MODEL if not is_fallback else "fallback",
            "language": language,
            "scans_analyzed": patient_data["total_scans"],
            "diagnostic_logs_used": patient_data["total_diagnostic_logs"],
            "generated_at": datetime.now().isoformat(),
        }
    }


# ──────────────────────────────────────
# PDF Report Generator
# ──────────────────────────────────────
def generate_pdf_report(patient_id: str, language: str = "es") -> bytes:
    """Generate a professional PDF from the AI report."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    import io

    # Generate the AI report first
    result = generate_narrative_report(patient_id, language)
    if "error" in result:
        return None

    patient = result["patient"]
    report = result["report"]
    metadata = result["metadata"]

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch)
    elements = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle('VTitle', parent=styles['Title'],
                                  fontSize=20, textColor=colors.HexColor('#6d28d9'),
                                  spaceAfter=6)
    subtitle_style = ParagraphStyle('VSubtitle', parent=styles['Normal'],
                                     fontSize=10, textColor=colors.HexColor('#6b7280'),
                                     spaceAfter=12)
    heading_style = ParagraphStyle('VHeading', parent=styles['Heading2'],
                                    fontSize=14, textColor=colors.HexColor('#1e1b4b'),
                                    spaceBefore=16, spaceAfter=8)
    body_style = ParagraphStyle('VBody', parent=styles['Normal'],
                                 fontSize=10, leading=14, spaceAfter=8)
    finding_critical = ParagraphStyle('VCritical', parent=body_style,
                                       textColor=colors.HexColor('#dc2626'))
    finding_warning = ParagraphStyle('VWarning', parent=body_style,
                                      textColor=colors.HexColor('#d97706'))

    # ── Header ──
    elements.append(Paragraph("Vibrana — Reporte de Biorresonancia NLS", title_style))
    elements.append(Paragraph(
        f"Paciente: <b>{patient['name']}</b> | Edad: {patient['age']} | Género: {patient['gender']}<br/>"
        f"Generado: {report.get('fecha_generacion', 'N/A')} | "
        f"Escaneos analizados: {metadata.get('scans_analyzed', 0)} | "
        f"{'🤖 AI Report' if metadata.get('ai_generated') else '📊 Data Report'}",
        subtitle_style
    ))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e5e7eb')))
    elements.append(Spacer(1, 12))

    # ── Health Score ──
    score = report.get("puntuacion_salud", 0)
    estado = report.get("estado_general", "pendiente")
    score_color = (
        '#22c55e' if score >= 75 else
        '#eab308' if score >= 50 else
        '#f97316' if score >= 25 else '#ef4444'
    )
    elements.append(Paragraph(
        f'<font size="24" color="{score_color}"><b>{score}/100</b></font> '
        f'<font size="12"> — Estado General: <b>{estado.upper()}</b></font>',
        body_style
    ))
    elements.append(Spacer(1, 8))

    # ── Executive Summary ──
    elements.append(Paragraph("Resumen Ejecutivo", heading_style))
    elements.append(Paragraph(report.get("resumen_ejecutivo", "Sin resumen disponible."), body_style))

    # ── Key Findings ──
    findings = report.get("hallazgos_principales", [])
    if findings:
        elements.append(Paragraph("Hallazgos Principales", heading_style))
        for f in findings:
            severity = f.get("severidad", "normal")
            style = finding_critical if severity in ("severo", "critico") else \
                    finding_warning if severity == "moderado" else body_style
            organs = ", ".join(f.get("organos_afectados", []))
            elements.append(Paragraph(
                f'<b>[{severity.upper()}]</b> {f.get("sistema", "")}: '
                f'{f.get("hallazgo", "")} ({organs})',
                style
            ))

    # ── System Analysis ──
    systems_analysis = report.get("analisis_por_sistema", [])
    if systems_analysis:
        elements.append(Paragraph("Análisis por Sistema Corporal", heading_style))
        for system in systems_analysis:
            icon = system.get("icono", "🔬")
            estado_sys = system.get("estado", "normal")
            elements.append(Paragraph(
                f'<b>{icon} {system.get("sistema", "Sistema")}</b> — '
                f'<i>{estado_sys}</i>',
                ParagraphStyle('SysHead', parent=body_style, fontSize=11,
                               textColor=colors.HexColor('#1e1b4b'), spaceBefore=10)
            ))
            elements.append(Paragraph(system.get("descripcion", ""), body_style))

            # Organ table
            organs = system.get("organos", [])
            if organs:
                table_data = [["Órgano", "Estado", "Entropía", "Tendencia"]]
                for org in organs:
                    trend_map = {"mejorando": "📈", "estable": "➡️", "empeorando": "📉"}
                    table_data.append([
                        org.get("nombre", ""),
                        org.get("estado", ""),
                        str(org.get("entropia_predominante", "")),
                        f'{trend_map.get(org.get("tendencia", ""), "➡️")} {org.get("tendencia", "")}',
                    ])
                t = Table(table_data, colWidths=[2.5 * inch, 1.5 * inch, 1 * inch, 1.5 * inch])
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2a2a3c')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
                ]))
                elements.append(t)
                elements.append(Spacer(1, 4))

    # ── Clinical Correlations ──
    correlations = report.get("correlaciones_clinicas", [])
    if correlations:
        elements.append(Paragraph("Correlaciones Clínicas", heading_style))
        for c in correlations:
            elements.append(Paragraph(f"• {c}", body_style))

    # ── Recommendations ──
    recs = report.get("recomendaciones", [])
    if recs:
        elements.append(Paragraph("Recomendaciones", heading_style))
        for r in recs:
            prio = r.get("prioridad", "media")
            prio_icon = {"alta": "🔴", "media": "🟡", "baja": "🟢"}.get(prio, "⚪")
            elements.append(Paragraph(
                f'{prio_icon} <b>[{prio.upper()}]</b> {r.get("descripcion", "")}',
                body_style
            ))

    # ── Next Control ──
    next_ctrl = report.get("proximo_control", "")
    if next_ctrl:
        elements.append(Spacer(1, 12))
        elements.append(Paragraph(f"📅 <b>Próximo Control:</b> {next_ctrl}", body_style))

    # ── Legal Note ──
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#d1d5db')))
    elements.append(Paragraph(
        report.get("nota_legal", "Este reporte no constituye un diagnóstico médico."),
        ParagraphStyle('Legal', parent=body_style, fontSize=7, textColor=colors.HexColor('#9ca3af'))
    ))
    elements.append(Paragraph(
        f"Generado por Vibrana v2.0 | Modelo: {metadata.get('model', 'N/A')} | "
        f"{metadata.get('generated_at', '')}",
        ParagraphStyle('Footer', parent=body_style, fontSize=7, textColor=colors.HexColor('#d1d5db'))
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
