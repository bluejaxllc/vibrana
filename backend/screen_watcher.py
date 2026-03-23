"""
Vibrana Screen Watcher — Auto Change Detection + NLS-Aware OCR

Runs a background thread that:
1. Captures frames at regular intervals
2. Compares each frame to the previous one via pixel diffing
3. When a significant change is detected:
   - Uses NLSOCRParser to find the NLS window region
   - Extracts header (organ name), data table, status bar
   - Parses structured NLS data (organ codes, descriptions, reserve %)
   - Runs nidal point detection
   - Persists a DiagnosticLog entry to the database
   - Stores the event in memory for live API polling
4. Exposes change events via API polling
"""
import cv2
import time
import threading
import numpy as np
from datetime import datetime
from collections import deque
from nls_ocr_parser import NLSOCRParser


def capture_region(x, y, width=200, height=200):
    """Capture a screen region at (x, y) with given dimensions. Returns numpy frame or None."""
    try:
        import mss
        with mss.mss() as sct:
            monitor = {"top": max(0, y - height // 2), "left": max(0, x - width // 2),
                       "width": width, "height": height}
            img = sct.grab(monitor)
            frame = np.array(img)
            return cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
    except Exception as e:
        print(f"[capture_region] Error: {e}")
        return None


class ScreenWatcher:
    def __init__(self, bot, max_events=200, db_factory=None):
        """
        bot: NLSAutomation instance (provides capture_screen, summarize_scan)
        max_events: max change events to keep in memory
        db_factory: callable that returns a DB session (for auto-persist)
        """
        self.bot = bot
        self.running = False
        self.thread = None
        self.db_factory = db_factory

        # NLS-aware OCR parser
        self.ocr_parser = NLSOCRParser()

        # Detection settings
        self.poll_interval = 1.0        # seconds between frame captures
        self.change_threshold = 0.92    # SSIM below this = significant change
        self.cooldown = 3.0             # seconds to wait after a change before detecting again
        self.min_change_area = 0.01     # minimum fraction of screen that must change

        # State
        self.prev_frame_gray = None
        self.last_change_time = 0
        self.events = deque(maxlen=max_events)
        self.event_id_counter = 0
        self.lock = threading.Lock()

        # Stats
        self.total_changes_detected = 0
        self.total_logs_persisted = 0
        self.watching_since = None

    # ──────────────────────────────────────
    # Control
    # ──────────────────────────────────────

    def start(self, patient_id=None):
        """Start watching for screen changes."""
        if self.running:
            return {"status": "already_running", "watching_since": self.watching_since.isoformat() if self.watching_since else None}

        self.running = True
        self.patient_id = patient_id
        self.watching_since = datetime.now()
        self.prev_frame_gray = None
        self.thread = threading.Thread(target=self._watch_loop, daemon=True)
        self.thread.start()
        return {
            "status": "started",
            "watching_since": self.watching_since.isoformat(),
            "settings": self.get_settings()
        }

    def stop(self):
        """Stop watching."""
        if not self.running:
            return {"status": "not_running"}

        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        duration = (datetime.now() - self.watching_since).total_seconds() if self.watching_since else 0
        return {
            "status": "stopped",
            "total_changes": self.total_changes_detected,
            "duration_seconds": round(duration, 1),
            "events_captured": len(self.events)
        }

    def get_settings(self):
        return {
            "poll_interval": self.poll_interval,
            "change_threshold": self.change_threshold,
            "cooldown": self.cooldown,
            "min_change_area": self.min_change_area
        }

    def update_settings(self, settings):
        """Update detection sensitivity settings."""
        if 'poll_interval' in settings:
            self.poll_interval = max(0.25, float(settings['poll_interval']))
        if 'change_threshold' in settings:
            self.change_threshold = max(0.5, min(0.99, float(settings['change_threshold'])))
        if 'cooldown' in settings:
            self.cooldown = max(0.5, float(settings['cooldown']))
        if 'min_change_area' in settings:
            self.min_change_area = max(0.001, min(0.5, float(settings['min_change_area'])))
        return self.get_settings()

    # ──────────────────────────────────────
    # Event Access
    # ──────────────────────────────────────

    def get_events(self, since_id=0, limit=50):
        """Get change events, optionally filtered to only new ones since a given ID."""
        with self.lock:
            events = [e for e in self.events if e['id'] > since_id]
        return events[-limit:]

    def get_latest(self):
        """Get the most recent change event."""
        with self.lock:
            if self.events:
                return self.events[-1]
        return None

    def get_status(self):
        """Full watcher status."""
        return {
            "running": self.running,
            "watching_since": self.watching_since.isoformat() if self.watching_since else None,
            "total_changes": self.total_changes_detected,
            "events_in_buffer": len(self.events),
            "patient_id": getattr(self, 'patient_id', None),
            "settings": self.get_settings()
        }

    # ──────────────────────────────────────
    # Core Detection Loop
    # ──────────────────────────────────────

    def _watch_loop(self):
        """Background thread: capture → compare → detect → NLS OCR → store."""
        print("[ScreenWatcher] Started watching for changes...")

        while self.running:
            try:
                frame = self.bot.capture_screen()
                if frame is None:
                    time.sleep(self.poll_interval)
                    continue

                # Convert to grayscale for comparison
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                # Downscale for faster comparison
                small = cv2.resize(gray, (640, 360))

                if self.prev_frame_gray is not None:
                    # Check cooldown
                    now = time.time()
                    if now - self.last_change_time < self.cooldown:
                        time.sleep(self.poll_interval)
                        continue

                    # Compute structural similarity
                    change_detected, change_pct = self._detect_change(self.prev_frame_gray, small)

                    if change_detected:
                        self.last_change_time = now
                        self.total_changes_detected += 1
                        print(f"[ScreenWatcher] Change detected! ({change_pct:.1%} changed)")

                        # Run NLS-aware OCR + analysis on FULL resolution frame
                        event = self._process_change(frame, change_pct)
                        with self.lock:
                            self.events.append(event)

                self.prev_frame_gray = small

            except Exception as e:
                print(f"[ScreenWatcher] Error: {e}")

            time.sleep(self.poll_interval)

        print("[ScreenWatcher] Stopped.")

    def _detect_change(self, prev, curr):
        """
        Compare two grayscale frames.
        Returns (is_significant_change, change_percentage).
        """
        # Absolute difference
        diff = cv2.absdiff(prev, curr)

        # Threshold to ignore noise
        _, thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)

        # Calculate percentage of pixels that changed
        total_pixels = thresh.shape[0] * thresh.shape[1]
        changed_pixels = np.count_nonzero(thresh)
        change_pct = changed_pixels / total_pixels

        # SSIM approximation
        mean_prev = np.mean(prev)
        mean_curr = np.mean(curr)
        std_prev = np.std(prev)
        std_curr = np.std(curr)

        if std_prev == 0 or std_curr == 0:
            ssim_approx = 1.0 if np.array_equal(prev, curr) else 0.0
        else:
            covariance = np.mean((prev - mean_prev) * (curr - mean_curr))
            ssim_approx = (2 * mean_prev * mean_curr + 1e-5) * (2 * covariance + 1e-5) / \
                          ((mean_prev**2 + mean_curr**2 + 1e-5) * (std_prev**2 + std_curr**2 + 1e-5))

        is_significant = (ssim_approx < self.change_threshold) and (change_pct > self.min_change_area)
        return is_significant, change_pct

    def _process_change(self, frame, change_pct):
        """
        When a change is detected:
          1. Use NLSOCRParser to extract NLS-specific data (header, table, status)
          2. Run nidal point analysis
          3. Build a comprehensive event
        """
        self.event_id_counter += 1
        timestamp = datetime.now()
        
        # Attach frame for persistence (Phase 11)
        # We don't want to keep this in memory 'events' deque forever, so we'll 
        # use it in _persist_event and then discard it.

        # ── NLS-Aware OCR: Smart region detection + structured parsing ──
        ocr_results = {}
        try:
            ocr_results = self.ocr_parser.analyze_screen(frame)
        except Exception as e:
            print(f"[ScreenWatcher] NLS OCR Error: {e}")
            ocr_results = {"error": str(e), "raw_text": "", "nls_data": {}}

        # ── NLS Nidal Point Analysis ──
        analysis = {}
        try:
            analysis = self.bot.summarize_scan(frame)
        except Exception as e:
            analysis = {"error": str(e)}

        # Build organ name from multiple sources (most specific wins)
        organ_name = (
            ocr_results.get("header", "").strip() or
            analysis.get("organ_name", "") or
            "Unknown"
        )

        # Build structured NLS data rows for the frontend
        nls_data = ocr_results.get("nls_data", {})
        nls_rows = nls_data.get("rows", [])

        event = {
            "id": self.event_id_counter,
            "timestamp": timestamp.isoformat(),
            "change_pct": round(change_pct * 100, 2),
            "organ_detected": organ_name,

            # Raw OCR text (for debugging / full view)
            "ocr_text": ocr_results.get("raw_text", ""),

            # Structured NLS data
            "nls_readings": {
                "rows": nls_rows[:20],  # Cap at 20 rows per event
                "row_count": len(nls_rows),
                "reserve_pct": nls_data.get("reserve_percentage"),
                "keywords": nls_data.get("keywords_found", []),
                "frequencies": nls_data.get("frequencies", []),
            },

            # NLS window detection info
            "nls_window_found": ocr_results.get("nls_window_detected", False),
            "header_text": ocr_results.get("header", ""),
            "status_bar": ocr_results.get("status_bar", ""),
            "summary": ocr_results.get("summary", ""),

            # Nidal point analysis
            "analysis": {
                "total_points": analysis.get("total_points", 0),
                "counts": analysis.get("counts", {}),
                "status": analysis.get("status", "Unknown"),
                "organ_name": analysis.get("organ_name", "Unknown")
            },

            "patient_id": getattr(self, 'patient_id', None)
        }

        print(f"[ScreenWatcher] Event #{event['id']}: organ={organ_name}, "
              f"NLS rows={len(nls_rows)}, points={event['analysis']['total_points']}, "
              f"change={event['change_pct']}%, window={'Y' if event['nls_window_found'] else 'N'}")

        event['_frame'] = frame
        
        # ── Auto-persist to database ──
        self._persist_event(event)
        
        # Remove frame from memory event to avoid RAM bloat
        del event['_frame']

        return event

    def _classify_severity(self, analysis):
        """Classify event severity based on entropy analysis."""
        counts = analysis.get('counts', {})
        status = analysis.get('status', '')
        c6 = int(counts.get(6, counts.get('6', 0)))
        c5 = int(counts.get(5, counts.get('5', 0)))
        c4 = int(counts.get(4, counts.get('4', 0)))
        if 'Pathology' in status or c6 > 0:
            return 'critical'
        if 'Functional' in status or 'Disorder' in status or c5 > 3:
            return 'warning'
        if 'Compensated' in status or c4 > 5:
            return 'attention'
        return 'normal'

    def _persist_event(self, event):
        """Persist a change event as a DiagnosticLog row in the database."""
        if not self.db_factory:
            return
        db = None
        try:
            from models import DiagnosticLog
            db = self.db_factory()
            # Save snapshot to disk (Phase 11)
            snapshot_path = None
            try:
                import os
                snapshot_dir = os.path.join(os.path.dirname(__file__), 'snapshots')
                if not os.path.exists(snapshot_dir):
                    os.makedirs(snapshot_dir)
                
                filename = f"log_{event['id']}_{int(time.time())}.jpg"
                snapshot_path = os.path.join(snapshot_dir, filename)
                # We need the original 'frame' which is not in the 'event' dict. 
                # I'll pass it to _persist_event or assume it's available.
                # Let's use the bot to save it.
                cv2.imwrite(snapshot_path, event.get('_frame')) # I'll add _frame to event temporarily
            except Exception as e:
                print(f"[ScreenWatcher] Snapshot error: {e}")

            log = DiagnosticLog(
                timestamp=datetime.fromisoformat(event['timestamp']),
                patient_id=event.get('patient_id'),
                event_type='screen_change',
                change_pct=event.get('change_pct', 0),
                organ_detected=event.get('organ_detected', 'Unknown'),
                ocr_text=event.get('ocr_text', ''),
                header_text=event.get('header_text', ''),
                status_bar=event.get('status_bar', ''),
                summary_text=event.get('summary', ''),
                nls_readings=event.get('nls_readings', {}),
                nls_window_found=event.get('nls_window_found', False),
                entropy_analysis=event.get('analysis', {}),
                severity=self._classify_severity(event.get('analysis', {})),
                snapshot_path=snapshot_path  # Need to add this to models.py
            )
            db.add(log)
            db.commit()
            self.total_logs_persisted += 1
            print(f"[ScreenWatcher] [OK] Persisted DiagnosticLog (total: {self.total_logs_persisted})")
        except Exception as e:
            print(f"[ScreenWatcher] [FAIL] Failed to persist log: {e}")
            try:
                if db:
                    db.rollback()
            except:
                pass
        finally:
            try:
                if db:
                    db.close()
            except:
                pass
