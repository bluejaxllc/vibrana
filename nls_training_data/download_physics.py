import urllib.request
import os

files = {
    "INFORMATION-IN-THE-STRUCTUREOF-THE-UNIVERSE.pdf": "https://3d-nls-health-analyzer.com/wp-content/uploads/2018/01/INFORMATION-IN-THE-STRUCTUREOF-THE-UNIVERSE.pdf",
    "nonlinear__nls__diagnostic_systems.pdf": "https://uk.metatron-nls.ru/wp-content/uploads/pdf/nonlinear__nls__diagnostic_systems.pdf",
    "Physical_Basics_of_Informational_Interaction_pub.pdf": "https://www.scancoaching.nl/wp-content/uploads/2014/10/Physical%20Basics%20of%20Informational%20Interaction%20pub.pdf",
    "The_Theory_of_Quantum_Entropic_Logic.pdf": "https://uk.metatron-nls.ru/wp-content/uploads/pdf/fiz_osnovy_eng3.pdf"
}

dir_path = r"c:\Users\edgar\OneDrive\Desktop\Vibrana\nls_training_data"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for filename, url in files.items():
    filepath = os.path.join(dir_path, filename)
    print(f"Downloading {filename}...")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"Success: {filename}")
    except Exception as e:
        print(f"Failed to download {filename}: {e}")
