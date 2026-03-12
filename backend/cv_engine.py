"""
Vibrana CV Engine — NLS Automation & Analysis
Enhanced with ROI selection, heatmap generation, multi-monitor support,
snapshot annotations, color calibration, and automated scan sequences.
"""
import mss
import os
import json
import cv2
import time
import base64
import numpy as np
import pyautogui
import pytesseract
from datetime import datetime


class NLSAutomation:
    def __init__(self, calibration_file="calibration.json"):
        print("NLSAutomation.__init__ started")
        self.screen_width, self.screen_height = pyautogui.size()
        print(f"Screen size detected: {self.screen_width}x{self.screen_height}")

        # Configure Tesseract Path
        tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path

        self.calibration_file = calibration_file
        self.coords = self.load_calibration()

        # ROI: Region of Interest (default: full screen)
        self.roi = self.coords.get('roi', None)  # {'x': 0, 'y': 0, 'w': 1920, 'h': 1080}

        # Active monitor index (default: 1 = primary)
        self.active_monitor = self.coords.get('active_monitor', 1)

        # Define color ranges for Nidal Points (HSV)
        self.colors = self.load_color_ranges()

        # Snapshot storage dir
        self.snapshot_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snapshots')
        os.makedirs(self.snapshot_dir, exist_ok=True)

        # Macro recording state
        self.macro_recording = False
        self.macro_actions = []
        self.macros_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'macros')
        os.makedirs(self.macros_dir, exist_ok=True)

    # ──────────────────────────────────────
    # Configuration & Calibration
    # ──────────────────────────────────────

    def load_calibration(self):
        """Loads calibration coordinates from JSON file."""
        if os.path.exists(self.calibration_file):
            try:
                with open(self.calibration_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading calibration: {e}")
        return {}

    def save_calibration(self, coords):
        """Saves calibration coordinates to JSON file."""
        self.coords.update(coords)
        try:
            with open(self.calibration_file, 'w') as f:
                json.dump(self.coords, f, indent=4)
            print("Calibration saved.")
        except Exception as e:
            print(f"Error saving calibration: {e}")

    def load_color_ranges(self):
        """Loads custom color ranges or uses defaults."""
        color_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'color_ranges.json')
        if os.path.exists(color_file):
            try:
                with open(color_file, 'r') as f:
                    data = json.load(f)
                    return {int(k): (tuple(v[0]), tuple(v[1])) for k, v in data.items()}
            except Exception as e:
                print(f"Error loading color ranges: {e}")

        # Defaults
        return {
            1: ((20, 100, 100), (30, 255, 255)),
            2: ((25, 100, 100), (35, 255, 255)),
            3: ((10, 100, 100), (20, 255, 255)),
            4: ((0, 100, 100), (10, 255, 255)),
            5: ((110, 100, 100), (130, 255, 255)),
            6: ((0, 0, 0), (180, 255, 30))
        }

    def save_color_ranges(self, colors):
        """Saves custom color ranges to JSON file."""
        self.colors = {int(k): (tuple(v[0]), tuple(v[1])) for k, v in colors.items()}
        color_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'color_ranges.json')
        try:
            serializable = {str(k): [list(v[0]), list(v[1])] for k, v in self.colors.items()}
            with open(color_file, 'w') as f:
                json.dump(serializable, f, indent=4)
            print("Color ranges saved.")
        except Exception as e:
            print(f"Error saving color ranges: {e}")

    def get_color_ranges(self):
        """Returns current HSV color ranges for all levels."""
        return {str(k): [list(v[0]), list(v[1])] for k, v in self.colors.items()}

    # ──────────────────────────────────────
    # Multi-Monitor Support
    # ──────────────────────────────────────

    def get_monitors(self):
        """Returns a list of available monitors."""
        with mss.mss() as sct:
            monitors = []
            for idx, mon in enumerate(sct.monitors):
                if idx == 0:
                    continue  # Skip the "all monitors" entry
                monitors.append({
                    "index": idx,
                    "width": mon['width'],
                    "height": mon['height'],
                    "left": mon['left'],
                    "top": mon['top'],
                    "active": idx == self.active_monitor
                })
            return monitors

    def set_active_monitor(self, monitor_index):
        """Sets which monitor to capture from."""
        self.active_monitor = monitor_index
        self.coords['active_monitor'] = monitor_index
        self.save_calibration(self.coords)

    # ──────────────────────────────────────
    # Screen Capture & ROI
    # ──────────────────────────────────────

    def capture_screen(self, monitor_idx=None):
        """Captures the current screen using MSS."""
        try:
            with mss.mss() as sct:
                idx = monitor_idx or self.active_monitor
                if idx >= len(sct.monitors):
                    idx = 1
                monitor = sct.monitors[idx]
                sct_img = sct.grab(monitor)
                frame = np.array(sct_img)
                frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
                return frame
        except Exception as e:
            print(f"Error capturing screen: {e}")
            return None

    def apply_roi(self, image):
        """Extract ROI from image if ROI is set."""
        if self.roi and image is not None:
            x = max(0, self.roi.get('x', 0))
            y = max(0, self.roi.get('y', 0))
            w = self.roi.get('w', image.shape[1])
            h = self.roi.get('h', image.shape[0])
            # Clamp to image bounds
            x2 = min(x + w, image.shape[1])
            y2 = min(y + h, image.shape[0])
            return image[y:y2, x:x2]
        return image

    def set_roi(self, roi_data):
        """Set the Region of Interest. roi_data = {'x':, 'y':, 'w':, 'h':}"""
        self.roi = roi_data
        self.coords['roi'] = roi_data
        self.save_calibration(self.coords)

    def clear_roi(self):
        """Clear the ROI (use full screen)."""
        self.roi = None
        if 'roi' in self.coords:
            del self.coords['roi']
        self.save_calibration(self.coords)

    # ──────────────────────────────────────
    # Nidal Point Detection
    # ──────────────────────────────────────

    def find_nidal_points(self, image, use_roi=True):
        """
        Analyzes the image to find colored nidal points (1-6 scale).
        Returns a list of points with their coordinates and values.
        """
        if image is None:
            return []

        work_image = self.apply_roi(image) if use_roi else image
        hsv = cv2.cvtColor(work_image, cv2.COLOR_BGR2HSV)
        detected_points = []

        for level, (lower, upper) in self.colors.items():
            mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

            contours, _ = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                area = cv2.contourArea(contour)
                if 20 < area < 500:
                    M = cv2.moments(contour)
                    if M["m00"] != 0:
                        cX = int(M["m10"] / M["m00"])
                        cY = int(M["m01"] / M["m00"])
                        # Offset by ROI position if applicable
                        if use_roi and self.roi:
                            cX += self.roi.get('x', 0)
                            cY += self.roi.get('y', 0)
                        detected_points.append({"level": level, "x": cX, "y": cY})

        return detected_points

    # ──────────────────────────────────────
    # Heatmap Generation
    # ──────────────────────────────────────

    def generate_heatmap(self, image, points=None):
        """
        Generates a heatmap overlay showing entropy point density.
        Returns the heatmap image as base64.
        """
        if image is None:
            return None

        if points is None:
            points = self.find_nidal_points(image)

        h, w = image.shape[:2]
        heatmap = np.zeros((h, w), dtype=np.float32)

        # Add gaussian blobs for each point, weighted by level
        for p in points:
            x, y, level = p['x'], p['y'], p['level']
            if 0 <= x < w and 0 <= y < h:
                # Higher levels get larger, more intense blobs
                radius = 15 + level * 5
                intensity = level / 6.0
                cv2.circle(heatmap, (x, y), radius, intensity, -1)

        # Apply gaussian blur for smooth gradient
        heatmap = cv2.GaussianBlur(heatmap, (51, 51), 0)

        # Normalize and apply colormap
        if heatmap.max() > 0:
            heatmap = (heatmap / heatmap.max() * 255).astype(np.uint8)
        else:
            heatmap = heatmap.astype(np.uint8)

        colored_heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

        # Blend with original image
        alpha = 0.4
        overlay = cv2.addWeighted(image, 1 - alpha, colored_heatmap, alpha, 0)

        # Resize for transport
        overlay = cv2.resize(overlay, (640, 480))
        _, buffer = cv2.imencode('.jpg', overlay, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buffer).decode('utf-8')

    # ──────────────────────────────────────
    # Snapshots & Annotations
    # ──────────────────────────────────────

    def take_snapshot(self, annotations=None):
        """
        Takes a snapshot of the current screen, optionally with annotations.
        annotations: list of {'type': 'text'|'circle'|'arrow', ...}
        Returns the snapshot filepath and base64 thumbnail.
        """
        frame = self.capture_screen()
        if frame is None:
            return None, None

        # Apply annotations
        if annotations:
            frame = self._apply_annotations(frame, annotations)

        # Save to file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"snapshot_{timestamp}.png"
        filepath = os.path.join(self.snapshot_dir, filename)
        cv2.imwrite(filepath, frame)

        # Generate thumbnail
        thumb = cv2.resize(frame, (320, 240))
        _, buffer = cv2.imencode('.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
        thumb_b64 = base64.b64encode(buffer).decode('utf-8')

        return filepath, thumb_b64

    def _apply_annotations(self, image, annotations):
        """Draw annotations on the image."""
        annotated = image.copy()
        for ann in annotations:
            ann_type = ann.get('type', 'text')
            color = tuple(ann.get('color', [189, 147, 249]))  # Default: accent purple

            if ann_type == 'text':
                pos = (ann.get('x', 50), ann.get('y', 50))
                text = ann.get('text', '')
                cv2.putText(annotated, text, pos, cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

            elif ann_type == 'circle':
                center = (ann.get('x', 100), ann.get('y', 100))
                radius = ann.get('radius', 30)
                cv2.circle(annotated, center, radius, color, 2)

            elif ann_type == 'arrow':
                start = (ann.get('x1', 100), ann.get('y1', 100))
                end = (ann.get('x2', 200), ann.get('y2', 200))
                cv2.arrowedLine(annotated, start, end, color, 2, tipLength=0.3)

            elif ann_type == 'rectangle':
                pt1 = (ann.get('x', 50), ann.get('y', 50))
                pt2 = (ann.get('x', 50) + ann.get('w', 100), ann.get('y', 50) + ann.get('h', 100))
                cv2.rectangle(annotated, pt1, pt2, color, 2)

        return annotated

    def list_snapshots(self):
        """List all saved snapshots."""
        snapshots = []
        if os.path.exists(self.snapshot_dir):
            for f in sorted(os.listdir(self.snapshot_dir), reverse=True):
                if f.endswith('.png') or f.endswith('.jpg'):
                    filepath = os.path.join(self.snapshot_dir, f)
                    stat = os.stat(filepath)
                    snapshots.append({
                        'filename': f,
                        'filepath': filepath,
                        'size': stat.st_size,
                        'created': datetime.fromtimestamp(stat.st_ctime).isoformat()
                    })
        return snapshots

    # ──────────────────────────────────────
    # OCR & Text Extraction
    # ──────────────────────────────────────

    def get_text_from_image(self, image):
        """Extracts text from the given image or ROI."""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
            text = pytesseract.image_to_string(thresh)
            return text.strip()
        except Exception as e:
            print(f"OCR Error: {e}")
            return ""

    # ──────────────────────────────────────
    # Scan Summarization
    # ──────────────────────────────────────

    def summarize_scan(self, image):
        """Returns a summary of the scan (counts of each entropy level)."""
        points = self.find_nidal_points(image)
        counts = {i: 0 for i in range(1, 7)}
        for p in points:
            counts[p['level']] += 1

        # Try to read Organ Name from header
        h, w, _ = image.shape
        roi_x = int(w * 0.25)
        roi_w = int(w * 0.5)
        roi_h = int(h * 0.1)
        header_roi = image[0:roi_h, roi_x:roi_x + roi_w]
        organ_name = self.get_text_from_image(header_roi)
        if not organ_name:
            organ_name = "Unknown Organ"

        # Determine health state
        status_msg = "Normal"
        if counts[6] > 0:
            status_msg = "Pathology Detected (Level 6)"
        elif counts[5] > 5:
            status_msg = "Functional Disorder (Level 5)"
        elif counts[4] > 10:
            status_msg = "Compensated State (Level 4)"

        return {
            "total_points": len(points),
            "counts": counts,
            "status": status_msg,
            "organ_name": organ_name,
            "points": points
        }

    # ──────────────────────────────────────
    # Color Calibration Helpers
    # ──────────────────────────────────────

    def sample_color_at_point(self, x, y):
        """Capture the HSV color at a specific screen coordinate."""
        frame = self.capture_screen()
        if frame is None:
            return None

        # Clamp coordinates
        h, w = frame.shape[:2]
        x = max(0, min(x, w - 1))
        y = max(0, min(y, h - 1))

        # Get a small area around the point for more reliable color
        region_size = 5
        x1 = max(0, x - region_size)
        y1 = max(0, y - region_size)
        x2 = min(w, x + region_size)
        y2 = min(h, y + region_size)

        region = frame[y1:y2, x1:x2]
        hsv_region = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
        avg_hsv = hsv_region.mean(axis=(0, 1)).astype(int).tolist()

        return {
            "hsv": avg_hsv,
            "rgb": frame[y, x].tolist()[::-1],  # BGR to RGB
        }

    # ──────────────────────────────────────
    # Macro Recording & Playback (Phase 3)
    # ──────────────────────────────────────

    def start_macro_recording(self):
        """Start recording a macro with real input capture."""
        self.macro_recording = True
        self.macro_actions = []
        self._macro_start_time = time.time()
        self._macro_last_action_time = time.time()

        # Start input listeners
        try:
            from pynput import mouse, keyboard

            def on_click(x, y, button, pressed):
                if not self.macro_recording:
                    return False  # Stop listener
                if pressed:
                    now = time.time()
                    # Add wait action for time between actions
                    wait = round(now - self._macro_last_action_time, 2)
                    if wait > 0.15:
                        self.macro_actions.append({
                            "type": "wait",
                            "params": {"seconds": min(wait, 10)},
                            "timestamp": now
                        })
                    btn_name = str(button).replace("Button.", "")
                    self.macro_actions.append({
                        "type": "click",
                        "params": {"x": int(x), "y": int(y), "button": btn_name},
                        "timestamp": now
                    })
                    self._macro_last_action_time = now
                    print(f"[Macro] Recorded click at ({x}, {y}) button={btn_name}")

            def on_scroll(x, y, dx, dy):
                if not self.macro_recording:
                    return False
                now = time.time()
                self.macro_actions.append({
                    "type": "scroll",
                    "params": {"x": int(x), "y": int(y), "dx": dx, "dy": dy},
                    "timestamp": now
                })
                self._macro_last_action_time = now

            def on_key_press(key):
                if not self.macro_recording:
                    return False
                now = time.time()
                try:
                    key_name = key.char if hasattr(key, 'char') and key.char else str(key).replace("Key.", "")
                except AttributeError:
                    key_name = str(key).replace("Key.", "")

                # Skip modifier-only presses
                if key_name in ('shift', 'shift_r', 'ctrl_l', 'ctrl_r', 'alt_l', 'alt_r', 'cmd'):
                    return

                self.macro_actions.append({
                    "type": "key",
                    "params": {"key": key_name},
                    "timestamp": now
                })
                self._macro_last_action_time = now
                print(f"[Macro] Recorded key: {key_name}")

            self._mouse_listener = mouse.Listener(on_click=on_click, on_scroll=on_scroll)
            self._keyboard_listener = keyboard.Listener(on_press=on_key_press)
            self._mouse_listener.start()
            self._keyboard_listener.start()
            print("[Macro] [OK] Input listeners started - recording user actions")
        except Exception as e:
            print(f"[Macro] [FAIL] Could not start input listeners: {e}")

        return {"status": "recording", "message": "Capturing mouse clicks, scroll, and keyboard input"}

    def stop_macro_recording(self, name):
        """Stop recording, stop listeners, and save the macro."""
        self.macro_recording = False

        # Stop input listeners
        try:
            if hasattr(self, '_mouse_listener') and self._mouse_listener:
                self._mouse_listener.stop()
                self._mouse_listener = None
            if hasattr(self, '_keyboard_listener') and self._keyboard_listener:
                self._keyboard_listener.stop()
                self._keyboard_listener = None
            print("[Macro] Input listeners stopped")
        except Exception as e:
            print(f"[Macro] Error stopping listeners: {e}")

        # Calculate duration
        duration = round(time.time() - getattr(self, '_macro_start_time', time.time()), 1)

        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        try:
            with open(macro_file, 'w') as f:
                json.dump({
                    "name": name,
                    "created": datetime.now().isoformat(),
                    "duration_seconds": duration,
                    "actions": self.macro_actions
                }, f, indent=2)
            print(f"[Macro] [OK] Saved '{name}' with {len(self.macro_actions)} actions ({duration}s)")
            return {"status": "saved", "filename": macro_file, "action_count": len(self.macro_actions), "duration": duration}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def add_macro_action(self, action_type, params):
        """Add an action to the current macro being recorded."""
        if self.macro_recording:
            self.macro_actions.append({
                "type": action_type,
                "params": params,
                "timestamp": time.time()
            })

    def list_macros(self):
        """List all saved macros."""
        macros = []
        if os.path.exists(self.macros_dir):
            for f in os.listdir(self.macros_dir):
                if f.endswith('.json'):
                    filepath = os.path.join(self.macros_dir, f)
                    try:
                        with open(filepath, 'r') as fh:
                            data = json.load(fh)
                            macros.append({
                                "name": data.get("name", f[:-5]),
                                "action_count": len(data.get("actions", [])),
                                "created": data.get("created", ""),
                                "filename": f
                            })
                    except Exception:
                        pass
        return macros

    def play_macro(self, name):
        """Replay a saved macro."""
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if not os.path.exists(macro_file):
            return {"status": "error", "message": f"Macro '{name}' not found"}

        try:
            with open(macro_file, 'r') as f:
                data = json.load(f)

            actions = data.get("actions", [])
            executed = 0

            for action in actions:
                a_type = action.get("type")
                params = action.get("params", {})

                if a_type == "click":
                    x, y = params.get("x", 0), params.get("y", 0)
                    pyautogui.moveTo(x, y, duration=0.15)
                    pyautogui.click()
                elif a_type == "scroll":
                    x, y = params.get("x", 0), params.get("y", 0)
                    dy = params.get("dy", 0)
                    pyautogui.moveTo(x, y, duration=0.1)
                    pyautogui.scroll(dy)
                elif a_type == "key":
                    key_name = params.get("key", "")
                    # Map pynput key names to pyautogui
                    key_map = {
                        'enter': 'enter', 'return': 'enter',
                        'space': 'space', 'tab': 'tab',
                        'backspace': 'backspace', 'delete': 'delete',
                        'escape': 'escape', 'esc': 'escape',
                        'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right',
                        'home': 'home', 'end': 'end',
                        'page_up': 'pageup', 'page_down': 'pagedown',
                    }
                    mapped = key_map.get(key_name, key_name)
                    try:
                        pyautogui.press(mapped)
                    except Exception:
                        pyautogui.typewrite(key_name, interval=0.02)
                elif a_type == "type":
                    self.type_text(params.get("text", ""))
                elif a_type == "wait":
                    time.sleep(params.get("seconds", 0.5))
                elif a_type == "navigate":
                    nav_target = params.get("target", "research")
                    if nav_target == "research":
                        self.navigate_to_research()

                executed += 1

            return {"status": "completed", "actions_executed": executed}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_macro(self, name):
        """Delete a saved macro."""
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if os.path.exists(macro_file):
            os.remove(macro_file)
            return {"status": "deleted"}
        return {"status": "error", "message": "Macro not found"}

    # ──────────────────────────────────────
    # Auto-Scan Sequence (Phase 3)
    # ──────────────────────────────────────

    def run_auto_scan_sequence(self, organ_coords_list):
        """
        Runs an automated scan sequence through a list of organ coordinates.
        organ_coords_list: [{'name': 'Heart', 'x': 500, 'y': 300}, ...]
        Returns results for each organ.
        """
        results = []
        for organ in organ_coords_list:
            try:
                # Navigate to organ
                self.safe_click((organ['x'], organ['y']), delay=1.5)

                # Wait for screen to load
                time.sleep(2)

                # Capture and analyze
                frame = self.capture_screen()
                if frame is not None:
                    summary = self.summarize_scan(frame)
                    summary['organ_name'] = organ.get('name', summary['organ_name'])
                    results.append({
                        "organ": organ.get('name', 'Unknown'),
                        "status": "success",
                        "analysis": summary
                    })
                else:
                    results.append({
                        "organ": organ.get('name', 'Unknown'),
                        "status": "error",
                        "message": "Capture failed"
                    })
            except Exception as e:
                results.append({
                    "organ": organ.get('name', 'Unknown'),
                    "status": "error",
                    "message": str(e)
                })

        return results

    # ──────────────────────────────────────
    # Navigation & Input
    # ──────────────────────────────────────

    def navigate_to_research(self):
        """Clicks the Research button."""
        coords = self.coords.get('research_btn', (100, 100))
        print(f"Navigating to Research at {coords}")
        self.safe_click(coords)

    def safe_click(self, coords, delay=0.5):
        """Moves to coordinates and clicks safely."""
        try:
            x, y = coords
            pyautogui.moveTo(x, y, duration=0.2)
            pyautogui.click()
            pyautogui.sleep(delay)
            # Record macro action if recording
            if self.macro_recording:
                self.add_macro_action("click", {"x": x, "y": y, "delay": delay})
        except Exception as e:
            print(f"Error clicking at {coords}: {e}")

    def type_text(self, text):
        """Types text safely."""
        try:
            pyautogui.write(text, interval=0.1)
            if self.macro_recording:
                self.add_macro_action("type", {"text": text})
        except Exception as e:
            print(f"Error typing text: {e}")


if __name__ == "__main__":
    bot = NLSAutomation()
    print("Automation Engine Initialized")
    img = bot.capture_screen()
    if img is not None:
        print(f"Screen captured: {img.shape}")
        summary = bot.summarize_scan(img)
        print(f"Analysis: {summary['status']}")
        print(f"Counts: {summary['counts']}")

        # Test heatmap
        hm = bot.generate_heatmap(img, summary['points'])
        if hm:
            print(f"Heatmap generated (base64 length: {len(hm)})")

        # Test monitors
        monitors = bot.get_monitors()
        print(f"Monitors available: {len(monitors)}")

        # Test snapshot
        path, thumb = bot.take_snapshot()
        if path:
            print(f"Snapshot saved: {path}")
    else:
        print("Screen capture failed")
