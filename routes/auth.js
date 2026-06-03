const express = require('express');
const router = express.Router();
const db = require('../models/db');

// 로그인 페이지
router.get('/login', (req, res) => {
    // 이미 로그인한 사용자는 메인으로 이동
    if (req.session.user) {
        return res.redirect('/');
    }

    res.render('auth/login');
});

// 로그인 처리
router.post('/login', async (req, res) => {
    try {
        let { userId, password } = req.body;

        userId = String(userId || '').trim();
        password = String(password || '').trim();

        if (!userId || !password) {
            return res.send(`
                <script>
                    alert('아이디와 비밀번호를 모두 입력하세요.');
                    history.back();
                </script>
            `);
        }

        const [rows] = await db.query(
            `
            SELECT id, userId
            FROM users
            WHERE userId = ? AND password = ?
            `,
            [userId, password]
        );

        if (rows.length === 0) {
            return res.send(`
                <script>
                    alert('아이디 또는 비밀번호가 틀렸습니다.');
                    history.back();
                </script>
            `);
        }

        // 세션에 로그인 사용자 정보 저장
        req.session.user = {
            id: rows[0].id,
            userId: rows[0].userId
        };

        res.redirect('/');

    } catch (err) {
        console.error('로그인 오류:', err);

        res.status(500).send(`
            <script>
                alert('로그인 중 오류가 발생했습니다. DB 연결을 확인하세요.');
                history.back();
            </script>
        `);
    }
});

// 로그아웃
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('로그아웃 오류:', err);

            return res.send(`
                <script>
                    alert('로그아웃 중 오류가 발생했습니다.');
                    location.href = '/';
                </script>
            `);
        }

        res.clearCookie('mymarket.sid');
        res.redirect('/');
    });
});

// 회원가입 페이지
router.get('/register', (req, res) => {
    // 이미 로그인한 사용자는 메인으로 이동
    if (req.session.user) {
        return res.redirect('/');
    }

    res.render('auth/register');
});

// 회원가입 처리
router.post('/register', async (req, res) => {
    try {
        let { userId, password, confirmPassword } = req.body;

        userId = String(userId || '').trim();
        password = String(password || '').trim();
        confirmPassword = String(confirmPassword || '').trim();

        // 입력값 확인
        if (!userId || !password || !confirmPassword) {
            return res.send(`
                <script>
                    alert('모든 항목을 입력하세요.');
                    history.back();
                </script>
            `);
        }

        // 비밀번호 확인
        if (password !== confirmPassword) {
            return res.send(`
                <script>
                    alert('비밀번호가 일치하지 않습니다.');
                    history.back();
                </script>
            `);
        }

        // 아이디 중복 확인
        const [existingUser] = await db.query(
            `
            SELECT id
            FROM users
            WHERE userId = ?
            `,
            [userId]
        );

        if (existingUser.length > 0) {
            return res.send(`
                <script>
                    alert('이미 사용 중인 아이디입니다.');
                    history.back();
                </script>
            `);
        }

        // 사용자 등록
        await db.query(
            `
            INSERT INTO users (userId, password)
            VALUES (?, ?)
            `,
            [userId, password]
        );

        res.send(`
            <script>
                alert('회원가입이 완료되었습니다. 로그인해주세요.');
                location.href = '/auth/login';
            </script>
        `);

    } catch (err) {
        console.error('회원가입 오류:', err);

        res.status(500).send(`
            <script>
                alert('회원가입 중 오류가 발생했습니다. DB 연결 또는 users 테이블을 확인하세요.');
                history.back();
            </script>
        `);
    }
});
// 내 정보 보기 페이지
router.get('/profile', async (req, res) => {
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

        const [rows] = await db.query(
            `
            SELECT id, userId
            FROM users
            WHERE id = ?
            `,
            [userId]
        );

        if (rows.length === 0) {
            req.session.destroy();

            return res.send(`
                <script>
                    alert('사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
                    location.href = '/auth/login';
                </script>
            `);
        }

        res.render('auth/profile', {
            profile: rows[0]
        });

    } catch (err) {
        console.error('내 정보 보기 오류:', err);

        res.status(500).send(`
            <script>
                alert('내 정보를 불러오는 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});
// 내 정보 수정 페이지
router.get('/profile/edit', async (req, res) => {
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

        const [rows] = await db.query(
            `
            SELECT id, userId
            FROM users
            WHERE id = ?
            `,
            [userId]
        );

        if (rows.length === 0) {
            req.session.destroy();

            return res.send(`
                <script>
                    alert('사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
                    location.href = '/auth/login';
                </script>
            `);
        }

        res.render('auth/profileEdit', {
            profile: rows[0]
        });

    } catch (err) {
        console.error('정보수정 페이지 오류:', err);

        res.status(500).send(`
            <script>
                alert('정보수정 페이지를 불러오는 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});

// 내 정보 수정 처리
router.post('/profile/edit', async (req, res) => {
    if (!req.session.user) {
        return res.send(`
            <script>
                alert('로그인이 필요합니다.');
                location.href = '/auth/login';
            </script>
        `);
    }

    try {
        const loginUserId = req.session.user.id;

        let { userId, password, confirmPassword } = req.body;

        userId = String(userId || '').trim();
        password = String(password || '').trim();
        confirmPassword = String(confirmPassword || '').trim();

        if (!userId) {
            return res.send(`
                <script>
                    alert('아이디를 입력하세요.');
                    history.back();
                </script>
            `);
        }

        // 다른 사용자가 같은 아이디를 쓰고 있는지 확인
        const [existingUser] = await db.query(
            `
            SELECT id
            FROM users
            WHERE userId = ? AND id <> ?
            `,
            [userId, loginUserId]
        );

        if (existingUser.length > 0) {
            return res.send(`
                <script>
                    alert('이미 사용 중인 아이디입니다.');
                    history.back();
                </script>
            `);
        }

        // 비밀번호를 입력한 경우에만 변경
        if (password || confirmPassword) {
            if (password !== confirmPassword) {
                return res.send(`
                    <script>
                        alert('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
                        history.back();
                    </script>
                `);
            }

            await db.query(
                `
                UPDATE users
                SET userId = ?, password = ?
                WHERE id = ?
                `,
                [userId, password, loginUserId]
            );
        } else {
            // 비밀번호를 비워두면 아이디만 변경
            await db.query(
                `
                UPDATE users
                SET userId = ?
                WHERE id = ?
                `,
                [userId, loginUserId]
            );
        }

        // 세션 정보 갱신
        req.session.user.userId = userId;

        res.send(`
            <script>
                alert('회원정보가 수정되었습니다.');
                location.href = '/auth/profile';
            </script>
        `);

    } catch (err) {
        console.error('정보수정 처리 오류:', err);

        res.status(500).send(`
            <script>
                alert('회원정보 수정 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});
module.exports = router;