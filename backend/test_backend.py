import pyautogui
try:
    w, h = pyautogui.size()
    print(f"Screen: {w}x{h}")
except Exception as e:
    print(f"PyAutoGUI Error: {e}")
