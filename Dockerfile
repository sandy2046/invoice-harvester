FROM node:18-alpine

# 工作目录
WORKDIR /app

# 复制前端文件
COPY index.html /app/public/index.html

# 复制后端代码（如果有）
# COPY server/ /app/server/

# 安装后端依赖（如果有）
# RUN cd /app/server && npm install --production

# 暴露端口
EXPOSE 3000 80

# 启动命令（根据实际后端调整）
# CMD ["node", "/app/server/index.js"]

# 纯静态文件部署方案（使用nginx）
RUN apk add --no-cache nginx

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY index.html /var/www/invoice-harvester/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
