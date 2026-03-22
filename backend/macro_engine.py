"""
Vibrana Macro Engine — Universal Keyboard & Mouse Recorder
Standalone module — works independently of the NLS bot / cv_engine.
Records mouse clicks, scroll events, and keyboard input using pynput.
Replays using pyautogui.  Smart playback with OCR/AI verification.
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

        # Playback state (for smart playback)
        self._playback_active = False
        self._playback_abort = False
        self._playback_state = {
            "active": False,
            "current_step": 0,
            "total_steps": 0,
            "current_action": "",
            "verifications": [],  # list of {step, type, success, detail}
            "errors": [],
            "screenshot": "",  # last screenshot base64
        }

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
                                "params": {"seconds": min(wait, 300)},
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

                elif a_type == "ocr_click":
                    from macro_verifier import find_text_on_screen
                    text = params.get("text", "")
                    search = find_text_on_screen(text, timeout=params.get("timeout", 10))
                    if search.get("success"):
                        x, y = search["location"]["x"], search["location"]["y"]
                        pyautogui.moveTo(x, y, duration=0.15)
                        pyautogui.click()

                elif a_type == "wait":
                    time.sleep(params.get("seconds", 0.5))

                executed += 1

            return {"status": "completed", "actions_executed": executed, "name": name}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    @property
    def is_recording(self):
        return self._recording

    @property
    def macro_recording(self):
        return self._recording

    @property
    def macro_actions(self):
        return self._actions

    def save_macro(self, name, actions):
        """Save/update a macro with the given actions list."""
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
        if 'created' not in existing:
            existing['created'] = existing['updated']
        with open(macro_file, 'w') as f:
            json.dump(existing, f, indent=2)
        return {"status": "saved", "name": name, "action_count": len(actions)}

    # ──────────────────────────────────────
    # Smart Playback (with verification)
    # ──────────────────────────────────────

    def play_macro_smart(self, name):
        """
        Replay a macro with OCR/AI verification at each verification step.
        Runs in a background thread. Use get_playback_status() to monitor.
        """
        macro_file = os.path.join(self.macros_dir, f"{name}.json")
        if not os.path.exists(macro_file):
            return {"status": "error", "message": f"Macro '{name}' not found"}

        if self._playback_active:
            return {"status": "error", "message": "A playback is already in progress"}

        try:
            import pyautogui
        except ImportError:
            return {"status": "error", "message": "pyautogui not installed"}

        try:
            with open(macro_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            return {"status": "error", "message": str(e)}

        actions = data.get("actions", [])
        self._playback_active = True
        self._playback_abort = False
        self._playback_state = {
            "active": True,
            "name": name,
            "current_step": 0,
            "total_steps": len(actions),
            "current_action": "Starting...",
            "verifications": [],
            "errors": [],
            "screenshot": "",
        }

        def _run():
            try:
                self._execute_smart_playback(actions, pyautogui)
            except Exception as e:
                self._playback_state["errors"].append(str(e))
            finally:
                self._playback_active = False
                self._playback_state["active"] = False
                self._playback_state["current_action"] = "Completed" if not self._playback_state["errors"] else "Finished with errors"

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        return {"status": "playing", "name": name, "total_steps": len(actions)}

    def _execute_smart_playback(self, actions, pyautogui):
        """Internal: execute actions with verification support."""
        from macro_verifier import (
            verify_text_in_region, verify_result_in_region,
            wait_for_text_on_screen, verify_button_template,
            find_text_on_screen, ai_verify_region, capture_screenshot,
        )

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

        for i, action in enumerate(actions):
            if self._playback_abort:
                self._playback_state["errors"].append("Aborted by user")
                break

            a_type = action.get("type")
            params = action.get("params", {})
            self._playback_state["current_step"] = i + 1
            self._playback_state["current_action"] = f"{a_type}: {json.dumps(params)[:80]}"

            # ── Standard actions ──
            if a_type == "click":
                x, y = params.get("x", 0), params.get("y", 0)
                btn = params.get("button", "left")

                # Smart click: verify label before clicking if specified
                verify_label = params.get("verify_label")
                verify_region = params.get("verify_region")
                if verify_label and verify_region:
                    self._playback_state["current_action"] = f"Verifying '{verify_label}' before click..."
                    result = verify_text_in_region(verify_region, verify_label, timeout=5)
                    v_record = {"step": i + 1, "type": "smart_click", "label": verify_label, "success": result["success"]}
                    self._playback_state["verifications"].append(v_record)
                    if result.get("screenshot"):
                        self._playback_state["screenshot"] = result["screenshot"]

                    if not result["success"]:
                        # Try to find the text on screen and adjust coordinates
                        self._playback_state["current_action"] = f"Searching for '{verify_label}' on screen..."
                        search = find_text_on_screen(verify_label, timeout=5)
                        if search["success"]:
                            x = search["location"]["x"]
                            y = search["location"]["y"]
                            v_record["relocated"] = True
                            print(f"[Macro Smart] Relocated '{verify_label}' to ({x}, {y})")
                        else:
                            error_msg = f"Step {i+1}: Could not verify '{verify_label}' at click target"
                            self._playback_state["errors"].append(error_msg)
                            print(f"[Macro Smart] WARNING: {error_msg}")
                            # Continue anyway — user might want to proceed

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
                wait_secs = params.get("seconds", 0.5)
                self._playback_state["current_action"] = f"Waiting {wait_secs}s..."
                # Sleep in small increments so abort works
                end_time = time.time() + wait_secs
                while time.time() < end_time and not self._playback_abort:
                    time.sleep(min(0.5, end_time - time.time()))

            elif a_type == "ocr_click":
                text = params.get("text", "")
                btn = params.get("button", "left")
                timeout = params.get("timeout", 10)
                self._playback_state["current_action"] = f"Searching for '{text}' to click..."
                
                search = find_text_on_screen(text, timeout=timeout)
                if search.get("success"):
                    x = search["location"]["x"]
                    y = search["location"]["y"]
                    pyautogui.moveTo(x, y, duration=0.15)
                    pyautogui.click(button=btn if btn in ('left', 'right', 'middle') else 'left')
                    v_record = {"step": i + 1, "type": "ocr_click", "text": text, "success": True}
                    self._playback_state["verifications"].append(v_record)
                else:
                    error_msg = f"Step {i+1}: Could not find text '{text}' to click"
                    self._playback_state["errors"].append(error_msg)
                    print(f"[Macro Smart] WARNING: {error_msg}")

            # ── Verification actions ──
            elif a_type == "verify_text":
                region = params.get("region", {"x": 0, "y": 0, "w": 400, "h": 100})
                expected = params.get("expected", "")
                timeout = params.get("timeout", 10)
                self._playback_state["current_action"] = f"Verifying text: '{expected}'..."
                result = verify_text_in_region(region, expected, timeout)
                self._playback_state["verifications"].append({
                    "step": i + 1, "type": "verify_text", "expected": expected,
                    "success": result["success"], "found": result.get("found_text", "")[:100]
                })
                if result.get("screenshot"):
                    self._playback_state["screenshot"] = result["screenshot"]
                if not result["success"]:
                    self._playback_state["errors"].append(result.get("error", "Verification failed"))

            elif a_type == "verify_result":
                region = params.get("region", {"x": 0, "y": 0, "w": 400, "h": 100})
                pattern = params.get("pattern", ".*")
                timeout = params.get("timeout", 15)
                self._playback_state["current_action"] = f"Checking result: '{pattern}'..."
                result = verify_result_in_region(region, pattern, timeout)
                self._playback_state["verifications"].append({
                    "step": i + 1, "type": "verify_result", "pattern": pattern,
                    "success": result["success"], "matches": result.get("matches", [])
                })
                if result.get("screenshot"):
                    self._playback_state["screenshot"] = result["screenshot"]
                if not result["success"]:
                    self._playback_state["errors"].append(result.get("error", "Pattern not matched"))

            elif a_type == "wait_for_text":
                text = params.get("text", "")
                region = params.get("region")
                timeout = params.get("timeout", 60)
                self._playback_state["current_action"] = f"Waiting for '{text}'..."
                result = wait_for_text_on_screen(text, region, timeout)
                self._playback_state["verifications"].append({
                    "step": i + 1, "type": "wait_for_text", "target": text,
                    "success": result["success"], "elapsed": result.get("elapsed", 0)
                })
                if result.get("screenshot"):
                    self._playback_state["screenshot"] = result["screenshot"]
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
                    "step": i + 1, "type": "verify_button", "template": template,
                    "success": result["success"], "confidence": result.get("confidence", 0)
                })
                if result.get("screenshot"):
                    self._playback_state["screenshot"] = result["screenshot"]
                if not result["success"]:
                    self._playback_state["errors"].append(result.get("error", "Button not found"))

            elif a_type == "screenshot":
                label = params.get("label", f"step_{i+1}")
                self._playback_state["current_action"] = f"Capturing: {label}"
                result = capture_screenshot(label)
                if result.get("screenshot"):
                    self._playback_state["screenshot"] = result["screenshot"]

            elif a_type == "ai_verify":
                region = params.get("region", {"x": 0, "y": 0, "w": 400, "h": 300})
                question = params.get("question", "Does this look correct?")
                timeout = params.get("timeout", 30)
                self._playback_state["current_action"] = f"AI verifying: '{question[:50]}'..."
                result = ai_verify_region(region, question, timeout)
                self._playback_state["verifications"].append({
                    "step": i + 1, "type": "ai_verify", "question": question,
                    "success": result["success"],
                    "answer": result.get("answer", ""),
                    "explanation": result.get("explanation", ""),
                })
                if result.get("screenshot"):
                    self._playback_state["screenshot"] = result["screenshot"]
                if not result["success"]:
                    self._playback_state["errors"].append(f"AI check failed: {result.get('explanation', '')}")

            print(f"[Macro Smart] Step {i+1}/{len(actions)}: {a_type}")

    def abort_playback(self):
        """Signal the smart playback loop to stop."""
        if not self._playback_active:
            return {"status": "error", "message": "No playback in progress"}
        self._playback_abort = True
        return {"status": "aborting", "message": "Playback will stop after current step"}

    def get_playback_status(self):
        """Return current playback progress for the frontend."""
        return dict(self._playback_state)


# Singleton instance for use across the app
macro_engine = MacroEngine()
