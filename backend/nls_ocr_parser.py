"""
Vibrana NLS OCR Parser — Smart Text Extraction for NLS Software

The NLS (Non-Linear System) bioresonance software displays:
  - Organ/body section names with numerical codes (e.g., "9.1.203")
  - Entropy levels (1-6 scale, shown as colored markers)
  - Frequency measurements and spectral data
  - Compensatory reserve percentages
  - Current organ/view title in the header

This module provides NLS-aware OCR that:
  1. Detects the NLS application window region automatically
  2. Extracts the data table with organ readings
  3. Parses structured data: codes, organ names, values
  4. Reads the header/title to identify the current organ view
  5. Reads the status bar for reserve/strength values
"""
import re
import cv2
import numpy as np
import pytesseract
import os

# Configure Tesseract path
tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.exists(tesseract_path):
    pytesseract.pytesseract.tesseract_cmd = tesseract_path


class NLSOCRParser:
    """NLS-specific OCR with smart region detection and structured parsing."""

    # Known NLS organ/section keywords for validation
    NLS_KEYWORDS = [
        'longitudinal', 'section', 'horizontal', 'transverse', 'cross',
        'head', 'heart', 'liver', 'kidney', 'lung', 'stomach', 'spleen',
        'pancreas', 'intestine', 'colon', 'bladder', 'thyroid', 'brain',
        'thoracic', 'cervical', 'lumbar', 'vertebra', 'vertebrae',
        'artery', 'vein', 'nerve', 'node', 'lymph', 'gland',
        'cortex', 'medulla', 'parenchyma', 'capsule', 'hilum',
        'pelvis', 'ureter', 'adrenal', 'prostate', 'uterus', 'ovary',
        'esophagus', 'trachea', 'bronchi', 'alveoli', 'pleura',
        'myocardium', 'endocardium', 'pericardium', 'aorta',
        'duodenum', 'jejunum', 'ileum', 'cecum', 'appendix', 'rectum',
        'gallbladder', 'bile', 'hepatic', 'portal',
        'frequency', 'entropy', 'spectrum', 'etalon', 'research',
        'compensatory', 'reserve', 'strengthening', 'weakening',
        'pathology', 'disorder', 'normal', 'dysfunction',
        'nidal', 'point', 'analysis', 'diagnostic',
    ]

    # Regex for NLS data row: "9.1.203  LONGITUDINAL SECTION OF..."
    ROW_PATTERN = re.compile(
        r'(\d{1,2}\.\d{1,2}\.\d{1,4})\s+(.+)',
        re.IGNORECASE
    )

    # Regex for percentage values: "reserve 17%"
    PERCENT_PATTERN = re.compile(r'(\d{1,3})\s*%')

    # Regex for frequency values
    FREQ_PATTERN = re.compile(r'(\d+\.?\d*)\s*(Hz|MHz|GHz|khz)', re.IGNORECASE)

    def __init__(self):
        self.last_raw_text = ""
        self.last_parsed = {}

    # ─────────────────────────────────────────
    # REGION DETECTION
    # ─────────────────────────────────────────

    def find_nls_window_region(self, frame):
        """
        Detect the NLS application window area in the screen capture.
        The NLS software typically has:
          - A dark or green-tinted background
          - A data table area with text on dark bg
          - An organ visualization area
        Returns (x, y, w, h) of the detected region, or None for full frame.
        """
        h, w = frame.shape[:2]

        # Strategy 1: Find the largest contiguous area with the NLS green/dark color scheme
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        # NLS software typically uses dark backgrounds with green/teal accents
        # Look for large dark regions (the NLS window background)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Find regions that look like an application window (not too bright, not pure black)
        # NLS software backgrounds are typically in the 20-80 brightness range
        mask = cv2.inRange(gray, 15, 120)

        # Morphological operations to connect nearby regions
        kernel = np.ones((20, 20), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        # Find the largest contour (likely the NLS window)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if contours:
            # Filter for large rectangles — at least 20% of screen
            min_area = h * w * 0.2
            large_contours = [c for c in contours if cv2.contourArea(c) > min_area]

            if large_contours:
                # Get the bounding rect of the largest one
                largest = max(large_contours, key=cv2.contourArea)
                x, y, cw, ch = cv2.boundingRect(largest)
                # Add small padding
                x = max(0, x - 5)
                y = max(0, y - 5)
                cw = min(w - x, cw + 10)
                ch = min(h - y, ch + 10)
                return (x, y, cw, ch)

        return None

    def find_data_table_region(self, nls_frame):
        """
        Within the NLS window, find the data table area.
        The data table typically appears as a region with many horizontal lines
        of text on a dark background (green/black).
        """
        h, w = nls_frame.shape[:2]

        # The data table in NLS is usually in the right half or center-right
        # and takes up the middle vertical third
        # We'll use edge detection to find text-dense regions

        gray = cv2.cvtColor(nls_frame, cv2.COLOR_BGR2GRAY)

        # Look for text-dense regions using edge detection
        edges = cv2.Canny(gray, 50, 150)

        # Horizontal projection — sum of edges per row
        h_proj = np.sum(edges, axis=1)

        # Find rows with significant text (edge density)
        threshold = np.max(h_proj) * 0.15
        text_rows = np.where(h_proj > threshold)[0]

        if len(text_rows) > 10:
            # Find the vertical extent of the text region
            y_start = text_rows[0]
            y_end = text_rows[-1]

            # Vertical projection in that row range — find horizontal extent
            v_proj = np.sum(edges[y_start:y_end, :], axis=0)
            v_threshold = np.max(v_proj) * 0.1
            text_cols = np.where(v_proj > v_threshold)[0]

            if len(text_cols) > 10:
                x_start = text_cols[0]
                x_end = text_cols[-1]

                # Add padding
                pad = 10
                x_start = max(0, x_start - pad)
                y_start = max(0, y_start - pad)
                x_end = min(w, x_end + pad)
                y_end = min(h, y_end + pad)

                return (x_start, y_start, x_end - x_start, y_end - y_start)

        return None

    # ─────────────────────────────────────────
    # IMAGE PREPROCESSING FOR OCR
    # ─────────────────────────────────────────

    def preprocess_for_ocr(self, image, mode='auto'):
        """
        Enhanced preprocessing for NLS software screenshots.
        NLS typically shows light/colored text on dark backgrounds.
        """
        if image is None or image.size == 0:
            return None

        # Upscale small images for better OCR
        h, w = image.shape[:2]
        if w < 800:
            scale = 800 / w
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        if mode == 'dark_bg':
            # NLS has light text on dark background — invert for OCR
            # Increase contrast first
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            # Invert so text is dark on light bg (what Tesseract expects)
            inverted = cv2.bitwise_not(enhanced)
            # Adaptive threshold
            binary = cv2.adaptiveThreshold(
                inverted, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 15, 5
            )
            return binary

        elif mode == 'light_bg':
            # Standard: dark text on light background
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            return binary

        else:
            # Auto-detect: check mean brightness
            mean_brightness = np.mean(gray)
            if mean_brightness < 128:
                return self.preprocess_for_ocr(image, mode='dark_bg')
            else:
                return self.preprocess_for_ocr(image, mode='light_bg')

    # ─────────────────────────────────────────
    # TEXT EXTRACTION
    # ─────────────────────────────────────────

    def extract_text(self, image, lang='eng', config=''):
        """Extract raw text with enhanced preprocessing."""
        processed = self.preprocess_for_ocr(image)
        if processed is None:
            return ""

        # Use PSM 6 (assume uniform block of text) for table data
        ocr_config = f'--psm 6 --oem 3 {config}'
        try:
            text = pytesseract.image_to_string(processed, lang=lang, config=ocr_config)
            return text.strip()
        except Exception as e:
            print(f"[NLS OCR] Error: {e}")
            return ""

    def extract_header(self, nls_frame):
        """Extract the organ/view title from the top of the NLS window."""
        h, w = nls_frame.shape[:2]
        # Header is typically in the top 12% of the NLS window
        header_region = nls_frame[0:int(h * 0.12), :]

        processed = self.preprocess_for_ocr(header_region)
        if processed is None:
            return ""

        try:
            text = pytesseract.image_to_string(processed, config='--psm 7 --oem 3')
            return text.strip()
        except Exception:
            return ""

    def extract_status_bar(self, nls_frame):
        """Extract the status bar text from the bottom of the NLS window."""
        h, w = nls_frame.shape[:2]
        # Status bar is in the bottom 8%
        status_region = nls_frame[int(h * 0.90):, :]

        processed = self.preprocess_for_ocr(status_region)
        if processed is None:
            return ""

        try:
            text = pytesseract.image_to_string(processed, config='--psm 7 --oem 3')
            return text.strip()
        except Exception:
            return ""

    # ─────────────────────────────────────────
    # STRUCTURED NLS DATA PARSING
    # ─────────────────────────────────────────

    def parse_nls_data(self, raw_text):
        """
        Parse raw OCR text into structured NLS data.
        Extracts: organ codes, names, frequency values, reserve percentages.
        """
        if not raw_text:
            return {"rows": [], "percentages": [], "frequencies": [], "keywords_found": []}

        lines = raw_text.split('\n')
        rows = []
        percentages = []
        frequencies = []
        keywords_found = []

        for line in lines:
            line = line.strip()
            if not line or len(line) < 3:
                continue

            # Try to match NLS data rows (e.g., "9.1.203  LONGITUDINAL SECTION...")
            row_match = self.ROW_PATTERN.match(line)
            if row_match:
                code = row_match.group(1)
                description = row_match.group(2).strip()
                rows.append({
                    "code": code,
                    "description": description,
                    "raw": line
                })
                continue

            # Look for percentage values
            pct_matches = self.PERCENT_PATTERN.findall(line)
            for pct in pct_matches:
                percentages.append({"value": int(pct), "context": line})

            # Look for frequency values
            freq_matches = self.FREQ_PATTERN.findall(line)
            for val, unit in freq_matches:
                frequencies.append({"value": float(val), "unit": unit, "context": line})

        # Find NLS keywords in the full text
        text_lower = raw_text.lower()
        for keyword in self.NLS_KEYWORDS:
            if keyword in text_lower:
                keywords_found.append(keyword)

        return {
            "rows": rows,
            "row_count": len(rows),
            "percentages": percentages,
            "frequencies": frequencies,
            "keywords_found": keywords_found
        }

    # ─────────────────────────────────────────
    # FULL NLS SCREEN ANALYSIS
    # ─────────────────────────────────────────

    def analyze_screen(self, frame):
        """
        Complete NLS screen analysis pipeline:
          1. Find NLS window in the screen capture
          2. Extract header (organ name), data table, status bar
          3. Parse all text into structured NLS data
          4. Return comprehensive results
        """
        if frame is None:
            return {"error": "No frame provided"}

        results = {
            "raw_text": "",
            "header": "",
            "status_bar": "",
            "nls_data": {},
            "nls_window_detected": False,
            "regions": {}
        }

        # Step 1: Find the NLS window
        nls_region = self.find_nls_window_region(frame)

        if nls_region:
            x, y, w, h = nls_region
            nls_frame = frame[y:y+h, x:x+w]
            results["nls_window_detected"] = True
            results["regions"]["nls_window"] = {"x": x, "y": y, "w": w, "h": h}
        else:
            # Use the full frame if no distinct NLS window found
            nls_frame = frame

        # Step 2: Extract header text (organ/view name)
        results["header"] = self.extract_header(nls_frame)

        # Step 3: Extract status bar
        results["status_bar"] = self.extract_status_bar(nls_frame)

        # Step 4: Find and extract data table
        table_region = self.find_data_table_region(nls_frame)

        if table_region:
            tx, ty, tw, th = table_region
            table_frame = nls_frame[ty:ty+th, tx:tx+tw]
            results["regions"]["data_table"] = {"x": tx, "y": ty, "w": tw, "h": th}
            table_text = self.extract_text(table_frame)
            results["raw_text"] = table_text
        else:
            # Fall back to reading the full NLS frame
            results["raw_text"] = self.extract_text(nls_frame)

        # Step 5: Parse structured data
        results["nls_data"] = self.parse_nls_data(results["raw_text"])

        # Also parse header and status bar for additional data
        status_parsed = self.parse_nls_data(results["status_bar"])
        if status_parsed["percentages"]:
            results["nls_data"]["reserve_percentage"] = status_parsed["percentages"][0]["value"]

        # Build summary
        results["summary"] = self._build_summary(results)

        self.last_raw_text = results["raw_text"]
        self.last_parsed = results

        return results

    def _build_summary(self, results):
        """Build a human-readable summary of what was detected."""
        parts = []

        header = results.get("header", "")
        if header:
            parts.append(f"View: {header}")

        nls_data = results.get("nls_data", {})

        row_count = nls_data.get("row_count", 0)
        if row_count > 0:
            parts.append(f"{row_count} organ readings detected")
            # List first 3 organ codes
            codes = [r["code"] for r in nls_data.get("rows", [])[:3]]
            if codes:
                parts.append(f"Codes: {', '.join(codes)}")

        reserve = nls_data.get("reserve_percentage")
        if reserve is not None:
            parts.append(f"Reserve: {reserve}%")

        keywords = nls_data.get("keywords_found", [])
        if keywords:
            # Show most relevant keywords (limit to 5)
            relevant = [k for k in keywords if k not in ('section', 'point', 'normal')][:5]
            if relevant:
                parts.append(f"Keywords: {', '.join(relevant)}")

        status = results.get("status_bar", "")
        if status:
            parts.append(f"Status: {status}")

        return " | ".join(parts) if parts else "No NLS data detected"
