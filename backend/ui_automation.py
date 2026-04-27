"""
Vibrana UI Automation — Windows Accessibility API integration.
Uses pywinauto for robust desktop application element discovery.
Falls back to basic win32gui enumeration if pywinauto is not installed.

This is the preferred method for discovering NLS software UI elements
since it reads the actual accessibility tree rather than relying on
fragile OCR/computer vision.
"""
import os
import time
import json
import base64
import traceback

try:
    import pywinauto
    from pywinauto import Application, Desktop
    from pywinauto.controls.uiawrapper import UIAWrapper
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False

try:
    import win32gui
    import win32con
    import win32process
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

try:
    import mss
    import numpy as np
    import cv2
    HAS_SCREEN = True
except ImportError:
    HAS_SCREEN = False


# Max elements to return (prevents huge payloads)
MAX_ELEMENTS = 300
# Max tree depth to explore
MAX_DEPTH = 8
# Control types we care about
INTERACTIVE_TYPES = {
    'Button', 'Edit', 'ComboBox', 'CheckBox', 'RadioButton',
    'MenuItem', 'TabItem', 'ListItem', 'TreeItem', 'Hyperlink',
    'Slider', 'Spinner', 'DataGrid', 'List', 'Tree', 'Tab',
    'Menu', 'MenuBar', 'ToolBar', 'StatusBar', 'ScrollBar',
}

# Types that are typically clickable
CLICKABLE_TYPES = {
    'Button', 'MenuItem', 'TabItem', 'ListItem', 'TreeItem',
    'Hyperlink', 'CheckBox', 'RadioButton',
}


class UIAutomation:
    """Windows UI Automation wrapper for robust element discovery."""

    def __init__(self):
        self._app = None
        self._window = None
        self._last_tree = None

    @staticmethod
    def is_available():
        """Check if UI Automation is available on this system."""
        return HAS_PYWINAUTO

    # ──────────────────────────────────────
    # Window Discovery
    # ──────────────────────────────────────

    def list_windows(self):
        """List all visible windows with their titles."""
        windows = []
        if HAS_PYWINAUTO:
            try:
                desktop = Desktop(backend='uia')
                for win in desktop.windows():
                    try:
                        title = win.window_text()
                        if title and title.strip() and win.is_visible():
                            rect = win.rectangle()
                            windows.append({
                                'title': title,
                                'class_name': win.class_name(),
                                'handle': win.handle,
                                'rect': {
                                    'x': rect.left, 'y': rect.top,
                                    'w': rect.width(), 'h': rect.height()
                                },
                                'is_enabled': win.is_enabled(),
                            })
                    except Exception:
                        continue
            except Exception as e:
                print(f"[UIAutomation] Error listing windows: {e}")
        elif HAS_WIN32:
            # Fallback to win32gui
            def enum_cb(hwnd, results):
                if win32gui.IsWindowVisible(hwnd):
                    title = win32gui.GetWindowText(hwnd)
                    if title.strip():
                        rect = win32gui.GetWindowRect(hwnd)
                        results.append({
                            'title': title,
                            'class_name': win32gui.GetClassName(hwnd),
                            'handle': hwnd,
                            'rect': {
                                'x': rect[0], 'y': rect[1],
                                'w': rect[2] - rect[0], 'h': rect[3] - rect[1]
                            },
                            'is_enabled': win32gui.IsWindowEnabled(hwnd),
                        })
            win32gui.EnumWindows(enum_cb, windows)

        # Filter out tiny/invisible windows and known system windows
        EXCLUDE = {'vibrana', 'overseer', 'localhost', 'program manager',
                    'settings', 'microsoft text input', 'nvidia'}
        windows = [w for w in windows
                    if w['rect']['w'] > 50 and w['rect']['h'] > 50
                    and not any(ex in w['title'].lower() for ex in EXCLUDE)]
        windows.sort(key=lambda w: w['title'])
        return {"windows": windows, "count": len(windows), "backend": "uia" if HAS_PYWINAUTO else "win32"}

    # ──────────────────────────────────────
    # Element Discovery
    # ──────────────────────────────────────

    def discover_window(self, window_title, max_depth=None, interactive_only=True):
        """
        Connect to a window and enumerate all its UI controls.
        Returns a flat list of elements with their properties.
        """
        if not HAS_PYWINAUTO:
            return {"error": "pywinauto not installed", "elements": [],
                    "hint": "Install with: pip install pywinauto"}

        if max_depth is None:
            max_depth = MAX_DEPTH

        try:
            # Connect to the application
            app = Application(backend='uia')
            app.connect(title_re=f".*{window_title}.*", timeout=5)
            window = app.window(title_re=f".*{window_title}.*")

            # Ensure window is in foreground
            try:
                window.set_focus()
            except Exception:
                pass
            time.sleep(0.2)

            self._app = app
            self._window = window

            # Enumerate all controls
            elements = []
            self._walk_tree(window, elements, depth=0, max_depth=max_depth,
                            interactive_only=interactive_only)

            # Take screenshot of the window for overlay
            screenshot_b64 = self._capture_window_screenshot(window)

            # Get window rect for coordinate mapping
            try:
                rect = window.rectangle()
                window_rect = {
                    'x': rect.left, 'y': rect.top,
                    'w': rect.width(), 'h': rect.height()
                }
            except Exception:
                window_rect = {'x': 0, 'y': 0, 'w': 1920, 'h': 1080}

            self._last_tree = {
                'window_title': window_title,
                'elements': elements,
                'window_rect': window_rect,
            }

            return {
                "status": "success",
                "window_title": window.window_text(),
                "window_rect": window_rect,
                "elements": elements,
                "count": len(elements),
                "screenshot": screenshot_b64,
                "backend": "uia",
            }

        except Exception as e:
            print(f"[UIAutomation] discover_window failed: {e}")
            traceback.print_exc()
            return {
                "error": str(e),
                "elements": [],
                "hint": "Make sure the window title is correct and the app is running."
            }

    def _walk_tree(self, element, results, depth, max_depth, interactive_only,
                   parent_path=""):
        """Recursively walk the UI Automation tree."""
        if depth > max_depth or len(results) >= MAX_ELEMENTS:
            return

        try:
            children = element.children()
        except Exception:
            return

        for child in children:
            if len(results) >= MAX_ELEMENTS:
                break
            try:
                control_type = child.element_info.control_type or ""
                name = child.window_text() or ""
                automation_id = ""
                try:
                    automation_id = child.element_info.automation_id or ""
                except Exception:
                    pass
                class_name = ""
                try:
                    class_name = child.class_name() or ""
                except Exception:
                    pass

                # Skip completely empty/unnamed elements
                if not name and not automation_id and control_type not in INTERACTIVE_TYPES:
                    # Still recurse into containers
                    self._walk_tree(child, results, depth + 1, max_depth,
                                    interactive_only, parent_path)
                    continue

                # Build element path
                path = f"{parent_path}/{control_type}[{name or automation_id or '?'}]"

                # Check if interactive
                is_interactive = control_type in INTERACTIVE_TYPES
                is_clickable = control_type in CLICKABLE_TYPES

                if interactive_only and not is_interactive:
                    # Still walk children (might contain interactive elements)
                    self._walk_tree(child, results, depth + 1, max_depth,
                                    interactive_only, path)
                    continue

                # Get bounding rectangle
                try:
                    rect = child.rectangle()
                    region = {
                        'x': rect.left, 'y': rect.top,
                        'w': rect.width(), 'h': rect.height()
                    }
                    center = {
                        'x': rect.left + rect.width() // 2,
                        'y': rect.top + rect.height() // 2
                    }
                    # Skip zero-size or off-screen elements
                    if region['w'] <= 0 or region['h'] <= 0:
                        self._walk_tree(child, results, depth + 1, max_depth,
                                        interactive_only, path)
                        continue
                except Exception:
                    region = None
                    center = None

                # Check enabled/visible state
                is_enabled = True
                is_visible = True
                try:
                    is_enabled = child.is_enabled()
                except Exception:
                    pass
                try:
                    is_visible = child.is_visible()
                except Exception:
                    pass

                if not is_visible:
                    continue

                elem = {
                    'id': f"uia_{len(results)}",
                    'name': name[:80],
                    'control_type': control_type,
                    'automation_id': automation_id[:60],
                    'class_name': class_name[:60],
                    'region': region,
                    'center': center,
                    'depth': depth,
                    'path': path[:200],
                    'is_clickable': is_clickable,
                    'is_enabled': is_enabled,
                    'is_visible': is_visible,
                    'source': 'uia',
                }
                results.append(elem)

            except Exception:
                pass

            # Recurse into children
            self._walk_tree(child, results, depth + 1, max_depth,
                            interactive_only, parent_path)

    def _capture_window_screenshot(self, window):
        """Capture a screenshot of the specific window."""
        if not HAS_SCREEN:
            return ""
        try:
            rect = window.rectangle()
            with mss.mss() as sct:
                monitor = {
                    "top": rect.top,
                    "left": rect.left,
                    "width": rect.width(),
                    "height": rect.height(),
                }
                shot = sct.grab(monitor)
                img = np.array(shot)
                img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 75])
                return base64.b64encode(buf).decode('utf-8')
        except Exception as e:
            print(f"[UIAutomation] Screenshot failed: {e}")
            return ""

    # ──────────────────────────────────────
    # Element Interaction
    # ──────────────────────────────────────

    def click_by_name(self, window_title, element_name, timeout=10):
        """Find an element by name and click it using UI Automation."""
        if not HAS_PYWINAUTO:
            return {"success": False, "error": "pywinauto not installed"}

        try:
            app = Application(backend='uia')
            app.connect(title_re=f".*{window_title}.*", timeout=5)
            window = app.window(title_re=f".*{window_title}.*")

            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    # Try to find the control
                    ctrl = window.child_window(title=element_name)
                    if ctrl.exists(timeout=0.5):
                        ctrl.click_input()
                        return {
                            "success": True,
                            "element": element_name,
                            "method": "uia_click"
                        }
                except Exception:
                    pass
                # Also try by automation_id
                try:
                    ctrl = window.child_window(auto_id=element_name)
                    if ctrl.exists(timeout=0.5):
                        ctrl.click_input()
                        return {
                            "success": True,
                            "element": element_name,
                            "method": "uia_auto_id"
                        }
                except Exception:
                    pass
                time.sleep(0.5)

            return {"success": False, "error": f"Element '{element_name}' not found after {timeout}s"}

        except Exception as e:
            return {"success": False, "error": str(e)}

    def wait_for_element(self, window_title, element_name, timeout=30):
        """Wait until an element with the given name appears."""
        if not HAS_PYWINAUTO:
            return {"success": False, "error": "pywinauto not installed"}

        try:
            app = Application(backend='uia')
            app.connect(title_re=f".*{window_title}.*", timeout=5)
            window = app.window(title_re=f".*{window_title}.*")

            start = time.time()
            deadline = start + timeout
            while time.time() < deadline:
                try:
                    ctrl = window.child_window(title=element_name)
                    if ctrl.exists(timeout=0.5):
                        rect = ctrl.rectangle()
                        return {
                            "success": True,
                            "element": element_name,
                            "elapsed": round(time.time() - start, 1),
                            "region": {
                                'x': rect.left, 'y': rect.top,
                                'w': rect.width(), 'h': rect.height()
                            }
                        }
                except Exception:
                    pass
                time.sleep(0.5)

            return {
                "success": False,
                "error": f"Element '{element_name}' not found after {timeout}s",
                "elapsed": round(time.time() - start, 1)
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_element_tree(self, window_title, max_depth=3):
        """Get a hierarchical tree of the window's UI elements (for tree view)."""
        if not HAS_PYWINAUTO:
            return {"error": "pywinauto not installed"}

        try:
            app = Application(backend='uia')
            app.connect(title_re=f".*{window_title}.*", timeout=5)
            window = app.window(title_re=f".*{window_title}.*")

            tree = self._build_tree_node(window, depth=0, max_depth=max_depth)
            return {"status": "success", "tree": tree, "window_title": window.window_text()}

        except Exception as e:
            return {"error": str(e)}

    def _build_tree_node(self, element, depth, max_depth):
        """Build a tree node recursively."""
        if depth > max_depth:
            return None

        try:
            name = element.window_text() or ""
            control_type = element.element_info.control_type or "Unknown"
        except Exception:
            return None

        node = {
            "name": name[:60],
            "type": control_type,
            "children": [],
        }

        try:
            for child in element.children():
                child_node = self._build_tree_node(child, depth + 1, max_depth)
                if child_node:
                    node["children"].append(child_node)
                if len(node["children"]) > 50:  # cap children per level
                    break
        except Exception:
            pass

        return node


# Module-level convenience functions
_instance = UIAutomation()


def discover_window(title, max_depth=None, interactive_only=True):
    return _instance.discover_window(title, max_depth, interactive_only)


def list_ui_windows():
    return _instance.list_windows()


def click_by_name(window_title, element_name, timeout=10):
    return _instance.click_by_name(window_title, element_name, timeout)


def wait_for_element(window_title, element_name, timeout=30):
    return _instance.wait_for_element(window_title, element_name, timeout)


def get_element_tree(window_title, max_depth=3):
    return _instance.get_element_tree(window_title, max_depth)


def is_available():
    return UIAutomation.is_available()
