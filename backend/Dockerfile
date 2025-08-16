# 使用官方 Python 镜像作为基础镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件到工作目录
COPY requirements.txt .

# 安装依赖
# --no-cache-dir: 不存储缓存，减小镜像体积
# --trusted-host pypi.python.org: 解决在国内服务器可能遇到的网络问题
RUN pip install --no-cache-dir --trusted-host pypi.python.org -r requirements.txt

# 复制应用代码到工作目录
COPY main.py .

# 暴露端口，以便容器外部可以访问
EXPOSE 8000

# 容器启动时运行的命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
