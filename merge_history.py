#!/usr/bin/env python3
"""合并所有历史排行榜数据到单个JSON文件"""
import json
import os

# 历史数据文件路径
files = [
    'history_leaderboard.json',
    'versions/v1.2.0-赛博霓虹风格+粒子特效/history_leaderboard.json',
    'versions/v1.3.0-AI贪吃蛇/history_leaderboard.json',
    'versions/v1.4.0-AI增强版/history_leaderboard.json',
    'versions/v1.5.0-终极版/history_leaderboard.json',
    'versions/v1.6.0-动感版/history_leaderboard.json',
]

all_records = []
seen = set()

for filepath in files:
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            count = 0
            for record in data:
                # 去重：name + score + date 组合
                key = (record.get('name', ''), record.get('score', 0), record.get('date', ''))
                if key not in seen:
                    seen.add(key)
                    record['_source'] = filepath
                    all_records.append(record)
                    count += 1
            print(f"✅ {filepath}: 读取 {len(data)} 条，新增 {count} 条")
        except Exception as e:
            print(f"❌ {filepath}: 读取失败 - {e}")
    else:
        print(f"⚠️ {filepath}: 文件不存在")

# 按分数降序排序
all_records.sort(key=lambda x: x.get('score', 0), reverse=True)

# 保存到新文件
output_file = 'all_leaderboard_merged.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(all_records, f, ensure_ascii=False, indent=2)

print(f"\n📊 合并完成！")
print(f"   总记录数: {len(all_records)} 条")
print(f"   输出文件: {output_file}")
print(f"\n🏆 Top 10:")
for i, r in enumerate(all_records[:10], 1):
    print(f"   {i}. {r.get('name', '匿名')} - ¥{r.get('score', 0)} ({r.get('date', '')})")
