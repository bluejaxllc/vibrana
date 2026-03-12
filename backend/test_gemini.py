import os
import requests
import json
import json
import pypdf

file_path = "c:/Users/edgar/Downloads/Maria del Carmen.pdf"
reader = pypdf.PdfReader(file_path)
text = ""
for page in reader.pages:
    text += page.extract_text() + "\n"

prompt = f"""Eres un ingeniero cuántico y experto clínico en biorresonancia NLS (Instituto de Psicofísica Práctica de Omsk), y utilizas la Escala de Fleindler y la Lógica Cuanto-Entrópica. 
Analiza este texto extraído del escaneo NLS del paciente.
Reglas estrictas de CSS (D-Value):
- CSS < 0.425 es patología aguda/activa.
- CSS 0.425 a 0.750 es sub-agudo.

Identifica las patologías agudas e Inversiones de Campos de Torsión.
Cruza estos hallazgos (usando resonancia espectral) con:
1. Homeopatía (Materia Médica de Boericke)
2. Fitoterapia (Electroherbalism / Índices vibracionales de plantas)
3. Radiónica (David V. Tansley)

Crea un 'Protocolo Calendarizado' detallado.

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido (sin formato markdown en el contenedor del JSON) que contenga la siguiente estructura exacta:
{{
  "status": "success",
  "report_markdown": "# Reporte Completo en Markdown\\nEscribe todo el reporte detallado aquí usando markdown, con ### para encabezados, listas, etc.",
  "scorecard": [
    {{
      "sistema": "Nombre del Sistema/Órgano",
      "hallazgo": "Descripción corta del problema agudo",
      "severidad": "critico"
    }}
  ]
}}

Nota sobre scorecard: Extrae estrictamente los 3 hallazgos más críticos (CSS < 0.425) para poblar el arreglo JSON. Si hay menos de 3, incluye los que haya.

TEXTO DEL ESCANEO:
{text[:8000]}
"""

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
print(f"API Key present: {bool(GEMINI_API_KEY)}")
GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
url = f"{GEMINI_URL}?key={GEMINI_API_KEY}"
payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {
        "temperature": 0.3,
        "maxOutputTokens": 4096
    }
}

try:
    resp = requests.post(url, json=payload, timeout=30)
    print("Status code:", resp.status_code)
    data = resp.json()
    if resp.status_code == 200:
        finish_reason = data["candidates"][0].get("finishReason", "UNKNOWN")
        print("Finish Reason:", finish_reason)
        text_resp = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        with open('raw_gemini_output.txt', 'w', encoding='utf-8') as f:
            f.write(text_resp)
        print("Wrote raw response to raw_gemini_output.txt")
        parsed = json.loads(text_resp)
        print("Parsed keys:", parsed.keys())
    else:
        print("Error text:", resp.text)
except Exception as e:
    print("Exception occurred:", str(e))
