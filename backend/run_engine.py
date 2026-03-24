"""
Vibrana Run Engine — Automated Data Collection via Learned Program Tree

After the LogicMapper has learned a program's UI tree (nodes = screens, edges = clicks),
the RunEngine traverses that tree depth-first, collecting NLS scan data at each screen:
  - Screenshot capture
  - OCR text extraction via NLSOCRParser
  - Entropy/nidal point analysis via NLSAutomation
  - Heatmap generation
  - Structured run results stored per-screen

Intelligence features:
  - Remembers which screens were already scanned (persists across retries)
  - Retries focus recovery up to 3 times before skipping a screen
  - Verifies captures by comparing consecutive frames
  - Saves partial results on abort so nothing is lost

Usage:
    engine = RunEngine(logic_mapper, bot)
    engine.start_run(patient_id="p123")
    # Poll: engine.get_status()
    # Stop: engine.stop_run()
    # Results: engine.get_results()
"""

import threading
import time
import uuid
import base64
import json
import os
import cv2
import numpy as np
import mss
import pygetwindow as gw
try:
    import win32gui
    import win32con
    import win32process
    import ctypes
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False
from datetime import datetime
from nls_ocr_parser import NLSOCRParser

# Persistent memory file for scan history
SCAN_MEMORY_FILE = os.path.join(os.path.dirname(__file__), "run_memory.json")

MAX_FOCUS_RETRIES = 3
FOCUS_RETRY_DELAY = 0.5
CAPTURE_VERIFY_THRESHOLD = 0.02  # If < 2% of pixels changed, capture is likely stale


class RunEngine:
    """Traverses a learned UI tree and collects NLS scan data at each screen."""

    def __init__(self, logic_mapper, bot=None):
        self.mapper = logic_mapper
        self.bot = bot
        self.ocr_parser = NLSOCRParser()

        # Run state
        self._running = False
        self._abort = False
        self._thread = None
        self._run_data = None
        self._progress = {"current_screen": 0, "total_screens": 0, "current_node": "", "pct": 0, "status_text": ""}
        self._run_history = []
        self._scanned_nodes = set()  # Persistent memory of already-scanned node IDs
        self._last_frame = None  # Previous frame for stale detection
        self._focus_failures = 0

        # Load persistent scan memory
        self._load_memory()

    # ─────────────────────────────────────────
    # PERSISTENT SCAN MEMORY
    # ─────────────────────────────────────────

    def _load_memory(self):
        """Load scan memory from disk."""
        try:
            if os.path.exists(SCAN_MEMORY_FILE):
                with open(SCAN_MEMORY_FILE, 'r') as f:
                    data = json.load(f)
                    self._scanned_nodes = set(data.get("scanned_nodes", []))
                    self._run_history = data.get("history", [])
                    print(f"[RunEngine] Loaded memory: {len(self._scanned_nodes)} scanned nodes, {len(self._run_history)} past runs")
        except Exception as e:
            print(f"[RunEngine] Memory load error: {e}")

    def _save_memory(self):
        """Save scan memory to disk."""
        try:
            data = {
                "scanned_nodes": list(self._scanned_nodes),
                "history": self._run_history[-10:],  # Keep last 10 runs
                "saved_at": datetime.now().isoformat()
            }
            with open(SCAN_MEMORY_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[RunEngine] Memory save error: {e}")

    def clear_memory(self):
        """Clear all scan memory."""
        self._scanned_nodes.clear()
        self._run_history.clear()
        self._last_frame = None
        self._focus_failures = 0
        try:
            if os.path.exists(SCAN_MEMORY_FILE):
                os.remove(SCAN_MEMORY_FILE)
        except Exception:
            pass
        return {"status": "memory_cleared"}

    # ─────────────────────────────────────────
    # FOCUS MANAGEMENT (AGGRESSIVE)
    # ─────────────────────────────────────────

    def _refocus_window(self):
        """Aggressively bring the target window to the foreground with retry."""
        target = self.mapper.target_window
        if not target:
            return True  # No target = nothing to focus

        for attempt in range(MAX_FOCUS_RETRIES):
            try:
                windows = gw.getWindowsWithTitle(target)
                if not windows:
                    print(f"[RunEngine] Window '{target}' not found (attempt {attempt+1})")
                    time.sleep(FOCUS_RETRY_DELAY)
                    continue

                win = windows[0]

                # Restore if minimized
                if win.isMinimized:
                    win.restore()
                    time.sleep(0.4)

                # Use win32gui for reliable foreground activation
                if HAS_WIN32:
                    hwnd = win._hWnd
                    success = False

                    # Method 1: Direct SetForegroundWindow
                    try:
                        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                        win32gui.SetForegroundWindow(hwnd)
                        success = True
                    except Exception:
                        pass

                    # Method 2: AttachThreadInput trick
                    if not success:
                        try:
                            fg_hwnd = win32gui.GetForegroundWindow()
                            if fg_hwnd != hwnd:
                                fg_thread = win32process.GetWindowThreadProcessId(fg_hwnd)[0]
                                target_thread = win32process.GetWindowThreadProcessId(hwnd)[0]
                                if fg_thread != target_thread:
                                    ctypes.windll.user32.AttachThreadInput(fg_thread, target_thread, True)
                                    win32gui.SetForegroundWindow(hwnd)
                                    ctypes.windll.user32.AttachThreadInput(fg_thread, target_thread, False)
                                    success = True
                        except Exception as e2:
                            print(f"[RunEngine] AttachThread failed: {e2}")

                    # Method 3: Alt-key hack (Windows lets SetForegroundWindow work after simulated input)
                    if not success:
                        try:
                            import pyautogui
                            pyautogui.press('alt')
                            time.sleep(0.05)
                            win32gui.SetForegroundWindow(hwnd)
                        except Exception:
                            pass
                else:
                    try:
                        win.activate()
                    except Exception:
                        pass

                time.sleep(0.2)

                # Verify focus was acquired
                if HAS_WIN32:
                    fg = win32gui.GetForegroundWindow()
                    if fg == win._hWnd:
                        self._focus_failures = 0
                        # Update cached bounds
                        self.mapper.target_box = {
                            "top": win.top, "left": win.left,
                            "width": win.width, "height": win.height
                        }
                        return True
                    else:
                        print(f"[RunEngine] Focus verify failed (attempt {attempt+1}), foreground is {win32gui.GetWindowText(fg)}")
                        time.sleep(FOCUS_RETRY_DELAY)
                        continue
                else:
                    # Can't verify on non-Windows
                    self.mapper.target_box = {
                        "top": win.top, "left": win.left,
                        "width": win.width, "height": win.height
                    }
                    return True

            except Exception as e:
                print(f"[RunEngine] Refocus error (attempt {attempt+1}): {e}")
                time.sleep(FOCUS_RETRY_DELAY)

        self._focus_failures += 1
        print(f"[RunEngine] ⚠️ Focus failed after {MAX_FOCUS_RETRIES} retries (total failures: {self._focus_failures})")
        return False

    def _verify_capture(self, frame):
        """Check if the captured frame is actually from the target window (not stale)."""
        if frame is None:
            return False
        if self._last_frame is not None:
            try:
                # Compare with previous frame
                gray_new = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
                gray_old = cv2.cvtColor(self._last_frame, cv2.COLOR_BGR2GRAY) if len(self._last_frame.shape) == 3 else self._last_frame
                if gray_new.shape == gray_old.shape:
                    diff = cv2.absdiff(gray_new, gray_old)
                    change_pct = np.count_nonzero(diff > 25) / diff.size
                    # If frames are identical, we might be capturing the wrong window
                    if change_pct < CAPTURE_VERIFY_THRESHOLD:
                        print(f"[RunEngine] ⚠️ Frame looks stale ({change_pct:.2%} change)")
                        return False
            except Exception:
                pass
        self._last_frame = frame.copy()
        return True

    # ─────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────

    def start_run(self, patient_id=None, resume=True):
        """Start a data collection run. If resume=True, skip already-scanned nodes."""
        if self._running:
            return {"error": "A run is already in progress"}

        tree = self.mapper.tree
        if not tree or not tree.get("nodes"):
            return {"error": "No program tree learned. Map the UI first."}

        self._abort = False
        self._running = True
        self._focus_failures = 0

        # Count how many nodes we need to scan (excluding already-scanned if resuming)
        total_nodes = len(tree.get("nodes", []))
        already_scanned = len(self._scanned_nodes) if resume else 0

        self._run_data = {
            "id": str(uuid.uuid4())[:12],
            "patient_id": patient_id,
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "status": "running",
            "resumed": resume and already_scanned > 0,
            "screens": [],
            "skipped_screens": already_scanned,
            "summary": {},
            "tree_snapshot": {
                "node_count": total_nodes,
                "edge_count": len(tree.get("edges", []))
            }
        }
        self._progress = {
            "current_screen": 0,
            "total_screens": total_nodes,
            "current_node": "",
            "pct": 0,
            "status_text": f"Iniciando... ({already_scanned} ya escaneados)" if already_scanned else "Iniciando..."
        }

        if not resume:
            self._scanned_nodes.clear()

        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

        return {"status": "started", "run_id": self._run_data["id"], "resuming": resume and already_scanned > 0}

    def stop_run(self):
        """Abort the current run. Partial results are saved."""
        self._abort = True
        self._save_memory()
        return {"status": "stopping", "screens_saved": len(self._run_data["screens"]) if self._run_data else 0}

    def get_status(self):
        return {
            "running": self._running,
            "progress": self._progress,
            "run_id": self._run_data["id"] if self._run_data else None,
            "screens_collected": len(self._run_data["screens"]) if self._run_data else 0,
            "focus_failures": self._focus_failures
        }

    def get_results(self, run_id=None):
        if run_id:
            for run in self._run_history:
                if run["id"] == run_id:
                    return run
            return {"error": f"Run {run_id} not found"}
        if self._run_data:
            return self._run_data
        elif self._run_history:
            return self._run_history[-1]
        return {"error": "No runs available"}

    def get_history(self):
        return [{
            "id": r["id"],
            "patient_id": r.get("patient_id"),
            "started_at": r["started_at"],
            "finished_at": r.get("finished_at"),
            "status": r["status"],
            "screen_count": len(r.get("screens", [])),
            "summary": r.get("summary", {})
        } for r in self._run_history]

    # ─────────────────────────────────────────
    # RUN LOOP (background thread)
    # ─────────────────────────────────────────

    def _run_loop(self):
        """Main run loop with intelligent traversal."""
        try:
            tree = self.mapper.tree
            nodes = tree.get("nodes", [])
            edges = tree.get("edges", [])

            node_map = {n["id"]: n for n in nodes}
            children_of = {}
            for e in edges:
                if e["from"] not in children_of:
                    children_of[e["from"]] = []
                children_of[e["from"]].append(e)

            target_ids = set(e["to"] for e in edges)
            root_ids = [n["id"] for n in nodes if n["id"] not in target_ids]
            if not root_ids and nodes:
                root_ids = [nodes[0]["id"]]

            total = len(nodes)
            self._progress["total_screens"] = total
            visited = set()
            screen_idx = 0

            for root_id in root_ids:
                if self._abort:
                    break
                screen_idx = self._traverse_node(root_id, node_map, children_of, visited, screen_idx, total)

            self._run_data["finished_at"] = datetime.now().isoformat()
            self._run_data["status"] = "aborted" if self._abort else "finished"
            self._run_data["summary"] = self._build_summary()
            self._run_history.append(self._run_data)
            self._save_memory()

            print(f"[RunEngine] Run {self._run_data['id']} completed: {len(self._run_data['screens'])} screens")

        except Exception as e:
            print(f"[RunEngine] Run error: {e}")
            import traceback
            traceback.print_exc()
            if self._run_data:
                self._run_data["status"] = "error"
                self._run_data["error"] = str(e)
                self._save_memory()
        finally:
            self._running = False

    def _traverse_node(self, node_id, node_map, children_of, visited, screen_idx, total):
        """Recursively traverse with intelligence: skip scanned, retry on failure."""
        if self._abort or node_id in visited:
            return screen_idx

        visited.add(node_id)
        node = node_map.get(node_id)
        if not node:
            return screen_idx

        screen_idx += 1
        self._progress["current_screen"] = screen_idx
        self._progress["current_node"] = node_id[:8]
        self._progress["pct"] = int((screen_idx / max(total, 1)) * 100)

        # Check if already scanned in a previous run
        if node_id in self._scanned_nodes:
            self._progress["status_text"] = f"⏭ Saltando {node_id[:8]} (ya escaneado)"
            print(f"[RunEngine] Skipping already-scanned node {node_id[:8]}")
        else:
            self._progress["status_text"] = f"📸 Escaneando {node_id[:8]}..."

            # Attempt capture with retry
            screen_data = None
            for attempt in range(MAX_FOCUS_RETRIES):
                focused = self._refocus_window()
                if not focused and attempt < MAX_FOCUS_RETRIES - 1:
                    self._progress["status_text"] = f"🔄 Reintentando foco ({attempt+2}/{MAX_FOCUS_RETRIES})..."
                    time.sleep(1.0)
                    continue

                screen_data = self._collect_screen_data(node_id, node)

                # If capture failed, retry
                if screen_data.get("error") and attempt < MAX_FOCUS_RETRIES - 1:
                    self._progress["status_text"] = f"⚠️ Reintentando captura ({attempt+2}/{MAX_FOCUS_RETRIES})..."
                    time.sleep(1.0)
                    continue
                break

            if screen_data:
                self._run_data["screens"].append(screen_data)
                self._scanned_nodes.add(node_id)
                # Auto-save progress every 3 screens
                if len(self._run_data["screens"]) % 3 == 0:
                    self._save_memory()

        # Traverse children
        children = children_of.get(node_id, [])
        for edge in children:
            if self._abort:
                break

            x = edge.get("x", 0)
            y = edge.get("y", 0)
            text = edge.get("text", "")

            self._progress["status_text"] = f"👆 Clic '{text}'..."

            # Focus before clicking
            self._refocus_window()
            time.sleep(0.2)

            result = self.mapper.execute_click(x, y, text, node_id)
            if "error" in result:
                print(f"[RunEngine] Click error on '{text}': {result['error']}")
                # Don't give up — try the next edge
                continue

            time.sleep(1.0)

            child_id = edge.get("to")
            if child_id:
                screen_idx = self._traverse_node(child_id, node_map, children_of, visited, screen_idx, total)

        return screen_idx

    # ─────────────────────────────────────────
    # DATA COLLECTION PER SCREEN
    # ─────────────────────────────────────────

    def _collect_screen_data(self, node_id, node):
        result = {
            "node_id": node_id,
            "timestamp": datetime.now().isoformat(),
            "buttons_count": len(node.get("buttons", [])),
            "ocr": {}, "entropy": {}, "heatmap": None, "screenshot": None, "error": None
        }

        try:
            frame = self._capture_screen()
            if frame is None:
                result["error"] = "Failed to capture screen"
                return result

            # Verify capture isn't stale
            if not self._verify_capture(frame):
                # Try once more with a longer wait
                time.sleep(0.5)
                self._refocus_window()
                time.sleep(0.3)
                frame = self._capture_screen_raw()
                if frame is None:
                    result["error"] = "Stale capture after retry"
                    return result

            result["screenshot"] = self._encode_thumbnail(frame, max_width=400)

            ocr_result = self.ocr_parser.analyze_screen(frame)
            result["ocr"] = {
                "header": ocr_result.get("header", ""),
                "status_bar": ocr_result.get("status_bar", ""),
                "raw_text": ocr_result.get("raw_text", "")[:500],
                "nls_data": ocr_result.get("nls_data", {}),
                "summary": ocr_result.get("summary", ""),
                "nls_window_detected": ocr_result.get("nls_window_detected", False)
            }

            if self.bot:
                try:
                    scan_summary = self.bot.summarize_scan(frame)
                    result["entropy"] = {
                        "total_points": scan_summary.get("total_points", 0),
                        "counts": scan_summary.get("counts", {}),
                        "points": scan_summary.get("points", [])[:50]
                    }
                    points = scan_summary.get("points", [])
                    if points:
                        heatmap_b64 = self.bot.generate_heatmap(frame, points)
                        result["heatmap"] = heatmap_b64
                except Exception as e:
                    print(f"[RunEngine] Entropy error: {e}")
                    result["entropy"]["error"] = str(e)

        except Exception as e:
            print(f"[RunEngine] Screen collection error: {e}")
            result["error"] = str(e)

        return result

    def _capture_screen_raw(self):
        """Raw screen capture without refocus (used for retry)."""
        try:
            with mss.mss() as sct:
                if self.mapper.target_box:
                    monitor = self.mapper.target_box
                else:
                    monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                screenshot = np.array(sct.grab(monitor))
                if screenshot.shape[2] == 4:
                    screenshot = cv2.cvtColor(screenshot, cv2.COLOR_BGRA2BGR)
                return screenshot
        except Exception as e:
            print(f"[RunEngine] Capture error: {e}")
            return None

    def _capture_screen(self):
        """Capture with focus."""
        self._refocus_window()
        return self._capture_screen_raw()

    def _encode_thumbnail(self, frame, max_width=400):
        try:
            h, w = frame.shape[:2]
            if w > max_width:
                scale = max_width / w
                frame = cv2.resize(frame, (max_width, int(h * scale)))
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            return base64.b64encode(buffer).decode('utf-8')
        except Exception:
            return None

    # ─────────────────────────────────────────
    # RUN SUMMARY
    # ─────────────────────────────────────────

    def _build_summary(self):
        screens = self._run_data.get("screens", [])
        if not screens:
            return {"total_screens": 0}

        total_entropy_points = 0
        level_counts = {}
        ocr_screens = 0
        nls_screens = 0
        headers = []
        errors = 0

        for s in screens:
            if s.get("error"):
                errors += 1
                continue
            entropy = s.get("entropy", {})
            total_entropy_points += entropy.get("total_points", 0)
            for level, count in entropy.get("counts", {}).items():
                level_counts[level] = level_counts.get(level, 0) + count
            ocr = s.get("ocr", {})
            if ocr.get("raw_text"):
                ocr_screens += 1
            if ocr.get("nls_window_detected"):
                nls_screens += 1
            if ocr.get("header"):
                headers.append(ocr["header"])

        high = level_counts.get("5", 0) + level_counts.get("6", 0)
        low = level_counts.get("1", 0) + level_counts.get("2", 0)
        mid = level_counts.get("3", 0) + level_counts.get("4", 0)

        if high > low * 2:
            overall_status = "critical"
        elif high > mid:
            overall_status = "warning"
        elif total_entropy_points == 0:
            overall_status = "no_data"
        else:
            overall_status = "normal"

        return {
            "total_screens": len(screens),
            "screens_with_ocr": ocr_screens,
            "screens_with_nls": nls_screens,
            "total_entropy_points": total_entropy_points,
            "level_counts": level_counts,
            "overall_status": overall_status,
            "headers_found": headers,
            "errors": errors,
            "focus_failures": self._focus_failures,
            "duration_seconds": self._calc_duration()
        }

    def _calc_duration(self):
        try:
            start = datetime.fromisoformat(self._run_data["started_at"])
            end_str = self._run_data.get("finished_at") or datetime.now().isoformat()
            end = datetime.fromisoformat(end_str)
            return int((end - start).total_seconds())
        except Exception:
            return 0
