const express = require('express');
const router = express.Router();
const db = require('../models/db');
const upload = require('../middleware/multerConfig');
const fs = require('fs');
const path = require('path');

// 로그인 확인 미들웨어
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.');location.href = '/auth/login';</script>");
    }
    next();
}

function parsePrice(price) {
    const rawPrice = String(price || '').trim();
    if (rawPrice.includes('-')) return -1;
    const onlyNumber = rawPrice.replace(/[^\d]/g, '');
    if (!onlyNumber) return -1;
    const parsedPrice = Number(onlyNumber);
    if (!Number.isSafeInteger(parsedPrice)) return -1;
    return parsedPrice;
}

function isValidPrice(price) {
    return Number.isInteger(price) && price >= 0 && price <= 999999999;
}

function isTextFile(file) {
    if (!file) return false;
    const ext = path.extname(file.originalname).toLowerCase();
    return file.mimetype === 'text/plain' || ext === '.txt';
}

function isImageFile(file) {
    if (!file) return false;
    return file.mimetype && file.mimetype.startsWith('image/');
}

function readTextFile(file) {
    try { return fs.readFileSync(file.path, 'utf8'); } catch (err) { return ''; }
}

// 1. 상품 작성 페이지
router.get('/write', requireLogin, (req, res) => {
    res.render('products/write');
});

// 2. 상품 작성 처리 (지역 정보 추가)
router.post('/write', requireLogin, upload.single('document'), async (req, res) => {
    try {
        let { title, content, price, location } = req.body; // location 추가
        title = title || '';
        content = content || '';
        price = parsePrice(price);

        if (!isValidPrice(price)) {
            return res.send("<script>alert('가격은 0원 이상 999,999,999원 이하의 숫자로 입력하세요.');history.back();</script>");
        }

        let imagePath = null;

        if (req.file) {
            if (isTextFile(req.file)) {
                const fileContent = readTextFile(req.file);
                if (fileContent) content += `\n\n[첨부 문서 내용]\n${fileContent}`;
            } else if (isImageFile(req.file)) {
                imagePath = `/images/${req.file.filename}`;
            }
        }

        if (!title.trim()) {
            return res.send("<script>alert('상품 제목을 입력하세요.');history.back();</script>");
        }

        // INSERT 쿼리에 location과 기본 status('on_sale') 추가
        await db.query(
            'INSERT INTO products (title, content, price, location, imagePath, userId, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, content, price, location || '지역 정보 없음', imagePath, req.session.user.id, 'on_sale']
        );

        res.send("<script>alert('상품이 등록되었습니다.');location.href = '/';</script>");

    } catch (err) {
        console.error('상품 등록 오류:', err);
        res.status(500).send("<script>alert('상품 등록 중 오류가 발생했습니다.');history.back();</script>");
    }
});

// 3. 상품 상세보기 (조회수 증가 및 채팅수 집계 추가)
router.get('/detail/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const user = req.session.user || null;

        // 상세 페이지 접속 시 조회수(views) 1 증가
        await db.query('UPDATE products SET views = views + 1 WHERE id = ?', [productId]);

        // 상품 정보 조회: 작성자명(ownerName)과 해당 상품 관련 채팅수(chatCount)를 서브쿼리로 가져옴
        const [products] = await db.query(`
            SELECT 
                p.*, 
                u.userId AS ownerName,
                (SELECT COUNT(*) FROM messages m WHERE (m.senderId = u.id OR m.receiverId = u.id)) as chatCount
            FROM products p
            JOIN users u ON p.userId = u.id
            WHERE p.id = ?
        `, [productId]);

        if (products.length === 0) {
            return res.status(404).send("<script>alert('상품을 찾을 수 없습니다.');location.href = '/';</script>");
        }

        const product = products[0];
        let isFriend = false;

        if (user && user.id !== product.userId) {
            const [friendCheck] = await db.query(
                'SELECT * FROM friends WHERE userId = ? AND friendId = ?',
                [user.id, product.userId]
            );
            isFriend = friendCheck.length > 0;
        }

        res.render('products/detail', { product, user, isFriend });

    } catch (err) {
        console.error('상세 페이지 오류:', err);
        res.status(500).send("<script>alert('상세 페이지를 불러오는 중 오류가 발생했습니다.');location.href = '/';</script>");
    }
});

// 4. 상품 수정 페이지
router.get('/edit/:id', requireLogin, async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user.id;

        const [rows] = await db.query('SELECT * FROM products WHERE id = ? AND userId = ?', [productId, userId]);

        if (rows.length === 0) {
            return res.send("<script>alert('상품을 찾을 수 없거나 수정 권한이 없습니다.');history.back();</script>");
        }

        res.render('products/edit', { product: rows[0] });

    } catch (err) {
        console.error('수정 페이지 오류:', err);
        res.status(500).send("<script>alert('수정 페이지를 불러오는 중 오류가 발생했습니다.');history.back();</script>");
    }
});

// 5. 상품 수정 처리 (지역 정보 수정 반영)
router.post('/edit/:id', requireLogin, upload.single('document'), async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user.id;
        let { title, content, price, location } = req.body; // location 추가

        title = title || '';
        content = content || '';
        price = parsePrice(price);

        if (!isValidPrice(price)) {
            return res.send("<script>alert('가격은 0원 이상 999,999,999원 이하의 숫자로 입력하세요.');history.back();</script>");
        }

        if (!title.trim()) {
            return res.send("<script>alert('상품 제목을 입력하세요.');history.back();</script>");
        }

        const [products] = await db.query('SELECT * FROM products WHERE id = ? AND userId = ?', [productId, userId]);

        if (products.length === 0) {
            return res.send("<script>alert('상품을 찾을 수 없거나 수정 권한이 없습니다.');history.back();</script>");
        }

        let imagePath = products[0].imagePath;

        if (req.file) {
            if (isTextFile(req.file)) {
                const fileContent = readTextFile(req.file);
                if (fileContent) content += `\n\n[첨부 문서 내용]\n${fileContent}`;
            } else if (isImageFile(req.file)) {
                imagePath = `/images/${req.file.filename}`;
            }
        }

        const [result] = await db.query(
            'UPDATE products SET title = ?, content = ?, price = ?, location = ?, imagePath = ? WHERE id = ? AND userId = ?',
            [title, content, price, location, imagePath, productId, userId]
        );

        if (result.affectedRows === 0) {
            return res.send("<script>alert('수정 권한이 없습니다.');history.back();</script>");
        }

        res.send(`<script>alert('상품이 수정되었습니다.');location.href = '/products/detail/${productId}';</script>`);

    } catch (err) {
        console.error('상품 수정 오류:', err);
        res.status(500).send("<script>alert('상품 수정 중 오류가 발생했습니다.');history.back();</script>");
    }
});

// 6. 상품 삭제 처리
router.get('/delete/:id', requireLogin, async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user.id;

        const [result] = await db.query('DELETE FROM products WHERE id = ? AND userId = ?', [productId, userId]);

        if (result.affectedRows === 0) {
            return res.send("<script>alert('삭제 권한이 없거나 이미 삭제된 상품입니다.');history.back();</script>");
        }

        res.send("<script>alert('상품이 삭제되었습니다.');location.href = '/';</script>");

    } catch (err) {
        console.error('상품 삭제 오류:', err);
        res.status(500).send("<script>alert('상품 삭제 중 오류가 발생했습니다.');history.back();</script>");
    }
});

// 7. 판매 상태 직접 변경 처리 (판매자 전용 기능)
router.post('/edit-status/:id', requireLogin, async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user.id;
        const { status } = req.body; // 'on_sale', 'reserved', 'sold_out'

        const [result] = await db.query(
            'UPDATE products SET status = ? WHERE id = ? AND userId = ?',
            [status, productId, userId]
        );

        if (result.affectedRows === 0) {
            return res.send("<script>alert('권한이 없거나 상품을 찾을 수 없습니다.');history.back();</script>");
        }

        res.redirect(`/products/detail/${productId}`);
    } catch (err) {
        console.error('상태 변경 오류:', err);
        res.status(500).send("<script>alert('상태 변경 중 오류가 발생했습니다.');history.back();</script>");
    }
});

// 8. 기존 구매 예약 처리 (세분화된 상태값에 맞춰 업데이트)
router.get('/buy/:id', requireLogin, async (req, res) => {
    try {
        const productId = Number(req.params.id);
        const buyerId = req.session.user.id;

        if (!productId) return res.send("<script>alert('잘못된 상품입니다.');location.href = '/';</script>");

        const [products] = await db.query('SELECT id, title, userId, status FROM products WHERE id = ?', [productId]);
        if (products.length === 0) return res.send("<script>alert('상품을 찾을 수 없습니다.');location.href = '/';</script>");

        const product = products[0];

        if (product.userId === buyerId) {
            return res.send("<script>alert('본인이 등록한 상품은 예약할 수 없습니다.');history.back();</script>");
        }

        // '판매중' 상태인 경우에만 예약 가능하도록 변경
        if (product.status !== 'on_sale') {
            return res.send("<script>alert('예약 가능한 상태가 아닙니다.');history.back();</script>");
        }

        const [result] = await db.query(`
            UPDATE products
            SET status = 'reserved'
            WHERE id = ? AND userId <> ? AND status = 'on_sale'
        `, [productId, buyerId]);

        if (result.affectedRows === 0) {
            return res.send("<script>alert('이미 예약이 완료된 상품입니다.');history.back();</script>");
        }

        await db.query(
            'INSERT INTO notifications (userId, message) VALUES (?, ?)',
            [product.userId, `[${product.title}] 상품에 대한 구매 예약이 도착했습니다!`]
        );

        res.send("<script>alert('구매 예약이 완료되었습니다. 판매자에게 알림이 전송되었습니다.');location.href = '/';</script>");

    } catch (err) {
        console.error('구매 예약 처리 오류:', err);
        res.status(500).send("<script>alert('구매 예약 처리 중 오류가 발생했습니다.');history.back();</script>");
    }
});

module.exports = router;