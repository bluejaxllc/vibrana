import cv2
import pytesseract
import pyautogui
import time
import json
import os
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
        # Don't reset explored_texts here — memory persists across sessions
        self.bot = bot
        return {"status": "started", "message": "Logic mapping session started"}

    def reset_memory(self):
        """Clears the explored_texts memory so Auto-Explore re-visits all buttons."""
        self.explored_texts.clear()
        return {"status": "memory_cleared", "message": "Click memory reset"}

    def stop_session(self):
        self.session_active = False
        return {"status": "stopped", "message": "Session ended", "tree": self.tree}

    def _process_image_for_ocr(self, image):
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        # We process both normal and inverted versions since some buttons might be dark on light, or light on dark
        return gray

    def detect_buttons(self, image=None, roi=None):
        """Captures screen and returns bounding boxes of detected text/buttons.
        roi: optional dict {x, y, w, h} as percentages (0-100) to restrict detection area.
        """
        with mss.mss() as sct:
            # monitors[0] = ALL screens combined (virtual desktop) — BAD for clicking
            # monitors[1] = primary monitor — correct default
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]

            if self.target_window:
                windows = gw.getWindowsWithTitle(self.target_window)
                if windows:
                    win = windows[0]
                    if win.isMinimized:
                        win.restore()
                    try:
                        win.activate()
                    except Exception:
                        pass
                    time.sleep(0.1)
                    monitor = {
                        "top": win.top,
                        "left": win.left,
                        "width": win.width,
                        "height": win.height
                    }
                    target_box = monitor
                    print(f"[DetectButtons] Target window '{self.target_window}' bounds: {monitor}")
                else:
                    print(f"[DetectButtons] WARNING: Window '{self.target_window}' not found!")
            
            self.target_box = monitor
            print(f"[DetectButtons] Capturing monitor region: {monitor}")

            if image is None:
                time.sleep(0.5)
                sct_img = sct.grab(monitor)
                screenshot = np.array(sct_img)
                if screenshot.shape[2] == 4:
                    screenshot = cv2.cvtColor(screenshot, cv2.COLOR_BGRA2BGR)
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
            if conf > 60 and len(text) > 2:  # Higher threshold + min length to filter garbled OCR noise
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

        h, w = screenshot.shape[:2]

        return {
            "status": "success",
            "node_id": node_id,
            "buttons": buttons,
            "screen_width": img_w,
            "screen_height": img_h,
            "screen": encoded_image,
            "tree": self.tree,
            "explored_texts": list(self.explored_texts)
        }

    def _encode_frame(self, frame):
        # Resize slightly to reduce base64 size for the overlay, if desired
        # Or keep original. Let's resize height to 720p to save bandwidth
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

    def execute_click(self, x, y, text, from_node_id):
        """Clicks the coordinate, waits for UI to change, then mapped connection."""
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
            time.sleep(1.5)
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

    def auto_explore(self, max_steps=10, ignored_texts=None, roi=None):
        if ignored_texts is None:
            ignored_texts = []
        if not self.session_active:
            return {"error": "Session must be started before auto-exploring"}

        self._auto_explore_abort = False
        # Use persistent memory instead of local set — skips previously visited buttons
        dangerous_keywords = ['exit', 'quit', 'close', 'delete', 'remove', 'cancel']
        
        for t in ignored_texts:
            dangerous_keywords.append(t.lower())
        
        steps_taken = 0
        
        for _ in range(max_steps):
            if self._auto_explore_abort or not self.session_active:
                print(f"[Auto-Explore] Aborted (abort={self._auto_explore_abort}, active={self.session_active})")
                break
                
            current_node = next((n for n in self.tree["nodes"] if n["id"] == self.current_node_id), None)
            if not current_node:
                print(f"[Auto-Explore] No current node found for id={self.current_node_id}")
                break
            if not current_node.get("buttons"):
                print(f"[Auto-Explore] Node has no buttons")
                break
                
            buttons = current_node["buttons"]
            
            # Find unclicked safe buttons (uses persistent self.explored_texts)
            safe_unclicked = []
            for b in buttons:
                txt_lower = b["text"].lower()
                if b["text"] not in self.explored_texts and not any(d in txt_lower for d in dangerous_keywords):
                    safe_unclicked.append(b)
            
            print(f"[Auto-Explore] {len(buttons)} total buttons, {len(safe_unclicked)} safe/unclicked, explored: {self.explored_texts}")
            
            if not safe_unclicked:
                print(f"[Auto-Explore] No safe unclicked buttons left")
                break
                
            btn_to_click = safe_unclicked[0]
            self.explored_texts.add(btn_to_click["text"])
            
            # Use CLICK_Y_RATIO for better targeting (slightly above center)
            cx = int(btn_to_click["x"] + btn_to_click["w"] / 2)
            cy = int(btn_to_click["y"] + btn_to_click["h"] * CLICK_Y_RATIO)
            
            print(f"[Auto-Explore] Step {steps_taken+1}: Clicking '{btn_to_click['text']}' at ({cx}, {cy})")
            last_result = self.execute_click(cx, cy, btn_to_click["text"], self.current_node_id)
            if "error" in last_result:
                print(f"[Auto-Explore] Click error: {last_result['error']}")
                break
            steps_taken += 1
            
        # Always return a fresh detection with the full tree
        final = self.detect_buttons(roi=roi)
        return {"status": "finished", "steps_taken": steps_taken, "tree": self.tree, "new_state": final}

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
        actions = []
        for edge in self.tree.get("edges", []):
            if edge.get("action") == "click":
                text = edge.get("text", "").strip()
                if text:
                    actions.append({
                        "type": "ocr_click",
                        "params": {"text": text, "timeout": 15}
                    })
                else:
                    actions.append({
                        "type": "click",
                        "params": {"x": edge.get("x", 0), "y": edge.get("y", 0)}
                    })
                actions.append({
                    "type": "wait",
                    "params": {"seconds": 2.0}
                })
        
        return macro_engine.save_macro(name, actions)

# Global instance
mapper = LogicMapper()
