const express = require('express');
const router = express.Router();
const db = require('../models/db');
const upload = require('../middleware/multerConfig');
const fs = require('fs');
const path = require('path');

// 로그인 확인 미들웨어
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.send(`
            <script>
                alert('로그인이 필요합니다.');
                location.href = '/auth/login';
            </script>
        `);
    }
    next();
}

function parsePrice(price) {
    const rawPrice = String(price || '').trim();

    // 음수 입력 방지
    if (rawPrice.includes('-')) {
        return -1;
    }

    // 숫자가 아닌 값 제거
    const onlyNumber = rawPrice.replace(/[^\d]/g, '');

    if (!onlyNumber) {
        return -1;
    }

    const parsedPrice = Number(onlyNumber);

    // 오버플로우, 비정상 숫자 방지
    if (!Number.isSafeInteger(parsedPrice)) {
        return -1;
    }

    return parsedPrice;
}

function isValidPrice(price) {
    // 가격 범위: 0원 이상 999,999,999원 이하
    return Number.isInteger(price) && price >= 0 && price <= 999999999;
}

// txt 파일 여부 확인
function isTextFile(file) {
    if (!file) return false;

    const ext = path.extname(file.originalname).toLowerCase();
    return file.mimetype === 'text/plain' || ext === '.txt';
}

// 이미지 파일 여부 확인
function isImageFile(file) {
    if (!file) return false;

    return file.mimetype && file.mimetype.startsWith('image/');
}

// txt 파일 내용 읽기
function readTextFile(file) {
    try {
        return fs.readFileSync(file.path, 'utf8');
    } catch (err) {
        console.error('txt 파일 읽기 오류:', err);
        return '';
    }
}

// 1. 상품 작성 페이지
router.get('/write', requireLogin, (req, res) => {
    res.render('products/write');
});

// 2. 상품 작성 처리
// 과제 가산점: txt 문서 첨부 시 파일 내용을 상품 내용에 포함
router.post('/write', requireLogin, upload.single('document'), async (req, res) => {
    try {
        let { title, content, price } = req.body;

        title = title || '';
        content = content || '';
        price = parsePrice(price);

        if (!isValidPrice(price)) {
    return res.send(`
        <script>
            alert('가격은 0원 이상 999,999,999원 이하의 숫자로 입력하세요.');
            history.back();
        </script>
    `);
}

        let imagePath = null;

        // 파일이 첨부된 경우
        if (req.file) {
            // txt 파일이면 내용을 content에 추가
            if (isTextFile(req.file)) {
                const fileContent = readTextFile(req.file);

                if (fileContent) {
                    content += `\n\n[첨부 문서 내용]\n${fileContent}`;
                }
            }
            // 이미지 파일이면 상품 이미지로 저장
            else if (isImageFile(req.file)) {
                imagePath = `/images/${req.file.filename}`;
            }
        }

        if (!title.trim()) {
            return res.send(`
                <script>
                    alert('상품 제목을 입력하세요.');
                    history.back();
                </script>
            `);
        }

        await db.query(
            `
            INSERT INTO products (title, content, price, imagePath, userId)
            VALUES (?, ?, ?, ?, ?)
            `,
            [title, content, price, imagePath, req.session.user.id]
        );

        res.send(`
            <script>
                alert('상품이 등록되었습니다.');
                location.href = '/';
            </script>
        `);

    } catch (err) {
        console.error('상품 등록 오류:', err);

        res.status(500).send(`
            <script>
                alert('상품 등록 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});

// 3. 상품 상세보기
router.get('/detail/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const user = req.session.user || null;

        const [products] = await db.query(
            `
            SELECT 
                p.*,
                u.userId AS ownerName
            FROM products p
            JOIN users u ON p.userId = u.id
            WHERE p.id = ?
            `,
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).send(`
                <script>
                    alert('상품을 찾을 수 없습니다.');
                    location.href = '/';
                </script>
            `);
        }

        const product = products[0];
        let isFriend = false;

        // 로그인한 사용자가 판매자와 친구인지 확인
        if (user && user.id !== product.userId) {
            const [friendCheck] = await db.query(
                `
                SELECT *
                FROM friends
                WHERE userId = ? AND friendId = ?
                `,
                [user.id, product.userId]
            );

            isFriend = friendCheck.length > 0;
        }

        res.render('products/detail', {
            product,
            user,
            isFriend
        });

    } catch (err) {
        console.error('상세 페이지 오류:', err);

        res.status(500).send(`
            <script>
                alert('상세 페이지를 불러오는 중 오류가 발생했습니다.');
                location.href = '/';
            </script>
        `);
    }
});

// 4. 상품 수정 페이지
router.get('/edit/:id', requireLogin, async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user.id;

        const [rows] = await db.query(
            `
            SELECT *
            FROM products
            WHERE id = ? AND userId = ?
            `,
            [productId, userId]
        );

        if (rows.length === 0) {
            return res.send(`
                <script>
                    alert('상품을 찾을 수 없거나 수정 권한이 없습니다.');
                    history.back();
                </script>
            `);
        }

        res.render('products/edit', {
            product: rows[0]
        });

    } catch (err) {
        console.error('수정 페이지 오류:', err);

        res.status(500).send(`
            <script>
                alert('수정 페이지를 불러오는 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});

// 5. 상품 수정 처리
router.post('/edit/:id', requireLogin, upload.single('document'), async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user.id;

        let { title, content, price } = req.body;

        title = title || '';
        content = content || '';
        price = parsePrice(price);

        if (!isValidPrice(price)) {
    return res.send(`
        <script>
            alert('가격은 0원 이상 999,999,999원 이하의 숫자로 입력하세요.');
            history.back();
        </script>
    `);
}

        if (!title.trim()) {
            return res.send(`
                <script>
                    alert('상품 제목을 입력하세요.');
                    history.back();
                </script>
            `);
        }

        // 실제 본인 상품인지 먼저 확인
        const [products] = await db.query(
            `
            SELECT *
            FROM products
            WHERE id = ? AND userId = ?
            `,
            [productId, userId]
        );

        if (products.length === 0) {
            return res.send(`
                <script>
                    alert('상품을 찾을 수 없거나 수정 권한이 없습니다.');
                    history.back();
                </script>
            `);
        }

        let imagePath = products[0].imagePath;

        // 수정할 때도 txt 첨부 가능
        if (req.file) {
            if (isTextFile(req.file)) {
                const fileContent = readTextFile(req.file);

                if (fileContent) {
                    content += `\n\n[첨부 문서 내용]\n${fileContent}`;
                }
            } else if (isImageFile(req.file)) {
                imagePath = `/images/${req.file.filename}`;
            }
        }

        const [result] = await db.query(
            `
            UPDATE products
            SET title = ?, content = ?, price = ?, imagePath = ?
            WHERE id = ? AND userId = ?
            `,
            [title, content, price, imagePath, productId, userId]
        );

        if (result.affectedRows === 0) {
            return res.send(`
                <script>
                    alert('수정 권한이 없습니다.');
                    history.back();
                </script>
            `);
        }

        res.send(`
            <script>
                alert('상품이 수정되었습니다.');
                location.href = '/products/detail/${productId}';
            </script>
        `);

    } catch (err) {
        console.error('상품 수정 오류:', err);

        res.status(500).send(`
            <script>
                alert('상품 수정 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});

// 6. 상품 삭제 처리
router.get('/delete/:id', requireLogin, async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user.id;

        const [result] = await db.query(
            `
            DELETE FROM products
            WHERE id = ? AND userId = ?
            `,
            [productId, userId]
        );

        if (result.affectedRows === 0) {
            return res.send(`
                <script>
                    alert('삭제 권한이 없거나 이미 삭제된 상품입니다.');
                    history.back();
                </script>
            `);
        }

        res.send(`
            <script>
                alert('상품이 삭제되었습니다.');
                location.href = '/';
            </script>
        `);

    } catch (err) {
        console.error('상품 삭제 오류:', err);

        res.status(500).send(`
            <script>
                alert('상품 삭제 중 오류가 발생했습니다.');
                history.back();
            </script>
        `);
    }
});

// 7. 구매 예약 처리
router.get('/buy/:id', requireLogin, async (req, res) => {
    try {
        const productId = Number(req.params.id);
        const buyerId = req.session.user.id;

        if (!productId) {
            return res.send(`
                <script>
                    alert('잘못된 상품입니다.');
                    location.href = '/';
                </script>
            `);
        }

        // 1. 상품 존재 여부 확인
        const [products] = await db.query(
            `
            SELECT id, title, userId, status
            FROM products
            WHERE id = ?
            `,
            [productId]
        );

        if (products.length === 0) {
            return res.send(`
                <script>
                    alert('상품을 찾을 수 없습니다.');
                    location.href = '/';
                </script>
            `);
        }

        const product = products[0];

        // 2. 내 물건 예약 방지
        if (product.userId === buyerId) {
            return res.send(`
                <script>
                    alert('본인이 등록한 상품은 예약할 수 없습니다.');
                    history.back();
                </script>
            `);
        }

        // 3. 이미 판매완료된 상품 예약 방지
        if (product.status === 'soldout') {
            return res.send(`
                <script>
                    alert('이미 예약 또는 판매완료된 상품입니다.');
                    history.back();
                </script>
            `);
        }

        // 4. 중복 예약 방지
        // status가 아직 soldout이 아닌 경우에만 soldout으로 변경
        const [result] = await db.query(
            `
            UPDATE products
            SET status = 'soldout'
            WHERE id = ?
              AND userId <> ?
              AND (status IS NULL OR status <> 'soldout')
            `,
            [productId, buyerId]
        );

        if (result.affectedRows === 0) {
            return res.send(`
                <script>
                    alert('이미 다른 사용자가 예약했거나 예약할 수 없는 상품입니다.');
                    history.back();
                </script>
            `);
        }

        res.send(`
            <script>
                alert('구매 예약이 완료되었습니다.');
                location.href = '/';
            </script>
        `);

    } catch (err) {
        console.error('구매 예약 처리 오류:', err);

        res.status(500).send(`
            <script>
                alert('구매 예약 처리 중 오류가 발생했습니다. products 테이블의 status 컬럼을 확인하세요.');
                history.back();
            </script>
        `);
    }
});

module.exports = router;