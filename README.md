# Live1973 后端API系统

## 🚀 快速开始

### 1. 安装Node.js
- 下载：https://nodejs.org/
- 选择LTS版本（推荐18.x或20.x）
- 验证安装：
```cmd
node --version
npm --version
```

### 2. 安装MySQL
- 下载：https://dev.mysql.com/downloads/mysql/
- 或使用XAMPP：https://www.apachefriends.org/
- 记住root密码

### 3. 项目安装

#### 创建项目目录
```cmd
mkdir live1973-backend
cd live1973-backend
```

#### 创建文件结构
```
live1973-backend/
├── package.json
├── .env
├── server.js
├── config/
│   └── database.js
├── routes/
│   ├── videos.js
│   └── stats.js
└── scripts/
    └── initDatabase.js
```

#### 复制所有代码文件
1. 复制`package.json`内容
2. 创建`.env`文件（复制`.env.example`并修改）
3. 复制所有其他代码文件

#### 安装依赖
```cmd
npm install
```

### 4. 配置环境变量

创建`.env`文件：
```bash
# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=你的MySQL密码
DB_NAME=live1973_db
DB_PORT=3306

# 安全配置
JWT_SECRET=your_jwt_secret_key_here
API_KEY=your_api_key
```

### 5. 初始化数据库
```cmd
npm run init-db
```

### 6. 启动服务器

#### 开发模式（推荐）
```cmd
npm run dev
```

#### 生产模式
```cmd
npm start
```

## 📡 API接口文档

### 基础信息
- **服务地址：** http://localhost:3000
- **API前缀：** /api

### 视频接口

#### 获取视频列表
```
GET /api/videos
参数：
- page: 页码（默认1）
- limit: 每页数量（默认20）
- sort: 排序方式（view_count/latest/duration）

返回：按播放量排序的视频列表
```

#### 获取视频详情
```
GET /api/videos/:id
返回：指定视频的详细信息
```

#### 记录播放
```
POST /api/videos/:id/view
Body: {
  "duration_watched": 120,
  "device_type": "mobile"
}
返回：播放记录成功，更新播放次数
```

#### 搜索视频
```
GET /api/videos/search/:keyword
参数：
- page, limit（同上）
返回：匹配关键词的视频列表
```

### 统计接口

#### 总体统计
```
GET /api/stats/overview
返回：总视频数、总播放量、今日播放量等
```

#### 热门视频排行
```
GET /api/stats/popular?limit=10
返回：播放量前N的视频列表
```

#### 播放趋势
```
GET /api/stats/trends?days=30
返回：最近N天的播放趋势数据
```

#### 设备统计
```
GET /api/stats/devices
返回：不同设备类型的使用统计
```

## 🗄️ 数据库结构

### videos表（视频信息）
- id: 主键
- title: 视频标题
- description: 描述
- aliyun_video_id: 阿里云视频ID
- video_url: 播放地址
- thumbnail_url: 缩略图地址
- duration: 时长（秒）
- view_count: 播放次数
- status: 状态
- created_at: 创建时间

### view_logs表（播放记录）
- id: 主键
- video_id: 视频ID
- ip_address: IP地址
- user_agent: 用户代理
- view_time: 播放时间
- duration_watched: 观看时长
- device_type: 设备类型

## 🔧 常用命令

```cmd
# 安装依赖
npm install

# 开发模式启动
npm run dev

# 生产模式启动
npm start

# 初始化数据库
npm run init-db

# 检查健康状态
curl http://localhost:3000/api/health
```

## 🛠️ 故障排除

### 数据库连接失败
1. 检查MySQL是否启动
2. 验证.env中的数据库配置
3. 确认数据库用户权限

### 端口占用
```cmd
# Windows查看端口
netstat -ano | findstr :3000

# 杀死进程
taskkill /PID <进程ID> /F
```

### 安装依赖失败
```cmd
# 清理缓存
npm cache clean --force

# 重新安装
rm -rf node_modules
npm install
```

## 📈 部署到阿里云ECS

### 1. 服务器环境准备
```bash
# 更新系统
sudo apt update

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装MySQL
sudo apt install mysql-server
```

### 2. 上传代码
```bash
# 使用git
git clone your-repo
cd live1973-backend

# 或使用scp上传文件
```

### 3. 配置生产环境
```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name "live1973-api"

# 设置开机自启
pm2 startup
pm2 save
```

### 4. 配置Nginx反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔒 安全建议

1. **修改默认密码**：更改数据库root密码
2. **使用强密钥**：设置复杂的JWT_SECRET
3. **启用HTTPS**：配置SSL证书
4. **防火墙设置**：只开放必要端口
5. **定期备份**：备份数据库和代码

## 📞 技术支持

如有问题，请检查：
1. Node.js和MySQL版本
2. 端口是否被占用
3. 环境变量配置
4. 数据库连接状态

成功启动后访问：http://localhost:3000