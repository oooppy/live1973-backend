const axios = require('axios');

// 添加本地测试视频到数据库
async function addLocalTestVideo() {
  try {
    console.log('正在添加本地测试视频...');
    
    const videoData = {
      title: 'YouTube下载测试视频',
      videoUrl: 'http://localhost:3000/videos/tz.mp4', // 本地文件路径
      thumbnail_url: '', // 暂时为空
      duration: '4:54', // 根据实际时长调整
      views: 1,
      status: 'active',
      isRealVideo: true,
      description: '从YouTube下载的测试视频，用于验证格式兼容性'
    };

    const response = await axios.post('http://localhost:3000/api/videos', videoData);
    
    if (response.status === 201) {
      console.log('✅ 本地测试视频添加成功!');
      console.log('视频ID:', response.data.id);
      console.log('视频标题:', response.data.title);
      console.log('视频URL:', response.data.videoUrl);
    }

  } catch (error) {
    console.error('❌ 添加本地测试视频失败:', error.response?.data || error.message);
  }
}

addLocalTestVideo();