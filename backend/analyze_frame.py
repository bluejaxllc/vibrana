import cv2
import numpy as np
import os

if os.path.exists('debug_frame.png'):
    img = cv2.imread('debug_frame.png')
    if img is None:
        print("Image is None (corrupt or unreadable)")
    else:
        avg_color = np.mean(img)
        print(f"Average Pixel Value: {avg_color}")
        print(f"Image Shape: {img.shape}")
        if avg_color < 1:
            print("CONCLUSION: Image is PURE BLACK.")
        else:
            print("CONCLUSION: Image contains data.")
else:
    print("debug_frame.png NOT FOUND")
