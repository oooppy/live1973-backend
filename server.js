const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const vodService = require('./services/aliyunVod');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// 检查环境变量
checkEnvVars();

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
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 测试数据库连接
async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ 数据库连接成功');
    connection.release();
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
  }
}

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Live1973 API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
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
      description = '',
      aliyun_video_id = ''
    } = req.body;

    // 验证必需字段
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
    const videoId = req.params.id;
    console.log(`🎬 收到播放数更新请求 - 视频ID: ${videoId}`);
    
    // 先查询当前播放数
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
    
    // 更新播放数
    const [updateResult] = await pool.execute(
      'UPDATE videos SET view_count = view_count + 1, updated_at = NOW() WHERE id = ?',
      [videoId]
    );
    
    console.log(`📝 更新结果:`, {
      affectedRows: updateResult.affectedRows,
      changedRows: updateResult.changedRows
    });
    
    if (updateResult.affectedRows === 0) {
      console.log(`⚠️  没有行被更新`);
      return res.status(500).json({ error: '更新失败，没有行被影响' });
    }
    
    // 查询更新后的播放数
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

// 🔧 新增：获取单个视频的播放数（用于调试）
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

// 🔧 新增：测试播放数增加的接口
app.post('/api/test/views/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    console.log(`🧪 测试播放数增加 - 视频ID: ${videoId}`);
    
    // 查询当前播放数
    const [beforeRows] = await pool.execute(
      'SELECT view_count FROM videos WHERE id = ?',
      [videoId]
    );
    
    if (beforeRows.length === 0) {
      return res.status(404).json({ error: '视频不存在' });
    }
    
    const beforeCount = beforeRows[0].view_count;
    
    // 增加播放数
    await pool.execute(
      'UPDATE videos SET view_count = view_count + 1 WHERE id = ?',
      [videoId]
    );
    
    // 查询更新后的播放数
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

// 🔧 新的VOD播放地址获取接口（使用VOD SDK）
app.get('/api/videos/:id/play', async (req, res) => {
  try {
    const videoId = req.params.id;
    console.log(`🎬 请求播放视频: ${videoId}`);
    
    // 从数据库获取视频信息
    const [rows] = await pool.execute(
      'SELECT * FROM videos WHERE id = ? AND status = ?',
      [videoId, 'active']
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '视频不存在' });
    }
    
    const video = rows[0];
    
    // 如果是VOD视频，使用SDK获取播放地址
    if (video.aliyun_video_id) {
      console.log(`🎯 VOD视频，使用SDK获取播放地址: ${video.aliyun_video_id}`);
      
      const result = await vodService.getPlayUrl(video.aliyun_video_id);
      
      if (result.success) {
        // 可选：更新数据库中的缓存URL
        try {
          await pool.execute(
            'UPDATE videos SET video_url = ?, updated_at = NOW() WHERE id = ?',
            [result.playUrl, videoId]
          );
          console.log('📝 已更新数据库中的播放地址缓存');
        } catch (updateError) {
          console.log('⚠️  更新缓存失败，但不影响播放:', updateError.message);
        }
        
        return res.json({
          success: true,
          data: {
            id: video.id,
            title: video.title,
            playUrl: result.playUrl,
            definition: result.definition,
            format: result.format,
            source: 'vod_sdk'
          }
        });
      } else {
        return res.status(500).json({
          error: 'VOD播放地址获取失败',
          details: result.error
        });
      }
    } else if (video.video_url) {
      // 普通视频，直接返回URL
      console.log(`▶️  普通视频，直接播放: ${video.video_url}`);
      return res.json({
        success: true,
        data: {
          id: video.id,
          title: video.title,
          playUrl: video.video_url,
          source: 'direct'
        }
      });
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

// VOD连接测试接口
app.get('/api/vod/test', async (req, res) => {
  try {
    const result = await vodService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// VOD视频信息获取接口
app.get('/api/vod/info/:videoId', async (req, res) => {
  try {
    const result = await vodService.getVideoInfo(req.params.videoId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 在你的 server.js 中，在现有的视频接口之后添加以下代码：

// 在你的 server.js 中，替换之前的测试版同步接口：

// 🔧 完整版：同步VOD视频接口
app.post('/api/videos/sync-vod', async (req, res) => {
  try {
    console.log('🔄 开始同步VOD视频...');
    
    // 1. 检查VOD服务是否可用
    const vodTest = await vodService.testConnection();
    if (!vodTest.success) {
      return res.status(500).json({
        success: false,
        message: 'VOD服务连接失败',
        error: vodTest.error
      });
    }
    
    console.log('✅ VOD连接正常');
    
    // 2. 获取VOD中的所有视频
    const vodVideos = await getVODVideoList();
    console.log(`📊 VOD中找到 ${vodVideos.length} 个视频`);
    
    if (vodVideos.length === 0) {
      return res.json({
        success: true,
        message: 'VOD中没有视频需要同步',
        data: {
          totalVodVideos: 0,
          newVideosAdded: 0,
          syncResults: []
        }
      });
    }
    
    // 3. 获取数据库中现有的视频
    const [existingVideos] = await pool.execute(
      'SELECT aliyun_video_id FROM videos WHERE aliyun_video_id IS NOT NULL AND aliyun_video_id != ""'
    );
    const existingVideoIds = existingVideos.map(v => v.aliyun_video_id);
    console.log(`💾 数据库中已有 ${existingVideoIds.length} 个VOD视频`);
    
    // 4. 找出需要添加的新视频
    const newVideos = vodVideos.filter(vodVideo => 
      !existingVideoIds.includes(vodVideo.VideoId)
    );
    
    console.log(`🆕 发现 ${newVideos.length} 个新视频需要同步`);
    
    // 5. 批量添加新视频到数据库
    const syncResults = [];
    let successCount = 0;
    
    for (const vodVideo of newVideos) {
      try {
        console.log(`📥 正在同步: ${vodVideo.Title}`);
        
        const [result] = await pool.execute(
          `INSERT INTO videos (
            title, 
            description, 
            aliyun_video_id, 
            duration, 
            thumbnail_url, 
            video_url,
            status,
            view_count,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            vodVideo.Title || '未命名视频',
            vodVideo.Description || '',
            vodVideo.VideoId,
            formatDurationFromSeconds(vodVideo.Duration), // 转换为 MM:SS 格式
            vodVideo.CoverURL || '',
            '', // video_url 先留空，播放时动态获取
            'active',
            0 // 初始播放数
          ]
        );
        
        syncResults.push({
          databaseId: result.insertId,
          videoId: vodVideo.VideoId,
          title: vodVideo.Title,
          duration: vodVideo.Duration,
          status: 'success'
        });
        
        successCount++;
        console.log(`✅ 同步成功: ${vodVideo.Title} (ID: ${result.insertId})`);
        
      } catch (error) {
        console.error(`❌ 同步失败: ${vodVideo.Title}`, error);
        syncResults.push({
          videoId: vodVideo.VideoId,
          title: vodVideo.Title,
          status: 'error',
          error: error.message
        });
      }
    }
    
    console.log(`🎉 同步完成! 成功: ${successCount}, 失败: ${newVideos.length - successCount}`);
    
    res.json({
      success: true,
      message: `同步完成! 新增 ${successCount} 个视频`,
      data: {
        totalVodVideos: vodVideos.length,
        existingVideos: existingVideoIds.length,
        newVideosAdded: successCount,
        failedVideos: newVideos.length - successCount,
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

// 🔧 获取VOD视频列表的辅助函数
async function getVODVideoList() {
  try {
    console.log('📋 调用 vodService.getAllVideos()...');
    
    // 使用新添加的 getAllVideos 方法
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

// 🔧 时长格式转换辅助函数
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

// 🗑️ 删除旧的临时接口（不再需要）
// app.get('/api/vod/:videoId/playurl', ...) - 已删除

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
app.listen(PORT, async () => {
  console.log(`🚀 Live1973 API 服务器运行在端口 ${PORT}`);
  console.log(`📱 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`🎬 视频接口: http://localhost:${PORT}/api/videos`);
  console.log(`📁 本地视频: http://localhost:${PORT}/videos/`);
  
  // 测试数据库连接
  await testDbConnection();
  
  // 🔧 测试VOD连接
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
});