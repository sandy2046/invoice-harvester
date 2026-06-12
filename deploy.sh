#!/bin/bash
# ============================================
# 发票收割机 - 自动部署脚本
# 适用于 Ubuntu/Debian 系统
# ============================================

set -e

# 配置变量
APP_NAME="invoice-harvester"
DEPLOY_DIR="/var/www/${APP_NAME}"
NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}"
DOMAIN=${1:-"your-domain.com"}

echo "========================================="
echo "  发票收割机 - 部署脚本"
echo "========================================="

# 1. 检查并安装依赖
echo "[1/6] 检查系统依赖..."
apt-get update -qq
apt-get install -y -qq nginx curl > /dev/null 2>&1
echo "  ✓ Nginx 已安装"

# 检查 Docker（可选）
if command -v docker &> /dev/null; then
    echo "  ✓ Docker 已安装"
    DOCKER_AVAILABLE=true
else
    echo "  ⚠ Docker 未安装（可选，跳过）"
    DOCKER_AVAILABLE=false
fi

# 2. 创建部署目录
echo "[2/6] 创建部署目录..."
mkdir -p ${DEPLOY_DIR}
echo "  ✓ 目录 ${DEPLOY_DIR} 已创建"

# 3. 复制文件
echo "[3/6] 复制项目文件..."
cp index.html ${DEPLOY_DIR}/index.html
echo "  ✓ 游戏文件已复制"

# 4. 配置 Nginx
echo "[4/6] 配置 Nginx..."
sed "s/your-domain.com/${DOMAIN}/g" nginx.conf > ${NGINX_CONF}
ln -sf ${NGINX_CONF} /etc/nginx/sites-enabled/${APP_NAME}

# 移除默认配置（如果存在）
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
fi

# 测试 Nginx 配置
nginx -t > /dev/null 2>&1
echo "  ✓ Nginx 配置已生效"

# 5. 重启 Nginx
echo "[5/6] 重启 Nginx..."
systemctl restart nginx
systemctl enable nginx > /dev/null 2>&1
echo "  ✓ Nginx 已启动"

# 6. 完成
echo "[6/6] 部署完成！"
echo ""
echo "========================================="
echo "  部署信息"
echo "========================================="
echo "  访问地址: http://${DOMAIN}"
echo "  部署目录: ${DEPLOY_DIR}"
echo "  Nginx配置: ${NGINX_CONF}"
echo ""
echo "  后续步骤："
echo "  1. 配置域名DNS解析到本服务器IP"
echo "  2. 启动后端API服务器（如需多人功能）"
echo "  3. 配置HTTPS（推荐）：使用 certbot --nginx"
echo "========================================="
