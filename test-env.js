// test-env.js - 测试环境变量是否正确加载
require('dotenv').config();

console.log('🔧 环境变量测试');
console.log('================');

console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ 已设置' : '❌ 未设置');
console.log('ALIYUN_ACCESS_KEY_ID:', process.env.ALIYUN_ACCESS_KEY_ID ? '✅ 已设置' : '❌ 未设置');
console.log('ALIYUN_ACCESS_KEY_SECRET:', process.env.ALIYUN_ACCESS_KEY_SECRET ? '✅ 已设置' : '❌ 未设置');
console.log('ALIYUN_REGION:', process.env.ALIYUN_REGION || '❌ 未设置');

console.log('\n🔍 详细信息:');
console.log('ACCESS_KEY_ID 长度:', process.env.ALIYUN_ACCESS_KEY_ID?.length || 0);
console.log('ACCESS_KEY_SECRET 长度:', process.env.ALIYUN_ACCESS_KEY_SECRET?.length || 0);

// 检查是否有空白字符
if (process.env.ALIYUN_ACCESS_KEY_ID) {
  const id = process.env.ALIYUN_ACCESS_KEY_ID;
  console.log('ACCESS_KEY_ID 是否有空白:', id !== id.trim());
  console.log('ACCESS_KEY_ID 前3位:', id.substring(0, 3));
}

if (process.env.ALIYUN_ACCESS_KEY_SECRET) {
  const secret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  console.log('ACCESS_KEY_SECRET 是否有空白:', secret !== secret.trim());
  console.log('ACCESS_KEY_SECRET 前3位:', secret.substring(0, 3));
}