import cv2
import pytesseract
import pyautogui
import time
import json
import os
import re
import uuid
import base64
from datetime import datetime
import numpy as np
import mss
import pygetwindow as gw
try:
    import win32gui
    import win32con
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

# Padding added around OCR text boxes so clicks land on the actual button, not the text edge
BUTTON_PADDING_X = 12
BUTTON_PADDING_Y = 6
# Click offset: shift click slightly above center since button text is often in the upper portion
CLICK_Y_RATIO = 0.45  # 0.5 = dead center, 0.4 = slightly above

# ──────────────────────────────────────
# OCR NOISE FILTERS
# ──────────────────────────────────────
# Patterns that indicate OCR noise rather than real UI buttons
NOISE_PATTERNS = [
    re.compile(r'^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$', re.IGNORECASE),  # timestamps: 2:53:19, 14:55 PM
    re.compile(r'^v?\d+\.\d+(\.\d+)?$'),             # version numbers: 4.0.25, v4.025
    re.compile(r'^\d{4,}$'),                           # long pure numbers: 25724, 40285
    re.compile(r'^[a-z]?\d{2,}$', re.IGNORECASE),     # mixed short: o25, 25s, e5
    re.compile(r'^\d+[a-z]\d*$', re.IGNORECASE),      # digit-letter: 40e5, 25s3
    re.compile(r'^[^a-zA-Z]*$'),                       # no letters at all: purely symbols/digits
    re.compile(r'^.{1,2}$'),                           # too short (1-2 chars)
    re.compile(r'^\d+\.\d+$'),                         # decimal numbers: 0.25, 40.25
    re.compile(r'^https?://'),                         # URLs
    re.compile(r'^localhost'),                          # localhost refs
    re.compile(r'\.(exe|dll|json|py|js|css|html)$', re.IGNORECASE),  # file extensions
]

# Known UI chrome text to always skip (case-insensitive)
CHROME_NOISE = {
    'file', 'edit', 'view', 'selection', 'terminal', 'help', 'run',
    'debug', 'go', 'window', 'preferences', 'extensions',
    'new', 'tab', 'close', 'minimize', 'maximize', 'restore',
    'connected', 'ready', 'device', 'ready',
}

# Minimum confidence for OCR text to be considered a real button
MIN_OCR_CONFIDENCE = 65
# Minimum text length (after filtering) to be considered a real button
MIN_TEXT_LENGTH = 3


def is_noise(text):
    """Returns True if the given text should be ignored as OCR noise."""
    stripped = text.strip()
    if len(stripped) < MIN_TEXT_LENGTH:
        return True
    if stripped.lower() in CHROME_NOISE:
        return True
    for pattern in NOISE_PATTERNS:
        if pattern.match(stripped):
            return True
    return False


# ──────────────────────────────────────
# SCREEN STABILITY DETECTION
# ──────────────────────────────────────
def capture_region(sct, monitor):
    """Capture a screen region and return as BGR numpy array."""
    sct_img = sct.grab(monitor)
    frame = np.array(sct_img)
    if frame.shape[2] == 4:
        frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
    return frame


def screen_diff(frame_a, frame_b):
    """Return 0-1 similarity score between two frames (1.0 = identical)."""
    if frame_a is None or frame_b is None:
        return 0.0
    if frame_a.shape != frame_b.shape:
        return 0.0
    # Downscale for faster comparison
    small_a = cv2.resize(frame_a, (160, 90))
    small_b = cv2.resize(frame_b, (160, 90))
    gray_a = cv2.cvtColor(small_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(small_b, cv2.COLOR_BGR2GRAY)
    diff = cv2.absdiff(gray_a, gray_b)
    changed_pixels = np.count_nonzero(diff > 15)  # threshold to ignore compression artifacts
    total = diff.size
    return 1.0 - (changed_pixels / total)


class LogicMapper:
    def __init__(self):
        self.session_active = False
        self._auto_explore_abort = False
        self.target_window = None
        self.target_box = None
        self.tree = {
            "nodes": [],
            "edges": []
        }
        self.current_node_id = None
        self.edge_count = 0
        self.explored_texts = set()  # Persistent memory of clicked button texts
        self.bot = None  # Reference to NLSAutomation
        # Navigation stack for backtracking (list of node_ids)
        self._nav_stack = []
        # Screen fingerprints: maps node_id -> set of button texts
        self._screen_fingerprints = {}
        # Back-button keywords
        self.back_keywords = ['back', '← back', '←', '<back', '< back', 'return', 'go back']
        # Scan/loading detection keywords
        self.scan_keywords = ['scanning', 'analyzing', 'processing', 'loading', 'please wait',
                              'calibrating', 'initializing', 'detecting']
        # Explore log for real-time status
        self._explore_log = []

    # Window titles to exclude from the selector (prevents recursive self-capture)
    SELF_WINDOW_KEYWORDS = ['vibrana', 'overseer', 'localhost:5176', 'localhost:5001']

    def get_windows(self):
        all_titles = [w for w in gw.getAllTitles() if w.strip()]
        # Filter out Vibrana's own window to prevent recursive nested capture
        return [w for w in all_titles if not any(kw in w.lower() for kw in self.SELF_WINDOW_KEYWORDS)]

    def set_target_window(self, title):
        self.target_window = title
        return {"status": "success", "target_window": title}

    def start_session(self, bot=None):
        self.session_active = True
        self.tree = {"nodes": [], "edges": []}
        self.current_node_id = None
        self._nav_stack = []
        self._screen_fingerprints = {}
        self._explore_log = []
        # Don't reset explored_texts here — memory persists across sessions
        self.bot = bot
        return {"status": "started", "message": "Logic mapping session started", "target_window": self.target_window}

    def reset_memory(self):
        """Clears the explored_texts memory so Auto-Explore re-visits all buttons."""
        self.explored_texts.clear()
        self._nav_stack = []
        self._screen_fingerprints = {}
        self._explore_log = []
        return {"status": "memory_cleared", "message": "Click memory reset"}

    def stop_session(self):
        self.session_active = False
        return {"status": "stopped", "message": "Session ended", "tree": self.tree, "target_window": self.target_window}

    def _process_image_for_ocr(self, image):
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        return gray

    # ──────────────────────────────────────
    # SCREEN STABILITY: Wait for screen to stop changing
    # ──────────────────────────────────────
    def _wait_for_stable_screen(self, monitor, max_wait=8.0, stability_threshold=0.97, checks=3):
        """Wait until pixel content stops changing (handles scan animations, loading screens).
        
        Args:
            monitor: mss monitor dict
            max_wait: max seconds to wait
            stability_threshold: 0-1, how similar consecutive frames must be
            checks: how many consecutive stable frames required
        
        Returns:
            The stable screenshot (BGR numpy array)
        """
        start = time.time()
        prev_frame = None
        stable_count = 0
        
        with mss.mss() as sct:
            while time.time() - start < max_wait:
                frame = capture_region(sct, monitor)
                
                if prev_frame is not None:
                    similarity = screen_diff(prev_frame, frame)
                    if similarity >= stability_threshold:
                        stable_count += 1
                        if stable_count >= checks:
                            elapsed = round(time.time() - start, 1)
                            if elapsed > 1.0:
                                print(f"[Stability] Screen stabilized after {elapsed}s (similarity={similarity:.3f})")
                            return frame
                    else:
                        stable_count = 0
                        print(f"[Stability] Screen still changing (similarity={similarity:.3f}), waiting...")
                
                prev_frame = frame
                time.sleep(0.4)
        
        print(f"[Stability] Timed out after {max_wait}s, proceeding with last frame")
        return prev_frame if prev_frame is not None else capture_region(sct, monitor)

    # ──────────────────────────────────────
    # SCAN / LOADING DETECTION
    # ──────────────────────────────────────
    def _detect_scan_overlay(self, screenshot):
        """Check if a scanning/loading overlay is visible by looking for scan keywords in OCR."""
        gray = self._process_image_for_ocr(screenshot)
        # Quick OCR pass
        text_data = pytesseract.image_to_string(gray).lower()
        for keyword in self.scan_keywords:
            if keyword in text_data:
                return True, keyword
        return False, None

    def _wait_for_scan_complete(self, monitor, max_wait=30.0):
        """If a scan/loading overlay is detected, wait for it to disappear.
        
        Returns the post-scan screenshot.
        """
        with mss.mss() as sct:
            start = time.time()
            scan_detected = False
            
            while time.time() - start < max_wait:
                frame = capture_region(sct, monitor)
                is_scanning, keyword = self._detect_scan_overlay(frame)
                
                if is_scanning:
                    if not scan_detected:
                        print(f"[ScanWait] Scan overlay detected ('{keyword}'), waiting for completion...")
                        scan_detected = True
                    time.sleep(1.0)
                elif scan_detected:
                    # Overlay was visible but now cleared — scan complete
                    elapsed = round(time.time() - start, 1)
                    print(f"[ScanWait] Scan completed after {elapsed}s")
                    time.sleep(0.5)  # Brief pause for results to render
                    return self._wait_for_stable_screen(monitor)
                else:
                    # No scan overlay, proceed
                    return frame
            
            print(f"[ScanWait] Timed out after {max_wait}s")
            return capture_region(sct, monitor)

    def detect_buttons(self, image=None, roi=None):
        """Captures screen and returns bounding boxes of detected text/buttons.
        roi: optional dict {x, y, w, h} as percentages (0-100) to restrict detection area.
        """
        with mss.mss() as sct:
            # monitors[0] = ALL screens combined (virtual desktop) — BAD for clicking
            # monitors[1] = primary monitor — correct default
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]

            if self.target_window:
                # Use the robust _get_window_bounds which does win32gui.SetForegroundWindow
                bounds = self._get_window_bounds()
                if bounds:
                    monitor = bounds
                    # Extra wait to ensure the OS finished bringing window to front
                    time.sleep(0.3)
                    print(f"[DetectButtons] Target window '{self.target_window}' bounds: {monitor}")
                else:
                    print(f"[DetectButtons] WARNING: Window '{self.target_window}' not found!")
            
            self.target_box = monitor
            print(f"[DetectButtons] Capturing monitor region: {monitor}")

            if image is None:
                # Wait for screen to stabilize before OCR
                screenshot = self._wait_for_stable_screen(monitor)
            else:
                screenshot = image

        if screenshot is None:
            return {"error": "Failed to capture screen or provided image is invalid"}

        gray = self._process_image_for_ocr(screenshot)
        
        # pytesseract to get bounding boxes
        results = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
        
        buttons = []
        n_boxes = len(results['text'])
        img_h, img_w = screenshot.shape[:2]
        for i in range(n_boxes):
            text = results['text'][i].strip()
            conf = int(results['conf'][i])
            if conf > MIN_OCR_CONFIDENCE and len(text) > 2:
                # ── OCR NOISE FILTER ──
                if is_noise(text):
                    continue

                (x, y, w, h) = (results['left'][i], results['top'][i], results['width'][i], results['height'][i])
                # Apply padding so the bounding box covers the actual button, not just the text
                padded_x = max(0, x - BUTTON_PADDING_X)
                padded_y = max(0, y - BUTTON_PADDING_Y)
                padded_w = min(img_w - padded_x, w + BUTTON_PADDING_X * 2)
                padded_h = min(img_h - padded_y, h + BUTTON_PADDING_Y * 2)

                # If ROI is set, skip buttons whose center falls outside the region
                if roi:
                    btn_cx = padded_x + padded_w / 2
                    btn_cy = padded_y + padded_h / 2
                    roi_x = roi['x'] / 100 * img_w
                    roi_y = roi['y'] / 100 * img_h
                    roi_r = (roi['x'] + roi['w']) / 100 * img_w
                    roi_b = (roi['y'] + roi['h']) / 100 * img_h
                    if btn_cx < roi_x or btn_cx > roi_r or btn_cy < roi_y or btn_cy > roi_b:
                        continue

                buttons.append({
                    "id": str(uuid.uuid4())[:8],
                    "text": text,
                    "x": padded_x,
                    "y": padded_y,
                    "w": padded_w,
                    "h": padded_h,
                    "conf": conf,
                    "visited": text in self.explored_texts
                })

        # Generate a thumbnail to return as base64 so frontend can display what it thinks it saw
        encoded_image = self._encode_frame(screenshot)

        node_id = str(uuid.uuid4())

        new_node = {
            "id": node_id,
            "timestamp": datetime.now().isoformat(),
            "buttons": buttons
        }

        self.tree["nodes"].append(new_node)
        self.current_node_id = node_id

        # Store fingerprint for this screen's button set
        self._screen_fingerprints[node_id] = frozenset(b["text"] for b in buttons)

        h, w = screenshot.shape[:2]

        return {
            "status": "success",
            "node_id": node_id,
            "buttons": buttons,
            "screen_width": img_w,
            "screen_height": img_h,
            "screen": encoded_image,
            "tree": self.tree,
            "explored_texts": list(self.explored_texts),
            "target_window": self.target_window
        }

    def _encode_frame(self, frame):
        h, w = frame.shape[:2]
        if h > 1080:
           scale = 1080 / h
           frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return base64.b64encode(buffer).decode('utf-8')

    def _get_window_bounds(self):
        """Re-acquire the target window position and forcefully bring it to foreground."""
        if not self.target_window:
            return None
        windows = gw.getWindowsWithTitle(self.target_window)
        if not windows:
            return None
        win = windows[0]
        if win.isMinimized:
            win.restore()
            time.sleep(0.3)
        # Use win32gui for reliable foreground activation
        if HAS_WIN32:
            hwnd = win._hWnd
            try:
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(hwnd)
            except Exception:
                try:
                    import win32process
                    import ctypes
                    fg_thread = win32process.GetWindowThreadProcessId(win32gui.GetForegroundWindow())[0]
                    target_thread = win32process.GetWindowThreadProcessId(hwnd)[0]
                    if fg_thread != target_thread:
                        ctypes.windll.user32.AttachThreadInput(fg_thread, target_thread, True)
                        win32gui.SetForegroundWindow(hwnd)
                        ctypes.windll.user32.AttachThreadInput(fg_thread, target_thread, False)
                except Exception as e:
                    print(f"[LogicMapper] Win32 focus fallback failed: {e}")
        else:
            try:
                win.activate()
            except Exception:
                pass
        time.sleep(0.15)
        return {
            "top": win.top,
            "left": win.left,
            "width": win.width,
            "height": win.height
        }

    def _get_monitor_for_target(self):
        """Get the mss monitor dict for the target window (or primary monitor)."""
        with mss.mss() as sct:
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
        if self.target_window:
            bounds = self._get_window_bounds()
            if bounds:
                monitor = bounds
        return monitor

    def execute_click(self, x, y, text, from_node_id):
        """Clicks the coordinate, waits for UI to change, then maps the connection."""
        if not self.session_active:
            return {"error": "Session not active"}

        try:
            box = self.target_box
            if self.target_window:
                new_box = self._get_window_bounds()
                if new_box:
                    box = new_box
            
            if box:
                abs_x = box["left"] + x
                abs_y = box["top"] + y
                # Safety: clip to window bounds so we never click outside
                abs_x = max(box["left"], min(abs_x, box["left"] + box["width"] - 1))
                abs_y = max(box["top"], min(abs_y, box["top"] + box["height"] - 1))
            else:
                abs_x = x
                abs_y = y

            print(f"[LogicMapper] Click relative ({x}, {y}) -> absolute ({abs_x}, {abs_y}) for '{text}'")
            pyautogui.moveTo(abs_x, abs_y, duration=0.15)
            pyautogui.click()
            # Record this text as explored
            if text:
                self.explored_texts.add(text)
            
            # Wait for UI to respond, then check for scan overlays
            time.sleep(0.8)
            monitor = self._get_monitor_for_target()
            
            # Check if clicking triggered a scan/loading overlay
            with mss.mss() as sct:
                quick_frame = capture_region(sct, monitor)
            is_scanning, keyword = self._detect_scan_overlay(quick_frame)
            if is_scanning:
                print(f"[LogicMapper] Click triggered scan overlay ('{keyword}'), waiting...")
                self._wait_for_scan_complete(monitor, max_wait=30.0)
            else:
                # Normal navigation — wait for screen to stabilize
                time.sleep(0.5)
            
        except Exception as e:
            print(f"[LogicMapper] Error executing click: {e}")
            return {"error": f"Click execution failed: {str(e)}"}

        # Detect the new screen state
        detection_result = self.detect_buttons()
        if "error" in detection_result:
            return detection_result
        
        to_node_id = detection_result["node_id"]

        # Record edge in tree
        self.edge_count += 1
        self.tree["edges"].append({
            "from": from_node_id,
            "to": to_node_id,
            "action": "click",
            "text": text,
            "x": x,
            "y": y,
            "step": self.edge_count
        })

        return {
            "status": "clicked",
            "from_node": from_node_id,
            "to_node": to_node_id,
            "new_state": detection_result
        }

    def stop_auto_explore(self):
        self._auto_explore_abort = True
        return {"status": "stopping_auto_explore"}

    # ──────────────────────────────────────
    # SCREEN FINGERPRINTING
    # ──────────────────────────────────────
    def _get_current_fingerprint(self):
        """Get the button-text fingerprint for the current node."""
        node = next((n for n in self.tree["nodes"] if n["id"] == self.current_node_id), None)
        if not node:
            return frozenset()
        return frozenset(b["text"] for b in node.get("buttons", []))

    def _screen_changed(self, old_fingerprint, new_fingerprint, threshold=0.5):
        """Check if the screen meaningfully changed (> threshold of buttons are different)."""
        if not old_fingerprint or not new_fingerprint:
            return True
        if old_fingerprint == new_fingerprint:
            return False
        common = old_fingerprint & new_fingerprint
        total = len(old_fingerprint | new_fingerprint)
        if total == 0:
            return True
        overlap = len(common) / total
        return overlap < threshold  # less than 50% overlap = screen changed

    def _find_back_button(self, buttons):
        """Find a 'Back' or '←' button in the current button list."""
        for b in buttons:
            txt = b["text"].lower().strip()
            for kw in self.back_keywords:
                if kw in txt or txt == kw:
                    return b
        return None

    def _get_safe_unclicked(self, buttons, dangerous_keywords):
        """Get buttons that haven't been clicked and aren't dangerous/noise."""
        safe = []
        for b in buttons:
            txt = b["text"]
            txt_lower = txt.lower().strip()
            # Skip already explored
            if txt in self.explored_texts:
                continue
            # Skip dangerous
            if any(d in txt_lower for d in dangerous_keywords):
                continue
            # Skip back buttons (we handle them separately)
            is_back = any(kw in txt_lower for kw in self.back_keywords)
            if is_back:
                continue
            safe.append(b)
        return safe

    # ──────────────────────────────────────
    # AUTO-EXPLORE V2: DFS with Backtracking + Scan Awareness
    # ──────────────────────────────────────
    def auto_explore(self, max_steps=10, ignored_texts=None, roi=None):
        """Depth-first exploration with backtracking.
        
        Algorithm:
        1. On current screen, find all safe unclicked buttons
        2. Click the first one → go deeper
        3. If new screen has unclicked buttons, continue deeper
        4. If no unclicked buttons remain, click Back → return to parent
        5. Resume exploring siblings from parent
        6. Repeat until max_steps reached or all screens exhausted
        
        Handles:
        - Scan overlays (waits for scan animation to complete)
        - Loading delays (pixel-stability detection before OCR)
        - No-op clicks (detects when screen didn't change)
        - OCR noise (filters timestamps, version numbers, etc.)
        """
        if ignored_texts is None:
            ignored_texts = []
        if not self.session_active:
            return {"error": "Session must be started before auto-exploring"}

        self._auto_explore_abort = False
        self._explore_log = []
        
        dangerous_keywords = ['exit', 'quit', 'close', 'delete', 'remove', 'cancel',
                              'uninstall', 'format', 'erase', 'shutdown', 'reboot']
        for t in ignored_texts:
            dangerous_keywords.append(t.lower())
        
        steps_taken = 0
        backtrack_count = 0
        max_depth = 0
        no_change_streak = 0
        MAX_NO_CHANGE = 3  # If 3 clicks don't change the screen, backtrack
        
        for iteration in range(max_steps * 3):  # Extra iterations to account for backtrack steps
            if self._auto_explore_abort or not self.session_active:
                self._log(f"Aborted (abort={self._auto_explore_abort}, active={self.session_active})")
                break
            
            if steps_taken >= max_steps:
                self._log(f"Reached max_steps={max_steps}")
                break
                
            current_node = next((n for n in self.tree["nodes"] if n["id"] == self.current_node_id), None)
            if not current_node:
                self._log(f"No current node found for id={self.current_node_id}")
                break
            
            buttons = current_node.get("buttons", [])
            if not buttons:
                self._log("Node has no buttons at all")
                # Try backtracking
                if self._try_backtrack(buttons, dangerous_keywords, roi):
                    backtrack_count += 1
                    continue
                break
                
            # Find safe unclicked buttons (excluding back buttons)
            safe_unclicked = self._get_safe_unclicked(buttons, dangerous_keywords)
            current_depth = len(self._nav_stack)
            
            self._log(f"Depth={current_depth}, {len(buttons)} buttons, "
                      f"{len(safe_unclicked)} safe/unclicked")
            
            if safe_unclicked:
                # ── FORWARD: Click next unclicked button ──
                old_fp = self._get_current_fingerprint()
                old_node_id = self.current_node_id
                
                btn = safe_unclicked[0]
                self.explored_texts.add(btn["text"])
                
                cx = int(btn["x"] + btn["w"] / 2)
                cy = int(btn["y"] + btn["h"] * CLICK_Y_RATIO)
                
                self._log(f"FORWARD Step {steps_taken+1}: Click '{btn['text']}' at ({cx}, {cy})")
                
                result = self.execute_click(cx, cy, btn["text"], self.current_node_id)
                if "error" in result:
                    self._log(f"Click error: {result['error']}")
                    # Skip this button, don't count as step, continue
                    continue
                
                steps_taken += 1
                new_fp = self._get_current_fingerprint()
                
                # Check if screen actually changed
                if self._screen_changed(old_fp, new_fp):
                    no_change_streak = 0
                    # Push parent to nav stack (so we can backtrack)
                    self._nav_stack.append({
                        "node_id": old_node_id,
                        "clicked_text": btn["text"],
                        "depth": current_depth
                    })
                    if current_depth + 1 > max_depth:
                        max_depth = current_depth + 1
                    self._log(f"  → Screen changed! Depth now {current_depth + 1}")
                else:
                    no_change_streak += 1
                    self._log(f"  → Screen did NOT change (streak={no_change_streak})")
                    if no_change_streak >= MAX_NO_CHANGE:
                        self._log(f"  → {MAX_NO_CHANGE} no-change clicks, trying backtrack")
                        no_change_streak = 0
                        if self._try_backtrack(buttons, dangerous_keywords, roi):
                            backtrack_count += 1
                            continue
                        self._log("  → No backtrack possible, stopping")
                        break
            else:
                # ── BACKTRACK: No more unclicked buttons here, go back ──
                self._log(f"No safe unclicked buttons at depth={current_depth}")
                
                if self._try_backtrack(buttons, dangerous_keywords, roi):
                    backtrack_count += 1
                    steps_taken += 1  # Count backtrack as a step
                    continue
                else:
                    self._log("No back button found and nav stack empty — exploration complete")
                    break
        
        # Always return a fresh detection with the full tree
        final = self.detect_buttons(roi=roi)
        
        # Build a clean summary of what was explored
        explored_organs = [e["text"] for e in self.tree.get("edges", []) 
                          if not is_noise(e.get("text", ""))]
        
        return {
            "status": "finished",
            "steps_taken": steps_taken,
            "backtrack_count": backtrack_count,
            "max_depth": max_depth,
            "explored_buttons": explored_organs,
            "explore_log": self._explore_log[-50:],  # Last 50 log entries
            "tree": self.tree,
            "new_state": final
        }

    def _try_backtrack(self, current_buttons, dangerous_keywords, roi=None):
        """Attempt to navigate back to the parent screen.
        
        Strategy:
        1. Look for a 'Back' button in current buttons
        2. If found, click it
        3. If not found, check nav stack and use keyboard Escape
        
        Returns True if backtrack was successful.
        """
        # Try to find a back button
        back_btn = self._find_back_button(current_buttons)
        
        if back_btn:
            self._log(f"BACKTRACK: Clicking '{back_btn['text']}'")
            old_fp = self._get_current_fingerprint()
            
            cx = int(back_btn["x"] + back_btn["w"] / 2)
            cy = int(back_btn["y"] + back_btn["h"] * CLICK_Y_RATIO)
            
            result = self.execute_click(cx, cy, f"[BACK]{back_btn['text']}", self.current_node_id)
            
            if "error" not in result:
                new_fp = self._get_current_fingerprint()
                if self._screen_changed(old_fp, new_fp):
                    # Pop nav stack
                    if self._nav_stack:
                        popped = self._nav_stack.pop()
                        self._log(f"  → Backtracked from depth {popped['depth']+1} to {popped['depth']}")
                    return True
                else:
                    self._log("  → Back clicked but screen didn't change")
        
        # No back button found — try Escape key as fallback
        if self._nav_stack:
            self._log("BACKTRACK: No back button, trying Escape key")
            old_fp = self._get_current_fingerprint()
            try:
                pyautogui.press('escape')
                time.sleep(1.0)
            except Exception:
                pass
            
            # Re-detect screen
            detection = self.detect_buttons(roi=roi)
            if "error" not in detection:
                new_fp = self._get_current_fingerprint()
                if self._screen_changed(old_fp, new_fp):
                    if self._nav_stack:
                        self._nav_stack.pop()
                    self._log("  → Escape worked, returned to parent")
                    return True
                else:
                    self._log("  → Escape had no effect")
        
        return False

    def _log(self, msg):
        """Log a message to both console and explore_log."""
        print(f"[Auto-Explore] {msg}")
        self._explore_log.append({
            "time": datetime.now().isoformat(),
            "message": msg
        })

    def execute_sequence(self, steps):
        """Execute a user-defined ordered sequence of click targets.
        steps: list of {x, y, text} dicts in execution order.
        """
        if not self.session_active:
            return {"error": "Session must be started before executing a sequence"}
        
        results = []
        for i, step in enumerate(steps):
            if self._auto_explore_abort:
                break
            x = step.get('x', 0)
            y = step.get('y', 0)
            text = step.get('text', '')
            print(f"[Sequence] Step {i+1}/{len(steps)}: Clicking '{text}' at ({x}, {y})")
            result = self.execute_click(x, y, text, self.current_node_id)
            results.append({"step": i + 1, "text": text, "status": "error" if "error" in result else "ok"})
            if "error" in result:
                break
        
        final = self.detect_buttons()
        return {"status": "finished", "steps_completed": len(results), "results": results, "new_state": final}

    def get_tree(self):
        return self.tree

    def save_tree(self, filename="logic_tree.json"):
        filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
        try:
            with open(filepath, 'w') as f:
                json.dump(self.tree, f, indent=4)
            return {"status": "saved", "path": filepath}
        except Exception as e:
            return {"error": str(e)}

    def create_macro_from_tree(self, name, macro_engine):
        """Convert the logic tree into an executable macro.
        Only includes real navigation clicks (filters out noise and back-clicks).
        """
        actions = []
        for edge in self.tree.get("edges", []):
            if edge.get("action") == "click":
                text = edge.get("text", "").strip()
                # Skip noise, back-clicks, and empty text
                if not text:
                    continue
                if text.startswith("[BACK]"):
                    continue
                if is_noise(text):
                    continue
                
                actions.append({
                    "type": "ocr_click",
                    "params": {"text": text, "timeout": 15}
                })
                actions.append({
                    "type": "wait",
                    "params": {"seconds": 2.0}
                })
        
        return macro_engine.save_macro(name, actions)

# Global instance
mapper = LogicMapper()
