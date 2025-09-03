const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const vodService = require('./services/aliyunVod');
const https = require('https');
const http = require('http');
const fs = require('fs');
require('dotenv').config();

// URL缓存机制
const urlCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

// 缓存管理函数
function getCachedUrl(key) {
  const cached = urlCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.url;
  }
  return null;
}

function setCachedUrl(key, url) {
  urlCache.set(key, {
    url: url,
    timestamp: Date.now()
  });
}

const app = express();
const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// 🆕 检测运行环境
const isProduction = process.env.NODE_ENV === 'production';
const enableDirectHTTPS = process.env.ENABLE_DIRECT_HTTPS === 'true';

// 简单的环境变量检查
function checkEnvVars() {
  const required = ['DB_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn('⚠️  缺少环境变量:', missing.join(', '));
    console.log('请检查 .env 文件配置');
  } else {
    console.log('✅ 环境变量检查通过');
  }
}

checkEnvVars();

app.use(express.json());

// 根据环境区分CORS配置
if (!isProduction) {
  // 开发环境：允许所有来源跨域，便于本地调试
  app.use(cors({
    origin: true,
    credentials: true
  }));
} 

// 🆕 信任代理设置（支持 Nginx）
app.set('trust proxy', true);

// 添加静态文件服务
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// 🆕 React 前端静态文件服务
app.use('/', express.static(path.join(__dirname, 'react-build')));

// 🆕 Flutter Web 静态文件服务（保留作为备用）
app.use('/flutter', express.static(path.join(__dirname, 'public')));

// 数据库连接配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'live1973_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ 数据库连接成功');
    connection.release();
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
  }
}

// 🆕 增强的健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Live1973 API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    protocol: req.protocol,
    host: req.get('host'),
    // 🆕 代理信息（用于调试 Nginx 配置）
    forwardedProto: req.get('X-Forwarded-Proto'),
    forwardedFor: req.get('X-Forwarded-For'),
    realIP: req.ip,
    isSecure: req.secure || req.get('X-Forwarded-Proto') === 'https'
  });
});

// 获取所有视频
app.get('/api/videos', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM videos WHERE status = ? ORDER BY created_at DESC',
      ['active']
    );
    
    // 为有阿里云视频ID的视频获取播放URL和缩略图URL（使用缓存优化）
    const videosWithUrls = await Promise.all(
      rows.map(async (video) => {
        if (video.aliyun_video_id) {
          try {
            console.log(`🎬 为视频 ${video.id} 获取URL: ${video.aliyun_video_id}`);
            
            // 播放URL：总是实时获取（因为只有1小时有效期）
            const playUrlResult = await vodService.getPlayUrl(video.aliyun_video_id);
            if (playUrlResult.success) {
              video.video_url = playUrlResult.playUrl;
              console.log(`✅ 成功获取播放URL: ${playUrlResult.playUrl.substring(0, 50)}...`);
            } else {
              console.log(`⚠️  获取播放URL失败: ${playUrlResult.error}`);
            }
            
            // 缩略图URL：使用缓存机制
            const thumbnailCacheKey = `thumbnail_${video.aliyun_video_id}`;
            let thumbnailUrl = getCachedUrl(thumbnailCacheKey);
            
            if (!thumbnailUrl) {
              // 缓存中没有，从VOD获取
              const videoInfoResult = await vodService.getVideoInfo(video.aliyun_video_id);
              if (videoInfoResult.success && videoInfoResult.coverUrl) {
                thumbnailUrl = videoInfoResult.coverUrl;
                setCachedUrl(thumbnailCacheKey, thumbnailUrl);
                console.log(`✅ 从VOD获取并缓存缩略图URL: ${thumbnailUrl.substring(0, 50)}...`);
              } else {
                console.log(`⚠️  获取缩略图URL失败: ${videoInfoResult.error || '无缩略图'}`);
                thumbnailUrl = video.thumbnail_url; // 使用数据库中的备用URL
              }
            } else {
              console.log(`✅ 使用缓存的缩略图URL: ${thumbnailUrl.substring(0, 50)}...`);
            }
            
            video.thumbnail_url = thumbnailUrl;
          } catch (vodError) {
            console.error(`❌ VOD服务错误: ${vodError.message}`);
          }
        }
        
        // 格式化时长
        if (video.duration) {
          video.duration = formatDurationFromSeconds(video.duration);
        }
        
        return video;
      })
    );
    
    res.json(videosWithUrls);
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
    
    const video = rows[0];
    
    // 如果有阿里云视频ID，尝试获取播放URL和缩略图URL
    if (video.aliyun_video_id) {
      try {
        console.log(`🎬 为视频 ${video.id} 获取播放URL和缩略图: ${video.aliyun_video_id}`);
        
        // 获取播放URL
        const playUrlResult = await vodService.getPlayUrl(video.aliyun_video_id);
        if (playUrlResult.success) {
          video.video_url = playUrlResult.playUrl;
          console.log(`✅ 成功获取播放URL: ${playUrlResult.playUrl.substring(0, 50)}...`);
        } else {
          console.log(`⚠️  获取播放URL失败: ${playUrlResult.error}`);
        }
        
        // 获取视频信息（包含缩略图URL）
        const videoInfoResult = await vodService.getVideoInfo(video.aliyun_video_id);
        if (videoInfoResult.success && videoInfoResult.coverUrl) {
          video.thumbnail_url = videoInfoResult.coverUrl;
          console.log(`✅ 成功获取缩略图URL: ${videoInfoResult.coverUrl.substring(0, 50)}...`);
        } else {
          console.log(`⚠️  获取缩略图URL失败: ${videoInfoResult.error || '无缩略图'}`);
        }
              } catch (vodError) {
          console.error(`❌ VOD服务错误: ${vodError.message}`);
        }
      }
      
      // 格式化时长
      if (video.duration) {
        video.duration = formatDurationFromSeconds(video.duration);
      }
      
      res.json(video);
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
      description = '',
      aliyun_video_id = ''
    } = req.body;

    if (!title || !videoUrl) {
      return res.status(400).json({ 
        error: '标题和视频URL是必需的' 
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO videos (title, video_url, thumbnail_url, duration, view_count, status, description, aliyun_video_id, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [title, videoUrl, thumbnail_url, duration, view_count, status, description, aliyun_video_id]
    );

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
    const videoId = req.params.id;
    const clientProtocol = req.secure || req.get('X-Forwarded-Proto') === 'https' ? 'HTTPS' : 'HTTP';
    console.log(`🎬 收到播放数更新请求 - 视频ID: ${videoId} (${clientProtocol})`);
    
    const [currentRows] = await pool.execute(
      'SELECT id, title, view_count FROM videos WHERE id = ?',
      [videoId]
    );
    
    if (currentRows.length === 0) {
      console.log(`❌ 视频不存在: ${videoId}`);
      return res.status(404).json({ error: '视频不存在' });
    }
    
    const currentVideo = currentRows[0];
    console.log(`📊 当前播放数: ${currentVideo.view_count} (${currentVideo.title})`);
    
    const [updateResult] = await pool.execute(
      'UPDATE videos SET view_count = view_count + 1, updated_at = NOW() WHERE id = ?',
      [videoId]
    );
    
    if (updateResult.affectedRows === 0) {
      console.log(`⚠️  没有行被更新`);
      return res.status(500).json({ error: '更新失败，没有行被影响' });
    }
    
    const [newRows] = await pool.execute(
      'SELECT view_count FROM videos WHERE id = ?',
      [videoId]
    );
    
    const newViewCount = newRows[0].view_count;
    console.log(`✅ 播放数已更新: ${currentVideo.view_count} → ${newViewCount}`);
    
    res.json({ 
      message: '播放次数已更新',
      data: {
        videoId: videoId,
        oldViewCount: currentVideo.view_count,
        newViewCount: newViewCount,
        increment: newViewCount - currentVideo.view_count
      }
    });
  } catch (error) {
    console.error('❌ 更新播放次数失败:', error);
    res.status(500).json({ 
      error: '更新播放次数失败',
      details: error.message 
    });
  }
});

// 获取单个视频的播放数
app.get('/api/videos/:id/views', async (req, res) => {
  try {
    const videoId = req.params.id;
    console.log(`📊 查询视频播放数: ${videoId}`);
    
    const [rows] = await pool.execute(
      'SELECT id, title, view_count, updated_at FROM videos WHERE id = ?',
      [videoId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '视频不存在' });
    }
    
    const video = rows[0];
    console.log(`📊 视频播放数: ${video.view_count} (${video.title})`);
    
    res.json({
      success: true,
      data: {
        videoId: video.id,
        title: video.title,
        viewCount: video.view_count,
        lastUpdated: video.updated_at
      }
    });
  } catch (error) {
    console.error('❌ 查询播放数失败:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// 测试播放数增加的接口
app.post('/api/test/views/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    console.log(`🧪 测试播放数增加 - 视频ID: ${videoId}`);
    
    const [beforeRows] = await pool.execute(
      'SELECT view_count FROM videos WHERE id = ?',
      [videoId]
    );
    
    if (beforeRows.length === 0) {
      return res.status(404).json({ error: '视频不存在' });
    }
    
    const beforeCount = beforeRows[0].view_count;
    
    await pool.execute(
      'UPDATE videos SET view_count = view_count + 1 WHERE id = ?',
      [videoId]
    );
    
    const [afterRows] = await pool.execute(
      'SELECT view_count FROM videos WHERE id = ?',
      [videoId]
    );
    
    const afterCount = afterRows[0].view_count;
    
    console.log(`🧪 测试结果: ${beforeCount} → ${afterCount}`);
    
    res.json({
      success: true,
      message: '测试播放数增加成功',
      data: {
        videoId: videoId,
        before: beforeCount,
        after: afterCount,
        increased: afterCount > beforeCount
      }
    });
  } catch (error) {
    console.error('❌ 测试播放数失败:', error);
    res.status(500).json({ error: '测试失败' });
  }
});

// VOD播放地址获取接口
app.get('/api/videos/:id/play', async (req, res) => {
  try {
    const videoId = req.params.id;
    const clientProtocol = req.secure || req.get('X-Forwarded-Proto') === 'https' ? 'HTTPS' : 'HTTP';
    console.log(`🎬 请求播放视频: ${videoId} (${clientProtocol})`);
    
    // 🆕 检查缓存
    const cacheKey = `play_${videoId}`;
    const cachedUrl = getCachedUrl(cacheKey);
    if (cachedUrl) {
      console.log(`📦 使用缓存的播放地址: ${videoId}`);
      return res.json(cachedUrl);
    }
    
    const [rows] = await pool.execute(
      'SELECT * FROM videos WHERE id = ? AND status = ?',
      [videoId, 'active']
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '视频不存在' });
    }
    
    const video = rows[0];
    
    if (video.aliyun_video_id) {
      console.log(`🎯 VOD视频，使用SDK获取播放地址: ${video.aliyun_video_id}`);
      
      const result = await vodService.getPlayUrl(video.aliyun_video_id);
      
      if (result.success) {
        // 🆕 缓存播放地址（30分钟）
        const responseData = {
          success: true,
          data: {
            id: video.id,
            title: video.title,
            playUrl: result.playUrl,
            definition: result.definition,
            format: result.format,
            source: 'vod_sdk'
          }
        };
        
        setCachedUrl(cacheKey, responseData);
        
        try {
          await pool.execute(
            'UPDATE videos SET video_url = ?, updated_at = NOW() WHERE id = ?',
            [result.playUrl, videoId]
          );
          console.log('📝 已更新数据库中的播放地址缓存');
        } catch (updateError) {
          console.log('⚠️  更新缓存失败，但不影响播放:', updateError.message);
        }
        
        return res.json(responseData);
      } else {
        return res.status(500).json({
          error: 'VOD播放地址获取失败',
          details: result.error
        });
      }
    } else if (video.video_url) {
      console.log(`▶️  普通视频，直接播放: ${video.video_url}`);
      const responseData = {
        success: true,
        data: {
          id: video.id,
          title: video.title,
          playUrl: video.video_url,
          source: 'direct'
        }
      };
      
      // 🆕 缓存普通视频播放地址（1小时）
      setCachedUrl(cacheKey, responseData);
      
      return res.json(responseData);
    } else {
      return res.status(400).json({ 
        error: '视频缺少播放地址' 
      });
    }
    
  } catch (error) {
    console.error('获取播放地址失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// VOD相关接口保持不变...
app.get('/api/vod/test', async (req, res) => {
  try {
    const result = await vodService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/vod/info/:videoId', async (req, res) => {
  try {
    const result = await vodService.getVideoInfo(req.params.videoId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 播放事件记录接口
app.post('/api/videos/play-events', async (req, res) => {
  try {
    const { videoId, eventType, timestamp, ...data } = req.body;
    
    // 记录播放事件到数据库（可选）
    await pool.execute(
      `INSERT INTO play_events (video_id, event_type, event_data, created_at) 
       VALUES (?, ?, ?, ?)`,
      [videoId, eventType, JSON.stringify(data), timestamp || new Date()]
    );
    
    console.log(`📊 记录播放事件: ${videoId} - ${eventType}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('记录播放事件失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 获取播放性能统计
app.get('/api/videos/:id/stats', async (req, res) => {
  try {
    const videoId = req.params.id;
    
    // 获取播放统计信息
    const [stats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_plays,
        COUNT(CASE WHEN event_type = 'start' THEN 1 END) as starts,
        COUNT(CASE WHEN event_type = 'complete' THEN 1 END) as completes,
        COUNT(CASE WHEN event_type = 'error' THEN 1 END) as errors,
        AVG(CASE WHEN event_type = 'seek' THEN JSON_EXTRACT(event_data, '$.seekTime') END) as avg_seek_time
       FROM play_events 
       WHERE video_id = ?`,
      [videoId]
    );
    
    res.json({
      success: true,
      data: stats[0] || {
        total_plays: 0,
        starts: 0,
        completes: 0,
        errors: 0,
        avg_seek_time: 0
      }
    });
  } catch (error) {
    console.error('获取播放统计失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// VOD同步接口（保持原有逻辑）...
app.post('/api/videos/sync-vod', async (req, res) => {
  try {
    console.log('🔄 开始同步VOD视频...');
    const vodTest = await vodService.testConnection();
    if (!vodTest.success) {
      return res.status(500).json({
        success: false,
        message: 'VOD服务连接失败',
        error: vodTest.error
      });
    }
    console.log('✅ VOD连接正常');
    const vodVideos = await getVODVideoList();
    console.log(`📊 VOD中找到 ${vodVideos.length} 个视频`);
    // 1. 获取数据库所有视频ID
    const [existingVideos] = await pool.execute(
      'SELECT id, aliyun_video_id FROM videos WHERE aliyun_video_id IS NOT NULL AND aliyun_video_id != ""'
    );
    const existingVideoIds = existingVideos.map(v => v.aliyun_video_id);
    // 2. 获取VOD所有视频ID
    const vodVideoIds = vodVideos.map(v => v.VideoId);
    // 3. 找出需要新增的视频
    const newVideos = vodVideos.filter(vodVideo => !existingVideoIds.includes(vodVideo.VideoId));
    // 4. 找出需要删除的视频
    const toDelete = existingVideos.filter(dbVideo => !vodVideoIds.includes(dbVideo.aliyun_video_id));
    // 5. 批量插入新增视频
    let successCount = 0;
    let updateCount = 0;
    let deleteCount = 0;
    const syncResults = [];
    for (const vodVideo of newVideos) {
      try {
        // 🆕 获取单个视频的详细信息
        console.log(`🔍 获取视频详细信息: ${vodVideo.VideoId}`);
        const videoInfo = await vodService.getVideoInfo(vodVideo.VideoId);
        
        let title = '未命名视频';
        let description = '';
        let duration = '0:00';
        let thumbnailUrl = '';
        
        if (videoInfo.success) {
          title = videoInfo.title || '未命名视频';
          description = videoInfo.description || '';
          
          // 调试VOD API返回的原始时长数据
          console.log(`🔍 VOD原始时长数据: ${vodVideo.VideoId}`);
          console.log(`   - 原始duration: ${videoInfo.duration}`);
          console.log(`   - duration类型: ${typeof videoInfo.duration}`);
          
          // 🆕 修复：将VOD API返回的duration字符串转换为秒数
          let durationInSeconds = 0;
          if (videoInfo.duration) {
            durationInSeconds = parseFloat(videoInfo.duration);
            console.log(`   - 转换为秒数: ${durationInSeconds}`);
          }
          
          console.log(`   - 格式化后: ${formatDurationFromSeconds(durationInSeconds)}`);
          
          // 🆕 存储秒数到数据库，而不是格式化后的字符串
          duration = durationInSeconds;
          thumbnailUrl = videoInfo.coverUrl || '';
          console.log(`✅ 获取到视频信息: ${title} (${durationInSeconds}秒)`);
        } else {
          console.log(`⚠️  获取视频信息失败: ${videoInfo.error}`);
        }
        
        const [result] = await pool.execute(
          `INSERT INTO videos (
            title, description, aliyun_video_id, duration, thumbnail_url, video_url, status, view_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            title,
            description,
            vodVideo.VideoId,
            duration,
            thumbnailUrl,
            '',
            'active',
            0
          ]
        );
        syncResults.push({
          databaseId: result.insertId,
          videoId: vodVideo.VideoId,
          title: vodVideo.Title,
          status: 'inserted'
        });
        successCount++;
      } catch (error) {
        syncResults.push({
          videoId: vodVideo.VideoId,
          title: vodVideo.Title,
          status: 'insert_error',
          error: error.message
        });
      }
    }
    // 6. 批量删除多余视频
    for (const dbVideo of toDelete) {
      try {
        await pool.execute('DELETE FROM videos WHERE id = ?', [dbVideo.id]);
        syncResults.push({
          databaseId: dbVideo.id,
          videoId: dbVideo.aliyun_video_id,
          status: 'deleted'
        });
        deleteCount++;
      } catch (error) {
        syncResults.push({
          databaseId: dbVideo.id,
          videoId: dbVideo.aliyun_video_id,
          status: 'delete_error',
          error: error.message
        });
      }
    }
    // 7. 同步更新已有视频的标题、描述、缩略图、时长等
    for (const vodVideo of vodVideos) {
      const dbVideo = existingVideos.find(v => v.aliyun_video_id === vodVideo.VideoId);
      if (dbVideo) {
        try {
          // 🆕 获取单个视频的详细信息
          console.log(`🔍 获取视频详细信息: ${vodVideo.VideoId}`);
          const videoInfo = await vodService.getVideoInfo(vodVideo.VideoId);
          
          let title = '未命名视频';
          let description = '';
          let duration = '0:00';
          let thumbnailUrl = '';
          
          if (videoInfo.success) {
            title = videoInfo.title || '未命名视频';
            description = videoInfo.description || '';
            
            // 调试VOD API返回的原始时长数据
            console.log(`🔍 VOD原始时长数据: ${vodVideo.VideoId}`);
            console.log(`   - 原始duration: ${videoInfo.duration}`);
            console.log(`   - duration类型: ${typeof videoInfo.duration}`);
            
            // 🆕 修复：将VOD API返回的duration字符串转换为秒数
            let durationInSeconds = 0;
            if (videoInfo.duration) {
              durationInSeconds = parseFloat(videoInfo.duration);
              console.log(`   - 转换为秒数: ${durationInSeconds}`);
            }
            
            console.log(`   - 格式化后: ${formatDurationFromSeconds(durationInSeconds)}`);
            
            // 🆕 存储秒数到数据库，而不是格式化后的字符串
            duration = durationInSeconds;
            thumbnailUrl = videoInfo.coverUrl || '';
            console.log(`✅ 获取到视频信息: ${title} (${durationInSeconds}秒)`);
          } else {
            console.log(`⚠️  获取视频信息失败: ${videoInfo.error}`);
          }
          
          console.log(`🔄 更新视频信息: ${title} (${vodVideo.VideoId})`);
          console.log(`   - 标题: ${title}`);
          console.log(`   - 时长: ${duration}`);
          console.log(`   - 缩略图: ${thumbnailUrl ? '有' : '无'}`);
          
          await pool.execute(
            'UPDATE videos SET title = ?, description = ?, duration = ?, thumbnail_url = ?, updated_at = NOW() WHERE id = ?',
            [
              title,
              description,
              duration,
              thumbnailUrl,
              dbVideo.id
            ]
          );
          syncResults.push({
            databaseId: dbVideo.id,
            videoId: vodVideo.VideoId,
            title: title,
            status: 'updated'
          });
          updateCount++;
        } catch (error) {
          console.error(`❌ 更新视频失败: ${vodVideo.VideoId}`, error.message);
          syncResults.push({
            databaseId: dbVideo.id,
            videoId: vodVideo.VideoId,
            title: title,
            status: 'update_error',
            error: error.message
          });
        }
      }
    }
    res.json({
      success: true,
      message: `同步完成! 新增 ${successCount} 个，删除 ${deleteCount} 个，更新 ${updateCount} 个视频`,
      data: {
        totalVodVideos: vodVideos.length,
        newVideosAdded: successCount,
        deletedVideos: deleteCount,
        updatedVideos: updateCount,
        syncResults: syncResults
      }
    });
  } catch (error) {
    console.error('❌ VOD同步失败:', error);
    res.status(500).json({
      success: false,
      message: 'VOD同步失败',
      error: error.message
    });
  }
});

async function getVODVideoList() {
  try {
    console.log('📋 调用 vodService.getAllVideos()...');
    
    const result = await vodService.getAllVideos();
    
    if (result.success) {
      console.log(`✅ 成功获取 ${result.videos.length} 个VOD视频`);
      return result.videos;
    } else {
      console.log(`❌ 获取VOD视频列表失败: ${result.error}`);
      return [];
    }
    
  } catch (error) {
    console.error('❌ 获取VOD视频列表异常:', error);
    return [];
  }
}

function formatDurationFromSeconds(seconds) {
  if (!seconds || seconds === 0) return '0:00';
  
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// OPTIONS 请求处理（CORS 预检请求）
app.options('*', (req, res) => {
  res.sendStatus(200);
});

// 🆕 SPA 路由支持（React路由处理）
app.get('*', (req, res) => {
  // 如果是 API 请求，返回 404
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  
  // 如果是Flutter路径，返回Flutter应用
  if (req.url.startsWith('/flutter')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  
  // 其他请求，返回 React 应用的 index.html
  res.sendFile(path.join(__dirname, 'react-build', 'index.html'));
});

// 其他请求的 404 处理（主要处理非 GET 请求）
app.use('*', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 🆕 智能的证书检测（仅在启用直接HTTPS时使用）
function createHTTPSOptions() {
  if (!enableDirectHTTPS) {
    console.log('🔧 直接 HTTPS 已禁用，推荐使用 Nginx 反向代理');
    return null;
  }

  try {
    const possiblePaths = [
      {
        key: '/etc/ssl/private/selfsigned.key',
        cert: '/etc/ssl/certs/selfsigned.crt',
        env: 'production'
      },
      {
        key: path.join(__dirname, 'ssl', 'selfsigned.key'),
        cert: path.join(__dirname, 'ssl', 'selfsigned.crt'),
        env: 'local'
      }
    ];

    for (const pathConfig of possiblePaths) {
      if (fs.existsSync(pathConfig.key) && fs.existsSync(pathConfig.cert)) {
        console.log(`📋 找到 SSL 证书文件 (${pathConfig.env})`);
        return {
          key: fs.readFileSync(pathConfig.key),
          cert: fs.readFileSync(pathConfig.cert)
        };
      }
    }
    
    console.log('⚠️  未找到 SSL 证书文件');
    return null;
    
  } catch (error) {
    console.error('❌ 读取 SSL 证书失败:', error.message);
    return null;
  }
}

// 🆕 启动服务器函数
async function startServers() {
  console.log(`🚀 启动模式: ${isProduction ? '生产环境' : '开发环境'}`);
  console.log(`🔧 推荐架构: Node.js (HTTP:${HTTP_PORT}) + Nginx 反向代理 (HTTPS:443)`);
  
  // 启动 HTTP 服务器（主要服务）
  const httpServer = http.createServer(app);
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🚀 HTTP 服务器运行在端口 ${HTTP_PORT}`);
    console.log(`📱 健康检查: http://localhost:${HTTP_PORT}/api/health`);
    console.log(`🎬 视频接口: http://localhost:${HTTP_PORT}/api/videos`);
    console.log(`🌐 前端应用: http://localhost:${HTTP_PORT}/`);
    console.log(`📱 手机访问: http://192.168.1.3:${HTTP_PORT}/`);
  });

  // 可选：启动直接 HTTPS 服务器（用于测试）
  if (enableDirectHTTPS) {
    const httpsOptions = createHTTPSOptions();
    if (httpsOptions) {
      try {
        const httpsServer = https.createServer(httpsOptions, app);
        httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
          console.log(`🔒 HTTPS 服务器运行在端口 ${HTTPS_PORT} (测试用)`);
          console.log(`🔐 HTTPS 健康检查: https://localhost:${HTTPS_PORT}/api/health`);
        });
      } catch (error) {
        console.error('❌ HTTPS 服务器启动失败:', error.message);
      }
    }
  }

  // 测试数据库连接
  await testDbConnection();
  
  // 测试VOD连接
  console.log('🔧 测试VOD SDK连接...');
  try {
    const vodResult = await vodService.testConnection();
    if (vodResult.success) {
      console.log('✅ VOD SDK连接成功');
    } else {
      console.log('❌ VOD SDK连接失败:', vodResult.error);
    }
  } catch (error) {
    console.log('❌ VOD SDK测试出错:', error.message);
  }
}

// 启动应用
startServers();