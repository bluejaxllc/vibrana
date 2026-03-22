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
        self.bot = None  # Reference to NLSAutomation

    def get_windows(self):
        return [w for w in gw.getAllTitles() if w.strip()]

    def set_target_window(self, title):
        self.target_window = title
        return {"status": "success", "target_window": title}

    def start_session(self, bot=None):
        self.session_active = True
        self.tree = {"nodes": [], "edges": []}
        self.current_node_id = None
        self.bot = bot
        return {"status": "started", "message": "Logic mapping session started"}

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

    def detect_buttons(self, image=None):
        """Captures screen and returns bounding boxes of detected text/buttons"""
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
        for i in range(n_boxes):
            text = results['text'][i].strip()
            conf = int(results['conf'][i])
            if conf > 40 and len(text) > 1:  # Filter out low confidence and single characters
                (x, y, w, h) = (results['left'][i], results['top'][i], results['width'][i], results['height'][i])
                buttons.append({
                    "id": str(uuid.uuid4())[:8],
                    "text": text,
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "conf": conf
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
            "screen_width": w,
            "screen_height": h,
            "screen": encoded_image,
            "tree": self.tree
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
        """Re-acquire the target window position right now."""
        if not self.target_window:
            return None
        windows = gw.getWindowsWithTitle(self.target_window)
        if not windows:
            return None
        win = windows[0]
        if win.isMinimized:
            win.restore()
            time.sleep(0.2)
        try:
            win.activate()
        except Exception:
            pass
        time.sleep(0.1)
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

    def auto_explore(self, max_steps=10, ignored_texts=None):
        if ignored_texts is None:
            ignored_texts = []
        if not self.session_active:
            return {"error": "Session must be started before auto-exploring"}

        self._auto_explore_abort = False
        explored_texts = set()
        # Removed 'x' — it was filtering too many legitimate buttons
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
            
            # Find unclicked safe buttons
            safe_unclicked = []
            for b in buttons:
                txt_lower = b["text"].lower()
                if b["text"] not in explored_texts and not any(d in txt_lower for d in dangerous_keywords):
                    safe_unclicked.append(b)
            
            print(f"[Auto-Explore] {len(buttons)} total buttons, {len(safe_unclicked)} safe/unclicked, explored: {explored_texts}")
            
            if not safe_unclicked:
                print(f"[Auto-Explore] No safe unclicked buttons left")
                break
                
            btn_to_click = safe_unclicked[0]
            explored_texts.add(btn_to_click["text"])
            
            cx = int(btn_to_click["x"] + btn_to_click["w"]/2)
            cy = int(btn_to_click["y"] + btn_to_click["h"]/2)
            
            print(f"[Auto-Explore] Step {steps_taken+1}: Clicking '{btn_to_click['text']}' at ({cx}, {cy})")
            last_result = self.execute_click(cx, cy, btn_to_click["text"], self.current_node_id)
            if "error" in last_result:
                print(f"[Auto-Explore] Click error: {last_result['error']}")
                break
            steps_taken += 1
            
        # Always return a fresh detection with the full tree
        final = self.detect_buttons()
        return {"status": "finished", "steps_taken": steps_taken, "tree": self.tree, "new_state": final}

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
