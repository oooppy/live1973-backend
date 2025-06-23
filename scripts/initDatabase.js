const mysql = require('mysql2/promise');
require('dotenv').config();

// 数据库初始化脚本
async function initDatabase() {
  let connection;
  
  try {
    // 连接MySQL服务器（不指定数据库）
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });

    console.log('✅ 已连接到MySQL服务器');

    // 创建数据库
    const dbName = process.env.DB_NAME || 'live1973_db';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ 数据库 ${dbName} 创建成功`);

    // 选择数据库
    await connection.query(`USE \`${dbName}\``);

    // 创建视频表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        aliyun_video_id VARCHAR(100) NOT NULL UNIQUE,
        video_url VARCHAR(500) NOT NULL,
        thumbnail_url VARCHAR(500),
        duration INT DEFAULT 0,
        file_size BIGINT DEFAULT 0,
        resolution VARCHAR(20) DEFAULT '720p',
        view_count INT DEFAULT 0,
        like_count INT DEFAULT 0,
        status ENUM('active', 'inactive', 'processing') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ 视频表创建成功');

    // 创建索引
    try {
      await connection.query('CREATE INDEX idx_status ON videos(status)');
      await connection.query('CREATE INDEX idx_view_count ON videos(view_count DESC)');
      await connection.query('CREATE INDEX idx_created_at ON videos(created_at DESC)');
      console.log('✅ 视频表索引创建成功');
    } catch (error) {
      // 索引可能已存在，忽略错误
      console.log('📝 视频表索引已存在或创建失败（可忽略）');
    }

    // 创建播放记录表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS view_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        video_id INT NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        view_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        duration_watched INT DEFAULT 0,
        device_type VARCHAR(20)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ 播放记录表创建成功');

    // 创建播放记录表索引
    try {
      await connection.query('CREATE INDEX idx_video_id ON view_logs(video_id)');
      await connection.query('CREATE INDEX idx_view_time ON view_logs(view_time)');
      await connection.query('CREATE INDEX idx_ip ON view_logs(ip_address)');
      console.log('✅ 播放记录表索引创建成功');
    } catch (error) {
      console.log('📝 播放记录表索引已存在或创建失败（可忽略）');
    }

    // 添加外键约束（如果不存在）
    try {
      await connection.query(`
        ALTER TABLE view_logs 
        ADD CONSTRAINT fk_view_logs_video_id 
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      `);
      console.log('✅ 外键约束创建成功');
    } catch (error) {
      console.log('📝 外键约束已存在或创建失败（可忽略）');
    }

    // 插入示例数据
    await connection.query(`
      INSERT IGNORE INTO videos (title, description, aliyun_video_id, video_url, thumbnail_url, duration, view_count) VALUES
      (?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?)
    `, [
      '示例视频1', '这是第一个示例视频', 'aliyun_video_001', 'https://your-aliyun-domain.com/video1.mp4', 'https://your-aliyun-domain.com/thumb1.jpg', 300, 1250,
      '示例视频2', '这是第二个示例视频', 'aliyun_video_002', 'https://your-aliyun-domain.com/video2.mp4', 'https://your-aliyun-domain.com/thumb2.jpg', 480, 890,
      '示例视频3', '这是第三个示例视频', 'aliyun_video_003', 'https://your-aliyun-domain.com/video3.mp4', 'https://your-aliyun-domain.com/thumb3.jpg', 360, 2150,
      '示例视频4', '这是第四个示例视频', 'aliyun_video_004', 'https://your-aliyun-domain.com/video4.mp4', 'https://your-aliyun-domain.com/thumb4.jpg', 420, 670,
      '示例视频5', '这是第五个示例视频', 'aliyun_video_005', 'https://your-aliyun-domain.com/video5.mp4', 'https://your-aliyun-domain.com/thumb5.jpg', 390, 1580
    ]);
    console.log('✅ 示例数据插入成功');

    console.log('\n🎉 数据库初始化完成！');
    console.log('📊 数据库统计：');
    
    // 统计信息
    const [videoCount] = await connection.query('SELECT COUNT(*) as count FROM videos');
    console.log(`   - 视频数量: ${videoCount[0].count}`);

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;