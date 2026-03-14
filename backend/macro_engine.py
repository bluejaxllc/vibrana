"""
Vibrana Macro Engine — Universal Keyboard & Mouse Recorder
Standalone module — works independently of the NLS bot / cv_engine.
Records mouse clicks, scroll events, and keyboard input using pynput.
Replays using pyautogui.
"""
import os
import json
import time
import threading
from datetime import datetime


class MacroEngine:
    """Universal macro recorder and player — no NLS dependency."""

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

    # ──────────────────────────────────────
    # Recording
    # ──────────────────────────────────────

    def start_recording(self):
        """Start capturing mouse and keyboard input."""
        if self._recording:
            return {"status": "already_recording", "message": "A recording is already in progress"}

        self._recording = True
        self._actions = []
        self._start_time = time.time()
        self._last_action_time = time.time()

        try:
            from pynput import mouse, keyboard

            def on_click(x, y, button, pressed):
                if not self._recording:
                    return False
                if pressed:
                    now = time.time()
                    with self._lock:
                        # Insert wait action for timing
                        wait = round(now - self._last_action_time, 2)
                        if wait > 0.15:
                            self._actions.append({
                                "type": "wait",
                                "params": {"seconds": min(wait, 10)},
                            })
                        btn_name = str(button).replace("Button.", "")
                        self._actions.append({
                            "type": "click",
                            "params": {"x": int(x), "y": int(y), "button": btn_name},
                        })
                        self._last_action_time = now
                    print(f"[Macro] Recorded click at ({x}, {y}) button={btn_name}")

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

                # Skip modifier-only presses
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
                print(f"[Macro] Recorded key: {key_name}")

            self._mouse_listener = mouse.Listener(on_click=on_click, on_scroll=on_scroll)
            self._keyboard_listener = keyboard.Listener(on_press=on_key_press)
            self._mouse_listener.start()
            self._keyboard_listener.start()
            print("[Macro] Recording started — capturing mouse & keyboard")
            return {"status": "recording", "message": "Capturing mouse clicks, scroll, and keyboard input"}

        except ImportError:
            self._recording = False
            return {"status": "error", "message": "pynput not installed — cannot record on this machine", "device_required": True}
        except Exception as e:
            self._recording = False
            return {"status": "error", "message": f"Could not start input listeners: {e}", "device_required": True}

    def stop_recording(self, name):
        """Stop recording, save the macro."""
        if not self._recording:
            return {"status": "error", "message": "Not currently recording"}

        self._recording = False

        # Stop listeners
        try:
            if self._mouse_listener:
                self._mouse_listener.stop()
                self._mouse_listener = None
            if self._keyboard_listener:
                self._keyboard_listener.stop()
                self._keyboard_listener = None
            print("[Macro] Input listeners stopped")
        except Exception as e:
            print(f"[Macro] Error stopping listeners: {e}")

        duration = round(time.time() - self._start_time, 1)

        # Save to file
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        try:
            with open(macro_file, 'w') as f:
                json.dump({
                    "name": name,
                    "created": datetime.now().isoformat(),
                    "duration_seconds": duration,
                    "actions": self._actions
                }, f, indent=2)
            action_count = len(self._actions)
            self._actions = []
            print(f"[Macro] Saved '{name}' with {action_count} actions ({duration}s)")
            return {"status": "saved", "name": name, "action_count": action_count, "duration": duration}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # ──────────────────────────────────────
    # Listing & Deleting (works everywhere)
    # ──────────────────────────────────────

    def list_macros(self):
        """List all saved macros — works on any environment."""
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
                            })
                    except Exception:
                        pass
        return macros

    def get_macro(self, name):
        """Get full macro details including all actions."""
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if not os.path.exists(macro_file):
            return None
        try:
            with open(macro_file, 'r') as f:
                return json.load(f)
        except Exception:
            return None

    def delete_macro(self, name):
        """Delete a saved macro — works on any environment."""
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if os.path.exists(macro_file):
            os.remove(macro_file)
            return {"status": "deleted", "name": name}
        return {"status": "error", "message": f"Macro '{name}' not found"}

    # ──────────────────────────────────────
    # Playback (requires display + input)
    # ──────────────────────────────────────

    def play_macro(self, name):
        """Replay a saved macro using pyautogui."""
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if not os.path.exists(macro_file):
            return {"status": "error", "message": f"Macro '{name}' not found"}

        try:
            import pyautogui
        except ImportError:
            return {"status": "error", "message": "pyautogui not installed — cannot play on this machine", "device_required": True}

        try:
            with open(macro_file, 'r') as f:
                data = json.load(f)

            actions = data.get("actions", [])
            executed = 0

            # Key name mapping from pynput → pyautogui
            key_map = {
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

            for action in actions:
                a_type = action.get("type")
                params = action.get("params", {})

                if a_type == "click":
                    x, y = params.get("x", 0), params.get("y", 0)
                    btn = params.get("button", "left")
                    pyautogui.moveTo(x, y, duration=0.15)
                    pyautogui.click(button=btn if btn in ('left', 'right', 'middle') else 'left')

                elif a_type == "scroll":
                    x, y = params.get("x", 0), params.get("y", 0)
                    dy = params.get("dy", 0)
                    pyautogui.moveTo(x, y, duration=0.1)
                    pyautogui.scroll(dy)

                elif a_type == "key":
                    key_name = params.get("key", "")
                    mapped = key_map.get(key_name, key_name)
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

                elif a_type == "wait":
                    time.sleep(params.get("seconds", 0.5))

                executed += 1

            return {"status": "completed", "actions_executed": executed, "name": name}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    @property
    def is_recording(self):
        return self._recording


# Singleton instance for use across the app
macro_engine = MacroEngine()
