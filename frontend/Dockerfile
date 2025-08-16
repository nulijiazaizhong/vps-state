# --- Build Stage ---
# 使用 Node.js 18 Alpine 作为构建环境
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package.json package-lock.json ./

# 安装所有依赖 (包括开发依赖)
RUN npm install

# 复制所有源代码
COPY . .

# 构建 Next.js 应用
RUN npm run build

# --- Production Stage ---
# 使用同样版本的 Node.js Alpine 作为生产环境
FROM node:18-alpine AS runner

# 设置工作目录
WORKDIR /app

# 从 builder 阶段复制必要的依赖配置文件
COPY --from=builder /app/package.json /app/package-lock.json ./

# 只安装生产环境所需的依赖
RUN npm install --production

# 从 builder 阶段复制构建好的应用
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# 暴露端口
EXPOSE 3000

# 容器启动时运行的命令
CMD ["npm", "start"]
