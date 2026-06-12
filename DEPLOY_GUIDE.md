# 发票收割者 - 部署指南

## 部署架构

本项目采用前后端分离部署架构：

- **前端 (Vercel)**: 静态游戏页面，已部署完成
  - 地址: https://6a054f2412f6191505e79b9b.vercel.app

- **后端 (Render)**: Socket.IO 实时游戏服务器，需要您完成部署
  - 目标地址: https://invoice-harvester-server.onrender.com

## 已完成的工作

1. 前端已成功部署到 Vercel
2. 客户端已配置为连接外部 Socket.IO 服务器
3. 后端服务器代码已准备就绪 (`render-server.js`)

## 您需要完成的步骤

### 第一步：注册 Render 账号

1. 访问 https://render.com
2. 点击 "Get Started for Free"
3. 使用 GitHub 账号登录（推荐，因为代码已在 GitHub 上）

### 第二步：创建 Web Service

1. 登录 Render Dashboard 后，点击 "New +" 按钮
2. 选择 "Web Service"
3. 在 GitHub 仓库列表中找到并选择 `invoice-harvester`
4. 配置如下：

| 配置项 | 值 |
|--------|-----|
| Name | `invoice-harvester-server` |
| Region | 选择离您最近的区域（如 Singapore） |
| Branch | `main` |
| Root Directory | 留空（使用仓库根目录） |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node render-server.js` |
| Plan | Free |

5. 点击 "Create Web Service"

### 第三步：等待部署完成

- Render 会自动构建和部署
- 首次部署可能需要 2-5 分钟
- 部署完成后，您会获得一个类似 `https://invoice-harvester-server.onrender.com` 的 URL

### 第四步：验证部署

1. 访问 `https://invoice-harvester-server.onrender.com/health`
2. 如果看到 `{"status":"ok"}` 表示服务器运行正常

### 第五步：测试游戏

1. 打开前端地址：https://6a054f2412f6191505e79b9b.vercel.app
2. 输入昵称，点击"进入大厅"
3. 创建房间或加入房间
4. 邀请朋友一起游玩！

## 注意事项

1. **Render Free 计划限制**：
   - 15 分钟无活动后服务会进入休眠状态
   - 首次连接可能需要等待 30 秒唤醒服务
   - 每月 750 小时免费运行时间

2. **如果更改了 Render 域名**：
   - 需要修改 `invoice-harvester-online/client/js/game.js` 中的 `serverUrl`
   - 重新提交并推送到 GitHub
   - Vercel 会自动重新部署前端

3. **本地开发**：
   - 前端会自动连接 `localhost:3000`
   - 需要先运行 `node render-server.js` 启动本地服务器

## 文件说明

- `render-server.js` - Render 部署专用服务器（包含 CORS 配置）
- `package-render.json` - Render 部署依赖配置
- `vercel.json` - Vercel 前端路由配置
- `invoice-harvester-online/client/js/game.js` - 客户端（已配置服务器地址）
