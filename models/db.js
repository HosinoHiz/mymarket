const mongoose = require('mongoose');
require('dotenv').config();

// .env 파일에 저장한 세팅 주소로 연결
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://root:1234@cluster0.ye5gfbq.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('🍃 MongoDB 연결 성공!'))
  .catch(err => console.error('MongoDB 연결 실패:', err));

module.exports = mongoose;