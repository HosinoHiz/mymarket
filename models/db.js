const mongoose = require('mongoose');

// 하드코딩된 주소 유지 (확실한 방법)
const MONGO_URI = "mongodb+srv://root:knutweb0506@cluster0.ye5gfbq.mongodb.net/mymarket?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 MongoDB Atlas 연결 대성공!!!'))
  .catch(err => console.error('🚨 MongoDB 연결 실패:', err));

module.exports = mongoose;