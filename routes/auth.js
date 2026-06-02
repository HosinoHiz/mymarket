const express = require('express');
const router = express.Router();
const User = require('../models/User');

// [로그인 페이지 렌더링]
router.get('/login', (req, res) => res.render('auth/login'));

// [로그인 처리]
router.post('/login', async (req, res) => {
    const { userId, password } = req.body;
    
    try {
        const user = await User.findOne({ userId, password });
        if (user) {
            req.session.user = { id: user._id.toString(), userId: user.userId };
            res.redirect('/');
        } else {
            res.send("<script>alert('아이디 또는 비밀번호가 틀렸습니다.'); history.back();</script>");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("로그인 중 오류 발생");
    }
});

// [로그아웃]
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// [회원가입 페이지 렌더링]
router.get('/register', (req, res) => res.render('auth/register'));

// [회원가입 처리]
router.post('/register', async (req, res) => {
    const { userId, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.send("<script>alert('비밀번호가 일치하지 않습니다.'); history.back();</script>");
    }

    try {
        const existingUser = await User.findOne({ userId });
        if (existingUser) {
            return res.send("<script>alert('이미 사용 중인 아이디입니다.'); history.back();</script>");
        }

        await User.create({ userId, password });
        res.send("<script>alert('회원가입이 완료되었습니다! 로그인해주세요.'); location.href='/auth/login';</script>");
    } catch (err) {
        console.error(err);
        res.status(500).send("회원가입 중 오류 발생");
    }
});

module.exports = router;