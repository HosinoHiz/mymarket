const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: String,
    price: { type: Number, required: true },
    imagePath: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 판매자 고유 ID 연동
    status: { type: String, default: 'onsale' } // soldout 등
});

module.exports = mongoose.model('Product', productSchema);