#!/bin/bash

# Live1973 VOD自动同步脚本
# 每天自动同步阿里云VOD视频数据到MySQL数据库

# 设置日志文件（放在项目目录下，避免权限问题）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/sync-vod.log"
SYNC_URL="http://localhost:3000/api/videos/sync-vod"

# 如果日志文件不存在，创建它
if [ ! -f "$LOG_FILE" ]; then
    touch "$LOG_FILE"
fi

# 记录开始时间
echo "==========================================" >> $LOG_FILE
echo "开始VOD同步 - $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE

# 检查后端服务是否运行
echo "🔍 检查后端服务状态..." >> $LOG_FILE
HEALTH_CHECK=$(curl -s http://localhost:3000/api/health)
if [ $? -ne 0 ]; then
    echo "❌ 后端服务未运行 - $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
    echo "请先启动后端服务: node server.js" >> $LOG_FILE
    exit 1
else
    echo "✅ 后端服务运行正常" >> $LOG_FILE
fi

# 执行同步
echo "🔄 开始执行VOD同步..." >> $LOG_FILE
RESPONSE=$(curl -s -X POST $SYNC_URL)
CURL_EXIT_CODE=$?

# 检查同步结果
if [ $CURL_EXIT_CODE -eq 0 ]; then
    # 检查响应内容是否包含成功信息
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo "✅ 同步成功 - $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
        echo "响应: $RESPONSE" >> $LOG_FILE
    else
        echo "⚠️  同步响应异常 - $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
        echo "响应: $RESPONSE" >> $LOG_FILE
    fi
else
    echo "❌ 同步失败 - $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
    echo "curl错误代码: $CURL_EXIT_CODE" >> $LOG_FILE
    echo "响应: $RESPONSE" >> $LOG_FILE
fi

echo "==========================================" >> $LOG_FILE
echo "" >> $LOG_FILE 