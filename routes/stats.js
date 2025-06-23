const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// 获取总体统计数据
router.get('/overview', async (req, res) => {
  try {
    // 获取视频总数
    const [videoCountResult] = await query(
      'SELECT COUNT(*) as total_videos FROM videos WHERE status = ?',
      ['active']
    );

    // 获取总播放量
    const [totalViewsResult] = await query(
      'SELECT SUM(view_count) as total_views FROM videos WHERE status = ?',
      ['active']
    );

    // 获取今日播放量
    const [todayViewsResult] = await query(
      'SELECT COUNT(*) as today_views FROM view_logs WHERE DATE(view_time) = CURDATE()'
    );

    // 获取本周播放量
    const [weekViewsResult] = await query(
      'SELECT COUNT(*) as week_views FROM view_logs WHERE view_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );

    // 获取总时长
    const [totalDurationResult] = await query(
      'SELECT SUM(duration) as total_duration FROM videos WHERE status = ?',
      ['active']
    );

    res.json({
      success: true,
      data: {
        total_videos: videoCountResult.total_videos || 0,
        total_views: totalViewsResult.total_views || 0,
        today_views: todayViewsResult.today_views || 0,
        week_views: weekViewsResult.week_views || 0,
        total_duration: formatDuration(totalDurationResult.total_duration || 0),
        average_views_per_video: Math.round((totalViewsResult.total_views || 0) / (videoCountResult.total_videos || 1))
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

// 获取热门视频排行榜
router.get('/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const videos = await query(
      `SELECT 
        id, title, view_count, like_count,
        DATE_FORMAT(created_at, '%Y-%m-%d') as created_at
      FROM videos 
      WHERE status = 'active'
      ORDER BY view_count DESC
      LIMIT ?`,
      [parseInt(limit)]
    );

    const formattedVideos = videos.map((video, index) => ({
      rank: index + 1,
      id: video.id,
      title: video.title,
      views: formatViewCount(video.view_count),
      viewCount: video.view_count,
      likes: video.like_count,
      createdAt: video.created_at
    }));

    res.json({
      success: true,
      data: formattedVideos
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

// 获取播放趋势数据（最近30天）
router.get('/trends', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const trends = await query(
      `SELECT 
        DATE(view_time) as date,
        COUNT(*) as views
      FROM view_logs 
      WHERE view_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(view_time)
      ORDER BY date ASC`,
      [parseInt(days)]
    );

    // 填充缺失的日期
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const trendData = trends.find(t => t.date === dateStr);
      result.push({
        date: dateStr,
        views: trendData ? trendData.views : 0
      });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('获取播放趋势错误:', error);
    res.status(500).json({
      success: false,
      error: '获取播放趋势失败',
      message: error.message
    });
  }
});

// 获取设备类型统计
router.get('/devices', async (req, res) => {
  try {
    const devices = await query(
      `SELECT 
        device_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM view_logs), 2) as percentage
      FROM view_logs 
      WHERE view_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY device_type
      ORDER BY count DESC`
    );

    res.json({
      success: true,
      data: devices
    });

  } catch (error) {
    console.error('获取设备统计错误:', error);
    res.status(500).json({
      success: false,
      error: '获取设备统计失败',
      message: error.message
    });
  }
});

// 获取观看时长分析
router.get('/watch-duration', async (req, res) => {
  try {
    const durations = await query(
      `SELECT 
        v.title,
        v.duration as video_duration,
        AVG(vl.duration_watched) as avg_watched,
        COUNT(vl.id) as total_views,
        ROUND(AVG(vl.duration_watched) * 100.0 / v.duration, 2) as completion_rate
      FROM videos v
      LEFT JOIN view_logs vl ON v.id = vl.video_id
      WHERE v.status = 'active' AND vl.view_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY v.id, v.title, v.duration
      HAVING total_views > 0
      ORDER BY completion_rate DESC
      LIMIT 20`
    );

    const formattedDurations = durations.map(item => ({
      title: item.title,
      videoDuration: formatDuration(item.video_duration),
      avgWatched: formatDuration(Math.round(item.avg_watched)),
      totalViews: item.total_views,
      completionRate: item.completion_rate || 0
    }));

    res.json({
      success: true,
      data: formattedDurations
    });

  } catch (error) {
    console.error('获取观看时长分析错误:', error);
    res.status(500).json({
      success: false,
      error: '获取观看时长分析失败',
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

module.exports = router;