import os
import sys

dir_path = r"c:\Users\edgar\OneDrive\Desktop\Vibrana\nls_training_data"
expected = [
    "INFORMATION-IN-THE-STRUCTUREOF-THE-UNIVERSE.pdf",
    "nonlinear__nls__diagnostic_systems.pdf",
    "Physical_Basics_of_Informational_Interaction_pub.pdf",
    "The_Theory_of_Quantum_Entropic_Logic.pdf",
    "ISHA-New-Metatron-4025-Hunter-user-manual.pdf",
    "MM-E-book-BHMC.pdf",
    "The_Electroherbalism_Frequency_Lists.pdf",
    "David-Tansley-Dimensions-of-Radionics.pdf"
]

all_valid = True
for fname in expected:
    path = os.path.join(dir_path, fname)
    if os.path.exists(path):
        size = os.path.getsize(path)
        with open(path, 'rb') as f:
            header = f.read(4)
            if header == b'%PDF':
                print(f"[OK] {fname} - {size/1024/1024:.2f} MB (Valid PDF header)")
            else:
                print(f"[ERROR] {fname} - {size/1024/1024:.2f} MB (Invalid header: {header})")
                all_valid = False
    else:
        print(f"[ERROR] Missing: {fname}")
        all_valid = False

if not all_valid:
    sys.exit(1)
