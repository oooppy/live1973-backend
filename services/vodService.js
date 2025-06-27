const RPCClient = require('@alicloud/pop-core').RPCClient;

class VODService {
  constructor() {
    this.client = new RPCClient({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      endpoint: 'https://vod.cn-hangzhou.aliyuncs.com',
      apiVersion: '2017-03-21'
    });
  }

  // 获取上传地址和凭证
  async getUploadAuth(title, fileName) {
    const params = {
      Title: title,
      FileName: fileName
    };
    
    return await this.client.request('CreateUploadVideo', params);
  }

  // 获取播放地址
  async getPlayInfo(videoId) {
    const params = {
      VideoId: videoId
    };
    
    return await this.client.request('GetPlayInfo', params);
  }
}

module.exports = new VODService();