// services/aliyunVod.js - 增强版本
require('dotenv').config();

console.log('🔧 初始化VOD服务...');

const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;

console.log('ACCESS_KEY_ID:', accessKeyId ? `✅ 已设置 (${accessKeyId.length}字符)` : '❌ 未设置');
console.log('ACCESS_KEY_SECRET:', accessKeySecret ? `✅ 已设置 (${accessKeySecret.length}字符)` : '❌ 未设置');

if (!accessKeyId || !accessKeySecret) {
  console.error('❌ 缺少必要的阿里云访问密钥');
  
  class TempVodService {
    async getPlayUrl(videoId) {
      return { success: false, error: '阿里云AccessKey未配置' };
    }
    async getVideoInfo(videoId) {
      return { success: false, error: 'AccessKey未配置' };
    }
    async testConnection() {
      return { success: false, error: '环境变量配置问题' };
    }
    async getVideoList() {
      return { success: false, error: 'AccessKey未配置' };
    }
  }
  
  module.exports = new TempVodService();
  return;
}

const Core = require('@alicloud/pop-core');

class AliyunVodService {
  constructor() {
    try {
      console.log('🚀 初始化阿里云VOD客户端...');
      
      const cleanAccessKeyId = accessKeyId.trim();
      const cleanAccessKeySecret = accessKeySecret.trim();
      
      // 🔧 使用正确的VOD端点配置
      this.client = new Core({
        accessKeyId: cleanAccessKeyId,
        accessKeySecret: cleanAccessKeySecret,
        // 🎯 正确的VOD API端点
        endpoint: 'https://vod.cn-shanghai.aliyuncs.com',
        apiVersion: '2017-03-21',
        // 添加其他配置
        opts: {
          timeout: 60000, // 60秒超时
        }
      });
      
      console.log('✅ VOD客户端初始化成功');
      console.log('📡 使用端点: https://vod.cn-shanghai.aliyuncs.com');
      this.initialized = true;
      
    } catch (error) {
      console.error('❌ VOD客户端初始化失败:', error.message);
      this.initialized = false;
      this.initError = error.message;
    }
  }

  // 🆕 获取视频列表
  async getVideoList(options = {}) {
    try {
      if (!this.initialized) {
        return {
          success: false,
          error: 'VOD客户端未初始化',
          details: this.initError
        };
      }
      
      console.log('📋 获取VOD视频列表...');
      
      const params = {
        PageNo: options.pageNo || 1,
        PageSize: options.pageSize || 100, // 一次最多获取100个
        Status: options.status || 'Normal', // 只获取正常状态的视频
        SortBy: options.sortBy || 'CreationTime:Desc' // 按创建时间降序
      };

      console.log('📡 调用VOD API: SearchMedia');
      console.log('📋 请求参数:', params);

      const result = await this.client.request('SearchMedia', params, {
        method: 'POST'
      });

      console.log('🔍 VOD API响应:');
      console.log(`📊 总数: ${result.Total || 0}`);
      console.log(`📄 当前页: ${result.MediaList ? result.MediaList.length : 0} 个视频`);

      if (result.MediaList && result.MediaList.length > 0) {
        console.log('🔍 原始VOD API响应示例:');
        console.log(JSON.stringify(result.MediaList[0], null, 2));
        
        const videos = result.MediaList.map(media => {
          const video = {
          VideoId: media.MediaId,
          Title: media.Title || '未命名视频',
          Description: media.Description || '',
          Duration: media.Duration || 0,
          CoverURL: media.CoverURL || '',
          Status: media.Status,
          CreationTime: media.CreationTime,
          Size: media.Size || 0
          };
          
          console.log(`📹 处理视频: ${video.Title} (${video.VideoId})`);
          console.log(`   - 标题: ${video.Title}`);
          console.log(`   - 时长: ${video.Duration}秒`);
          console.log(`   - 缩略图: ${video.CoverURL ? '有' : '无'}`);
          
          return video;
        });
        
        console.log(`✅ 获取视频列表成功: ${videos.length} 个视频`);
        videos.forEach((video, index) => {
          console.log(`   ${index + 1}. ${video.Title} (${video.VideoId})`);
        });
        
        return {
          success: true,
          videos: videos,
          total: result.Total || 0,
          pageNo: params.PageNo,
          pageSize: params.PageSize
        };
      } else {
        console.log('📭 VOD中没有找到视频');
        return {
          success: true,
          videos: [],
          total: 0,
          pageNo: params.PageNo,
          pageSize: params.PageSize
        };
      }
    } catch (error) {
      console.error('❌ 获取VOD视频列表失败:', error);
      
      // 详细的错误处理
      let errorMessage = error.message;
      let suggestion = '';
      
      if (error.code === 'Forbidden.Delinquent') {
        errorMessage = '账户欠费，VOD服务被停用';
        suggestion = '请充值后重试';
      } else if (error.message.includes('getaddrinfo') || error.code === 'ENOTFOUND') {
        errorMessage = '网络连接失败，无法访问阿里云VOD服务';
        suggestion = '请检查网络连接和DNS设置';
      } else if (error.code === 'InvalidAccessKeyId.NotFound') {
        errorMessage = 'AccessKey ID 无效';
        suggestion = '请检查环境变量中的 ALIYUN_ACCESS_KEY_ID';
      } else if (error.code === 'SignatureDoesNotMatch') {
        errorMessage = 'AccessKey Secret 无效';
        suggestion = '请检查环境变量中的 ALIYUN_ACCESS_KEY_SECRET';
      }
      
      return {
        success: false,
        error: errorMessage,
        code: error.code || 'UNKNOWN',
        suggestion: suggestion
      };
    }
  }

  // 🆕 获取所有视频（支持分页）
  async getAllVideos() {
    try {
      console.log('📋 获取所有VOD视频...');
      
      let allVideos = [];
      let pageNo = 1;
      const pageSize = 100;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`📄 获取第 ${pageNo} 页...`);
        
        const result = await this.getVideoList({
          pageNo: pageNo,
          pageSize: pageSize
        });
        
        if (!result.success) {
          throw new Error(result.error);
        }
        
        allVideos = allVideos.concat(result.videos);
        
        // 检查是否还有更多页
        hasMore = result.videos.length === pageSize && allVideos.length < result.total;
        pageNo++;
        
        // 防止无限循环
        if (pageNo > 10) {
          console.log('⚠️  达到最大页数限制，停止获取');
          break;
        }
      }
      
      console.log(`🎉 获取完成，总共 ${allVideos.length} 个视频`);
      
      return {
        success: true,
        videos: allVideos,
        total: allVideos.length
      };
    } catch (error) {
      console.error('❌ 获取所有视频失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 获取视频播放地址
  async getPlayUrl(videoId) {
    try {
      if (!this.initialized) {
        return {
          success: false,
          error: 'VOD客户端未初始化',
          details: this.initError
        };
      }
      
      console.log(`🎬 获取VOD播放地址: ${videoId}`);
      
      // 🆕 支持HLS格式，提升播放流畅度
      const params = {
        VideoId: videoId,
        Formats: 'mp4,m3u8', // 优先获取HLS格式
        AuthTimeout: 3600, // 1小时有效期
        Definition: 'Auto' // 自动选择最佳清晰度
      };

      console.log('📡 调用VOD API: GetPlayInfo');
      console.log('📋 请求参数:', params);

      const result = await this.client.request('GetPlayInfo', params, {
        method: 'POST'
      });

      console.log('🔍 VOD API响应:');
      console.log(JSON.stringify(result, null, 2));

      if (result.PlayInfoList && result.PlayInfoList.PlayInfo && result.PlayInfoList.PlayInfo.length > 0) {
        // 🆕 优先选择HLS格式，如果没有则使用MP4
        const playInfoList = result.PlayInfoList.PlayInfo;
        const hlsPlayInfo = playInfoList.find(info => info.Format === 'm3u8');
        const mp4PlayInfo = playInfoList.find(info => info.Format === 'mp4');
        
        const playInfo = hlsPlayInfo || mp4PlayInfo || playInfoList[0];
        
        console.log(`✅ 获取播放地址成功:`);
        console.log(`   播放URL: ${playInfo.PlayURL}`);
        console.log(`   清晰度: ${playInfo.Definition}`);
        console.log(`   格式: ${playInfo.Format}`);
        console.log(`   文件大小: ${playInfo.Size} bytes`);
        
        return {
          success: true,
          playUrl: playInfo.PlayURL,
          definition: playInfo.Definition,
          format: playInfo.Format,
          size: playInfo.Size,
          duration: playInfo.Duration
        };
      } else {
        console.log('⚠️  API响应中没有播放信息');
        throw new Error('未获取到播放信息，可能视频不存在或转码未完成');
      }
    } catch (error) {
      console.error('❌ 获取VOD播放地址失败:', error);
      
      // 详细的错误处理
      let errorMessage = error.message;
      let suggestion = '';
      
      if (error.code === 'InvalidVideo.NotFound') {
        errorMessage = 'VideoId不存在或已被删除';
        suggestion = '请检查VideoId是否正确';
      } else if (error.code === 'Forbidden.Delinquent') {
        errorMessage = '账户欠费，VOD服务被停用';
        suggestion = '请充值后重试';
      } else if (error.message.includes('getaddrinfo') || error.code === 'ENOTFOUND') {
        errorMessage = '网络连接失败，无法访问阿里云VOD服务';
        suggestion = '请检查网络连接和DNS设置';
      }
      
      return {
        success: false,
        error: errorMessage,
        code: error.code || 'UNKNOWN',
        suggestion: suggestion
      };
    }
  }

  // 获取视频信息
  async getVideoInfo(videoId) {
    try {
      if (!this.initialized) {
        return { success: false, error: 'VOD客户端未初始化' };
      }
      
      console.log(`📋 获取VOD视频信息: ${videoId}`);
      
      const params = { VideoId: videoId };
      const result = await this.client.request('GetVideoInfo', params, { method: 'POST' });

      console.log('🔍 GetVideoInfo API响应:');
      console.log(JSON.stringify(result, null, 2));

      if (result.Video) {
        const video = result.Video;
        console.log(`✅ 获取视频信息成功: ${video.Title}`);
        
        return {
          success: true,
            title: video.Title,
            description: video.Description,
            duration: video.Duration,
            coverUrl: video.CoverURL,
            status: video.Status,
            creationTime: video.CreationTime,
            size: video.Size
        };
      } else {
        throw new Error('未获取到视频信息');
      }
    } catch (error) {
      console.error('❌ 获取VOD视频信息失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 测试连接
  async testConnection() {
    try {
      if (!this.initialized) {
        return {
          success: false,
          error: 'VOD客户端未初始化',
          details: this.initError
        };
      }
      
      console.log('🔧 测试VOD连接...');
      
      // 🔧 使用简单的方法测试连接
      const params = {
        PageNo: 1,
        PageSize: 1
      };

      console.log('📡 测试API调用: SearchMedia');
      const result = await this.client.request('SearchMedia', params, {
        method: 'POST'
      });

      console.log('📊 测试响应:', result);
      console.log('✅ VOD连接测试成功');
      
      return { 
        success: true, 
        message: 'VOD API连接正常',
        endpoint: 'https://vod.cn-shanghai.aliyuncs.com',
        totalCount: result.Total || 0
      };
    } catch (error) {
      console.error('❌ VOD连接测试失败:', error);
      return { 
        success: false, 
        error: error.message,
        code: error.code || 'UNKNOWN',
        endpoint: 'https://vod.cn-shanghai.aliyuncs.com'
      };
    }
  }
}

const vodService = new AliyunVodService();
module.exports = vodService;