function validateEnv() {
  const required = [
    'DB_PASSWORD',
    'ALIYUN_ACCESS_KEY_ID', 
    'ALIYUN_ACCESS_KEY_SECRET',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ 缺少必要的环境变量:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n请检查 .env 文件配置');
    process.exit(1);
  }
  
  console.log('✅ 环境变量验证通过');
}

module.exports = validateEnv;