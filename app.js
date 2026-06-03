const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRouter = require('./routes/auth');
const productRouter = require('./routes/products');
const indexRouter = require('./routes/index');

const app = express();

// 포트 및 서버 주소 설정
const PORT = process.env.PORT || 3000;

// 보고서와 시작 페이지에 넣을 실제 서버 주소
// 예: http://123.123.123.123:3000
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// 이미지 업로드 폴더가 없으면 자동 생성
const imageUploadPath = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imageUploadPath)) {
    fs.mkdirSync(imageUploadPath, { recursive: true });
}

// 보안상 Express 정보 노출 방지
app.disable('x-powered-by');

// 클라우드 또는 외부 접속 환경 대비
app.set('trust proxy', 1);

// 1. 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. 정적 파일 제공
// public 폴더 안의 css, js, images 등을 브라우저에서 접근 가능하게 함
app.use(express.static(path.join(__dirname, 'public')));

// 3. POST 요청 데이터 파싱 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. 세션 설정
// 로그인 상태 유지에 사용
app.use(session({
    name: 'mymarket.sid',
    secret: process.env.SESSION_SECRET || 'mymarket_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60, // 1시간
        httpOnly: true
    }
}));

// 5. 모든 EJS 화면에서 공통으로 사용할 값 설정
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.serverUrl = SERVER_URL;
    res.locals.currentPath = req.path;
    next();
});

// 6. 서버 상태 확인용 라우터
app.get('/health', (req, res) => {
    res.status(200).send('MyMarket server is running');
});


// 7. 라우터 연결
app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/products', productRouter);

// 8. 존재하지 않는 페이지 처리
app.use((req, res) => {
    res.status(404).send(`
        <script>
            alert('존재하지 않는 페이지입니다.');
            location.href = '/';
        </script>
    `);
});

// 9. 서버 내부 오류 처리
app.use((err, req, res, next) => {
    console.error('서버 오류:', err);

    res.status(500).send(`
        <script>
            alert('서버 오류가 발생했습니다. 관리자에게 문의하세요.');
            history.back();
        </script>
    `);
});

// 10. 서버 실행
// 0.0.0.0으로 열어야 같은 네트워크 또는 외부 IP 접속이 가능함
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
========================================
🚀 MyMarket 서버 가동 중
🔗 로컬 접속 주소: http://localhost:${PORT}
🌐 제출용 서버 주소: ${SERVER_URL}
📂 이미지 저장 경로: ${imageUploadPath}
========================================
    `);
});

//http://localhost:3000