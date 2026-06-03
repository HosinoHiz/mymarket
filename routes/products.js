const express = require('express');
const router = express.Router();
const db = require('../models/db');
const upload = require('../middleware/multerConfig');
const fs = require('fs');
const path = require('path');

function requireLogin(req, res, next) {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.');location.href='/auth/login';</script>");
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

function isValidPrice(price) { return Number.isInteger(price) && price >= 0 && price <= 999999999; }
function isTextFile(file) { return file && (path.extname(file.originalname).toLowerCase() === '.txt' || file.mimetype === 'text/plain'); }
function isImageFile(file) { return file && file.mimetype && file.mimetype.startsWith('image/'); }
function readTextFile(file) { try { return fs.readFileSync(file.path, 'utf8'); } catch (err) { return ''; } }

router.get('/write', requireLogin, (req, res) => { res.render('products/write'); });

// ⭐ 수정된 상품 작성 처리 로직 (routes/products.js 내부)
router.post('/write', requireLogin, upload.single('document'), async (req, res) => {
    try {
        let { title, content, price } = req.body;
        title = title || ''; content = content || ''; price = parsePrice(price);
        
        if (!isValidPrice(price)) return res.send("<script>alert('가격은 0원 이상 999,999,999원 이하로 입력하세요.');history.back();</script>");

        // ⭐ 1. 이미지 필수 검사 로직 추가
        if (!req.file || !isImageFile(req.file)) {
            return res.send("<script>alert('상품 이미지는 필수입니다! 반드시 사진을 업로드해주세요.');history.back();</script>");
        }

        let imagePath = `/images/${req.file.filename}`;

        if (!title.trim()) return res.send("<script>alert('상품 제목을 입력하세요.');history.back();</script>");

        await db.query('INSERT INTO products (title, content, price, imagePath, userId) VALUES (?, ?, ?, ?, ?)', [title, content, price, imagePath, req.session.user.id]);
        
        res.send("<script>alert('상품이 등록되었습니다.');location.href='/';</script>");
    } catch (err) { 
        res.status(500).send("상품 등록 오류"); 
    }
});

router.get('/detail/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const user = req.session.user || null;
        
        // 조회수 1 증가
        await db.query('UPDATE products SET views = views + 1 WHERE id = ?', [productId]);

        const [products] = await db.query('SELECT p.*, u.userId AS ownerName FROM products p JOIN users u ON p.userId = u.id WHERE p.id = ?', [productId]);
        if (products.length === 0) return res.status(404).send("<script>alert('상품을 찾을 수 없습니다.');location.href='/';</script>");

        let isFriend = false;
        if (user && user.id !== products[0].userId) {
            const [friendCheck] = await db.query('SELECT * FROM friends WHERE userId = ? AND friendId = ?', [user.id, products[0].userId]);
            isFriend = friendCheck.length > 0;
        }
        res.render('products/detail', { product: products[0], user, isFriend });
    } catch (err) { res.status(500).send("상세 페이지 오류"); }
});

router.get('/edit/:id', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM products WHERE id = ? AND userId = ?', [req.params.id, req.session.user.id]);
        if (rows.length === 0) return res.send("<script>alert('권한이 없습니다.');history.back();</script>");
        res.render('products/edit', { product: rows[0] });
    } catch (err) { res.status(500).send("수정 페이지 오류"); }
});

router.post('/edit/:id', requireLogin, upload.single('document'), async (req, res) => {
    try {
        let { title, content, price } = req.body;
        price = parsePrice(price);
        if (!isValidPrice(price)) return res.send("<script>alert('올바른 가격을 입력하세요.');history.back();</script>");

        const [products] = await db.query('SELECT * FROM products WHERE id = ? AND userId = ?', [req.params.id, req.session.user.id]);
        if (products.length === 0) return res.send("<script>alert('수정 권한이 없습니다.');history.back();</script>");

        let imagePath = products[0].imagePath;
        if (req.file) {
            if (isTextFile(req.file)) content += `\n\n[첨부 문서]\n${readTextFile(req.file)}`;
            else if (isImageFile(req.file)) imagePath = `/images/${req.file.filename}`;
        }

        await db.query('UPDATE products SET title=?, content=?, price=?, imagePath=? WHERE id=? AND userId=?', [title, content, price, imagePath, req.params.id, req.session.user.id]);
        res.send(`<script>alert('수정되었습니다.');location.href='/products/detail/${req.params.id}';</script>`);
    } catch (err) { res.status(500).send("수정 오류"); }
});

router.get('/delete/:id', requireLogin, async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM products WHERE id = ? AND userId = ?', [req.params.id, req.session.user.id]);
        if (result.affectedRows === 0) return res.send("<script>alert('삭제 권한이 없습니다.');history.back();</script>");
        res.send("<script>alert('삭제되었습니다.');location.href='/';</script>");
    } catch (err) { res.status(500).send("삭제 오류"); }
});

// ⭐ 1. 정가 즉시 구매 처리 (돈 차감 및 입금 기능 포함)
router.get('/buy/:id', requireLogin, async (req, res) => {
    try {
        const productId = Number(req.params.id);
        const buyerId = req.session.user.id;

        const [products] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) return res.send("<script>alert('상품이 없습니다.');location.href='/';</script>");
        const product = products[0];

        if (product.userId === buyerId) return res.send("<script>alert('내 상품은 구매할 수 없습니다.');history.back();</script>");
        if (product.status === 'soldout') return res.send("<script>alert('이미 판매된 상품입니다.');history.back();</script>");

        // 구매자 잔액 확인
        const [buyerRows] = await db.query('SELECT balance FROM users WHERE id = ?', [buyerId]);
        if (buyerRows[0].balance < product.price) return res.send("<script>alert('잔액이 부족합니다. 돈을 더 모아오세요!');history.back();</script>");

        // 중복 방지: 업데이트가 성공한 사람만 1명이 되도록 처리
        const [result] = await db.query("UPDATE products SET status='soldout' WHERE id=? AND status<>'soldout'", [productId]);
        if (result.affectedRows === 0) return res.send("<script>alert('이미 판매되었습니다.');history.back();</script>");

        // 잔액 이동 (구매자 돈 빼고, 판매자 돈 추가)
        await db.query('UPDATE users SET balance = balance - ? WHERE id = ?', [product.price, buyerId]);
        await db.query('UPDATE users SET balance = balance + ? WHERE id = ?', [product.price, product.userId]);

        // 알림 전송
        await db.query('INSERT INTO notifications (userId, message) VALUES (?, ?)', 
            [product.userId, `[${product.title}] 상품이 정가(${product.price}원)에 결제 완료되었습니다!`]);

        res.send("<script>alert('결제가 완료되었습니다!');location.href='/';</script>");
    } catch (err) { res.status(500).send("구매 오류"); }
});

// ⭐ 2. 흥정 제안하기 (POST)
router.post('/bargain/:id', requireLogin, async (req, res) => {
    try {
        const productId = req.params.id;
        const buyerId = req.session.user.id;
        const offerPrice = Number(req.body.offerPrice);

        const [products] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (products.length === 0) return res.send("<script>alert('상품을 찾을 수 없습니다.');history.back();</script>");
        const product = products[0];

        if (product.userId === buyerId) return res.send("<script>alert('내 상품에는 흥정할 수 없습니다.');history.back();</script>");
        if (product.status === 'soldout') return res.send("<script>alert('이미 판매된 상품입니다.');history.back();</script>");
        if (offerPrice >= product.price) return res.send("<script>alert('원가보다 낮은 가격을 제시해주세요!');history.back();</script>");

        // 구매자 잔액이 흥정가보다 적으면 애초에 흥정 불가
        const [buyerRows] = await db.query('SELECT balance FROM users WHERE id = ?', [buyerId]);
        if (buyerRows[0].balance < offerPrice) return res.send("<script>alert('보유 잔액이 제시하신 흥정가보다 적습니다.');history.back();</script>");

        const [existing] = await db.query("SELECT * FROM bargains WHERE productId=? AND buyerId=? AND status='pending'", [productId, buyerId]);
        if (existing.length > 0) return res.send("<script>alert('이미 흥정을 제안했습니다. 답변을 기다려주세요.');history.back();</script>");

        await db.query("INSERT INTO bargains (productId, buyerId, offerPrice) VALUES (?, ?, ?)", [productId, buyerId, offerPrice]);
        await db.query("INSERT INTO notifications (userId, message) VALUES (?, ?)", [product.userId, `[${product.title}] 상품에 ${offerPrice}원으로 흥정 요청이 왔습니다! (내 정보에서 확인)`]);

        res.send("<script>alert('흥정을 제안했습니다! 판매자가 수락하면 즉시 결제됩니다.');history.back();</script>");
    } catch(err) { res.status(500).send("흥정 제안 오류"); }
});

// ⭐ 3. 판매자가 흥정 수락하기 (즉시 거래 성사)
router.get('/bargain/accept/:id', requireLogin, async (req, res) => {
    try {
        const bargainId = req.params.id;
        const sellerId = req.session.user.id;

        const [bargains] = await db.query(`
            SELECT b.*, p.title, p.userId AS sellerId, p.status AS productStatus
            FROM bargains b JOIN products p ON b.productId = p.id WHERE b.id = ?
        `, [bargainId]);

        if (bargains.length === 0) return res.send("<script>alert('존재하지 않는 제안입니다.');history.back();</script>");
        const bargain = bargains[0];

        if (bargain.sellerId !== sellerId) return res.send("<script>alert('권한이 없습니다.');history.back();</script>");
        if (bargain.productStatus === 'soldout') return res.send("<script>alert('이미 판매된 상품입니다.');history.back();</script>");
        if (bargain.status !== 'pending') return res.send("<script>alert('이미 처리된 제안입니다.');history.back();</script>");

        // 수락 시점 구매자 잔액 재확인
        const [buyerRows] = await db.query('SELECT balance FROM users WHERE id = ?', [bargain.buyerId]);
        if (buyerRows[0].balance < bargain.offerPrice) return res.send("<script>alert('그새 구매자의 잔액이 부족해져 거래할 수 없습니다.');history.back();</script>");

        // 상품 판매완료 처리
        const [updateResult] = await db.query("UPDATE products SET status='soldout' WHERE id=? AND status<>'soldout'", [bargain.productId]);
        if (updateResult.affectedRows === 0) return res.send("<script>alert('오류가 발생했습니다.');history.back();</script>");

        // 잔액 이동 (흥정 가격으로 결제)
        await db.query('UPDATE users SET balance = balance - ? WHERE id = ?', [bargain.offerPrice, bargain.buyerId]);
        await db.query('UPDATE users SET balance = balance + ? WHERE id = ?', [bargain.offerPrice, sellerId]);

        // 현재 흥정은 수락, 나머지 동일 상품 흥정은 모두 거절 처리
        await db.query("UPDATE bargains SET status='accepted' WHERE id=?", [bargainId]);
        await db.query("UPDATE bargains SET status='rejected' WHERE productId=? AND id<>?", [bargain.productId, bargainId]);

        await db.query('INSERT INTO notifications (userId, message) VALUES (?, ?)', 
            [bargain.buyerId, `🎉 [${bargain.title}] 흥정이 수락되어 ${bargain.offerPrice}원에 결제 및 구매 완료되었습니다!`]);

        res.send("<script>alert('흥정을 수락하여 성공적으로 거래가 체결되었습니다!');location.href='/auth/profile';</script>");
    } catch(err) { res.status(500).send("흥정 수락 오류"); }
});

// ⭐ 4. 판매자가 흥정 거절하기
router.get('/bargain/reject/:id', requireLogin, async (req, res) => {
    try {
        const [bargains] = await db.query('SELECT b.*, p.userId AS sellerId, p.title FROM bargains b JOIN products p ON b.productId = p.id WHERE b.id = ?', [req.params.id]);
        if (bargains.length > 0 && bargains[0].sellerId === req.session.user.id) {
            await db.query("UPDATE bargains SET status='rejected' WHERE id=?", [req.params.id]);
            await db.query('INSERT INTO notifications (userId, message) VALUES (?, ?)', [bargains[0].buyerId, `❌ [${bargains[0].title}] 판매자가 흥정 제안을 거절했습니다.`]);
        }
        res.redirect('/auth/profile');
    } catch(err) { res.status(500).send("거절 오류"); }
});

module.exports = router;