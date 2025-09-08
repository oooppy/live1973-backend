# 本地测试配置指南

## 🎯 目标
在本地测试生产环境的行为，包括CDN认证功能。

## 📋 需要配置的环境变量

### 1. 创建 `.env` 文件
在 `live1973-backend` 目录下创建 `.env` 文件：

```bash
# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=live1973_db
DB_PORT=3306

# 阿里云VOD配置
ALIYUN_ACCESS_KEY_ID=your_access_key_id_here
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret_here
ALIYUN_REGION=cn-shanghai

# CDN配置 - 与生产环境保持一致
CDN_ENABLED=true
CDN_DOMAIN=vod.live1973.cn
CDN_AUTH_ENABLED=true
CDN_AUTH_KEY_PRIMARY=your_cdn_auth_key_primary_here
CDN_AUTH_KEY_BACKUP=your_cdn_auth_key_backup_here
CDN_EXPIRE_SECONDS=1800

# 服务器配置
NODE_ENV=development
PORT=3000

# 其他配置
PREFER_CDN_OVER_VOD=false
ENABLE_DIRECT_HTTPS=false
```

## 🔑 关键配置说明

### CDN认证密钥
- **CDN_AUTH_KEY_PRIMARY**: 生产环境的主密钥
- **CDN_AUTH_KEY_BACKUP**: 生产环境的备用密钥
- **CDN_DOMAIN**: CDN域名，与生产环境一致

### 测试模式配置
- **NODE_ENV=development**: 本地开发模式
- **CDN_ENABLED=true**: 启用CDN功能
- **CDN_AUTH_ENABLED=true**: 启用CDN认证

## 🧪 测试步骤

### 1. 启动本地服务
```bash
cd live1973-backend
node server.js
```

### 2. 测试CDN功能
```bash
# 测试CDN预览
curl "http://localhost:3000/api/cdn/preview?path=/test.jpg"

# 测试视频列表（应该使用CDN）
curl "http://localhost:3000/api/videos"

# 测试视频播放（应该使用CDN）
curl "http://localhost:3000/api/videos/8/play"
```

### 3. 检查日志输出
查看控制台输出，应该看到：
```
[ENV] CDN_ENABLED = true
[ENV] CDN_AUTH_ENABLED = true
[ENV] CDN_DOMAIN = vod.live1973.cn
✅ 使用CDN播放URL: https://vod.live1973.cn/...
```

## 🔍 验证CDN是否工作

### 1. 检查URL格式
CDN URL应该包含认证参数：
```
https://vod.live1973.cn/path/to/video.mp4?auth_key=timestamp-rand-uid-signature
```

### 2. 检查响应头
CDN响应应该包含：
- `X-Cache: HIT` 或 `X-Cache: MISS`
- `Server: Tengine` 或类似CDN服务器标识

### 3. 测试URL有效性
```bash
# 测试CDN URL是否可访问
curl -I "https://vod.live1973.cn/path/to/video.mp4?auth_key=..."
```

## 🚨 常见问题

### 问题1：CDN认证失败
**症状**: URL返回403或401错误
**解决**: 检查CDN_AUTH_KEY_PRIMARY是否正确

### 问题2：CDN域名无法访问
**症状**: 连接超时或DNS解析失败
**解决**: 检查CDN_DOMAIN是否正确

### 问题3：本地无法访问HTTPS
**症状**: SSL证书错误
**解决**: 使用HTTP协议测试，或配置本地SSL证书

## 📊 测试对比

### 启用CDN前
```
播放URL: https://vod.cn-shanghai.aliyuncs.com/...
缩略图: https://vod.cn-shanghai.aliyuncs.com/...
```

### 启用CDN后
```
播放URL: https://vod.live1973.cn/...?auth_key=...
缩略图: https://vod.live1973.cn/...?auth_key=...
```

## 🎉 成功标志

如果配置正确，您应该看到：
1. ✅ CDN URL生成成功
2. ✅ 认证参数正确添加
3. ✅ 视频和缩略图正常加载
4. ✅ 控制台显示CDN相关日志

## 📞 需要帮助

如果遇到问题，请提供：
1. `.env` 文件内容（隐藏敏感信息）
2. 控制台日志输出
3. API测试结果
4. 具体的错误信息
