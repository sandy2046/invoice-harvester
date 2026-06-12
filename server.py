#!/usr/bin/env python3
"""
发票收割机 - 游戏服务器
支持静态文件 + API
"""

import json
import uuid
import time
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

# 内存存储
players = {}
history_leaderboard = []

class GameHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)
    
    def log_message(self, format, *args):
        # 简化日志输出
        pass
    
    def _set_json_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_OPTIONS(self):
        self._set_json_headers()
    
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        # API 路由
        if path == '/api/history':
            self._set_json_headers()
            sorted_history = sorted(history_leaderboard, key=lambda x: x['score'], reverse=True)[:10]
            self.wfile.write(json.dumps(sorted_history).encode())
            return
        
        elif path == '/api/events':
            # SSE 实时排行榜
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            try:
                while True:
                    online_players = [p for p in players.values() if p.get('status') == 'playing']
                    sorted_players = sorted(online_players, key=lambda x: x.get('score', 0), reverse=True)
                    data = json.dumps({
                        'players': sorted_players,
                        'onlineCount': len(online_players)
                    })
                    self.wfile.write(f"data: {data}\n\n".encode())
                    self.wfile.flush()
                    time.sleep(5)
            except:
                pass
            return
        
        # 静态文件服务
        super().do_GET()
    
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(post_data) if post_data else {}
        except:
            data = {}
        
        if path == '/api/register':
            player_id = str(uuid.uuid4())
            name = data.get('name', '匿名玩家')
            players[player_id] = {
                'id': player_id,
                'name': name,
                'score': 0,
                'invoices': 0,
                'speed': 1.0,
                'status': 'playing',
                'rank': {'name': '职场小白', 'headIcon': '😊'}
            }
            self._set_json_headers()
            self.wfile.write(json.dumps({
                'player_id': player_id,
                'name': name,
                'score': 0
            }).encode())
            return
        
        elif path == '/api/score':
            player_id = data.get('player_id')
            if player_id and player_id in players:
                players[player_id]['score'] = data.get('score', 0)
                players[player_id]['invoices'] = data.get('invoices', 0)
                players[player_id]['speed'] = data.get('speed', 1.0)
                players[player_id]['status'] = data.get('status', 'playing')
            self._set_json_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            return
        
        elif path == '/api/rename':
            player_id = data.get('player_id')
            name = data.get('name')
            if player_id and player_id in players and name:
                players[player_id]['name'] = name
            self._set_json_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            return
        
        elif path == '/api/leave':
            player_id = data.get('player_id')
            if player_id and player_id in players:
                del players[player_id]
            self._set_json_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            return
        
        elif path == '/api/history':
            name = data.get('name', '匿名')
            score = data.get('score', 0)
            invoices = data.get('invoices', 0)
            history_leaderboard.append({
                'name': name,
                'score': score,
                'invoices': invoices,
                'date': time.strftime('%Y-%m-%d')
            })
            self._set_json_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            return
        
        self._set_json_headers(404)
        self.wfile.write(json.dumps({'error': 'Not found'}).encode())

if __name__ == '__main__':
    port = 3000
    server = HTTPServer(('0.0.0.0', port), GameHandler)
    print(f"🎮 发票收割机服务器已启动！")
    print(f"📍 访问地址: http://localhost:{port}/invoice-harvester-multiplayer.html")
    print(f"🛑 按 Ctrl+C 停止服务器")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n✅ 服务器已停止")
