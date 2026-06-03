// models/db.js
require('dotenv').config();

const mysql = require('mysql2');

// MySQL 연결 풀 생성
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'mymarket',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

// Promise 방식으로 사용
const promisePool = pool.promise();

// DB 연결 확인 함수
async function testConnection() {
    try {
        const connection = await promisePool.getConnection();
        console.log('✅ MySQL 연결 준비 완료');
        connection.release();
    } catch (err) {
        console.error('❌ MySQL 연결 실패:', err.message);
        console.error('DB_HOST, DB_USER, DB_PASS, DB_NAME 값을 확인하세요.');
    }
}

// 서버 시작 시 DB 연결 상태 확인
testConnection();

module.exports = promisePool;