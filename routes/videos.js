const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// 获取视频列表（按播放量排序）
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, sort = 'view_count' } = req.query;
    const offset = (page - 1) * limit;
    
    // 构建排序条件
    let orderBy = 'view_count DESC'; // 默认按播放量降序
    if (sort === 'latest') {
      orderBy = 'created_at DESC';
    } else if (sort === 'duration') {
      orderBy = 'duration DESC';
    }

    // 获取视频列表
    const videos = await query(
      `SELECT 
        id,
        title,
        description,
        video_url,
        thumbnail_url,
        duration,
        view_count,
        like_count,
        resolution,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM videos 
      WHERE status = 'active'
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const [countResult] = await query(
      'SELECT COUNT(*) as total FROM videos WHERE status = ?',
      ['active']
    );

    // 格式化返回数据
    const formattedVideos = videos.map(video => ({
      id: video.id,
      title: video.title,
      description: video.description,
      videoUrl: video.video_url,
      thumbnail: video.thumbnail_url,
      duration: formatDuration(video.duration),
      views: formatViewCount(video.view_count),
      viewCount: video.view_count, // 原始数字，用于排序
      likes: video.like_count,
      resolution: video.resolution,
      createdAt: video.created_at,
      isRealVideo: true
    }));

    res.json({
      success: true,
      data: {
        videos: formattedVideos,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: countResult.total,
          total_pages: Math.ceil(countResult.total / limit)
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
    const { id } = req.params;

    const videos = await query(
      `SELECT 
        id,
        title,
        description,
        video_url,
        thumbnail_url,
        duration,
        view_count,
        like_count,
        resolution,
        file_size,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM videos 
      WHERE id = ? AND status = 'active'`,
      [id]
    );

    if (videos.length === 0) {
      return res.status(404).json({
        success: false,
        error: '视频不存在'
      });
    }

    const video = videos[0];
    const formattedVideo = {
      id: video.id,
      title: video.title,
      description: video.description,
      videoUrl: video.video_url,
      thumbnail: video.thumbnail_url,
      duration: formatDuration(video.duration),
      views: formatViewCount(video.view_count),
      viewCount: video.view_count,
      likes: video.like_count,
      resolution: video.resolution,
      fileSize: formatFileSize(video.file_size),
      createdAt: video.created_at,
      isRealVideo: true
    };

    res.json({
      success: true,
      data: formattedVideo
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

// 记录视频播放
router.post('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration_watched = 0, device_type = 'mobile' } = req.body;
    const ip_address = req.ip || req.connection.remoteAddress;
    const user_agent = req.get('User-Agent');

    // 检查视频是否存在
    const videos = await query('SELECT id FROM videos WHERE id = ? AND status = ?', [id, 'active']);
    
    if (videos.length === 0) {
      return res.status(404).json({
        success: false,
        error: '视频不存在'
      });
    }

    // 记录播放日志
    await query(
      `INSERT INTO view_logs (video_id, ip_address, user_agent, duration_watched, device_type) 
       VALUES (?, ?, ?, ?, ?)`,
      [id, ip_address, user_agent, duration_watched, device_type]
    );

    // 更新播放次数
    await query(
      'UPDATE videos SET view_count = view_count + 1 WHERE id = ?',
      [id]
    );

    // 获取更新后的播放次数
    const [result] = await query('SELECT view_count FROM videos WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '播放记录成功',
      data: {
        video_id: parseInt(id),
        new_view_count: result.view_count
      }
    });

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
    const { keyword } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const videos = await query(
      `SELECT 
        id, title, description, video_url, thumbnail_url, 
        duration, view_count, like_count, resolution,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM videos 
      WHERE status = 'active' 
        AND (title LIKE ? OR description LIKE ?)
      ORDER BY view_count DESC
      LIMIT ? OFFSET ?`,
      [`%${keyword}%`, `%${keyword}%`, parseInt(limit), parseInt(offset)]
    );

    const formattedVideos = videos.map(video => ({
      id: video.id,
      title: video.title,
      description: video.description,
      videoUrl: video.video_url,
      thumbnail: video.thumbnail_url,
      duration: formatDuration(video.duration),
      views: formatViewCount(video.view_count),
      viewCount: video.view_count,
      likes: video.like_count,
      resolution: video.resolution,
      createdAt: video.created_at,
      isRealVideo: true
    }));

    res.json({
      success: true,
      data: {
        videos: formattedVideos,
        keyword: keyword,
        count: videos.length
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

// 辅助函数：格式化时长
function formatDuration(seconds) {
  if (!seconds) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 辅助函数：格式化播放量
function formatViewCount(count) {
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + '万';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k';
  }
  return count.toString();
}

// 辅助函数：格式化文件大小
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

module.exports = router;