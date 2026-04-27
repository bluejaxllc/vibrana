"""
Vibrana Element Detector — Screen-level UI element detection.
Uses OpenCV contour detection + OCR to find interactive elements
(buttons, close buttons, arrows, inputs, checkboxes) on screen.
"""
import os
import base64
import time
import numpy as np
import mss

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import pytesseract
except ImportError:
    pytesseract = None


# ─── Classification helpers ───

ARROW_CHARS = set('▶◀▲▼→←↑↓►◄⏵⏴⏶⏷>><<')
CLOSE_CHARS = set('X✕✖✗×✘')

def _classify_element(label, w, h):
    """Classify a detected region by its OCR label and geometry."""
    text = label.strip()
    ratio = w / max(h, 1)

    # Close / X button: small, squarish, contains X-like character
    if w < 60 and h < 60 and ratio > 0.5 and ratio < 2.0:
        if any(c in CLOSE_CHARS for c in text) or text.upper() in ('X', 'CLOSE', 'CERRAR'):
            return 'close'

    # Arrow / navigation
    if any(c in ARROW_CHARS for c in text):
        return 'arrow'
    if text.lower() in ('next', 'prev', 'back', 'forward', 'siguiente', 'anterior', 'atrás'):
        return 'arrow'

    # Checkbox
    if any(c in text for c in '☐☑☒✓✔') or text.lower() in ('check', 'uncheck'):
        return 'checkbox'

    # Input field: wide, shallow, little or no text
    if ratio > 3.0 and h < 50 and len(text) < 3:
        return 'input'

    # Button: has text, reasonable size, has border (we detect these by contour)
    if len(text) > 0 and w > 25 and h > 15:
        return 'button'

    # Small icon or unknown
    if w < 40 and h < 40:
        return 'icon'

    return 'unknown'


def _img_to_base64(img, quality=75):
    """Convert BGR numpy image to base64 JPEG."""
    if cv2 is None:
        return ""
    _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode('utf-8')


import re

def _clean_ocr_text(text):
    """Clean garbled OCR text by removing excessive symbols and noise."""
    # Keep alphanumeric, spaces, and essential punctuation
    cleaned = re.sub(r'[^\w\s\-\.▶◀▲▼→←↑↓►◄>><<]', '', text)
    # Remove isolated random characters if they constitute the entire string
    if len(cleaned.strip()) < 2 and not any(c in ARROW_CHARS for c in cleaned):
        return ""
    return cleaned.strip()

def _ocr_region(img):
    """Run OCR on a small image region. Returns text."""
    if pytesseract is None or cv2 is None:
        return ""
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Try both normal and inverted threshold
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        text1 = pytesseract.image_to_string(thresh, config='--psm 7 -l spa+eng').strip()
        inv = cv2.bitwise_not(thresh)
        text2 = pytesseract.image_to_string(inv, config='--psm 7 -l spa+eng').strip()
        
        best_text = text1 if len(text1) >= len(text2) else text2
        return _clean_ocr_text(best_text)
    except Exception:
        return ""


def _merge_overlapping(boxes, overlap_thresh=0.4):
    """Merge overlapping bounding boxes using non-maximum suppression."""
    if len(boxes) == 0:
        return []

    # Convert to numpy
    rects = np.array([[b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']] for b in boxes], dtype=float)
    pick = []

    x1, y1, x2, y2 = rects[:, 0], rects[:, 1], rects[:, 2], rects[:, 3]
    area = (x2 - x1) * (y2 - y1)
    idxs = np.argsort(area)

    while len(idxs) > 0:
        last = len(idxs) - 1
        i = idxs[last]
        pick.append(i)

        xx1 = np.maximum(x1[i], x1[idxs[:last]])
        yy1 = np.maximum(y1[i], y1[idxs[:last]])
        xx2 = np.minimum(x2[i], x2[idxs[:last]])
        yy2 = np.minimum(y2[i], y2[idxs[:last]])

        w = np.maximum(0, xx2 - xx1)
        h = np.maximum(0, yy2 - yy1)
        overlap = (w * h) / area[idxs[:last]]

        suppress = np.concatenate(([last], np.where(overlap > overlap_thresh)[0]))
        idxs = np.delete(idxs, suppress)

    return [boxes[i] for i in pick]


# ─── Monitor helpers ───

def list_monitors():
    """List all available monitors with resolution info."""
    with mss.mss() as sct:
        monitors = []
        for i, m in enumerate(sct.monitors):
            if i == 0:
                monitors.append({'index': 0, 'label': f'Todas las pantallas ({m["width"]}x{m["height"]})', 'width': m['width'], 'height': m['height']})
            else:
                monitors.append({'index': i, 'label': f'Pantalla {i} ({m["width"]}x{m["height"]})', 'width': m['width'], 'height': m['height']})
        return {'monitors': monitors, 'count': len(monitors)}


# ─── Main detection ───

def detect_elements(monitor_idx=1):
    """
    Capture screen and detect all interactive UI elements.
    Returns: {elements: [...], screenshot: base64, width, height}
    """
    if cv2 is None:
        return {"error": "OpenCV not available", "elements": []}

    # Capture screen
    with mss.mss() as sct:
        if monitor_idx >= len(sct.monitors):
            monitor_idx = 1
        monitor = sct.monitors[monitor_idx]
        shot = sct.grab(monitor)
        screen = np.array(shot)
        screen = cv2.cvtColor(screen, cv2.COLOR_BGRA2BGR)

    screen_h, screen_w = screen.shape[:2]
    max_area = screen_w * screen_h * 0.6  # skip regions > 60% of screen

    # Edge detection
    gray = cv2.cvtColor(screen, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 30, 120)

    # Dilate to close gaps in edges
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(edges, kernel, iterations=1)

    # Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Also try MSER for text regions
    raw_boxes = []

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)

        # Filter by size
        area = w * h
        if area < 300:  # too small (< ~20x15)
            continue
        if area > max_area:  # too large
            continue
        if w < 20 or h < 12:  # too narrow/short
            continue
        if w > screen_w * 0.8:  # almost full width = probably not a button
            continue

        # Check rectangularity (contour area vs bounding rect area)
        contour_area = cv2.contourArea(contour)
        rect_area = w * h
        if rect_area > 0 and contour_area / rect_area < 0.3:
            continue  # too irregular

        raw_boxes.append({'x': x, 'y': y, 'w': w, 'h': h})

    # Merge overlapping boxes
    merged = _merge_overlapping(raw_boxes)

    # OCR each region and classify
    elements = []
    for i, box in enumerate(merged):
        x, y, w, h = box['x'], box['y'], box['w'], box['h']

        # Extract region from screen
        region = screen[y:y+h, x:x+w]
        if region.size == 0:
            continue

        # OCR the region
        label = _ocr_region(region)

        # Classify
        elem_type = _classify_element(label, w, h)

        # Skip unknown elements with no text (noise)
        if elem_type == 'unknown' and len(label) < 2:
            continue

        # Get a small thumbnail
        thumb = _img_to_base64(region, quality=60)

        elements.append({
            'id': f'elem_{i}',
            'type': elem_type,
            'label': label[:60],  # truncate long labels
            'region': {'x': x, 'y': y, 'w': w, 'h': h},
            'center': {'x': x + w // 2, 'y': y + h // 2},
            'thumbnail': thumb,
        })

    # Sort by y then x (top-to-bottom, left-to-right)
    elements.sort(key=lambda e: (e['region']['y'], e['region']['x']))

    # Re-index
    for i, e in enumerate(elements):
        e['id'] = f'elem_{i}'

    # Generate annotated screenshot
    annotated = _draw_annotations(screen.copy(), elements)
    screenshot_b64 = _img_to_base64(annotated, quality=70)

    return {
        'elements': elements,
        'screenshot': screenshot_b64,
        'width': screen_w,
        'height': screen_h,
        'count': len(elements),
        'monitor_idx': monitor_idx,
    }


def detect_elements_in_region(region):
    """Detect elements in a specific screen region only."""
    if cv2 is None:
        return {"error": "OpenCV not available", "elements": []}

    with mss.mss() as sct:
        monitor = {
            "top": region["y"], "left": region["x"],
            "width": region["w"], "height": region["h"],
        }
        shot = sct.grab(monitor)
        screen = np.array(shot)
        screen = cv2.cvtColor(screen, cv2.COLOR_BGRA2BGR)

    # Run same detection pipeline on the cropped region
    result = _detect_on_image(screen)

    # Offset coordinates back to absolute screen position
    for elem in result.get('elements', []):
        elem['region']['x'] += region['x']
        elem['region']['y'] += region['y']
        elem['center']['x'] += region['x']
        elem['center']['y'] += region['y']

    return result


def _detect_on_image(image):
    """Run element detection on an already-captured image."""
    h, w = image.shape[:2]
    max_area = w * h * 0.6

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 30, 120)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(edges, kernel, iterations=1)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    raw_boxes = []
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area = bw * bh
        if area < 300 or area > max_area or bw < 20 or bh < 12:
            continue
        contour_area = cv2.contourArea(contour)
        if area > 0 and contour_area / area < 0.3:
            continue
        raw_boxes.append({'x': x, 'y': y, 'w': bw, 'h': bh})

    merged = _merge_overlapping(raw_boxes)
    elements = []
    for i, box in enumerate(merged):
        region = image[box['y']:box['y']+box['h'], box['x']:box['x']+box['w']]
        if region.size == 0:
            continue
        label = _ocr_region(region)
        elem_type = _classify_element(label, box['w'], box['h'])
        if elem_type == 'unknown' and len(label) < 2:
            continue
        elements.append({
            'id': f'elem_{i}',
            'type': elem_type,
            'label': label[:60],
            'region': dict(box),
            'center': {'x': box['x'] + box['w'] // 2, 'y': box['y'] + box['h'] // 2},
            'thumbnail': _img_to_base64(region, 60),
        })

    elements.sort(key=lambda e: (e['region']['y'], e['region']['x']))
    annotated = _draw_annotations(image.copy(), elements)

    return {
        'elements': elements,
        'screenshot': _img_to_base64(annotated, 70),
        'width': w, 'height': h,
        'count': len(elements),
    }


# ─── Annotation drawing ───

TYPE_COLORS = {
    'button':   (186, 92, 139),   # purple (BGR)
    'close':    (68, 68, 239),    # red
    'arrow':    (0, 215, 255),    # yellow
    'input':    (230, 160, 60),   # blue
    'checkbox': (120, 200, 80),   # green
    'icon':     (180, 180, 180),  # gray
    'unknown':  (140, 140, 140),  # dark gray
}

def _draw_annotations(image, elements):
    """Draw colored bounding boxes + labels on the image."""
    for elem in elements:
        r = elem['region']
        color = TYPE_COLORS.get(elem['type'], (140, 140, 140))
        x, y, w, h = r['x'], r['y'], r['w'], r['h']

        # Draw rectangle
        cv2.rectangle(image, (x, y), (x + w, y + h), color, 2)

        # Draw semi-transparent fill
        overlay = image.copy()
        cv2.rectangle(overlay, (x, y), (x + w, y + h), color, -1)
        cv2.addWeighted(overlay, 0.12, image, 0.88, 0, image)

        # Draw label badge
        badge_text = f"{elem['type']}: {elem['label'][:25]}" if elem['label'] else elem['type']
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.4
        (tw, th), _ = cv2.getTextSize(badge_text, font, font_scale, 1)
        badge_y = max(y - 4, th + 6)
        cv2.rectangle(image, (x, badge_y - th - 4), (x + tw + 6, badge_y + 2), color, -1)
        cv2.putText(image, badge_text, (x + 3, badge_y - 2), font, font_scale, (255, 255, 255), 1, cv2.LINE_AA)

    return image


# ─── Template management ───

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'macros', 'templates')

def capture_element_template(region, name):
    """Save a screen region as a PNG template for future matching."""
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    with mss.mss() as sct:
        monitor = {
            "top": region["y"], "left": region["x"],
            "width": region["w"], "height": region["h"],
        }
        shot = sct.grab(monitor)
        img = np.array(shot)
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    filepath = os.path.join(TEMPLATES_DIR, f"{name}.png")
    cv2.imwrite(filepath, img)
    return {
        "status": "saved",
        "name": name,
        "path": filepath,
        "thumbnail": _img_to_base64(img, 60),
    }
