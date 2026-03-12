import pytesseract
from PIL import Image
import sys
import os

print(f"Python: {sys.executable}")
try:
    import pytesseract
    print(f"Pytesseract version: {pytesseract.__version__}")
except ImportError:
    print("pytesseract not installed")
    sys.exit(1)

try:
    # Attempt to get tesseract version (checks binary)
    # Configure path first
    tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(tesseract_path):
        pytesseract.pytesseract.tesseract_cmd = tesseract_path
        
    version = pytesseract.get_tesseract_version()
    print(f"Tesseract binary version: {version}")
except Exception as e:
    print(f"Tesseract binary error: {e}")
    print("Tesseract-OCR is likely not installed or not in PATH.")
