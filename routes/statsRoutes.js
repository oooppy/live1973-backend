const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const router = express.Router();

// 创建数据库连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'live1973_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 获取热门视频
router.get('/popular', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const [videos] = await pool.execute(
      `SELECT id, title, thumbnail_url, view_count, duration 
       FROM videos 
       WHERE status = 'active' 
       ORDER BY view_count DESC 
       LIMIT ?`,
      [limit]
    );

    res.json({
      success: true,
      data: videos
    });

  } catch (error) {
    console.error('获取热门视频错误:', error);
    res.status(500).json({
      success: false,
      error: '获取热门视频失败',
      message: error.message
    });
  }
});

// 获取统计数据
router.get('/overview', async (req, res) => {
  try {
    // 总视频数
    const [videoCount] = await pool.execute(
      'SELECT COUNT(*) as total FROM videos WHERE status = ?',
      ['active']
    );

    // 总播放量
    const [totalViews] = await pool.execute(
      'SELECT SUM(view_count) as total FROM videos WHERE status = ?',
      ['active']
    );

    // 今日播放量
    const [todayViews] = await pool.execute(
      `SELECT COUNT(*) as total FROM view_logs 
       WHERE DATE(view_time) = CURDATE()`
    );

    // 最受欢迎的视频
    const [popularVideo] = await pool.execute(
      `SELECT title, view_count FROM videos 
       WHERE status = 'active' 
       ORDER BY view_count DESC 
       LIMIT 1`
    );

    res.json({
      success: true,
      data: {
        total_videos: videoCount[0].total,
        total_views: totalViews[0].total || 0,
        today_views: todayViews[0].total,
        most_popular: popularVideo[0] || null
      }
    });

  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({
      success: false,
      error: '获取统计数据失败',
      message: error.message
    });
  }
});

// 获取最近播放记录
router.get('/recent-views', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const [records] = await pool.execute(
      `SELECT vl.*, v.title, v.thumbnail_url 
       FROM view_logs vl 
       JOIN videos v ON vl.video_id = v.id 
       ORDER BY vl.view_time DESC 
       LIMIT ?`,
      [limit]
    );

    res.json({
      success: true,
      data: records
    });

  } catch (error) {
    console.error('获取播放记录错误:', error);
    res.status(500).json({
      success: false,
      error: '获取播放记录失败',
      message: error.message
    });
  }
});

module.exports = router;