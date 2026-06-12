#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
发票收割机 Pro - 局域网多人游戏服务端
=====================================
使用Python标准库实现，零第三方依赖
功能：
1. HTTP静态文件服务
2. 玩家分数实时同步 (Server-Sent Events)
3. 在线玩家列表管理
4. 局域网IP自动检测

使用方法：
    python server.py
    python server.py --port 8080
"""

import json
import time
import uuid
import socket
import argparse
import os
import sys
from urllib.parse import parse_qs, urlparse
from http.server import HTTPServer, BaseHTTPRequestHandler

# ============================================================
# 自动切换到脚本所在目录（关键修复）
# ============================================================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)  # 切换工作目录到脚本所在位置


# ============================================================
# 游戏状态管理器 (线程安全的数据存储)
# ============================================================
class GameState:
    """管理所有玩家的游戏状态"""
    
    def __init__(self):
        self.players = {}  # {player_id: {name, score, invoices, last_seen}}
        self.subscribers = []  # SSE订阅者列表
    
    def register_player(self, name):
        """注册新玩家"""
        player_id = str(uuid.uuid4())[:8]
        self.players[player_id] = {
            'id': player_id,
            'name': name[:8],  # 限制名字长度
            'score': 0,
            'invoices': 0,
            'speed': 1.0,
            'status': 'playing',  # playing, gameover
            'last_seen': time.time()
        }
        self._notify_subscribers()
        return player_id
    
    def update_score(self, player_id, score, invoices, speed, status='playing'):
        """更新玩家分数"""
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
        """移除玩家"""
        if player_id in self.players:
            del self.players[player_id]
            self._notify_subscribers()
    
    def get_leaderboard(self):
        """获取排行榜 (按分数排序)"""
        sorted_players = sorted(
            self.players.values(),
            key=lambda p: p['score'],
            reverse=True
        )
        return sorted_players
    
    def add_subscriber(self, callback):
        """添加SSE订阅者"""
        self.subscribers.append(callback)
    
    def remove_subscriber(self, callback):
        """移除SSE订阅者"""
        if callback in self.subscribers:
            self.subscribers.remove(callback)
    
    def _notify_subscribers(self):
        """通知所有订阅者数据更新"""
        data = json.dumps({
            'type': 'leaderboard',
            'data': self.get_leaderboard(),
            'timestamp': time.time()
        })
        dead_subscribers = []
        for callback in self.subscribers:
            try:
                callback(data)
            except Exception:
                dead_subscribers.append(callback)
        # 清理失效的订阅者
        for dead in dead_subscribers:
            self.remove_subscriber(dead)
    
    def cleanup_inactive(self, timeout=60):
        """清理不活跃玩家"""
        now = time.time()
        inactive = [
            pid for pid, p in self.players.items()
            if now - p['last_seen'] > timeout
        ]
        for pid in inactive:
            self.remove_player(pid)


# 全局游戏状态实例
game_state = GameState()


# ============================================================
# HTTP请求处理器
# ============================================================
class GameRequestHandler(BaseHTTPRequestHandler):
    """自定义HTTP请求处理器"""
    
    # 静态文件映射
    STATIC_FILES = {
        '/': 'invoice-harvester-multiplayer.html',
        '/game': 'invoice-harvester-multiplayer.html',
    }
    
    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")
    
    def do_GET(self):
        """处理GET请求"""
        parsed = urlparse(self.path)
        path = parsed.path
        
        # 根路径或游戏页面
        if path in self.STATIC_FILES:
            self._serve_static(self.STATIC_FILES[path])
        
        # API: 获取排行榜
        elif path == '/api/leaderboard':
            self._serve_json({'players': game_state.get_leaderboard()})
        
        # API: SSE实时数据流
        elif path == '/api/events':
            self._serve_sse()
        
        # 404
        else:
            self._serve_404()
    
    def do_POST(self):
        """处理POST请求"""
        parsed = urlparse(self.path)
        path = parsed.path
        
        # 读取请求体
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._serve_json({'error': 'Invalid JSON'}, 400)
            return
        
        # API: 注册玩家
        if path == '/api/register':
            name = data.get('name', '匿名玩家')
            player_id = game_state.register_player(name)
            self._serve_json({
                'player_id': player_id,
                'name': game_state.players[player_id]['name']
            })
        
        # API: 更新分数
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
        
        # API: 玩家离开
        elif path == '/api/leave':
            player_id = data.get('player_id')
            if player_id:
                game_state.remove_player(player_id)
            self._serve_json({'success': True})
        
        else:
            self._serve_404()
    
    def do_OPTIONS(self):
        """处理OPTIONS请求 (CORS预检)"""
        self._send_cors_headers()
        self.end_headers()
    
    def _serve_static(self, filename):
        """提供静态文件"""
        try:
            filepath = os.path.join(SCRIPT_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            self._send_cors_headers(200, 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
        except FileNotFoundError:
            print(f"[错误] 文件未找到: {filename}")
            self._serve_404()
        except Exception as e:
            print(f"[错误] 读取文件失败: {e}")
            self._serve_404()
    
    def _serve_json(self, data, status=200):
        """返回JSON响应"""
        self._send_cors_headers(status, 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def _serve_sse(self):
        """提供Server-Sent Events流"""
        try:
            self._send_cors_headers(200, 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            
            # 发送初始数据
            initial_data = json.dumps({
                'type': 'leaderboard',
                'data': game_state.get_leaderboard()
            })
            self.wfile.write(f"data: {initial_data}\n\n".encode('utf-8'))
            self.wfile.flush()
            
            # 注册订阅者
            def send_update(data):
                try:
                    self.wfile.write(f"data: {data}\n\n".encode('utf-8'))
                    self.wfile.flush()
                except Exception:
                    raise
            
            game_state.add_subscriber(send_update)
            
            # 保持连接活跃
            while True:
                time.sleep(1)
                self.wfile.write(b":heartbeat\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:
            print(f"[SSE] 连接异常: {e}")
        finally:
            game_state.remove_subscriber(send_update)
    
    def _serve_404(self):
        """返回404错误"""
        self._send_cors_headers(404, 'text/plain')
        self.end_headers()
        self.wfile.write(b'Not Found')
    
    def _send_cors_headers(self, status=200, content_type=None):
        """发送CORS响应头"""
        self.send_response(status)
        if content_type:
            self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')


# ============================================================
# 局域网IP检测工具
# ============================================================
def get_lan_ip():
    """获取本机局域网IP地址"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        pass
    
    try:
        hostname = socket.gethostname()
        ip = socket.getaddrinfo(hostname, None, socket.AF_INET)[0][4][0]
        return ip
    except Exception:
        pass
    
    return '127.0.0.1'


def get_all_ips():
    """获取所有可用的IP地址"""
    ips = []
    try:
        hostname = socket.gethostname()
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_INET)
        for info in addr_info:
            ip = info[4][0]
            if ip not in ips and not ip.startswith('127.'):
                ips.append(ip)
    except Exception:
        pass
    return ips


# ============================================================
# 主程序入口
# ============================================================
def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='发票收割机 Pro - 局域网多人游戏服务端',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python server.py              # 默认端口8765
  python server.py --port 8080  # 指定端口8080
        '''
    )
    parser.add_argument(
        '--port', '-p',
        type=int,
        default=8765,
        help='服务端口号 (默认: 8765)'
    )
    parser.add_argument(
        '--host',
        default='0.0.0.0',
        help='绑定地址 (默认: 0.0.0.0)'
    )
    args = parser.parse_args()
    
    # 获取局域网IP
    lan_ip = get_lan_ip()
    all_ips = get_all_ips()
    
    # 打印启动信息
    print("=" * 60)
    print("  🎮 发票收割机 Pro - 局域网多人游戏服务端")
    print("=" * 60)
    print()
    print(f"  📁 工作目录: {SCRIPT_DIR}")
    print(f"  📁 当前目录: {os.getcwd()}")
    print()
    print(f"  📡 服务已启动!")
    print()
    print("  🌐 访问地址:")
    print(f"     本机访问: http://127.0.0.1:{args.port}")
    print(f"     局域网访问: http://{lan_ip}:{args.port}")
    
    if len(all_ips) > 1:
        print()
        print("  📶 其他可用IP:")
        for ip in all_ips:
            if ip != lan_ip:
                print(f"     http://{ip}:{args.port}")
    
    print()
    print("  📋 功能说明:")
    print("     • 打开网页即可开始游戏")
    print("     • 同局域网内其他玩家可以通过上述地址加入")
    print("     • 实时查看所有玩家的分数排名")
    print()
    print("  ⚠️  按 Ctrl+C 停止服务")
    print("=" * 60)
    print()
    
    # 启动HTTP服务器
    server = HTTPServer((args.host, args.port), GameRequestHandler)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\n  👋 服务已停止")
        server.shutdown()


if __name__ == '__main__':
    main()
