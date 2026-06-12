#!/usr/bin/env python3
"""发票收割机 - 游戏服务器（完整版，含数据持久化）"""
import json, time, uuid, os, threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

PORT = 8765
players = {}
subscribers = []
history_file = 'all_leaderboard_merged.json'

# ============================================================
# 历史记录文件操作（线程安全）
# ============================================================
def load_history():
    """从JSON文件加载历史记录"""
    global history
    if os.path.exists(history_file):
        try:
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
            print(f"  📂 已加载 {len(history)} 条历史记录")
        except Exception as e:
            print(f"  ⚠️ 加载历史记录失败: {e}")
            history = []
    else:
        history = []
        print("  📂 未找到历史记录文件，将创建新文件")

def save_history():
    """保存历史记录到JSON文件（线程安全）"""
    with history_lock:
        try:
            with open(history_file, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"  ⚠️ 保存历史记录失败: {e}")

history = []
history_lock = threading.RLock()  # 可重入锁，防止嵌套调用死锁

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
        # 根路径重定向到游戏页面
        if self.path == '/' or self.path == '':
            self.send_response(302)
            self.send_header('Location', '/invoice-harvester-multiplayer.html')
            self.end_headers()
            return
        if self.path == '/api/events':
            self.handle_sse()
        elif self.path == '/api/history':
            with history_lock:
                top = sorted(history, key=lambda x: x['score'], reverse=True)[:10]
            self.send_json({'players': top})
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
                'id': pid, 'name': data.get('name', 'Player')[:8],
                'score': 0, 'invoices': 0, 'speed': 1.0,
                'status': 'playing', 'last_seen': time.time()
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

        elif self.path == '/api/rename':
            pid = data.get('player_id')
            if pid in players:
                players[pid]['name'] = data.get('name', 'Player')[:8]
                self.send_json({'success': True})
            else:
                self.send_json({'error': 'Not found'}, 404)

        elif self.path == '/api/leave':
            pid = data.get('player_id')
            if pid in players:
                del players[pid]
                self.notify_all()
            self.send_json({'success': True})

        elif self.path == '/api/history':
            with history_lock:
                history.append({
                    'name': data.get('name', '匿名')[:8],
                    'score': data.get('score', 0),
                    'invoices': data.get('invoices', 0),
                    'date': time.strftime('%m-%d %H:%M')
                })
                save_history()
                top = sorted(history, key=lambda x: x['score'], reverse=True)[:10]
            self.send_json({'success': True, 'players': top})
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
        def cb(data):
            try:
                self.wfile.write(f"data: {data}\n\n".encode())
                self.wfile.flush()
            except:
                pass
        cb(json.dumps({'type': 'leaderboard', 'data': sorted(players.values(), key=lambda p: p['score'], reverse=True)}))
        subscribers.append(cb)
        try:
            # 最多保持60秒，超时自动断开防止线程堆积
            for _ in range(20):
                time.sleep(3)
                self.wfile.write(b":heartbeat\n\n")
                self.wfile.flush()
        except:
            pass
        finally:
            if cb in subscribers:
                subscribers.remove(cb)

    def notify_all(self):
        data = json.dumps({'type': 'leaderboard', 'data': sorted(players.values(), key=lambda p: p['score'], reverse=True)})
        for cb in subscribers[:]:
            try:
                cb(data)
            except:
                if cb in subscribers:
                    subscribers.remove(cb)

    def log_message(self, fmt, *args):
        pass  # 静默日志

print("=" * 50)
print("  🎮 发票收割机 游戏服务器")
print("=" * 50)
print(f"  📍 本地访问: http://127.0.0.1:{PORT}")
print(f"  📍 游戏页面: http://127.0.0.1:{PORT}/invoice-harvester-multiplayer.html")
print(f"  💾 数据文件: {history_file}")
print(f"  🛑 按 Ctrl+C 停止")
print("=" * 50)

# 启动时加载历史记录
load_history()

try:
    ThreadingHTTPServer(('', PORT), GameHandler).serve_forever()
except KeyboardInterrupt:
    print("\n✅ 服务器已停止")
