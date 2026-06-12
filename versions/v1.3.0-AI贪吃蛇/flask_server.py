#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
发票收割机 Pro - Flask 版本服务端
=================================
使用 Flask 框架实现，支持多人实时游戏

安装依赖:
    pip install flask flask-cors

启动:
    python flask_server.py
"""

import json
import time
import uuid
import socket
import os
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

# 初始化 Flask 应用
app = Flask(__name__, static_folder='.')
CORS(app)

# 游戏状态存储
players = {}
subscribers = []

# 历史高分榜存储文件
HISTORY_LEADERBOARD_FILE = 'history_leaderboard.json'
MAX_HISTORY_RECORDS = 50  # 最多保留50条历史记录


def load_history_leaderboard():
    """加载历史高分榜"""
    try:
        if os.path.exists(HISTORY_LEADERBOARD_FILE):
            with open(HISTORY_LEADERBOARD_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"[错误] 加载历史高分榜失败: {e}")
    return []


def save_history_leaderboard(leaderboard):
    """保存历史高分榜到文件"""
    try:
        with open(HISTORY_LEADERBOARD_FILE, 'w', encoding='utf-8') as f:
            json.dump(leaderboard, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[错误] 保存历史高分榜失败: {e}")


def add_to_history_leaderboard(name, score, invoices):
    """添加新记录到历史高分榜"""
    leaderboard = load_history_leaderboard()
    record = {
        'name': name[:8] if name else '匿名玩家',
        'score': score,
        'invoices': invoices,
        'date': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    leaderboard.append(record)
    # 按分数排序，保留前N名
    leaderboard.sort(key=lambda x: x['score'], reverse=True)
    save_history_leaderboard(leaderboard[:MAX_HISTORY_RECORDS])
    return leaderboard[:10]  # 返回前10名


def get_lan_ip():
    """获取本机局域网IP地址"""
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
    """获取所有可用的IP地址"""
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith('127.'):
                ips.append(ip)
    except:
        pass
    return ips


def notify_all():
    """通知所有订阅者数据更新"""
    sorted_players = sorted(players.values(), key=lambda p: p['score'], reverse=True)
    data = json.dumps({
        'type': 'leaderboard',
        'data': sorted_players[:10]  # 只返回前10名
    })
    dead_subscribers = []
    for callback in subscribers:
        try:
            callback(data)
        except:
            dead_subscribers.append(callback)
    for dead in dead_subscribers:
        if dead in subscribers:
            subscribers.remove(dead)


# ============================================================
# API 路由
# ============================================================

@app.route('/')
def index():
    """主页 - 返回游戏 HTML"""
    return send_from_directory('.', 'invoice-harvester-multiplayer.html')


@app.route('/game')
def game():
    """游戏页面"""
    return send_from_directory('.', 'invoice-harvester-multiplayer.html')


@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    """获取排行榜 - 返回前10名"""
    sorted_players = sorted(players.values(), key=lambda p: p['score'], reverse=True)
    return jsonify({
        'players': sorted_players[:10]  # 只返回前10名
    })


@app.route('/api/register', methods=['POST'])
def register_player():
    """注册新玩家"""
    data = request.get_json() or {}
    name = data.get('name', '匿名玩家')[:8]
    
    # 获取客户端IP地址
    client_ip = request.environ.get('HTTP_X_REAL_IP', 
                   request.environ.get('HTTP_X_FORWARDED_FOR', 
                   request.remote_addr))
    
    player_id = str(uuid.uuid4())[:8]
    players[player_id] = {
        'id': player_id,
        'name': name,
        'score': 0,
        'invoices': 0,
        'speed': 1.0,
        'status': 'playing',
        'last_seen': time.time(),
        'ip': client_ip  # 记录IP用于统计在线人数
    }
    notify_all()
    
    return jsonify({
        'player_id': player_id,
        'name': players[player_id]['name'],
        'ip': client_ip
    })


@app.route('/api/score', methods=['POST'])
def update_score():
    """更新玩家分数"""
    data = request.get_json() or {}
    player_id = data.get('player_id')
    
    if player_id and player_id in players:
        players[player_id].update({
            'score': data.get('score', 0),
            'invoices': data.get('invoices', 0),
            'speed': data.get('speed', 1.0),
            'status': data.get('status', 'playing'),
            'last_seen': time.time()
        })
        notify_all()
        return jsonify({'success': True})
    
    return jsonify({'error': 'Player not found'}), 404


@app.route('/api/leave', methods=['POST'])
def leave_game():
    """玩家离开游戏"""
    data = request.get_json() or {}
    player_id = data.get('player_id')
    
    if player_id and player_id in players:
        del players[player_id]
        notify_all()
    
    return jsonify({'success': True})


@app.route('/api/rename', methods=['POST'])
def rename_player():
    """更新玩家名字"""
    data = request.get_json() or {}
    player_id = data.get('player_id')
    new_name = data.get('name', '匿名玩家')[:8]
    
    if player_id and player_id in players:
        players[player_id]['name'] = new_name
        notify_all()
        return jsonify({'success': True})
    
    return jsonify({'error': 'Player not found'}), 404


@app.route('/api/history', methods=['GET'])
def get_history_leaderboard():
    """获取历史高分榜"""
    leaderboard = load_history_leaderboard()
    return jsonify({
        'players': leaderboard[:10]  # 返回前10名
    })


@app.route('/api/history', methods=['POST'])
def add_history_record():
    """添加记录到历史高分榜"""
    data = request.get_json() or {}
    
    # 处理可能的字符串输入（双重JSON编码）
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except:
            data = {}
    
    name = data.get('name', '匿名玩家') if isinstance(data, dict) else '匿名玩家'
    score = data.get('score', 0) if isinstance(data, dict) else 0
    invoices = data.get('invoices', 0) if isinstance(data, dict) else 0
    
    top10 = add_to_history_leaderboard(name, score, invoices)
    return jsonify({
        'success': True,
        'players': top10
    })


@app.route('/api/events')
def sse_events():
    """Server-Sent Events 实时数据流"""
    def event_stream():
        # 发送初始数据 - 前10名
        sorted_players = sorted(players.values(), key=lambda p: p['score'], reverse=True)
        initial_data = json.dumps({
            'type': 'leaderboard',
            'data': sorted_players[:10]
        })
        yield f"data: {initial_data}\n\n"
        
        # 注册订阅者
        message_queue = []
        
        def callback(data):
            message_queue.append(data)
        
        subscribers.append(callback)
        
        try:
            while True:
                # 检查是否有新消息
                while message_queue:
                    yield f"data: {message_queue.pop(0)}\n\n"
                # 发送心跳
                yield ":heartbeat\n\n"
                time.sleep(1)
        except GeneratorExit:
            pass
        finally:
            if callback in subscribers:
                subscribers.remove(callback)
    
    return Response(
        event_stream(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    )


# ============================================================
# 主程序入口
# ============================================================
if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='发票收割机 Flask 服务端')
    parser.add_argument('--port', '-p', type=int, default=8765, help='服务端口号 (默认: 8765)')
    parser.add_argument('--host', default='0.0.0.0', help='绑定地址 (默认: 0.0.0.0)')
    parser.add_argument('--debug', action='store_true', help='调试模式')
    args = parser.parse_args()
    
    # 获取局域网IP
    lan_ip = get_lan_ip()
    all_ips = get_all_ips()
    
    # 打印启动信息
    print("=" * 60)
    print("  🎮 发票收割机 Pro - Flask 游戏服务端")
    print("=" * 60)
    print()
    print(f"  📁 工作目录: {os.getcwd()}")
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
    
    # 启动 Flask 服务器
    app.run(
        host=args.host,
        port=args.port,
        debug=args.debug,
        threaded=True,
        use_reloader=False
    )
