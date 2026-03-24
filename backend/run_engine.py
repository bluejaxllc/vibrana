"""
Vibrana Run Engine — Automated Data Collection via Learned Program Tree

After the LogicMapper has learned a program's UI tree (nodes = screens, edges = clicks),
the RunEngine traverses that tree depth-first, collecting NLS scan data at each screen:
  - Screenshot capture
  - OCR text extraction via NLSOCRParser
  - Entropy/nidal point analysis via NLSAutomation
  - Heatmap generation
  - Structured run results stored per-screen

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
import cv2
import numpy as np
import mss
import pygetwindow as gw
try:
    import win32gui
    import win32con
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False
from datetime import datetime
from nls_ocr_parser import NLSOCRParser


class RunEngine:
    """Traverses a learned UI tree and collects NLS scan data at each screen."""

    def __init__(self, logic_mapper, bot=None):
        """
        logic_mapper: LogicMapper instance with a populated tree
        bot: NLSAutomation instance (optional — used for heatmap + nidal points)
        """
        self.mapper = logic_mapper
        self.bot = bot
        self.ocr_parser = NLSOCRParser()

        # Run state
        self._running = False
        self._abort = False
        self._thread = None
        self._run_data = None
        self._progress = {"current_screen": 0, "total_screens": 0, "current_node": "", "pct": 0}
        self._run_history = []  # List of completed runs

    def _refocus_window(self):
        """Aggressively bring the target window to the foreground."""
        target = self.mapper.target_window
        if not target:
            return
        try:
            windows = gw.getWindowsWithTitle(target)
            if not windows:
                print(f"[RunEngine] WARNING: Window '{target}' not found!")
                return
            win = windows[0]
            if win.isMinimized:
                win.restore()
                import time as _t
                _t.sleep(0.3)
            # Try win32gui first (most reliable on Windows)
            if HAS_WIN32:
                hwnd = win._hWnd
                try:
                    # If window is minimized or in background, ShowWindow first
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                    win32gui.SetForegroundWindow(hwnd)
                except Exception:
                    # Fallback: use AttachThreadInput trick
                    try:
                        import win32process
                        import win32api
                        fg_thread = win32process.GetWindowThreadProcessId(win32gui.GetForegroundWindow())[0]
                        target_thread = win32process.GetWindowThreadProcessId(hwnd)[0]
                        if fg_thread != target_thread:
                            import ctypes
                            ctypes.windll.user32.AttachThreadInput(fg_thread, target_thread, True)
                            win32gui.SetForegroundWindow(hwnd)
                            ctypes.windll.user32.AttachThreadInput(fg_thread, target_thread, False)
                    except Exception as e2:
                        print(f"[RunEngine] win32 fallback failed: {e2}")
            else:
                # pygetwindow fallback
                try:
                    win.activate()
                except Exception:
                    pass
            time.sleep(0.2)
            # Update cached window bounds
            self.mapper.target_box = {
                "top": win.top,
                "left": win.left,
                "width": win.width,
                "height": win.height
            }
            print(f"[RunEngine] Refocused window '{target}' at ({win.left}, {win.top})")
        except Exception as e:
            print(f"[RunEngine] Refocus error: {e}")

    # ─────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────

    def start_run(self, patient_id=None):
        """Start a data collection run in a background thread."""
        if self._running:
            return {"error": "A run is already in progress"}

        tree = self.mapper.tree
        if not tree or not tree.get("nodes"):
            return {"error": "No program tree learned. Map the UI first."}

        self._abort = False
        self._running = True
        self._run_data = {
            "id": str(uuid.uuid4())[:12],
            "patient_id": patient_id,
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "status": "running",
            "screens": [],
            "summary": {},
            "tree_snapshot": {
                "node_count": len(tree.get("nodes", [])),
                "edge_count": len(tree.get("edges", []))
            }
        }
        self._progress = {"current_screen": 0, "total_screens": len(tree["nodes"]), "current_node": "", "pct": 0}

        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

        return {"status": "started", "run_id": self._run_data["id"]}

    def stop_run(self):
        """Abort the current run."""
        self._abort = True
        return {"status": "stopping"}

    def get_status(self):
        """Get current run progress."""
        return {
            "running": self._running,
            "progress": self._progress,
            "run_id": self._run_data["id"] if self._run_data else None,
            "screens_collected": len(self._run_data["screens"]) if self._run_data else 0
        }

    def get_results(self, run_id=None):
        """Get results. If run_id is None, returns the latest run."""
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
        """List all completed runs (without full screen data for brevity)."""
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
        """Main run loop — traverses tree and collects data."""
        try:
            tree = self.mapper.tree
            nodes = tree.get("nodes", [])
            edges = tree.get("edges", [])

            # Build adjacency map
            node_map = {n["id"]: n for n in nodes}
            children_of = {}
            for e in edges:
                if e["from"] not in children_of:
                    children_of[e["from"]] = []
                children_of[e["from"]].append(e)

            # Find root nodes
            target_ids = set(e["to"] for e in edges)
            root_ids = [n["id"] for n in nodes if n["id"] not in target_ids]
            if not root_ids and nodes:
                root_ids = [nodes[0]["id"]]

            total = len(nodes)
            self._progress["total_screens"] = total
            visited = set()
            screen_idx = 0

            # DFS traversal
            for root_id in root_ids:
                if self._abort:
                    break
                screen_idx = self._traverse_node(root_id, node_map, children_of, visited, screen_idx, total)

            # Finalize
            self._run_data["finished_at"] = datetime.now().isoformat()
            self._run_data["status"] = "aborted" if self._abort else "finished"
            self._run_data["summary"] = self._build_summary()
            self._run_history.append(self._run_data)

            print(f"[RunEngine] Run {self._run_data['id']} completed: {len(self._run_data['screens'])} screens collected")

        except Exception as e:
            print(f"[RunEngine] Run error: {e}")
            if self._run_data:
                self._run_data["status"] = "error"
                self._run_data["error"] = str(e)
        finally:
            self._running = False

    def _traverse_node(self, node_id, node_map, children_of, visited, screen_idx, total):
        """Recursively traverse a node and its children, collecting data."""
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

        print(f"[RunEngine] Screen {screen_idx}/{total}: Node {node_id[:8]}")

        # Re-focus target window before capture
        self._refocus_window()

        # Capture and analyze the current screen
        screen_data = self._collect_screen_data(node_id, node)
        self._run_data["screens"].append(screen_data)

        # Traverse children (follow edges from this node)
        children = children_of.get(node_id, [])
        for edge in children:
            if self._abort:
                break

            # Click the button to navigate to child screen
            x = edge.get("x", 0)
            y = edge.get("y", 0)
            text = edge.get("text", "")

            print(f"[RunEngine] Clicking '{text}' at ({x}, {y}) to navigate...")
            # Re-focus before clicking
            self._refocus_window()
            result = self.mapper.execute_click(x, y, text, node_id)

            if "error" in result:
                print(f"[RunEngine] Click error: {result['error']}")
                continue

            time.sleep(1.0)  # Wait for UI transition

            # Recurse into child node
            child_id = edge.get("to")
            if child_id:
                screen_idx = self._traverse_node(child_id, node_map, children_of, visited, screen_idx, total)

        return screen_idx

    # ─────────────────────────────────────────
    # DATA COLLECTION PER SCREEN
    # ─────────────────────────────────────────

    def _collect_screen_data(self, node_id, node):
        """Capture screenshot and run full NLS analysis on current screen."""
        result = {
            "node_id": node_id,
            "timestamp": datetime.now().isoformat(),
            "buttons_count": len(node.get("buttons", [])),
            "ocr": {},
            "entropy": {},
            "heatmap": None,
            "screenshot": None,
            "error": None
        }

        try:
            # Capture the screen
            frame = self._capture_screen()
            if frame is None:
                result["error"] = "Failed to capture screen"
                return result

            # Generate a small thumbnail for the result
            result["screenshot"] = self._encode_thumbnail(frame, max_width=400)

            # Run NLS OCR analysis
            ocr_result = self.ocr_parser.analyze_screen(frame)
            result["ocr"] = {
                "header": ocr_result.get("header", ""),
                "status_bar": ocr_result.get("status_bar", ""),
                "raw_text": ocr_result.get("raw_text", "")[:500],  # Truncate for storage
                "nls_data": ocr_result.get("nls_data", {}),
                "summary": ocr_result.get("summary", ""),
                "nls_window_detected": ocr_result.get("nls_window_detected", False)
            }

            # Run entropy/nidal point analysis if bot is available
            if self.bot:
                try:
                    scan_summary = self.bot.summarize_scan(frame)
                    result["entropy"] = {
                        "total_points": scan_summary.get("total_points", 0),
                        "counts": scan_summary.get("counts", {}),
                        "points": scan_summary.get("points", [])[:50]  # Limit points for storage
                    }

                    # Generate heatmap
                    points = scan_summary.get("points", [])
                    if points:
                        heatmap_b64 = self.bot.generate_heatmap(frame, points)
                        result["heatmap"] = heatmap_b64
                except Exception as e:
                    print(f"[RunEngine] Entropy analysis error: {e}")
                    result["entropy"]["error"] = str(e)

        except Exception as e:
            print(f"[RunEngine] Screen data collection error: {e}")
            result["error"] = str(e)

        return result

    def _capture_screen(self):
        """Capture the current screen, using the mapper's target window if set."""
        # Re-focus before capture to ensure we're grabbing the right window
        self._refocus_window()
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
            print(f"[RunEngine] Screen capture error: {e}")
            return None

    def _encode_thumbnail(self, frame, max_width=400):
        """Encode a frame as a base64 JPEG thumbnail."""
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
        """Build aggregate summary across all collected screens."""
        screens = self._run_data.get("screens", [])
        if not screens:
            return {"total_screens": 0}

        total_entropy_points = 0
        level_counts = {}
        ocr_screens = 0
        nls_screens = 0
        headers = []

        for s in screens:
            # Entropy aggregation
            entropy = s.get("entropy", {})
            total_entropy_points += entropy.get("total_points", 0)
            for level, count in entropy.get("counts", {}).items():
                level_counts[level] = level_counts.get(level, 0) + count

            # OCR aggregation
            ocr = s.get("ocr", {})
            if ocr.get("raw_text"):
                ocr_screens += 1
            if ocr.get("nls_window_detected"):
                nls_screens += 1
            if ocr.get("header"):
                headers.append(ocr["header"])

        # Classify overall status based on entropy distribution
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
            "duration_seconds": self._calc_duration()
        }

    def _calc_duration(self):
        """Calculate run duration in seconds."""
        try:
            start = datetime.fromisoformat(self._run_data["started_at"])
            end_str = self._run_data.get("finished_at") or datetime.now().isoformat()
            end = datetime.fromisoformat(end_str)
            return int((end - start).total_seconds())
        except Exception:
            return 0
