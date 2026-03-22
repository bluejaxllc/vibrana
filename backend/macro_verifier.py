"""
Vibrana Macro Verifier — OCR + AI verification for smart macro playback.
Uses mss (screen capture), Tesseract (OCR), OpenCV (template matching),
and Gemini (AI verification) to validate each macro step.
"""
import os
import re
import time
import base64
import mss
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import pytesseract
except ImportError:
    pytesseract = None


def _capture_region(region):
    """
    Capture a screen region and return as numpy array (BGR).
    region: dict with keys x, y, w, h (screen coordinates).
    """
    with mss.mss() as sct:
        monitor = {
            "top": region["y"],
            "left": region["x"],
            "width": region["w"],
            "height": region["h"],
        }
        shot = sct.grab(monitor)
        img = np.array(shot)
        # mss returns BGRA, convert to BGR
        return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR) if cv2 else img


def _capture_full_screen():
    """Capture the entire primary monitor."""
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # Primary monitor
        shot = sct.grab(monitor)
        img = np.array(shot)
        return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR) if cv2 else img, monitor


def _img_to_base64(img):
    """Convert a BGR numpy image to base64-encoded JPEG."""
    if cv2 is None:
        return ""
    _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buf).decode('utf-8')


def _ocr_image(img):
    """Run Tesseract OCR on a BGR image. Returns extracted text."""
    if pytesseract is None or cv2 is None:
        return ""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Preprocessing: threshold for better OCR on dark backgrounds
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Try both normal and inverted
    text_normal = pytesseract.image_to_string(thresh, lang='spa+eng').strip()
    inv = cv2.bitwise_not(thresh)
    text_inv = pytesseract.image_to_string(inv, lang='spa+eng').strip()
    return text_normal if len(text_normal) >= len(text_inv) else text_inv


def verify_text_in_region(region, expected, timeout=10):
    """
    OCR a screen region and check if expected text is present.
    Returns: {success: bool, found_text: str, screenshot: base64}
    """
    deadline = time.time() + timeout
    last_text = ""
    while time.time() < deadline:
        img = _capture_region(region)
        text = _ocr_image(img)
        last_text = text
        if expected.lower() in text.lower():
            return {
                "success": True,
                "found_text": text,
                "expected": expected,
                "screenshot": _img_to_base64(img),
            }
        time.sleep(0.5)

    img = _capture_region(region)
    return {
        "success": False,
        "found_text": last_text,
        "expected": expected,
        "screenshot": _img_to_base64(img),
        "error": f"Expected '{expected}' not found. Got: '{last_text[:100]}'"
    }


def verify_result_in_region(region, pattern, timeout=15):
    """
    OCR a region and check if a regex pattern matches.
    Returns: {success: bool, found_text: str, matches: list}
    """
    deadline = time.time() + timeout
    last_text = ""
    while time.time() < deadline:
        img = _capture_region(region)
        text = _ocr_image(img)
        last_text = text
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return {
                "success": True,
                "found_text": text,
                "pattern": pattern,
                "matches": matches,
                "screenshot": _img_to_base64(img),
            }
        time.sleep(0.5)

    img = _capture_region(region)
    return {
        "success": False,
        "found_text": last_text,
        "pattern": pattern,
        "matches": [],
        "screenshot": _img_to_base64(img),
        "error": f"Pattern '{pattern}' not matched in: '{last_text[:100]}'"
    }


def wait_for_text_on_screen(text, region=None, timeout=60, poll_interval=1.0):
    """
    Pause until OCR detects target text. If region is None, scans full screen.
    Returns: {success: bool, found_text: str, elapsed: float}
    """
    start = time.time()
    deadline = start + timeout
    while time.time() < deadline:
        if region:
            img = _capture_region(region)
        else:
            img, _ = _capture_full_screen()
        ocr_text = _ocr_image(img)
        if text.lower() in ocr_text.lower():
            return {
                "success": True,
                "found_text": ocr_text,
                "target": text,
                "elapsed": round(time.time() - start, 1),
                "screenshot": _img_to_base64(img),
            }
        time.sleep(poll_interval)

    if region:
        img = _capture_region(region)
    else:
        img, _ = _capture_full_screen()
    return {
        "success": False,
        "found_text": _ocr_image(img),
        "target": text,
        "elapsed": round(time.time() - start, 1),
        "screenshot": _img_to_base64(img),
        "error": f"Text '{text}' not found after {timeout}s"
    }


def verify_button_template(template_path, threshold=0.8, timeout=10):
    """
    Template matching — finds a saved button image on screen.
    Returns: {success: bool, location: {x, y}, confidence: float}
    """
    if cv2 is None:
        return {"success": False, "error": "OpenCV not available"}
    if not os.path.exists(template_path):
        return {"success": False, "error": f"Template not found: {template_path}"}

    template = cv2.imread(template_path)
    if template is None:
        return {"success": False, "error": f"Could not load template: {template_path}"}

    th, tw = template.shape[:2]
    deadline = time.time() + timeout

    while time.time() < deadline:
        screen, monitor = _capture_full_screen()
        result = cv2.matchTemplate(screen, template, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)

        if max_val >= threshold:
            cx = max_loc[0] + tw // 2
            cy = max_loc[1] + th // 2
            return {
                "success": True,
                "location": {"x": cx, "y": cy},
                "confidence": round(float(max_val), 3),
                "screenshot": _img_to_base64(screen),
            }
        time.sleep(0.5)

    screen, _ = _capture_full_screen()
    return {
        "success": False,
        "confidence": round(float(max_val), 3),
        "threshold": threshold,
        "screenshot": _img_to_base64(screen),
        "error": f"Button template not found (best confidence: {max_val:.3f} < {threshold})"
    }


def find_text_on_screen(text, timeout=5):
    """
    Full-screen OCR search for a text string. Returns the bounding box if found.
    Useful for re-locating UI elements that have moved.
    """
    if pytesseract is None or cv2 is None:
        return {"success": False, "error": "OCR dependencies not available"}

    deadline = time.time() + timeout
    while time.time() < deadline:
        screen, monitor = _capture_full_screen()
        gray = cv2.cvtColor(screen, cv2.COLOR_BGR2GRAY)
        data = pytesseract.image_to_data(gray, lang='spa+eng', output_type=pytesseract.Output.DICT)

        # Search through OCR results for the target text
        words = data['text']
        for i, word in enumerate(words):
            if text.lower() in str(word).lower() and data['conf'][i] > 30:
                x = data['left'][i]
                y = data['top'][i]
                w = data['width'][i]
                h = data['height'][i]
                return {
                    "success": True,
                    "location": {"x": x + w // 2, "y": y + h // 2},
                    "region": {"x": x, "y": y, "w": w, "h": h},
                    "confidence": data['conf'][i],
                }
        time.sleep(0.5)

    return {"success": False, "error": f"Text '{text}' not found on screen"}


def ai_verify_region(region, question, timeout=30):
    """
    Send a screenshot region to Gemini with a natural language question.
    Returns: {success: bool, answer: str}
    """
    try:
        import google.generativeai as genai
        from dotenv import load_dotenv
        load_dotenv()
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            return {"success": False, "error": "GEMINI_API_KEY not set"}

        genai.configure(api_key=api_key)

        img = _capture_region(region)
        _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        img_bytes = buf.tobytes()

        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content([
            {
                "mime_type": "image/jpeg",
                "data": img_bytes,
            },
            f"""You are verifying a macro automation step. Answer this question about the screenshot:

{question}

Reply with a JSON object: {{"answer": "yes" or "no", "confidence": 0.0-1.0, "explanation": "brief reason"}}
Only output the JSON, nothing else."""
        ])

        import json
        try:
            result = json.loads(response.text.strip().replace('```json', '').replace('```', '').strip())
            is_yes = result.get('answer', '').lower() in ('yes', 'sí', 'si', 'true')
            return {
                "success": is_yes,
                "answer": result.get('answer', ''),
                "confidence": result.get('confidence', 0),
                "explanation": result.get('explanation', ''),
                "screenshot": _img_to_base64(img),
            }
        except (json.JSONDecodeError, Exception):
            return {
                "success": False,
                "answer": response.text[:200],
                "screenshot": _img_to_base64(img),
                "error": "Could not parse AI response"
            }

    except ImportError:
        return {"success": False, "error": "google-generativeai not installed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def capture_screenshot(label="screenshot"):
    """Capture full screen and return as base64 with label."""
    screen, monitor = _capture_full_screen()
    return {
        "success": True,
        "label": label,
        "width": monitor["width"],
        "height": monitor["height"],
        "screenshot": _img_to_base64(screen),
    }


def ocr_region(region):
    """One-shot OCR a region and return the text. Used by the UI for setting up steps."""
    img = _capture_region(region)
    text = _ocr_image(img)
    return {
        "text": text,
        "screenshot": _img_to_base64(img),
    }
