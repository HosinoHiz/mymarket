const express = require('express');
const router = express.Router();
const db = require('../models/db');
const bcrypt = require('bcryptjs');

// 비밀번호 정규식 (영문, 숫자, 특수문자 포함 최소 6자)
const pwdRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?/-]).{6,}$/;

router.get('/login', (req, res) => { if (req.session.user) return res.redirect('/'); res.render('auth/login'); });

router.post('/login', async (req, res) => {
    try {
        let { userId, password } = req.body;
        const [rows] = await db.query('SELECT id, userId, password FROM users WHERE userId = ?', [userId]);
        if (rows.length === 0) return res.send("<script>alert('아이디 또는 비밀번호가 틀렸습니다.');history.back();</script>");

        const isMatch = await bcrypt.compare(password, rows[0].password).catch(() => false);
        let isValid = isMatch;
        if (!isValid && password === rows[0].password) isValid = true; 

        if (!isValid) return res.send("<script>alert('아이디 또는 비밀번호가 틀렸습니다.');history.back();</script>");

        req.session.user = { id: rows[0].id, userId: rows[0].userId };
        res.redirect('/');
    } catch (err) { res.status(500).send("로그인 오류"); }
});

router.get('/logout', (req, res) => { req.session.destroy(() => { res.clearCookie('mymarket.sid'); res.redirect('/'); }); });

router.get('/register', (req, res) => { if (req.session.user) return res.redirect('/'); res.render('auth/register'); });

router.post('/register', async (req, res) => {
    try {
        let { userId, password, confirmPassword } = req.body;
        if (!userId || !password) return res.send("<script>alert('모든 항목을 입력하세요.');history.back();</script>");
        if (password !== confirmPassword) return res.send("<script>alert('비밀번호가 일치하지 않습니다.');history.back();</script>");
        
        // 비밀번호 보안 검증
        if (!pwdRegex.test(password)) {
            return res.send("<script>alert('보안을 위해 비밀번호는 영문, 숫자, 특수문자를 모두 포함하여 6자 이상으로 만들어주세요.');history.back();</script>");
        }
        
        const [existing] = await db.query('SELECT id FROM users WHERE userId = ?', [userId]);
        if (existing.length > 0) return res.send("<script>alert('이미 사용 중인 아이디입니다.');history.back();</script>");

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (userId, password, balance) VALUES (?, ?, 1000000)', [userId, hashedPassword]);
        res.send("<script>alert('가입 완료! (축하금 100만 원 지급)');location.href='/auth/login';</script>");
    } catch (err) { res.status(500).send("회원가입 오류"); }
});

router.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const userId = req.session.user.id;
        const [userRows] = await db.query('SELECT id, userId, balance FROM users WHERE id = ?', [userId]);
        const [receivedBargains] = await db.query(`
            SELECT b.*, p.title, p.imagePath, u.userId AS buyerName FROM bargains b JOIN products p ON b.productId = p.id JOIN users u ON b.buyerId = u.id
            WHERE p.userId = ? AND b.status = 'pending' AND p.status != 'soldout' ORDER BY b.createdAt DESC
        `, [userId]);
        
        // 내가 산 물건 목록 가져오기
        const [purchasedProducts] = await db.query('SELECT * FROM products WHERE buyerId = ? ORDER BY id DESC', [userId]);

        res.render('auth/profile', { profile: userRows[0], receivedBargains, purchasedProducts });
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
        if (!pwdRegex.test(password)) return res.send("<script>alert('비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.');history.back();</script>");
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('UPDATE users SET userId=?, password=? WHERE id=?', [userId, hashedPassword, req.session.user.id]);
    } else {
        await db.query('UPDATE users SET userId=? WHERE id=?', [userId, req.session.user.id]);
    }
    req.session.user.userId = userId;
    res.send("<script>alert('수정 완료!');location.href='/auth/profile';</script>");
});
// 돈 송금 기능 라우터
router.post('/transfer', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const { targetUserId, amount } = req.body;
        const sendAmount = Number(amount);
        const myId = req.session.user.id;

        if (sendAmount <= 0) return res.send("<script>alert('올바른 금액을 입력하세요.');history.back();</script>");
        
        const [myRows] = await db.query('SELECT balance FROM users WHERE id = ?', [myId]);
        if (myRows[0].balance < sendAmount) return res.send("<script>alert('잔액이 부족합니다.');history.back();</script>");

        const [targetRows] = await db.query('SELECT id FROM users WHERE userId = ?', [targetUserId]);
        if (targetRows.length === 0) return res.send("<script>alert('존재하지 않는 사용자입니다.');history.back();</script>");
        if (targetRows[0].id === myId) return res.send("<script>alert('자신에게 송금할 수 없습니다.');history.back();</script>");

        const targetId = targetRows[0].id;
        
        // 내 돈 빼고, 상대방 돈 늘리기
        await db.query('UPDATE users SET balance = balance - ? WHERE id = ?', [sendAmount, myId]);
        await db.query('UPDATE users SET balance = balance + ? WHERE id = ?', [sendAmount, targetId]);
        
        // 상대방에게 입금 알림 전송
        await db.query('INSERT INTO notifications (userId, message) VALUES (?, ?)', [targetId, `💸 [${req.session.user.userId}]님으로부터 ${sendAmount.toLocaleString()}원이 입금되었습니다!`]);

        res.send(`<script>alert('${targetUserId}님에게 성공적으로 송금했습니다!');location.href='/auth/profile';</script>`);
    } catch (err) { res.status(500).send("송금 오류"); }
});

// 회원 탈퇴 처리 API
router.get('/delete', async (req, res) => {
    // 1. 로그인 상태인지 확인
    if (!req.session.user) {
        return res.send("<script>alert('로그인 상태에서만 탈퇴가 가능합니다.'); location.href='/auth/login';</script>");
    }

    try {
        const userId = req.session.user.id;

        // 2. DB에서 유저 삭제 
        // (미리 설정해둔 ON DELETE CASCADE 덕분에 관련된 상품, 채팅, 친구, 장바구니 내역까지 깔끔하게 자동 삭제됩니다!)
        await db.query('DELETE FROM users WHERE id = ?', [userId]);

        // 3. 세션 파기 (로그아웃 처리)
        req.session.destroy((err) => {
            if (err) console.error('세션 파기 오류:', err);
            res.send("<script>alert('회원 탈퇴가 정상적으로 완료되었습니다. 그동안 한국교통대학교장터를 이용해주셔서 감사합니다! 🎓'); location.href='/';</script>");
        });
    } catch (err) {
        console.error('회원 탈퇴 오류:', err);
        res.status(500).send("<script>alert('회원 탈퇴 처리 중 오류가 발생했습니다. 관리자에게 문의해주세요.'); history.back();</script>");
    }
});

module.exports = router;