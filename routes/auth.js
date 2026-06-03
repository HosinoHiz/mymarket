const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/login', (req, res) => { if (req.session.user) return res.redirect('/'); res.render('auth/login'); });

router.post('/login', async (req, res) => {
    try {
        let { userId, password } = req.body;
        const [rows] = await db.query('SELECT id, userId FROM users WHERE userId = ? AND password = ?', [userId, password]);
        if (rows.length === 0) return res.send("<script>alert('아이디 또는 비밀번호가 틀렸습니다.');history.back();</script>");
        req.session.user = { id: rows[0].id, userId: rows[0].userId };
        res.redirect('/');
    } catch (err) { res.status(500).send("로그인 오류"); }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => { res.clearCookie('mymarket.sid'); res.redirect('/'); });
});

router.get('/register', (req, res) => { if (req.session.user) return res.redirect('/'); res.render('auth/register'); });

router.post('/register', async (req, res) => {
    try {
        let { userId, password, confirmPassword } = req.body;
        if (!userId || !password) return res.send("<script>alert('모든 항목을 입력하세요.');history.back();</script>");
        if (password !== confirmPassword) return res.send("<script>alert('비밀번호가 일치하지 않습니다.');history.back();</script>");
        
        const [existing] = await db.query('SELECT id FROM users WHERE userId = ?', [userId]);
        if (existing.length > 0) return res.send("<script>alert('이미 사용 중인 아이디입니다.');history.back();</script>");

        // ⭐ 회원가입 시 기본금 1,000,000원 빵빵하게 지급!
        await db.query('INSERT INTO users (userId, password, balance) VALUES (?, ?, 1000000)', [userId, password]);
        res.send("<script>alert('회원가입 완료! 가입 축하금 100만 원이 지급되었습니다.');location.href='/auth/login';</script>");
    } catch (err) { res.status(500).send("회원가입 오류"); }
});

// ⭐ 내 정보 및 받은 흥정 내역 보기
router.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const userId = req.session.user.id;
        const [userRows] = await db.query('SELECT id, userId, balance FROM users WHERE id = ?', [userId]);
        
        // 내 물건에 들어온 '대기중인(pending)' 흥정 제안들 불러오기
        const [receivedBargains] = await db.query(`
            SELECT b.*, p.title, p.imagePath, u.userId AS buyerName
            FROM bargains b
            JOIN products p ON b.productId = p.id
            JOIN users u ON b.buyerId = u.id
            WHERE p.userId = ? AND b.status = 'pending' AND p.status != 'soldout'
            ORDER BY b.createdAt DESC
        `, [userId]);

        res.render('auth/profile', { profile: userRows[0], receivedBargains });
    } catch (err) { res.status(500).send("내 정보 오류"); }
});

router.get('/profile/edit', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const [rows] = await db.query('SELECT id, userId FROM users WHERE id = ?', [req.session.user.id]);
    res.render('auth/profileEdit', { profile: rows[0] });
});

router.post('/profile/edit', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const { userId, password, confirmPassword } = req.body;
    
    if (password && password !== confirmPassword) return res.send("<script>alert('비밀번호가 불일치합니다.');history.back();</script>");
    
    if(password) {
        await db.query('UPDATE users SET userId=?, password=? WHERE id=?', [userId, password, req.session.user.id]);
    } else {
        await db.query('UPDATE users SET userId=? WHERE id=?', [userId, req.session.user.id]);
    }
    req.session.user.userId = userId;
    res.send("<script>alert('수정 완료!');location.href='/auth/profile';</script>");
});

module.exports = router;