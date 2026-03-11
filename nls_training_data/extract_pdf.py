import sys
import os

pdf_path = r"c:\Users\edgar\Downloads\Maria del Carmen.pdf"
out_path = r"c:\Users\edgar\OneDrive\Desktop\Vibrana\nls_training_data\maria_del_carmen.txt"

def extract_with_pypdf(path):
    try:
        import pypdf
        with open(path, 'rb') as f:
            reader = pypdf.PdfReader(f)
            text = ""
            for i in range(len(reader.pages)):
                text += reader.pages[i].extract_text() + "\n"
            return text
    except Exception as e:
        print(f"pypdf extraction failed: {e}")
    return None

text = extract_with_pypdf(pdf_path)

if text is None:
    print("Could not extract text.")
    sys.exit(1)

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Extraction complete.")
