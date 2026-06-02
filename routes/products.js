const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Friend = require('../models/Friend');
const upload = require('../middleware/multerConfig');
const fs = require('fs');

// [작성 페이지 렌더링]
router.get('/write', (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    res.render('products/write');
});

// [작성 로직] - 중복된 라우터 하나로 병합
router.post('/write', upload.single('document'), async (req, res) => {
    const { title, price } = req.body;
    let { content } = req.body;
    const imagePath = req.file && req.file.mimetype.startsWith('image/') ? `/images/${req.file.filename}` : null;

    // 텍스트 파일(.txt) 첨부 시 내용 합치기
    if (req.file && (req.file.mimetype === 'text/plain' || req.file.originalname.endsWith('.txt'))) {
        try {
            const fileContent = fs.readFileSync(req.file.path, 'utf8');
            content = (content || "") + "\n\n[첨부 문서 내용]\n" + fileContent;
        } catch (err) {
            console.error("파일 읽기 오류:", err);
        }
    }

    try {
        await Product.create({
            title, content, price, imagePath,
            userId: req.session.user.id
        });
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send("등록 실패");
    }
});

// [상세보기]
router.get('/detail/:id', async (req, res) => {
    try {
        const user = req.session.user || null;
        const rawProduct = await Product.findById(req.params.id).populate('userId');
        
        if (!rawProduct) return res.status(404).send("상품을 찾을 수 없습니다.");

        // EJS 호환성을 위한 매핑
        const product = {
            ...rawProduct.toObject(),
            id: rawProduct._id.toString(),
            ownerName: rawProduct.userId.userId,
            userId: rawProduct.userId._id.toString()
        };

        let isFriend = false;
        if (user) {
            const friendCheck = await Friend.findOne({ userId: user.id, friendId: product.userId });
            if (friendCheck) isFriend = true;
        }

        res.render('products/detail', { product, user, isFriend });
    } catch (err) {
        console.error(err);
        res.status(500).send("상세 페이지 로딩 중 오류");
    }
});

// [수정 페이지 렌더링]
router.get('/edit/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).send("상품을 찾을 수 없습니다.");
        
        if (product.userId.toString() !== req.session.user.id) {
            return res.send("<script>alert('권한이 없습니다.'); history.back();</script>");
        }
        
        product.id = product._id.toString(); // EJS 뷰 호환
        res.render('products/edit', { product });
    } catch (err) {
        console.error(err);
        res.status(500).send("서버 오류");
    }
});

// [수정 처리]
router.post('/edit/:id', upload.single('document'), async (req, res) => {
    const { title, content, price } = req.body;
    
    try {
        const updateData = { title, content, price };
        if (req.file && req.file.mimetype.startsWith('image/')) {
            updateData.imagePath = `/images/${req.file.filename}`;
        }

        await Product.updateOne({ _id: req.params.id }, updateData);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send("수정 실패");
    }
});

// [삭제 처리] - 중복 로직 병합
router.get('/delete/:id', async (req, res) => {
    if (!req.session.user) {
        return res.send("<script>alert('로그인이 필요합니다.'); location.href='/auth/login';</script>");
    }

    try {
        const result = await Product.deleteOne({ 
            _id: req.params.id, 
            userId: req.session.user.id 
        });

        if (result.deletedCount === 0) {
            return res.send("<script>alert('삭제 권한이 없거나 이미 삭제된 상품입니다.'); history.back();</script>");
        }

        res.send("<script>alert('삭제되었습니다.'); location.href='/';</script>");
    } catch (err) {
        console.error(err);
        res.status(500).send("삭제 중 오류 발생");
    }
});

// [구매 처리]
router.get('/buy/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');

    try {
        await Product.updateOne(
            { _id: req.params.id }, 
            { status: 'soldout', buyerId: req.session.user.id }
        );
        res.send("<script>alert('구매 예약이 완료되었습니다!'); location.href='/';</script>");
    } catch (err) {
        console.error(err);
        res.status(500).send("구매 처리 중 오류");
    }
});

module.exports = router;