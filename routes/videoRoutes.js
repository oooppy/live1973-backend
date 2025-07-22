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

// 获取视频列表（支持分页和排序）
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sort = req.query.sort || 'created_at';
    const order = req.query.order || 'DESC';
    const offset = (page - 1) * limit;

    // 验证排序字段
    const allowedSortFields = ['view_count', 'created_at', 'title', 'duration'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // 获取总数
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM videos WHERE status = ?',
      ['active']
    );
    const total = countResult[0].total;

    // 获取视频列表
    const [videos] = await pool.execute(
      `SELECT id, title, description, aliyun_video_id, video_url, thumbnail_url, 
              duration, view_count, like_count, status, created_at, updated_at 
       FROM videos 
       WHERE status = ? 
       ORDER BY ${sortField} ${sortOrder} 
       LIMIT ? OFFSET ?`,
      ['active', limit, offset]
    );

    // 计算分页信息
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        videos,
        pagination: {
          current_page: page,
          per_page: limit,
          total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('获取视频列表错误:', error);
    res.status(500).json({
      success: false,
      error: '获取视频列表失败',
      message: error.message
    });
  }
});

// 获取单个视频详情
router.get('/:id', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: '无效的视频ID'
      });
    }

    const [videos] = await pool.execute(
      `SELECT id, title, description, aliyun_video_id, video_url, thumbnail_url, 
              duration, file_size, resolution, view_count, like_count, status, 
              created_at, updated_at 
       FROM videos 
       WHERE id = ? AND status = ?`,
      [videoId, 'active']
    );

    if (videos.length === 0) {
      return res.status(404).json({
        success: false,
        error: '视频不存在'
      });
    }

    res.json({
      success: true,
      data: videos[0]
    });

  } catch (error) {
    console.error('获取视频详情错误:', error);
    res.status(500).json({
      success: false,
      error: '获取视频详情失败',
      message: error.message
    });
  }
});

// 记录播放次数
router.post('/:id/view', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const { device_type = 'unknown', duration_watched = 0 } = req.body;
    
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: '无效的视频ID'
      });
    }

    // 获取客户端IP
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.connection.remoteAddress || 
                    req.socket.remoteAddress ||
                    '127.0.0.1';

    // 获取User-Agent
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // 记录播放日志
      await connection.execute(
        `INSERT INTO view_logs (video_id, ip_address, user_agent, duration_watched, device_type) 
         VALUES (?, ?, ?, ?, ?)`,
        [videoId, clientIP.substring(0, 45), userAgent, duration_watched, device_type]
      );

      // 更新播放次数
      const [updateResult] = await connection.execute(
        'UPDATE videos SET view_count = view_count + 1 WHERE id = ?',
        [videoId]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: '视频不存在'
        });
      }

      // 获取更新后的播放次数
      const [videos] = await connection.execute(
        'SELECT view_count FROM videos WHERE id = ?',
        [videoId]
      );

      await connection.commit();

      res.json({
        success: true,
        message: '播放记录成功',
        data: {
          video_id: videoId,
          new_view_count: videos[0].view_count
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('记录播放错误:', error);
    res.status(500).json({
      success: false,
      error: '记录播放失败',
      message: error.message
    });
  }
});

// 搜索视频
router.get('/search/:keyword', async (req, res) => {
  try {
    const keyword = req.params.keyword;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '搜索关键词不能为空'
      });
    }

    const searchTerm = `%${keyword.trim()}%`;

    // 搜索视频（标题和描述）
    const [videos] = await pool.execute(
      `SELECT id, title, description, aliyun_video_id, video_url, thumbnail_url, 
              duration, view_count, like_count, status, created_at 
       FROM videos 
       WHERE status = 'active' 
       AND (title LIKE ? OR description LIKE ?) 
       ORDER BY view_count DESC 
       LIMIT ? OFFSET ?`,
      [searchTerm, searchTerm, limit, offset]
    );

    // 获取搜索结果总数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM videos 
       WHERE status = 'active' 
       AND (title LIKE ? OR description LIKE ?)`,
      [searchTerm, searchTerm]
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        videos,
        keyword,
        pagination: {
          current_page: page,
          per_page: limit,
          total,
          total_pages: totalPages
        }
      }
    });

  } catch (error) {
    console.error('搜索视频错误:', error);
    res.status(500).json({
      success: false,
      error: '搜索失败',
      message: error.message
    });
  }
});

module.exports = router;