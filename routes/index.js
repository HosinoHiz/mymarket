const express = require('express');
const router = express.Router();
const db = require('../models/db');

// 1. 메인 페이지 (알림 목록 포함)
router.get('/', async (req, res) => {
    try {
        const user = req.session.user || null;
        let notifications = []; // 알림 배열

        // 전체 판매 물품 조회
        const [allProducts] = await db.query(`
            SELECT 
                p.*,
                u.userId AS ownerName
            FROM products p
            JOIN users u ON p.userId = u.id
            ORDER BY p.id DESC
        `);

        let friendProducts = [];

        // 로그인한 경우에만 친구의 최근 판매물품 및 안 읽은 알림 조회
        if (user) {
            const [rows] = await db.query(`
                SELECT 
                    p.*,
                    u.userId AS ownerName
                FROM products p
                JOIN users u ON p.userId = u.id
                WHERE p.userId IN (
                    SELECT friendId
                    FROM friends
                    WHERE userId = ?
                )
                ORDER BY p.id DESC
                LIMIT 3
            `, [user.id]);

            friendProducts = rows;

            // 안 읽은 알림 가져오기
            const [notiRows] = await db.query(
                'SELECT * FROM notifications WHERE userId = ? AND isRead = FALSE ORDER BY id DESC',
                [user.id]
            );
            notifications = notiRows;
        }

        res.render('main', {
            user,
            allProducts,
            friendProducts,
            notifications
        });

    } catch (err) {
        console.error('메인 페이지 오류:', err);
        res.status(500).send(`
            <script>
                alert('메인 페이지를 불러오는 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});

// 2. 알림 읽음(닫기) 처리
router.post('/notifications/clear', async (req, res) => {
    if (req.session.user) {
        await db.query('UPDATE notifications SET isRead = TRUE WHERE userId = ?', [req.session.user.id]);
    }
    res.redirect('back');
});

// 3. 내 알림 보관함 보기
router.get('/notifications', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.');location.href='/auth/login';</script>");
    try {
        const myId = req.session.user.id;
        
        // 내 모든 알림 가져오기 (최신순)
        const [notifications] = await db.query(
            'SELECT * FROM notifications WHERE userId = ? ORDER BY id DESC',
            [myId]
        );
        
        // 알림함에 들어오면 '안 읽음' 알림들을 모두 '읽음'으로 자동 처리
        await db.query('UPDATE notifications SET isRead = TRUE WHERE userId = ?', [myId]);

        res.render('notifications', { notifications });
    } catch (err) {
        console.error(err);
        res.status(500).send("알림 로드 오류");
    }
});

// 4. 친구 추가
router.get('/add-friend/:friendId', async (req, res) => {
    if (!req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.');location.href='/auth/login';</script>");
    }

    try {
        const userId = req.session.user.id;
        const friendId = Number(req.params.friendId);

        if (!friendId) return res.send("<script>alert('잘못된 사용자입니다.');history.back();</script>");
        if (userId === friendId) return res.send("<script>alert('자기 자신은 친구로 추가할 수 없습니다.');history.back();</script>");

        const [targetUsers] = await db.query('SELECT id, userId FROM users WHERE id = ?', [friendId]);
        if (targetUsers.length === 0) return res.send("<script>alert('존재하지 않는 사용자입니다.');history.back();</script>");

        const [existingFriends] = await db.query('SELECT * FROM friends WHERE userId = ? AND friendId = ?', [userId, friendId]);
        if (existingFriends.length > 0) return res.send("<script>alert('이미 친구로 추가된 사용자입니다.');history.back();</script>");

        await db.query('INSERT INTO friends (userId, friendId) VALUES (?, ?)', [userId, friendId]);

        res.send("<script>alert('친구 추가가 완료되었습니다.');location.href = '/';</script>");

    } catch (err) {
        console.error('친구 추가 오류:', err);
        res.status(500).send("<script>alert('친구 추가 중 오류가 발생했습니다.');history.back();</script>");
    }
});

// 5. 내 채팅 목록 보기
router.get('/chat', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.');location.href='/auth/login';</script>");
    try {
        const myId = req.session.user.id;
        
        // 나와 한 번이라도 메시지를 주고받은 적 있는 사용자 목록 가져오기
        const [chatUsers] = await db.query(`
            SELECT DISTINCT u.id, u.userId
            FROM users u
            JOIN messages m ON (u.id = m.senderId OR u.id = m.receiverId)
            WHERE (m.senderId = ? OR m.receiverId = ?) AND u.id != ?
        `, [myId, myId, myId]);

        res.render('chatList', { chatUsers });
    } catch (err) {
        console.error(err);
        res.status(500).send("채팅 목록 로드 오류");
    }
});

// 6. 특정 판매자와의 채팅방 보기
router.get('/chat/:sellerId', async (req, res) => {
    if (!req.session.user) return res.send("<script>alert('로그인이 필요합니다.');location.href='/auth/login';</script>");

    try {
        const myId = req.session.user.id;
        const sellerId = Number(req.params.sellerId);

        if (myId === sellerId) return res.send("<script>alert('자신과는 채팅할 수 없습니다.');history.back();</script>");

        const [sellers] = await db.query('SELECT id, userId FROM users WHERE id = ?', [sellerId]);
        if (sellers.length === 0) return res.send("<script>alert('존재하지 않는 사용자입니다.');history.back();</script>");

        const [messages] = await db.query(`
            SELECT m.*, u.userId as senderName
            FROM messages m
            JOIN users u ON m.senderId = u.id
            WHERE (m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?)
            ORDER BY m.createdAt ASC
        `, [myId, sellerId, sellerId, myId]);

        res.render('chat', { seller: sellers[0], messages, myId });

    } catch (err) {
        res.status(500).send("채팅방 로드 오류");
    }
});

// 7. 채팅 메시지 전송
router.post('/chat/:sellerId', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    
    try {
        const content = req.body.content;
        if (content && content.trim()) {
            await db.query(
                'INSERT INTO messages (senderId, receiverId, content) VALUES (?, ?, ?)', 
                [req.session.user.id, req.params.sellerId, content]
            );
        }
        res.redirect('/chat/' + req.params.sellerId);
    } catch (err) {
        res.status(500).send("메시지 전송 오류");
    }
});

module.exports = router;