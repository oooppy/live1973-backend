module.exports = {
  apps: [{
    name: 'live1973-api',
    script: 'server.js',
    cwd: '/var/www/live1973/app/live1973-backend', // 指定工作目录
    instances: 2, // 2个实例
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/live1973/error.log',
    out_file: '/var/log/live1973/access.log',
    log_file: '/var/log/live1973/combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};
