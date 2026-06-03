const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 업로드 폴더 경로
const uploadDir = path.join(__dirname, '..', 'public', 'images');

// public/images 폴더가 없으면 자동 생성
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 파일 저장 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const fileName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;

        cb(null, fileName);
    }
});

// 이미지 또는 txt 파일만 허용
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const isImage = file.mimetype.startsWith('image/');
    const isText = file.mimetype === 'text/plain' || ext === '.txt';

    if (isImage || isText) {
        cb(null, true);
    } else {
        cb(new Error('이미지 파일 또는 txt 파일만 업로드할 수 있습니다.'));
    }
};

// multer 설정
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 최대 5MB
    }
});

module.exports = upload;