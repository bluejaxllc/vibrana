"""
Simple HTTP server for the Mock NLS Simulator.
Serves on port 5555 so Vibrana's LogicMapper can target the browser window.
"""
import http.server
import os
import sys

PORT = 5555
DIR = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

if __name__ == "__main__":
    print(f"[Mock NLS] Serving on http://localhost:{PORT}")
    print(f"[Mock NLS] Open in browser, then use Vibrana's LogicMapper to target:")
    print(f"           Window title: 'Metatron Hunter 4025 — NLS Diagnostic'")
    print(f"[Mock NLS] Press Ctrl+C to stop")
    
    server = http.server.HTTPServer(("", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Mock NLS] Stopped.")
        server.server_close()
