const express = require('express');
const session = require('express-session');
const path = require('path');
const authRouter = require('./routes/auth');
const productRouter = require('./routes/products');
const indexRouter = require('./routes/index');
require('dotenv').config();

const app = express();

// 1. 템플릿 엔진 및 정적 폴더 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// 2. 데이터 파싱 미들웨어 (POST 요청 데이터 읽기용)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. 세션 설정 (로그인 유지를 위해 필수)
app.use(session({
    secret: 'mymarket_secret_key', // 암호화 키
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1시간 동안 유지
}));

// 4. 라우터 연결 (아까 에러 났던 부분 확인!)
app.use('/', indexRouter);           // 메인 페이지 관련
app.use('/auth', authRouter);        // 로그인, 로그아웃 관련
app.use('/products', productRouter); // 물품 등록, 수정, 삭제 관련

// 5. 서버 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    🚀 서버 가동 중!
    🔗 접속 주소: http://localhost:${PORT}
    📂 이미지 저장 경로: /public/images
    `);
});