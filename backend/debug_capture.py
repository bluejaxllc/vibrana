from cv_engine import NLSAutomation
import cv2
import os

def debug_capture():
    try:
        bot = NLSAutomation()
        frame = bot.capture_screen()
        if frame is not None:
            # Check if frame is all black
            if frame.max() == 0:
                print("Captured frame is ALL BLACK (zeros).")
            else:
                print(f"Captured frame has content. Max value: {frame.max()}")
                cv2.imwrite("debug_capture.png", frame)
                print("Saved debug_capture.png")
        else:
            print("Capture returned None.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_capture()
