require('dotenv').config();

const config = {
  development: {
    database: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'live1973_db',
      port: process.env.DB_PORT || 3306
    },
    aliyun: {
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      region: process.env.ALIYUN_REGION || 'cn-hangzhou'
    }
  },
  production: {
    database: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'live1973_db',
      port: process.env.DB_PORT || 3306,
      // 生产环境额外配置
      ssl: false,
      connectionLimit: 20,
      acquireTimeout: 60000,
      timeout: 60000
    },
    aliyun: {
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      region: process.env.ALIYUN_REGION || 'cn-hangzhou'
    }
  }
};

const env = process.env.NODE_ENV || 'development';
module.exports = config[env];