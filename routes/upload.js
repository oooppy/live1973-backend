const express = require('express');
const router = express.Router();
const vodService = require('../services/vodService');
const { query } = require('../config/database');

// 获取上传凭证
router.post('/upload/auth', async (req, res) => {
  try {
    const { title, fileName } = req.body;
    
    const result = await vodService.getUploadAuth(title, fileName);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取上传凭证失败',
      message: error.message
    });
  }
});

// 上传完成后保存视频信息
router.post('/upload/complete', async (req, res) => {
  try {
    const { 
      title, 
      description, 
      aliyun_video_id, 
      duration 
    } = req.body;

    // 获取播放地址
    const playInfo = await vodService.getPlayInfo(aliyun_video_id);
    const video_url = playInfo.VideoBase.CoverURL;
    const thumbnail_url = playInfo.VideoBase.CoverURL;

    // 保存到数据库
    await query(
      `INSERT INTO videos (title, description, aliyun_video_id, video_url, thumbnail_url, duration) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description, aliyun_video_id, video_url, thumbnail_url, duration]
    );

    res.json({
      success: true,
      message: '视频保存成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '保存视频失败',
      message: error.message
    });
  }
});

module.exports = router;