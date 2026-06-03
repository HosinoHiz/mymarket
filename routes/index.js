// routes/index.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

// 메인 페이지
router.get('/', async (req, res) => {
    try {
        const user = req.session.user || null;

        // 전체 판매 물품 조회
        // 다른 사용자들이 올린 판매물품도 모두 볼 수 있도록 함
        const [allProducts] = await db.query(`
            SELECT 
                p.*,
                u.userId AS ownerName
            FROM products p
            JOIN users u ON p.userId = u.id
            ORDER BY p.id DESC
        `);

        let friendProducts = [];

        // 로그인한 경우에만 친구의 최근 판매물품 3개 조회
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
        }

        res.render('main', {
            user,
            allProducts,
            friendProducts
        });

    } catch (err) {
        console.error('메인 페이지 오류:', err);

        res.status(500).send(`
            <script>
                alert('메인 페이지를 불러오는 중 오류가 발생했습니다. DB 연결과 테이블을 확인하세요.');
                history.back();
            </script>
        `);
    }
});

// 친구 추가
router.get('/add-friend/:friendId', async (req, res) => {
    if (!req.session.user) {
        return res.send(`
            <script>
                alert('로그인이 필요합니다.');
                location.href = '/auth/login';
            </script>
        `);
    }

    try {
        const userId = req.session.user.id;
        const friendId = Number(req.params.friendId);

        // 잘못된 사용자 번호 방지
        if (!friendId) {
            return res.send(`
                <script>
                    alert('잘못된 사용자입니다.');
                    history.back();
                </script>
            `);
        }

        // 자기 자신 친구 추가 방지
        if (userId === friendId) {
            return res.send(`
                <script>
                    alert('자기 자신은 친구로 추가할 수 없습니다.');
                    history.back();
                </script>
            `);
        }

        // 친구로 추가하려는 사용자가 실제 존재하는지 확인
        const [targetUsers] = await db.query(
            'SELECT id, userId FROM users WHERE id = ?',
            [friendId]
        );

        if (targetUsers.length === 0) {
            return res.send(`
                <script>
                    alert('존재하지 않는 사용자입니다.');
                    history.back();
                </script>
            `);
        }

        // 이미 친구인지 확인
        const [existingFriends] = await db.query(
            'SELECT * FROM friends WHERE userId = ? AND friendId = ?',
            [userId, friendId]
        );

        if (existingFriends.length > 0) {
            return res.send(`
                <script>
                    alert('이미 친구로 추가된 사용자입니다.');
                    history.back();
                </script>
            `);
        }

        // 친구 추가
        await db.query(
            'INSERT INTO friends (userId, friendId) VALUES (?, ?)',
            [userId, friendId]
        );

        res.send(`
            <script>
                alert('친구 추가가 완료되었습니다.');
                location.href = '/';
            </script>
        `);

    } catch (err) {
        console.error('친구 추가 오류:', err);

        res.status(500).send(`
            <script>
                alert('친구 추가 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});

module.exports = router;