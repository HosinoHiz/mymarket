const express = require('express');
const router = express.Router();
const db = require('../models/db');

// ⭐ 1. 메인 페이지 (친구 물건 최상단 정렬 로직 추가)
router.get('/', async (req, res) => {
    try {
        let allProducts = [];
        if (req.session.user) {
            // 로그인 시: 내 친구가 올린 물건인지 확인(isFriendProduct)하여 먼저 정렬하고, 그다음 최신순 정렬
            const [products] = await db.query(`
                SELECT p.*, u.userId AS ownerName,
                       IF(f.friendId IS NOT NULL, 1, 0) AS isFriendProduct
                FROM products p
                JOIN users u ON p.userId = u.id
                LEFT JOIN friends f ON p.userId = f.friendId AND f.userId = ?
                ORDER BY isFriendProduct DESC, p.id DESC
            `, [req.session.user.id]);
            allProducts = products;
        } else {
            // 비로그인 시: 일반 최신순 정렬
            const [products] = await db.query('SELECT p.*, u.userId AS ownerName FROM products p JOIN users u ON p.userId = u.id ORDER BY p.id DESC');
            allProducts = products;
        }
        res.render('main', { 
            user: req.session.user, 
            userBalance: req.session.user ? req.session.user.balance : 0,
            allProducts 
        });
    } catch (err) { res.status(500).send("메인 페이지 오류"); }
});

// ⭐ 2. 친구 추가 기능 (중복 방지 로직 추가)
router.get('/add-friend/:id', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.');location.href='/auth/login';</script>");
    try {
        const myId = req.session.user.id;
        const targetId = req.params.id;
        
        if (myId == targetId) return res.send("<script>alert('자기 자신은 친구로 추가할 수 없습니다.');history.back();</script>");
        
        // 이미 친구인지 DB에서 검사
        const [existing] = await db.query('SELECT * FROM friends WHERE userId = ? AND friendId = ?', [myId, targetId]);
        if (existing.length > 0) return res.send("<script>alert('이미 친구로 등록된 학우입니다!');history.back();</script>");
        
        await db.query('INSERT INTO friends (userId, friendId) VALUES (?, ?)', [myId, targetId]);
        res.send("<script>alert('친구 추가 완료! 이제 이 학우의 물건이 메인 화면 최상단에 먼저 보입니다.');history.back();</script>");
    } catch(err) { res.status(500).send("친구 추가 오류"); }
});

router.post('/notifications/clear', async (req, res) => {
    if (req.session.user) await db.query('UPDATE notifications SET isRead = TRUE WHERE userId = ?', [req.session.user.id]);
    res.redirect('back');
});

router.get('/notifications', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const [notifications] = await db.query('SELECT * FROM notifications WHERE userId = ? ORDER BY id DESC', [req.session.user.id]);
    await db.query('UPDATE notifications SET isRead = TRUE WHERE userId = ?', [req.session.user.id]);
    res.render('notifications', { notifications });
});

router.get('/add-friend/:friendId', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const userId = req.session.user.id; const friendId = Number(req.params.friendId);
        if (userId === friendId) return res.send("<script>alert('나 자신은 친구불가');history.back();</script>");
        await db.query('INSERT INTO friends (userId, friendId) VALUES (?, ?)', [userId, friendId]);
        res.send("<script>alert('친구 추가 완료!');location.href = '/';</script>");
    } catch (err) { res.status(500).send("친구 추가 오류"); }
});

router.get('/chat', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const [chatUsers] = await db.query(`SELECT DISTINCT u.id, u.userId FROM users u JOIN messages m ON (u.id = m.senderId OR u.id = m.receiverId) WHERE (m.senderId = ? OR m.receiverId = ?) AND u.id != ?`, [req.session.user.id, req.session.user.id, req.session.user.id]);
    res.render('chatList', { chatUsers });
});

router.get('/chat/:sellerId', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const sellerId = Number(req.params.sellerId);
    if (req.session.user.id === sellerId) return res.send("<script>alert('자신과는 불가');history.back();</script>");
    const [sellers] = await db.query('SELECT id, userId FROM users WHERE id = ?', [sellerId]);
    const [messages] = await db.query(`SELECT m.*, u.userId as senderName FROM messages m JOIN users u ON m.senderId = u.id WHERE (m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?) ORDER BY m.createdAt ASC`, [req.session.user.id, sellerId, sellerId, req.session.user.id]);
    res.render('chat', { seller: sellers[0], messages, myId: req.session.user.id });
});

router.post('/chat/:sellerId', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const content = req.body.content; const receiverId = req.params.sellerId; const senderId = req.session.user.id; const senderName = req.session.user.userId;
        if (content && content.trim()) {
            await db.query('INSERT INTO messages (senderId, receiverId, content) VALUES (?, ?, ?)', [senderId, receiverId, content]);
            const notiMessage = `💬 [${senderName}]님으로부터 새 메시지가 도착했습니다!`;
            const [existNoti] = await db.query('SELECT id FROM notifications WHERE userId = ? AND message = ? AND isRead = FALSE', [receiverId, notiMessage]);
            if (existNoti.length === 0) await db.query('INSERT INTO notifications (userId, message) VALUES (?, ?)', [receiverId, notiMessage]);
        }
        res.redirect('/chat/' + receiverId);
    } catch (err) { res.status(500).send("메시지 전송 오류"); }
});

// ⭐ 장바구니 보기 페이지
router.get('/cart', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const [cartItems] = await db.query(`
            SELECT c.id AS cartId, p.*, u.userId AS ownerName
            FROM cart c JOIN products p ON c.productId = p.id JOIN users u ON p.userId = u.id
            WHERE c.userId = ? ORDER BY c.createdAt DESC
        `, [req.session.user.id]);
        res.render('cart', { cartItems });
    } catch(err) { res.status(500).send("장바구니 조회 오류"); }
});

// ⭐ 장바구니에서 삭제
router.get('/cart/remove/:cartId', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    await db.query('DELETE FROM cart WHERE id = ? AND userId = ?', [req.params.cartId, req.session.user.id]);
    res.redirect('/cart');
});

// ⭐ 알림 자동 리프레쉬를 위한 안 읽은 알림 개수 확인 API
router.get('/api/noti-check', async (req, res) => {
    if (!req.session.user) return res.json({ count: 0 });
    try {
        const [rows] = await db.query('SELECT COUNT(*) as cnt FROM notifications WHERE userId = ? AND isRead = FALSE', [req.session.user.id]);
        res.json({ count: rows[0].cnt });
    } catch(err) { res.json({ count: 0 }); }
});

// ⭐ 내 친구 목록 불러오기 API (가로 스크롤 UI용)
router.get('/api/friends', async (req, res) => {
    if (!req.session.user) return res.json([]);
    try {
        const [rows] = await db.query('SELECT u.id, u.userId FROM friends f JOIN users u ON f.friendId = u.id WHERE f.userId = ?', [req.session.user.id]);
        res.json(rows);
    } catch(err) { res.json([]); }
});
module.exports = router;