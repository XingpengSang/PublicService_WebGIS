# 1. 使用轻量级 Python 基础镜像
FROM python:3.11-slim

# 2. 设置工作目录
WORKDIR /app

# 3. 复制依赖清单并安装 (利用 Docker 缓存机制加速)
COPY backend/requirements.txt .
# 使用清华源加速安装
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 4. 复制项目所有代码
COPY . .

# 5. 暴露端口 (Flask 默认 5000)
EXPOSE 5000

# 6. 启动命令 (使用 Gunicorn 启动，而不是 python app.py)
# -w 1: 只用1个进程，省内存
# --timeout 120: 允许启动加载耗时达 120秒
# -b: 绑定地址
# backend.app:app : 指向 backend/app.py 里的 app 对象
CMD ["gunicorn", "-w", "1", "--timeout", "120", "-b", "0.0.0.0:5000", "backend.app:app"]