import pyautogui
import cv2
import numpy as np
import datetime

print(f"[{datetime.datetime.now()}] Starting capture test...")
try:
    screenshot = pyautogui.screenshot()
    print(f"[{datetime.datetime.now()}] Screenshot taken object: {type(screenshot)}")
    
    frame = np.array(screenshot)
    print(f"[{datetime.datetime.now()}] Converted to numpy: {frame.shape}")
    
    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    cv2.imwrite('minimal_capture.png', frame)
    print(f"[{datetime.datetime.now()}] Saved minimal_capture.png")
    
except Exception as e:
    print(f"[{datetime.datetime.now()}] CAPTURE FAILED: {e}")
