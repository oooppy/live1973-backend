# Live1973 生产环境问题修复指南

## 🚨 当前问题

1. **无法加载缩略图和视频** - 静态资源访问问题
2. **视频链接跳转错误** - 跳转到 `/video/8` 而不是VOD链接

## 🔍 问题分析

### 问题1：缩略图和视频无法加载
**可能原因：**
- CDN配置问题
- 静态资源路径错误
- HTTPS/HTTP协议不匹配
- 阿里云VOD服务连接问题

### 问题2：视频链接跳转错误
**当前行为：** 点击视频 → 跳转到 `/video/8`
**期望行为：** 点击视频 → 跳转到 `/video/8` → 自动获取VOD播放地址

## 🛠️ 解决方案

### 1. 检查环境变量配置

创建 `.env.production` 文件：
```bash
# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=live1973_db
DB_PORT=3306

# 阿里云VOD配置
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_REGION=cn-shanghai

# CDN配置
CDN_ENABLED=true
CDN_DOMAIN=vod.live1973.cn
CDN_AUTH_ENABLED=false
PREFER_CDN_OVER_VOD=false

# 服务器配置
NODE_ENV=production
PORT=3000
```

### 2. 修复CDN配置问题

**问题：** CDN使用HTTP协议，生产环境需要HTTPS
**解决：** 已修复 `services/cdnUrl.js` 中的协议选择逻辑

### 3. 检查静态资源服务

确保以下路径可访问：
- `/videos/` - 本地视频文件
- `/` - React前端文件
- `/api/videos` - 视频列表API
- `/api/videos/:id/play` - 视频播放API

### 4. 测试VOD连接

```bash
# 测试VOD服务
curl https://live1973.cn/api/vod/test

# 测试视频列表
curl https://live1973.cn/api/videos

# 测试视频播放
curl https://live1973.cn/api/videos/8/play
```

## 🔧 具体修复步骤

### 步骤1：检查服务器日志
```bash
# 查看服务器日志
tail -f /var/log/live1973/server.log

# 查看错误日志
grep -i error /var/log/live1973/server.log
```

### 步骤2：验证环境变量
```bash
# 检查环境变量
node -e "console.log(process.env.ALIYUN_ACCESS_KEY_ID)"
node -e "console.log(process.env.CDN_ENABLED)"
```

### 步骤3：测试API接口
```bash
# 测试健康检查
curl https://live1973.cn/api/health

# 测试VOD连接
curl https://live1973.cn/api/vod/test

# 测试视频列表
curl https://live1973.cn/api/videos | jq '.[0]'
```

### 步骤4：检查数据库连接
```bash
# 连接数据库检查视频数据
mysql -u root -p live1973_db -e "SELECT id, title, aliyun_video_id, thumbnail_url FROM videos LIMIT 5;"
```

## 🚀 快速修复命令

### 重启服务
```bash
# 重启Node.js服务
pm2 restart live1973

# 或使用systemd
sudo systemctl restart live1973
```

### 清除缓存
```bash
# 清除CDN缓存（如果使用CDN）
# 在阿里云CDN控制台清除缓存

# 清除浏览器缓存
# 强制刷新页面 (Ctrl+F5)
```

### 重新构建前端
```bash
cd live1973-react
npm run build
cp -r build/* ../live1973-backend/react-build/
```

## 🔍 调试工具

### 1. 服务器健康检查
访问：https://live1973.cn/api/health

### 2. VOD连接测试
访问：https://live1973.cn/api/vod/test

### 3. CDN预览测试
访问：https://live1973.cn/api/cdn/preview?path=/test.jpg

### 4. 视频播放测试
访问：https://live1973.cn/api/videos/8/play

## 📊 预期结果

### 修复后应该看到：
1. **缩略图正常显示** - 视频卡片显示缩略图
2. **视频正常播放** - 点击视频可以正常播放
3. **API正常响应** - 所有API接口返回正确数据
4. **VOD服务正常** - 阿里云VOD连接成功

### 日志应该显示：
```
✅ 数据库连接成功
✅ VOD SDK连接成功
✅ 成功获取播放URL
✅ 使用CDN播放URL
```

## 🆘 故障排除

### 如果缩略图仍然无法加载：
1. 检查 `thumbnail_url` 字段是否有值
2. 检查CDN域名是否正确
3. 检查图片URL是否可访问
4. 检查HTTPS证书是否有效

### 如果视频仍然无法播放：
1. 检查 `aliyun_video_id` 字段是否有值
2. 检查VOD服务是否正常
3. 检查播放URL是否有效
4. 检查浏览器控制台错误

### 如果API返回错误：
1. 检查环境变量配置
2. 检查数据库连接
3. 检查VOD服务配置
4. 查看服务器错误日志

## 📞 联系支持

如果问题仍然存在，请提供：
1. 服务器错误日志
2. API测试结果
3. 环境变量配置（隐藏敏感信息）
4. 浏览器控制台错误信息
