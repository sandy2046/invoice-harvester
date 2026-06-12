#!/usr/bin/env python3
import json
import time
import uuid
import socket
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

class GameState:
    def __init__(self):
        self.players = {}
        self.subscribers = []
    
    def register_player(self, name):
        player_id = str(uuid.uuid4())[:8]
        self.players[player_id] = {
            'id': player_id,
            'name': name[:8],
            'score': 0,
            'invoices': 0,
            'speed': 1.0,
            'status': 'playing',
            'last_seen': time.time()
        }
        self._notify_subscribers()
        return player_id
    
    def update_score(self, player_id, score, invoices, speed, status='playing'):
        if player_id in self.players:
            self.players[player_id].update({
                'score': score,
                'invoices': invoices,
                'speed': speed,
                'status': status,
                'last_seen': time.time()
            })
            self._notify_subscribers()
    
    def remove_player(self, player_id):
        if player_id in self.players:
            del self.players[player_id]
            self._notify_subscribers()
    
    def get_leaderboard(self):
        return sorted(self.players.values(), key=lambda p: p['score'], reverse=True)
    
    def add_subscriber(self, callback):
        self.subscribers.append(callback)
    
    def remove_subscriber(self, callback):
        if callback in self.subscribers:
            self.subscribers.remove(callback)
    
    def _notify_subscribers(self):
        data = json.dumps({
            'type': 'leaderboard',
            'data': self.get_leaderboard(),
            'timestamp': time.time()
        })
        for callback in self.subscribers[:]:
            try:
                callback(data)
            except:
                self.subscribers.remove(callback)

game_state = GameState()

class GameRequestHandler(BaseHTTPRequestHandler):
    STATIC_FILES = {
        '/': 'invoice-harvester-multiplayer.html',
        '/game': 'invoice-harvester-multiplayer.html',
    }
    
    def log_message(self, format, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")
    
    def do_GET(self):
        from urllib.parse import urlparse
        path = urlparse(self.path).path
        
        if path in self.STATIC_FILES:
            self._serve_static(self.STATIC_FILES[path])
        elif path == '/api/leaderboard':
            self._serve_json({'players': game_state.get_leaderboard()})
        elif path == '/api/events':
            self._serve_sse()
        else:
            self._serve_404()
    
    def do_POST(self):
        from urllib.parse import urlparse
        path = urlparse(self.path).path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(body) if body else {}
        except:
            self._serve_json({'error': 'Invalid JSON'}, 400)
            return
        
        if path == '/api/register':
            name = data.get('name', 'Anonymous')
            player_id = game_state.register_player(name)
            self._serve_json({'player_id': player_id, 'name': game_state.players[player_id]['name']})
        elif path == '/api/score':
            player_id = data.get('player_id')
            if player_id and player_id in game_state.players:
                game_state.update_score(
                    player_id,
                    data.get('score', 0),
                    data.get('invoices', 0),
                    data.get('speed', 1.0),
                    data.get('status', 'playing')
                )
                self._serve_json({'success': True})
            else:
                self._serve_json({'error': 'Player not found'}, 404)
        elif path == '/api/leave':
            if data.get('player_id'):
                game_state.remove_player(data['player_id'])
            self._serve_json({'success': True})
        else:
            self._serve_404()
    
    def do_OPTIONS(self):
        self._send_cors_headers()
        self.end_headers()
    
    def _serve_static(self, filename):
        try:
            filepath = os.path.join(SCRIPT_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            self._send_cors_headers(200, 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
        except Exception as e:
            print(f"[Error] File not found: {filename} - {e}")
            self._serve_404()
    
    def _serve_json(self, data, status=200):
        self._send_cors_headers(status, 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def _serve_sse(self):
        try:
            self._send_cors_headers(200, 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            
            initial_data = json.dumps({
                'type': 'leaderboard',
                'data': game_state.get_leaderboard()
            })
            self.wfile.write(f"data: {initial_data}\n\n".encode('utf-8'))
            self.wfile.flush()
            
            def send_update(data):
                self.wfile.write(f"data: {data}\n\n".encode('utf-8'))
                self.wfile.flush()
            
            game_state.add_subscriber(send_update)
            
            while True:
                time.sleep(1)
                self.wfile.write(b":heartbeat\n\n")
                self.wfile.flush()
        except:
            pass
        finally:
            game_state.remove_subscriber(send_update)
    
    def _serve_404(self):
        self._send_cors_headers(404, 'text/plain')
        self.end_headers()
        self.wfile.write(b'Not Found')
    
    def _send_cors_headers(self, status=200, content_type=None):
        self.send_response(status)
        if content_type:
            self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        pass
    try:
        return socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)[0][4][0]
    except:
        pass
    return '127.0.0.1'

def get_all_ips():
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith('127.'):
                ips.append(ip)
    except:
        pass
    return ips

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Invoice Harvester Game Server')
    parser.add_argument('--port', '-p', type=int, default=8765)
    parser.add_argument('--host', default='0.0.0.0')
    args = parser.parse_args()
    
    lan_ip = get_lan_ip()
    all_ips = get_all_ips()
    
    print("=" * 60)
    print("  Invoice Harvester Pro - Game Server")
    print("=" * 60)
    print()
    print(f"  Working Directory: {SCRIPT_DIR}")
    print()
    print(f"  Server Started!")
    print()
    print("  Access URLs:")
    print(f"     Local:    http://127.0.0.1:{args.port}")
    print(f"     LAN:      http://{lan_ip}:{args.port}")
    for ip in all_ips:
        if ip != lan_ip:
            print(f"              http://{ip}:{args.port}")
    print()
    print("  Press Ctrl+C to stop")
    print("=" * 60)
    print()
    
    server = HTTPServer((args.host, args.port), GameRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\n  Server stopped")
        server.shutdown()

if __name__ == '__main__':
    main()
