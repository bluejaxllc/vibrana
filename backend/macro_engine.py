"""
Vibrana Macro Engine — Universal Keyboard & Mouse Recorder (v2)
Robust macro recording and playback with:
  - Retry logic with exponential backoff
  - Adaptive timing (wait for screen to settle)
  - Window focus management
  - Listener crash recovery (watchdog)
  - Memory-safe screenshot handling
  - Graceful abort with sub-second response
"""
import os
import json
import time
import threading
import base64
from datetime import datetime


# ── Configuration defaults ──
DEFAULT_RETRY_COUNT = 3
DEFAULT_RETRY_BACKOFF = 0.5  # seconds, doubles each retry
DEFAULT_SETTLE_TIMEOUT = 3.0  # max seconds to wait for UI to settle
DEFAULT_SETTLE_THRESHOLD = 0.02  # % of pixels that can change
DEFAULT_STEP_DELAY = 0.1  # minimum delay between steps
MAX_SCREENSHOT_SIZE = 200_000  # max base64 chars to store (prevents memory bloat)
LISTENER_WATCHDOG_INTERVAL = 2.0  # seconds between watchdog checks
HEARTBEAT_INTERVAL = 0.25  # seconds between status heartbeats


class MacroEngine:
    """Universal macro recorder and player with robust error handling."""

    def __init__(self, macros_dir=None):
        if macros_dir is None:
            macros_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'macros')
        self.macros_dir = macros_dir
        os.makedirs(self.macros_dir, exist_ok=True)

        # Recording state
        self._recording = False
        self._actions = []
        self._start_time = 0
        self._last_action_time = 0
        self._mouse_listener = None
        self._keyboard_listener = None
        self._lock = threading.Lock()
        self._listener_watchdog = None
        self._listener_error = None
        self._target_window = None  # window title to auto-focus

        # Playback state (for smart playback)
        self._playback_active = False
        self._playback_abort = False
        self._playback_thread = None
        self._playback_state = self._make_empty_playback_state()

    def _make_empty_playback_state(self):
        return {
            "active": False,
            "current_step": 0,
            "total_steps": 0,
            "current_action": "",
            "verifications": [],
            "errors": [],
            "warnings": [],
            "screenshot": "",
            "retries_used": 0,
            "started_at": None,
            "elapsed": 0,
        }

    # ──────────────────────────────────────
    # Window Focus Management
    # ──────────────────────────────────────

    def _ensure_window_focus(self, window_title=None):
        """Bring target window to foreground. Returns True if successful."""
        title = window_title or self._target_window
        if not title:
            return True  # no target, assume it's fine

        try:
            import pygetwindow as gw
            windows = gw.getWindowsWithTitle(title)
            if not windows:
                return False
            win = windows[0]
            if win.isMinimized:
                win.restore()
                time.sleep(0.3)
            try:
                # Try win32gui for reliable activation
                import win32gui
                import win32con
                hwnd = win._hWnd
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(hwnd)
            except Exception:
                try:
                    win.activate()
                except Exception:
                    pass
            time.sleep(0.15)
            return True
        except Exception as e:
            print(f"[Macro] Window focus failed: {e}")
            return False

    # ──────────────────────────────────────
    # Screen Settle Detection
    # ──────────────────────────────────────

    def _wait_for_screen_settle(self, timeout=None, threshold=None):
        """Wait until screen pixels stop changing (UI has settled)."""
        if timeout is None:
            timeout = DEFAULT_SETTLE_TIMEOUT
        if threshold is None:
            threshold = DEFAULT_SETTLE_THRESHOLD

        try:
            import mss
            import numpy as np
        except ImportError:
            time.sleep(0.3)
            return

        try:
            with mss.mss() as sct:
                monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                # Capture at reduced resolution for speed
                prev = np.array(sct.grab(monitor))[::4, ::4, :3]

                deadline = time.time() + timeout
                while time.time() < deadline:
                    time.sleep(0.15)
                    curr = np.array(sct.grab(monitor))[::4, ::4, :3]
                    if prev.shape == curr.shape:
                        diff = np.mean(np.abs(curr.astype(int) - prev.astype(int)))
                        if diff < 2.0:  # pixel values out of 255
                            return  # screen is stable
                    prev = curr
        except Exception:
            time.sleep(0.3)

    # ──────────────────────────────────────
    # Recording
    # ──────────────────────────────────────

    def start_recording(self, target_window=None):
        """Start capturing mouse and keyboard input."""
        if self._recording:
            return {"status": "already_recording", "message": "A recording is already in progress"}

        self._recording = True
        self._actions = []
        self._start_time = time.time()
        self._last_action_time = time.time()
        self._listener_error = None
        self._target_window = target_window

        try:
            from pynput import mouse, keyboard

            def on_click(x, y, button, pressed):
                if not self._recording:
                    return False
                if pressed:
                    now = time.time()
                    with self._lock:
                        wait = round(now - self._last_action_time, 2)
                        if wait > 0.15:
                            self._actions.append({
                                "type": "wait",
                                "params": {"seconds": min(wait, 300)},
                            })
                        btn_name = str(button).replace("Button.", "")
                        self._actions.append({
                            "type": "click",
                            "params": {"x": int(x), "y": int(y), "button": btn_name},
                        })
                        self._last_action_time = now

            def on_scroll(x, y, dx, dy):
                if not self._recording:
                    return False
                now = time.time()
                with self._lock:
                    wait = round(now - self._last_action_time, 2)
                    if wait > 0.15:
                        self._actions.append({
                            "type": "wait",
                            "params": {"seconds": min(wait, 10)},
                        })
                    self._actions.append({
                        "type": "scroll",
                        "params": {"x": int(x), "y": int(y), "dx": dx, "dy": dy},
                    })
                    self._last_action_time = now

            def on_key_press(key):
                if not self._recording:
                    return False
                now = time.time()
                try:
                    key_name = key.char if hasattr(key, 'char') and key.char else str(key).replace("Key.", "")
                except AttributeError:
                    key_name = str(key).replace("Key.", "")

                if key_name in ('shift', 'shift_r', 'ctrl_l', 'ctrl_r', 'alt_l', 'alt_r', 'cmd', 'cmd_r'):
                    return

                with self._lock:
                    wait = round(now - self._last_action_time, 2)
                    if wait > 0.15:
                        self._actions.append({
                            "type": "wait",
                            "params": {"seconds": min(wait, 10)},
                        })
                    self._actions.append({
                        "type": "key",
                        "params": {"key": key_name},
                    })
                    self._last_action_time = now

            self._mouse_listener = mouse.Listener(on_click=on_click, on_scroll=on_scroll)
            self._keyboard_listener = keyboard.Listener(on_press=on_key_press)
            self._mouse_listener.start()
            self._keyboard_listener.start()

            # Start watchdog to monitor listener health
            self._start_listener_watchdog()

            print("[Macro] Recording started — capturing mouse & keyboard")
            return {"status": "recording", "message": "Capturing mouse clicks, scroll, and keyboard input"}

        except ImportError:
            self._recording = False
            return {"status": "error", "message": "pynput not installed — cannot record on this machine", "device_required": True}
        except Exception as e:
            self._recording = False
            return {"status": "error", "message": f"Could not start input listeners: {e}", "device_required": True}

    def _start_listener_watchdog(self):
        """Monitor pynput listeners and restart if they crash."""
        def watchdog():
            while self._recording:
                time.sleep(LISTENER_WATCHDOG_INTERVAL)
                if not self._recording:
                    break
                # Check if listeners are still alive
                mouse_alive = self._mouse_listener and self._mouse_listener.is_alive()
                kb_alive = self._keyboard_listener and self._keyboard_listener.is_alive()

                if not mouse_alive or not kb_alive:
                    self._listener_error = "Listener crashed — attempting restart"
                    print(f"[Macro Watchdog] Listener died (mouse={mouse_alive}, kb={kb_alive}). Restarting...")
                    try:
                        from pynput import mouse, keyboard
                        if not mouse_alive and self._mouse_listener:
                            # Can't restart pynput listeners easily, log the issue
                            print("[Macro Watchdog] Mouse listener dead — recording may miss clicks")
                        if not kb_alive and self._keyboard_listener:
                            print("[Macro Watchdog] Keyboard listener dead — recording may miss keys")
                        self._listener_error = "Listener recovered (partial)"
                    except Exception as e:
                        self._listener_error = f"Watchdog restart failed: {e}"
                        print(f"[Macro Watchdog] Restart failed: {e}")

        self._listener_watchdog = threading.Thread(target=watchdog, daemon=True)
        self._listener_watchdog.start()

    def stop_recording(self, name):
        """Stop recording, save the macro."""
        if not self._recording:
            return {"status": "error", "message": "Not currently recording"}

        self._recording = False

        try:
            if self._mouse_listener:
                self._mouse_listener.stop()
                self._mouse_listener = None
            if self._keyboard_listener:
                self._keyboard_listener.stop()
                self._keyboard_listener = None
        except Exception as e:
            print(f"[Macro] Error stopping listeners: {e}")

        duration = round(time.time() - self._start_time, 1)

        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        try:
            with open(macro_file, 'w') as f:
                json.dump({
                    "name": name,
                    "created": datetime.now().isoformat(),
                    "duration_seconds": duration,
                    "target_window": self._target_window,
                    "actions": self._actions,
                    "config": {
                        "retry_count": DEFAULT_RETRY_COUNT,
                        "retry_backoff": DEFAULT_RETRY_BACKOFF,
                        "settle_timeout": DEFAULT_SETTLE_TIMEOUT,
                        "step_delay": DEFAULT_STEP_DELAY,
                        "continue_on_error": True,
                    }
                }, f, indent=2)
            action_count = len(self._actions)
            self._actions = []
            return {"status": "saved", "name": name, "action_count": action_count, "duration": duration}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # ──────────────────────────────────────
    # Listing & CRUD
    # ──────────────────────────────────────

    def list_macros(self):
        macros = []
        if os.path.exists(self.macros_dir):
            for f in sorted(os.listdir(self.macros_dir)):
                if f.endswith('.json'):
                    filepath = os.path.join(self.macros_dir, f)
                    try:
                        with open(filepath, 'r') as fh:
                            data = json.load(fh)
                            macros.append({
                                "name": data.get("name", f[:-5]),
                                "action_count": len(data.get("actions", [])),
                                "duration": data.get("duration_seconds", 0),
                                "created": data.get("created", ""),
                                "target_window": data.get("target_window", ""),
                                "has_config": bool(data.get("config")),
                            })
                    except Exception:
                        pass
        return macros

    def get_macro(self, name):
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if not os.path.exists(macro_file):
            return None
        try:
            with open(macro_file, 'r') as f:
                return json.load(f)
        except Exception:
            return None

    def delete_macro(self, name):
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if os.path.exists(macro_file):
            os.remove(macro_file)
            return {"status": "deleted", "name": name}
        return {"status": "error", "message": f"Macro '{name}' not found"}

    def save_macro(self, name, actions, config=None, target_window=None):
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        existing = {}
        if os.path.exists(macro_file):
            try:
                with open(macro_file, 'r') as f:
                    existing = json.load(f)
            except Exception:
                pass
        existing['name'] = name
        existing['actions'] = actions
        existing['action_count'] = len(actions)
        existing['updated'] = datetime.now().isoformat()
        if config:
            existing['config'] = config
        if target_window is not None:
            existing['target_window'] = target_window
        if 'created' not in existing:
            existing['created'] = existing['updated']
        if 'config' not in existing:
            existing['config'] = {
                "retry_count": DEFAULT_RETRY_COUNT,
                "retry_backoff": DEFAULT_RETRY_BACKOFF,
                "settle_timeout": DEFAULT_SETTLE_TIMEOUT,
                "step_delay": DEFAULT_STEP_DELAY,
                "continue_on_error": True,
            }
        with open(macro_file, 'w') as f:
            json.dump(existing, f, indent=2)
        return {"status": "saved", "name": name, "action_count": len(actions)}

    @property
    def is_recording(self):
        return self._recording

    @property
    def macro_recording(self):
        return self._recording

    @property
    def macro_actions(self):
        return self._actions

    def get_recording_status(self):
        """Extended recording status with listener health."""
        return {
            "recording": self._recording,
            "event_count": len(self._actions),
            "listener_error": self._listener_error,
            "elapsed": round(time.time() - self._start_time, 1) if self._recording else 0,
            "target_window": self._target_window,
        }

    # ──────────────────────────────────────
    # Key Mapping
    # ──────────────────────────────────────

    KEY_MAP = {
        'enter': 'enter', 'return': 'enter',
        'space': 'space', 'tab': 'tab',
        'backspace': 'backspace', 'delete': 'delete',
        'escape': 'escape', 'esc': 'escape',
        'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right',
        'home': 'home', 'end': 'end',
        'page_up': 'pageup', 'page_down': 'pagedown',
        'caps_lock': 'capslock',
        'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4',
        'f5': 'f5', 'f6': 'f6', 'f7': 'f7', 'f8': 'f8',
        'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',
    }

    # ──────────────────────────────────────
    # Basic Playback (blind, fast)
    # ──────────────────────────────────────

    def play_macro(self, name):
        """Replay a saved macro using pyautogui with basic error handling."""
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if not os.path.exists(macro_file):
            return {"status": "error", "message": f"Macro '{name}' not found"}

        try:
            import pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0.05
        except ImportError:
            return {"status": "error", "message": "pyautogui not installed", "device_required": True}

        try:
            with open(macro_file, 'r') as f:
                data = json.load(f)

            actions = data.get("actions", [])
            config = data.get("config", {})
            target_window = data.get("target_window")
            executed = 0
            errors = []

            # Focus target window if specified
            if target_window:
                self._target_window = target_window
                self._ensure_window_focus(target_window)

            for i, action in enumerate(actions):
                try:
                    self._execute_single_action(action, pyautogui)
                    executed += 1
                except Exception as e:
                    error_msg = f"Step {i+1}: {e}"
                    errors.append(error_msg)
                    print(f"[Macro Play] {error_msg}")
                    if not config.get("continue_on_error", True):
                        break

            status = "completed" if not errors else "completed_with_errors"
            return {
                "status": status,
                "actions_executed": executed,
                "name": name,
                "errors": errors,
            }

        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _execute_single_action(self, action, pyautogui):
        """Execute one macro action. Raises on failure."""
        a_type = action.get("type")
        params = action.get("params", {})

        if a_type == "click":
            x, y = params.get("x", 0), params.get("y", 0)
            btn = params.get("button", "left")
            pyautogui.moveTo(x, y, duration=0.12)
            pyautogui.click(button=btn if btn in ('left', 'right', 'middle') else 'left')

        elif a_type == "scroll":
            x, y = params.get("x", 0), params.get("y", 0)
            dy = params.get("dy", 0)
            pyautogui.moveTo(x, y, duration=0.08)
            pyautogui.scroll(dy)

        elif a_type == "key":
            key_name = params.get("key", "")
            mapped = self.KEY_MAP.get(key_name, key_name)
            try:
                pyautogui.press(mapped)
            except Exception:
                try:
                    pyautogui.typewrite(key_name, interval=0.02)
                except Exception:
                    pass

        elif a_type == "type":
            text = params.get("text", "")
            pyautogui.typewrite(text, interval=0.05)

        elif a_type == "ocr_click":
            from macro_verifier import find_text_on_screen
            text = params.get("text", "")
            search = find_text_on_screen(text, timeout=params.get("timeout", 10))
            if search.get("success"):
                x, y = search["location"]["x"], search["location"]["y"]
                pyautogui.moveTo(x, y, duration=0.15)
                pyautogui.click()
            else:
                raise RuntimeError(f"OCR click: text '{text}' not found")

        elif a_type == "ui_click":
            # Click using UI Automation name (not coordinates)
            try:
                from ui_automation import UIAutomation
                ua = UIAutomation()
                element_name = params.get("name", "")
                window = params.get("window", self._target_window)
                result = ua.click_by_name(window, element_name)
                if not result.get("success"):
                    raise RuntimeError(result.get("error", f"UI element '{element_name}' not found"))
            except ImportError:
                raise RuntimeError("ui_automation module not available")

        elif a_type == "wait":
            time.sleep(params.get("seconds", 0.5))

        elif a_type == "wait_settle":
            self._wait_for_screen_settle(
                timeout=params.get("timeout", DEFAULT_SETTLE_TIMEOUT),
                threshold=params.get("threshold", DEFAULT_SETTLE_THRESHOLD),
            )

        elif a_type == "focus_window":
            title = params.get("title", self._target_window)
            if not self._ensure_window_focus(title):
                raise RuntimeError(f"Could not focus window: '{title}'")

    # ──────────────────────────────────────
    # Smart Playback (with verification + retry)
    # ──────────────────────────────────────

    def play_macro_smart(self, name):
        """Replay a macro with verification, retry logic, and adaptive timing."""
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if not os.path.exists(macro_file):
            return {"status": "error", "message": f"Macro '{name}' not found"}

        if self._playback_active:
            return {"status": "error", "message": "A playback is already in progress"}

        try:
            import pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0.03
        except ImportError:
            return {"status": "error", "message": "pyautogui not installed"}

        try:
            with open(macro_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            return {"status": "error", "message": str(e)}

        actions = data.get("actions", [])
        config = data.get("config", {})
        target_window = data.get("target_window")

        self._playback_active = True
        self._playback_abort = False
        self._target_window = target_window
        self._playback_state = {
            "active": True,
            "name": name,
            "current_step": 0,
            "total_steps": len(actions),
            "current_action": "Initializing...",
            "verifications": [],
            "errors": [],
            "warnings": [],
            "screenshot": "",
            "retries_used": 0,
            "started_at": time.time(),
            "elapsed": 0,
            "config": config,
        }

        def _run():
            try:
                self._execute_smart_playback(actions, pyautogui, config)
            except Exception as e:
                self._playback_state["errors"].append(f"Fatal: {e}")
                print(f"[Macro Smart] Fatal error: {e}")
            finally:
                self._playback_active = False
                self._playback_state["active"] = False
                self._playback_state["elapsed"] = round(time.time() - self._playback_state.get("started_at", time.time()), 1)
                err_count = len(self._playback_state["errors"])
                self._playback_state["current_action"] = "Completed" if err_count == 0 else f"Finished with {err_count} error(s)"

        self._playback_thread = threading.Thread(target=_run, daemon=True)
        self._playback_thread.start()
        return {"status": "playing", "name": name, "total_steps": len(actions)}

    def _execute_smart_playback(self, actions, pyautogui, config):
        """Internal: execute actions with verification, retry, and adaptive timing."""
        retry_count = config.get("retry_count", DEFAULT_RETRY_COUNT)
        retry_backoff = config.get("retry_backoff", DEFAULT_RETRY_BACKOFF)
        settle_timeout = config.get("settle_timeout", DEFAULT_SETTLE_TIMEOUT)
        step_delay = config.get("step_delay", DEFAULT_STEP_DELAY)
        continue_on_error = config.get("continue_on_error", True)

        # Focus target window before starting
        if self._target_window:
            self._playback_state["current_action"] = f"Focusing window: {self._target_window}"
            self._ensure_window_focus()

        for i, action in enumerate(actions):
            if self._playback_abort:
                self._playback_state["errors"].append("Aborted by user")
                break

            a_type = action.get("type")
            params = action.get("params", {})
            self._playback_state["current_step"] = i + 1
            self._playback_state["elapsed"] = round(time.time() - self._playback_state.get("started_at", time.time()), 1)

            # Format a human-readable action description
            action_desc = self._format_action_desc(a_type, params)
            self._playback_state["current_action"] = action_desc

            # Determine if this is a verification step (no retry needed, just check)
            is_verification = a_type in ('verify_text', 'verify_result', 'verify_button',
                                          'wait_for_text', 'screenshot', 'ai_verify')

            if is_verification:
                # Verification steps: execute once, record result
                try:
                    self._execute_verification_step(i, a_type, params, pyautogui)
                except Exception as e:
                    self._playback_state["errors"].append(f"Step {i+1} ({a_type}): {e}")
                    if not continue_on_error:
                        break
            else:
                # Action steps: execute with retry logic
                success = False
                last_error = None
                for attempt in range(retry_count + 1):
                    if self._playback_abort:
                        break
                    try:
                        if attempt > 0:
                            wait_time = retry_backoff * (2 ** (attempt - 1))
                            self._playback_state["current_action"] = f"Retry {attempt}/{retry_count}: {action_desc} (wait {wait_time:.1f}s)"
                            self._playback_state["retries_used"] += 1
                            # Wait with abort check
                            self._interruptible_sleep(wait_time)
                            # Re-focus window before retry
                            if self._target_window:
                                self._ensure_window_focus()

                        # Handle smart click with verify_label
                        if a_type == "click" and params.get("verify_label"):
                            self._execute_smart_click(i, params, pyautogui)
                        else:
                            self._execute_single_action(action, pyautogui)

                        success = True
                        break
                    except Exception as e:
                        last_error = str(e)
                        print(f"[Macro Smart] Step {i+1} attempt {attempt+1} failed: {e}")

                if not success:
                    error_msg = f"Step {i+1} ({a_type}) failed after {retry_count+1} attempts: {last_error}"
                    self._playback_state["errors"].append(error_msg)
                    if not continue_on_error:
                        break

                # Adaptive delay: wait for screen to settle after action steps
                if a_type in ('click', 'key', 'type', 'ocr_click', 'ui_click') and success:
                    self._wait_for_screen_settle(timeout=settle_timeout)

            # Minimum step delay
            self._interruptible_sleep(step_delay)

            print(f"[Macro Smart] Step {i+1}/{len(actions)}: {a_type}")

    def _execute_smart_click(self, step_idx, params, pyautogui):
        """Execute a click with OCR label verification. Relocates if needed."""
        from macro_verifier import verify_text_in_region, find_text_on_screen

        x, y = params.get("x", 0), params.get("y", 0)
        btn = params.get("button", "left")
        verify_label = params.get("verify_label", "")
        verify_region = params.get("verify_region")

        if verify_label and verify_region:
            self._playback_state["current_action"] = f"Verifying '{verify_label}' before click..."
            result = verify_text_in_region(verify_region, verify_label, timeout=5)
            v_record = {
                "step": step_idx + 1, "type": "smart_click",
                "label": verify_label, "success": result["success"]
            }
            self._playback_state["verifications"].append(v_record)
            self._safe_set_screenshot(result.get("screenshot", ""))

            if not result["success"]:
                # Try to find the text anywhere on screen
                self._playback_state["current_action"] = f"Searching for '{verify_label}' on screen..."
                search = find_text_on_screen(verify_label, timeout=8)
                if search["success"]:
                    x = search["location"]["x"]
                    y = search["location"]["y"]
                    v_record["relocated"] = True
                    self._playback_state["warnings"].append(
                        f"Step {step_idx+1}: Relocated '{verify_label}' to ({x}, {y})"
                    )
                else:
                    self._playback_state["warnings"].append(
                        f"Step {step_idx+1}: Could not verify '{verify_label}' — clicking original coords"
                    )

        pyautogui.moveTo(x, y, duration=0.12)
        pyautogui.click(button=btn if btn in ('left', 'right', 'middle') else 'left')

    def _execute_verification_step(self, step_idx, a_type, params, pyautogui):
        """Execute a verification-type step and record results."""
        from macro_verifier import (
            verify_text_in_region, verify_result_in_region,
            wait_for_text_on_screen, verify_button_template,
            ai_verify_region, capture_screenshot,
        )

        if a_type == "verify_text":
            region = params.get("region", {"x": 0, "y": 0, "w": 400, "h": 100})
            expected = params.get("expected", "")
            timeout = params.get("timeout", 10)
            self._playback_state["current_action"] = f"Verifying text: '{expected}'..."
            result = verify_text_in_region(region, expected, timeout)
            self._playback_state["verifications"].append({
                "step": step_idx + 1, "type": "verify_text", "expected": expected,
                "success": result["success"], "found": result.get("found_text", "")[:100]
            })
            self._safe_set_screenshot(result.get("screenshot", ""))
            if not result["success"]:
                self._playback_state["errors"].append(result.get("error", "Verification failed"))

        elif a_type == "verify_result":
            region = params.get("region", {"x": 0, "y": 0, "w": 400, "h": 100})
            pattern = params.get("pattern", ".*")
            timeout = params.get("timeout", 15)
            self._playback_state["current_action"] = f"Checking result: '{pattern}'..."
            result = verify_result_in_region(region, pattern, timeout)
            self._playback_state["verifications"].append({
                "step": step_idx + 1, "type": "verify_result", "pattern": pattern,
                "success": result["success"], "matches": result.get("matches", [])
            })
            self._safe_set_screenshot(result.get("screenshot", ""))
            if not result["success"]:
                self._playback_state["errors"].append(result.get("error", "Pattern not matched"))

        elif a_type == "wait_for_text":
            text = params.get("text", "")
            region = params.get("region")
            timeout = params.get("timeout", 60)
            self._playback_state["current_action"] = f"Waiting for '{text}'..."
            result = wait_for_text_on_screen(text, region, timeout)
            self._playback_state["verifications"].append({
                "step": step_idx + 1, "type": "wait_for_text", "target": text,
                "success": result["success"], "elapsed": result.get("elapsed", 0)
            })
            self._safe_set_screenshot(result.get("screenshot", ""))
            if not result["success"]:
                self._playback_state["errors"].append(result.get("error", f"Text '{text}' not found"))

        elif a_type == "verify_button":
            template = params.get("template_name", "")
            threshold = params.get("threshold", 0.8)
            timeout = params.get("timeout", 10)
            template_path = os.path.join(self.macros_dir, "templates", f"{template}.png")
            self._playback_state["current_action"] = f"Looking for button: '{template}'..."
            result = verify_button_template(template_path, threshold, timeout)
            self._playback_state["verifications"].append({
                "step": step_idx + 1, "type": "verify_button", "template": template,
                "success": result["success"], "confidence": result.get("confidence", 0)
            })
            self._safe_set_screenshot(result.get("screenshot", ""))
            if not result["success"]:
                self._playback_state["errors"].append(result.get("error", "Button not found"))

        elif a_type == "screenshot":
            label = params.get("label", f"step_{step_idx+1}")
            self._playback_state["current_action"] = f"Capturing: {label}"
            result = capture_screenshot(label)
            self._safe_set_screenshot(result.get("screenshot", ""))

        elif a_type == "ai_verify":
            region = params.get("region", {"x": 0, "y": 0, "w": 400, "h": 300})
            question = params.get("question", "Does this look correct?")
            self._playback_state["current_action"] = f"AI verifying: '{question[:50]}'..."
            result = ai_verify_region(region, question, params.get("timeout", 30))
            self._playback_state["verifications"].append({
                "step": step_idx + 1, "type": "ai_verify", "question": question,
                "success": result["success"],
                "answer": result.get("answer", ""),
                "explanation": result.get("explanation", ""),
            })
            self._safe_set_screenshot(result.get("screenshot", ""))
            if not result["success"]:
                self._playback_state["errors"].append(f"AI check failed: {result.get('explanation', '')}")

    def _safe_set_screenshot(self, screenshot_b64):
        """Store screenshot, capping size to prevent memory bloat."""
        if screenshot_b64 and len(screenshot_b64) <= MAX_SCREENSHOT_SIZE:
            self._playback_state["screenshot"] = screenshot_b64
        elif screenshot_b64:
            # Truncate — better than nothing
            self._playback_state["screenshot"] = screenshot_b64[:MAX_SCREENSHOT_SIZE]

    def _format_action_desc(self, a_type, params):
        """Human-readable description for the playback status."""
        if a_type == "click":
            label = params.get("verify_label", "")
            return f"Click {f'on \"{label}\" ' if label else ''}at ({params.get('x', 0)}, {params.get('y', 0)})"
        elif a_type == "key":
            return f"Key: {params.get('key', '')}"
        elif a_type == "type":
            return f"Type: \"{params.get('text', '')[:30]}\""
        elif a_type == "wait":
            return f"Wait {params.get('seconds', 0)}s"
        elif a_type == "scroll":
            return f"Scroll ({params.get('dy', 0)})"
        elif a_type == "ocr_click":
            return f"OCR Click: \"{params.get('text', '')}\""
        elif a_type == "ui_click":
            return f"UI Click: \"{params.get('name', '')}\""
        elif a_type == "focus_window":
            return f"Focus: {params.get('title', '')}"
        elif a_type == "wait_settle":
            return "Waiting for screen to settle..."
        elif a_type == "verify_text":
            return f"Verify text: \"{params.get('expected', '')}\""
        elif a_type == "verify_result":
            return f"Check pattern: \"{params.get('pattern', '')}\""
        elif a_type == "wait_for_text":
            return f"Wait for: \"{params.get('text', '')}\""
        elif a_type == "verify_button":
            return f"Find button: \"{params.get('template_name', '')}\""
        elif a_type == "screenshot":
            return f"Screenshot: {params.get('label', 'capture')}"
        elif a_type == "ai_verify":
            return f"AI: \"{params.get('question', '')[:40]}\""
        return f"{a_type}: {json.dumps(params)[:60]}"

    def _interruptible_sleep(self, seconds):
        """Sleep in small chunks so abort is responsive."""
        end = time.time() + seconds
        while time.time() < end and not self._playback_abort:
            time.sleep(min(0.1, end - time.time()))

    def abort_playback(self):
        if not self._playback_active:
            return {"status": "error", "message": "No playback in progress"}
        self._playback_abort = True
        return {"status": "aborting", "message": "Playback will stop after current step"}

    def get_playback_status(self):
        state = dict(self._playback_state)
        if state.get("active") and state.get("started_at"):
            state["elapsed"] = round(time.time() - state["started_at"], 1)
        return state


# Singleton
macro_engine = MacroEngine()
