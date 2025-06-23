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

// 添加新视频
router.post('/videos', async (req, res) => {
  try {
    const {
      title,
      description,
      aliyun_video_id,
      video_url,
      thumbnail_url,
      duration,
      file_size,
      resolution
    } = req.body;

    // 验证必填字段
    if (!title || !aliyun_video_id || !video_url) {
      return res.status(400).json({
        success: false,
        error: '标题、阿里云视频ID和视频地址为必填项'
      });
    }

    // 检查是否已存在
    const [existing] = await pool.execute(
      'SELECT id FROM videos WHERE aliyun_video_id = ?',
      [aliyun_video_id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: '该阿里云视频ID已存在'
      });
    }

    // 插入新视频
    const [result] = await pool.execute(
      `INSERT INTO videos (
        title, description, aliyun_video_id, video_url, thumbnail_url, 
        duration, file_size, resolution, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description || '',
        aliyun_video_id,
        video_url,
        thumbnail_url || '',
        duration || 0,
        file_size || 0,
        resolution || '',
        'active'
      ]
    );

    // 获取插入的视频信息
    const [newVideo] = await pool.execute(
      'SELECT * FROM videos WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: '视频添加成功',
      data: newVideo[0]
    });

  } catch (error) {
    console.error('添加视频错误:', error);
    res.status(500).json({
      success: false,
      error: '添加视频失败',
      message: error.message
    });
  }
});

// 更新视频信息
router.put('/videos/:id', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const {
      title,
      description,
      video_url,
      thumbnail_url,
      duration,
      file_size,
      resolution,
      status
    } = req.body;

    const [result] = await pool.execute(
      `UPDATE videos SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        video_url = COALESCE(?, video_url),
        thumbnail_url = COALESCE(?, thumbnail_url),
        duration = COALESCE(?, duration),
        file_size = COALESCE(?, file_size),
        resolution = COALESCE(?, resolution),
        status = COALESCE(?, status),
        updated_at = NOW()
      WHERE id = ?`,
      [title, description, video_url, thumbnail_url, duration, file_size, resolution, status, videoId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: '视频不存在'
      });
    }

    // 获取更新后的视频信息
    const [updatedVideo] = await pool.execute(
      'SELECT * FROM videos WHERE id = ?',
      [videoId]
    );

    res.json({
      success: true,
      message: '视频更新成功',
      data: updatedVideo[0]
    });

  } catch (error) {
    console.error('更新视频错误:', error);
    res.status(500).json({
      success: false,
      error: '更新视频失败',
      message: error.message
    });
  }
});

// 删除视频（软删除）
router.delete('/videos/:id', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);

    const [result] = await pool.execute(
      'UPDATE videos SET status = ?, updated_at = NOW() WHERE id = ?',
      ['deleted', videoId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: '视频不存在'
      });
    }

    res.json({
      success: true,
      message: '视频删除成功'
    });

  } catch (error) {
    console.error('删除视频错误:', error);
    res.status(500).json({
      success: false,
      error: '删除视频失败',
      message: error.message
    });
  }
});

// 获取所有视频（包括已删除的）
router.get('/videos', async (req, res) => {
  try {
    const [videos] = await pool.execute(
      `SELECT * FROM videos ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: videos
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

module.exports = router;