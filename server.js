require('./config/validateEnv')(); // 验证环境变量
const config = require('./config/config');

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 添加静态文件服务 - 用于本地视频测试
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// 数据库连接配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'live1973_db',
  port: process.env.DB_PORT || 3306
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Live1973 API is running',
    timestamp: new Date().toISOString()
  });
});

// 获取所有视频
app.get('/api/videos', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM videos WHERE status = ? ORDER BY created_at DESC',
      ['active']
    );
    res.json(rows);
  } catch (error) {
    console.error('获取视频列表失败:', error);
    res.status(500).json({ error: '获取视频列表失败' });
  }
});

// 获取单个视频
app.get('/api/videos/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM videos WHERE id = ? AND status = ?',
      [req.params.id, 'active']
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '视频不存在' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('获取视频详情失败:', error);
    res.status(500).json({ error: '获取视频详情失败' });
  }
});

// 添加视频
app.post('/api/videos', async (req, res) => {
  try {
    const {
      title,
      videoUrl,
      thumbnail_url = '',
      duration = '0:00',
      view_count = 0,
      status = 'active',
      description = ''
    } = req.body;

    // 验证必需字段
    if (!title || !videoUrl) {
      return res.status(400).json({ 
        error: '标题和视频URL是必需的' 
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO videos (title, video_url, thumbnail_url, duration, view_count, status, description, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, videoUrl, thumbnail_url, duration, view_count, status, description]
    );

    // 返回创建的视频信息
    const [newVideo] = await pool.execute(
      'SELECT * FROM videos WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(newVideo[0]);
  } catch (error) {
    console.error('添加视频失败:', error);
    res.status(500).json({ error: '添加视频失败' });
  }
});

// 更新视频播放次数
app.patch('/api/videos/:id/views', async (req, res) => {
  try {
    await pool.execute(
      'UPDATE videos SET view_count = view_count + 1, updated_at = NOW() WHERE id = ?',
      [req.params.id]
    );
    
    res.json({ message: '播放次数已更新' });
  } catch (error) {
    console.error('更新播放次数失败:', error);
    res.status(500).json({ error: '更新播放次数失败' });
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Live1973 API 服务器运行在端口 ${PORT}`);
  console.log(`📱 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`🎬 视频接口: http://localhost:${PORT}/api/videos`);
  console.log(`📁 本地视频: http://localhost:${PORT}/videos/`);
});