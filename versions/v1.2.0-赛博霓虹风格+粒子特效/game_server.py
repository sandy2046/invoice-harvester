#!/usr/bin/env python3
import json
import time
import uuid
import socket
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8765

# Game state
players = {}
subscribers = []

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return '127.0.0.1'

class GameHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/api/events':
            self.handle_sse()
        elif self.path == '/api/leaderboard':
            self.send_json({'players': sorted(players.values(), key=lambda p: p['score'], reverse=True)})
        else:
            super().do_GET()
    
    def do_POST(self):
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8')
        try:
            data = json.loads(body) if body else {}
        except:
            self.send_json({'error': 'Invalid JSON'}, 400)
            return
        
        if self.path == '/api/register':
            pid = str(uuid.uuid4())[:8]
            players[pid] = {
                'id': pid,
                'name': data.get('name', 'Player')[:8],
                'score': 0,
                'invoices': 0,
                'speed': 1.0,
                'status': 'playing',
                'last_seen': time.time()
            }
            self.notify_all()
            self.send_json({'player_id': pid, 'name': players[pid]['name']})
        
        elif self.path == '/api/score':
            pid = data.get('player_id')
            if pid in players:
                players[pid].update({
                    'score': data.get('score', 0),
                    'invoices': data.get('invoices', 0),
                    'speed': data.get('speed', 1.0),
                    'status': data.get('status', 'playing'),
                    'last_seen': time.time()
                })
                self.notify_all()
                self.send_json({'success': True})
            else:
                self.send_json({'error': 'Not found'}, 404)
        
        elif self.path == '/api/leave':
            if data.get('player_id') in players:
                del players[data['player_id']]
                self.notify_all()
            self.send_json({'success': True})
        else:
            self.send_json({'error': 'Not found'}, 404)
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())
    
    def handle_sse(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        
        def callback(data):
            self.wfile.write(f"data: {data}\n\n".encode())
            self.wfile.flush()
        
        callback(json.dumps({'type': 'leaderboard', 'data': sorted(players.values(), key=lambda p: p['score'], reverse=True)}))
        subscribers.append(callback)
        
        try:
            while True:
                time.sleep(1)
                self.wfile.write(b":heartbeat\n\n")
                self.wfile.flush()
        except:
            pass
        finally:
            if callback in subscribers:
                subscribers.remove(callback)
    
    def notify_all(self):
        data = json.dumps({'type': 'leaderboard', 'data': sorted(players.values(), key=lambda p: p['score'], reverse=True)})
        for cb in subscribers[:]:
            try:
                cb(data)
            except:
                subscribers.remove(cb)

# Start server
lan_ip = get_lan_ip()
print("=" * 50)
print("  Invoice Harvester Game Server")
print("=" * 50)
print(f"\n  Server running on port {PORT}")
print(f"\n  Local:   http://127.0.0.1:{PORT}")
print(f"  LAN:     http://{lan_ip}:{PORT}")
print("\n  Press Ctrl+C to stop")
print("=" * 50)

try:
    HTTPServer(('', PORT), GameHandler).serve_forever()
except KeyboardInterrupt:
    print("\n\nServer stopped.")
