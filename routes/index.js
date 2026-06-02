const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Friend = require('../models/Friend');

// [메인 페이지] - 중복된 라우터 하나로 병합
router.get('/', async (req, res) => {
    try {
        const user = req.session.user || null;
        let friendProducts = [];

        // 1. 전체 상품 조회 (.populate()를 사용해 JOIN 효과 구현)
        const allProductsRaw = await Product.find().populate('userId').sort({ _id: -1 });
        
        // EJS에서 기존 코드를 그대로 쓸 수 있게 데이터 가공 (id, ownerName 등)
        const allProducts = allProductsRaw.map(p => ({
            ...p.toObject(),
            id: p._id.toString(),
            ownerName: p.userId ? p.userId.userId : '알수없음',
            userId: p.userId ? p.userId._id.toString() : null
        }));

        // 2. 친구의 최신 물품 3개 조회
        if (user) {
            // 내 친구 목록 조회
            const myFriends = await Friend.find({ userId: user.id });
            const friendIds = myFriends.map(f => f.friendId);

            // 친구가 올린 상품 조회
            const friendProductsRaw = await Product.find({ userId: { $in: friendIds } })
                                                 .populate('userId')
                                                 .sort({ _id: -1 })
                                                 .limit(3);

            friendProducts = friendProductsRaw.map(p => ({
                ...p.toObject(),
                id: p._id.toString(),
                ownerName: p.userId ? p.userId.userId : '알수없음',
                userId: p.userId ? p.userId._id.toString() : null
            }));
        }

        res.render('main', { user, allProducts, friendProducts });
    } catch (err) {
        console.error(err);
        res.status(500).send("데이터베이스 연결 확인이 필요합니다.");
    }
});

// [친구 추가]
router.get('/add-friend/:friendId', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    
    try {
        const friendCheck = await Friend.findOne({ userId: req.session.user.id, friendId: req.params.friendId });
        if (friendCheck) {
            return res.send("<script>alert('이미 친구입니다.'); history.back();</script>");
        }

        await Friend.create({ userId: req.session.user.id, friendId: req.params.friendId });
        res.send("<script>alert('친구 추가 완료!'); history.back();</script>");
    } catch (err) {
        console.error(err);
        res.send("<script>alert('오류가 발생했습니다.'); history.back();</script>");
    }
});

module.exports = router;