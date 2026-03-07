"""Einfacher lokaler Webserver zum Testen der App.
Starten mit: python serve.py
Dann im Browser: http://localhost:8000
"""
import http.server
import webbrowser
import os

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"  {self.address_string()} → {format % args}")

print(f"Hauspost Scanner läuft auf http://localhost:{PORT}")
print("Strg+C zum Beenden\n")
webbrowser.open(f"http://localhost:{PORT}")
http.server.HTTPServer(("", PORT), Handler).serve_forever()
