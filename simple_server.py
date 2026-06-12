#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 8765
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

print(f"Starting server at http://127.0.0.1:{PORT}")
print(f"Working directory: {SCRIPT_DIR}")
print("Press Ctrl+C to stop")

try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server running...")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
