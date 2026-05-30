import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || 'sk_fruits';

let client = null;
let db = null;

let connectPromise = null;

async function ensureIndexes(d) {
    await d.collection('users').createIndex({ username: 1 }, { unique: true });
    await d.collection('inventory').createIndex({ id: 1 }, { unique: true });
    await d.collection('metrics').createIndex({ key: 1 }, { unique: true });
    await d.collection('stock_history').createIndex({ createdAt: -1 });
    await d.collection('stock_history').createIndex({ productId: 1, createdAt: -1 });
    await d.collection('activity_log').createIndex({ timestamp: -1 });
}

async function connect() {
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
        if (!MONGO_URI) {
            throw new Error(
                'MONGO_URI is required. Add it to .env (see .env.example) with your MongoDB connection string.'
            );
        }
        try {
            client = new MongoClient(MONGO_URI);
            await client.connect();
            db = client.db(DB_NAME);
            await ensureIndexes(db);
            await seedInitialData(db);
            console.log('[Database] Connected to MongoDB');
            return db;
        } catch (err) {
            connectPromise = null;
            console.error('[Database] MongoDB connection failed:', err.message);
            throw err;
        }
    })();
    return connectPromise;
}

async function seedInitialData(d) {
    const usersCount = await d.collection('users').countDocuments();
    if (usersCount === 0) {
        const defaultAdminPassword = 'admin123';
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(defaultAdminPassword, saltRounds);
        await d.collection('users').insertOne({ username: 'admin', password: hashedPassword, role: 'admin' });
    }

    const invCount = await d.collection('inventory').countDocuments();
    const historyCount = await d.collection('stock_history').countDocuments();
    if (invCount === 0 && historyCount > 0) {
        console.log('[Database] History exists but inventory is empty — skipping default seed.');
        return;
    }
    if (invCount === 0) {
        const now = Date.now();
        const docs = [
            { id: 'f1', nameEn: 'Apple', nameTa: 'ఆపిల్', stock: 50, lastUpdatedStock: 50, limit: 150, price: 180, cost: 120, unitEn: 'kg', unitTa: 'கிலோ', statusEn: 'Optimal', statusTa: 'சరியானது', emoji: '🍎', accent: '#ef4444', accentGlow: 'rgba(239, 68, 68, 0.4)' },
            { id: 'f2', nameEn: 'Banana', nameTa: 'வாழைப்பழம்', stock: 80, lastUpdatedStock: 80, limit: 240, price: 60, cost: 40, unitEn: 'kg', unitTa: 'கிலோ', statusEn: 'Optimal', statusTa: 'சరியானது', emoji: '🍌', accent: '#fbbf24', accentGlow: 'rgba(251, 191, 36, 0.4)' }
        ];
        await d.collection('inventory').insertMany(docs);
        await d.collection('metrics').insertMany([
            { key: 'totalStock', value: docs.reduce((s, x) => s + (x.stock || 0), 0) },
            { key: 'totalStockLimit', value: docs.reduce((s, x) => s + (x.limit || 0), 0) },
            { key: 'todaySales', value: 0 },
            { key: 'todaySalesTrend', value: 0 },
            { key: 'netProfit', value: 0 },
            { key: 'netProfitTrend', value: 0 }
        ]);
        await d.collection('activity_log').insertOne({ type: 'restock', fruitEn: 'Apple', fruitTa: 'ஆப்பிள்', qty: 50, value: 6000, timestamp: now, timeEn: 'Just now', timeTa: 'சரியாக இப்போது' });
    }
}

async function ensureConnected() {
    // Lazy connection: avoid import-time crashes; return a clear error if Mongo is unreachable.
    if (db && client) return db;
    if (!MONGO_URI) {
        throw new Error('MongoDB is not configured (missing MONGO_URI).');
    }
    try {
        return await connect();
    } catch (err) {
        // Keep the original message but standardize for API.
        const msg = err && err.message ? err.message : String(err);
        throw new Error(`MongoDB connection failed: ${msg}`);
    }
}

function getStockStatus(stock, limit) {
    if (stock < limit * 0.15) return { statusEn: 'Danger Alert', statusTa: 'அபாயம்' };
    if (stock < limit * 0.35) return { statusEn: 'Low Stock', statusTa: 'குறைந்த இருப்பு' };
    return { statusEn: 'Optimal', statusTa: 'சரியானது' };
}

export async function getDashboardState() {
    const d = await ensureConnected();
    const metricsArr = await d.collection('metrics').find().toArray();
    const metrics = {};
    for (const m of metricsArr) metrics[m.key] = m.value;
    const inventory = await d.collection('inventory').find().toArray();
    const recentActivity = await d.collection('activity_log').find().sort({ timestamp: -1 }).toArray();
    const historyStats = await getStockHistoryMetrics();
    Object.assign(metrics, historyStats);
    return { metrics, inventory, recentActivity };
}

export async function updateProductStock(productId, stock, userName) {
    const d = await ensureConnected();
    const fruit = await d.collection('inventory').findOne({ id: productId });
    if (!fruit || stock < 0) throw new Error('Invalid product ID or stock value');
    const { statusEn, statusTa } = getStockStatus(stock, fruit.limit);
    await d.collection('inventory').updateOne({ id: productId }, { $set: { stock, statusEn, statusTa, lastUpdatedStock: stock } });
    const stockDiff = stock - (fruit.stock || 0);
    await d.collection('metrics').updateOne({ key: 'totalStock' }, { $inc: { value: stockDiff } }, { upsert: true });
    await d.collection('stock_history').insertOne({ productId, productNameEn: fruit.nameEn, productNameTa: fruit.nameTa, previousStock: fruit.stock || 0, addedQuantity: stockDiff > 0 ? stockDiff : 0, reducedQuantity: stockDiff < 0 ? Math.abs(stockDiff) : 0, updatedStock: stock, actionType: 'Stock Adjustment', notes: `Manual update by ${userName || 'Admin'}`, userName: userName || 'Admin', createdAt: Date.now() });
    return getDashboardState();
}

export async function saveSalesReportItems(reports, userName) {
    if (!Array.isArray(reports)) throw new Error('Reports must be an array');
    const d = await ensureConnected();
    const session = client?.startSession?.() || { withTransaction: async (cb) => cb() };
    try {
        let resultState;
        await session.withTransaction(async () => {
            for (const report of reports) {
                const { productId, quantitySold } = report;
                const fruit = await d.collection('inventory').findOne({ id: productId });
                if (!fruit || typeof quantitySold !== 'number' || quantitySold <= 0 || quantitySold > fruit.stock) {
                    throw new Error(`Invalid sale report for product ${productId}`);
                }
                const saleValue = quantitySold * fruit.price;
                const profit = saleValue - quantitySold * fruit.cost;
                const newStock = (fruit.stock || 0) - quantitySold;
                const { statusEn, statusTa } = getStockStatus(newStock, fruit.limit);
                await d.collection('inventory').updateOne({ id: productId }, { $set: { stock: newStock, statusEn, statusTa, lastUpdatedStock: newStock } });
                await d.collection('activity_log').insertOne({ type: 'sale', fruitEn: fruit.nameEn, fruitTa: fruit.nameTa, qty: quantitySold, value: saleValue, timestamp: Date.now(), timeEn: 'Just now', timeTa: 'சரியாக இப்போது' });
                await d.collection('stock_history').insertOne({ productId, productNameEn: fruit.nameEn, productNameTa: fruit.nameTa, previousStock: fruit.stock || 0, addedQuantity: 0, reducedQuantity: quantitySold, updatedStock: newStock, actionType: 'Sale', userName: userName || 'POS System', createdAt: Date.now() });
                await d.collection('metrics').updateOne({ key: 'totalStock' }, { $inc: { value: -quantitySold } }, { upsert: true });
                await d.collection('metrics').updateOne({ key: 'todaySales' }, { $inc: { value: saleValue } }, { upsert: true });
                await d.collection('metrics').updateOne({ key: 'netProfit' }, { $inc: { value: profit } }, { upsert: true });
            }
            resultState = await getDashboardState();
        });
        await session.endSession?.();
        return resultState;
    } catch (err) {
        await session.endSession?.();
        throw err;
    }
}

export async function recordSale(fruitId, qty, userName) {
    return saveSalesReportItems([{ productId: fruitId, quantitySold: qty }], userName);
}

export async function recordRestock(fruitId, qty, userName) {
    const d = await ensureConnected();
    const fruit = await d.collection('inventory').findOne({ id: fruitId });
    if (!fruit || qty <= 0) throw new Error('Invalid fruit or quantity');
    const newStock = (fruit.stock || 0) + qty;
    const { statusEn, statusTa } = getStockStatus(newStock, fruit.limit);
    await d.collection('inventory').updateOne({ id: fruitId }, { $set: { stock: newStock, statusEn, statusTa, lastUpdatedStock: newStock } });
    await d.collection('activity_log').insertOne({ type: 'restock', fruitEn: fruit.nameEn, fruitTa: fruit.nameTa, qty, value: qty * fruit.cost, timestamp: Date.now(), timeEn: 'Just now', timeTa: 'சரியாக இப்போது' });
    await d.collection('stock_history').insertOne({ productId: fruitId, productNameEn: fruit.nameEn, productNameTa: fruit.nameTa, previousStock: fruit.stock || 0, addedQuantity: qty, reducedQuantity: 0, updatedStock: newStock, actionType: 'Restock', userName: userName || 'Warehouse', createdAt: Date.now() });
    await d.collection('metrics').updateOne({ key: 'totalStock' }, { $inc: { value: qty } }, { upsert: true });
    return getDashboardState();
}

export async function recordWaste(fruitId, qty, notes, userName) {
    const d = await ensureConnected();
    const fruit = await d.collection('inventory').findOne({ id: fruitId });
    if (!fruit || qty <= 0 || qty > fruit.stock) throw new Error('Invalid fruit or quantity');
    const newStock = fruit.stock - qty;
    const { statusEn, statusTa } = getStockStatus(newStock, fruit.limit);
    await d.collection('inventory').updateOne({ id: fruitId }, { $set: { stock: newStock, statusEn, statusTa, lastUpdatedStock: newStock } });
    await d.collection('activity_log').insertOne({ type: 'waste', fruitEn: fruit.nameEn, fruitTa: fruit.nameTa, qty, value: 0, timestamp: Date.now(), timeEn: 'Just now', timeTa: 'சரியாக இப்போது' });
    await d.collection('stock_history').insertOne({ productId: fruitId, productNameEn: fruit.nameEn, productNameTa: fruit.nameTa, previousStock: fruit.stock || 0, addedQuantity: 0, reducedQuantity: qty, updatedStock: newStock, actionType: 'Waste', notes: notes || 'Spoilage', userName: userName || 'Admin', createdAt: Date.now() });
    await d.collection('metrics').updateOne({ key: 'totalStock' }, { $inc: { value: -qty } }, { upsert: true });
    return getDashboardState();
}

export async function addFruit(fruitData, userName) {
    const d = await ensureConnected();
    const id = 'fruit-' + Date.now();
    const limit = (fruitData.threshold || 100) * 3;
    const doc = { id, nameEn: fruitData.nameEn, nameTa: fruitData.nameTa, stock: 0, lastUpdatedStock: 0, limit, price: fruitData.price || 0, cost: fruitData.cost || 0, unitEn: fruitData.unitEn || 'kg', unitTa: fruitData.unitTa || 'கிலோ', statusEn: 'Danger Alert', statusTa: 'அபாயம்', emoji: fruitData.emoji || '🍇', accent: fruitData.accent || '#8b5cf6', accentGlow: fruitData.accentGlow || 'rgba(139, 92, 246, 0.4)' };
    await d.collection('inventory').insertOne(doc);
    await d.collection('stock_history').insertOne({ productId: id, productNameEn: doc.nameEn, productNameTa: doc.nameTa, previousStock: 0, addedQuantity: 0, reducedQuantity: 0, updatedStock: 0, actionType: 'Creation', userName: userName || 'Admin', createdAt: Date.now() });
    return getDashboardState();
}

export async function updateFruit(id, fruitData, userName) {
    const d = await ensureConnected();
    const current = await d.collection('inventory').findOne({ id });
    if (!current) throw new Error('Fruit not found');
    const newStock = typeof fruitData.stock === 'number' ? fruitData.stock : current.stock;
    const limit = fruitData.limit || current.limit;
    const { statusEn, statusTa } = getStockStatus(newStock, limit);
    await d.collection('inventory').updateOne({ id }, { $set: { nameEn: fruitData.nameEn || current.nameEn, nameTa: fruitData.nameTa || current.nameTa, stock: newStock, lastUpdatedStock: newStock, limit, price: fruitData.price || current.price, cost: fruitData.cost || current.cost, statusEn, statusTa } });
    await d.collection('stock_history').insertOne({ productId: id, productNameEn: fruitData.nameEn || current.nameEn, productNameTa: fruitData.nameTa || current.nameTa, previousStock: current.stock || 0, addedQuantity: newStock - (current.stock || 0) > 0 ? newStock - (current.stock || 0) : 0, reducedQuantity: newStock - (current.stock || 0) < 0 ? Math.abs(newStock - (current.stock || 0)) : 0, updatedStock: newStock, actionType: 'Update', notes: fruitData.notes || null, userName: userName || 'Admin', createdAt: Date.now() });
    return getDashboardState();
}

export async function removeFruit(id) {
    const d = await ensureConnected();
    const res = await d.collection('inventory').deleteOne({ id });
    if (res.deletedCount === 0) throw new Error('Fruit not found');
    const totalStock = await d.collection('inventory').aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]).toArray();
    const total = (totalStock[0] && totalStock[0].total) || 0;
    await d.collection('metrics').updateOne({ key: 'totalStock' }, { $set: { value: total } }, { upsert: true });
    return getDashboardState();
}

export async function getStockHistory(filters = {}) {
    const d = await ensureConnected();
    const q = {};
    if (filters.productId && filters.productId !== 'All') q.productId = filters.productId;
    if (filters.actionType && filters.actionType !== 'All') q.actionType = filters.actionType;
    if (filters.search) {
        q.$or = [
            { productNameEn: { $regex: filters.search, $options: 'i' } },
            { productNameTa: { $regex: filters.search, $options: 'i' } },
            { userName: { $regex: filters.search, $options: 'i' } }
        ];
    }
    if (filters.from || filters.to) {
        q.createdAt = {};
        if (filters.from) {
            const from = new Date(filters.from);
            if (!Number.isNaN(from.getTime())) q.createdAt.$gte = from.getTime();
        }
        if (filters.to) {
            const to = new Date(filters.to);
            if (!Number.isNaN(to.getTime())) {
                to.setHours(23, 59, 59, 999);
                q.createdAt.$lte = to.getTime();
            }
        }
        if (Object.keys(q.createdAt).length === 0) delete q.createdAt;
    }
    return d.collection('stock_history').find(q).sort({ createdAt: -1 }).toArray();
}

export async function getStockHistoryMetrics(filters = {}) {
    const d = await ensureConnected();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const q = { createdAt: { $gte: startOfDay.getTime() } };
    if (filters.productId && filters.productId !== 'All') q.productId = filters.productId;
    const addedToday = await d.collection('stock_history').aggregate([{ $match: q }, { $group: { _id: null, total: { $sum: '$addedQuantity' } } }]).toArray();
    const salesToday = await d.collection('stock_history').aggregate([{ $match: { ...q, actionType: 'Sale' } }, { $group: { _id: null, total: { $sum: '$reducedQuantity' } } }]).toArray();
    const wasteToday = await d.collection('stock_history').aggregate([{ $match: { ...q, actionType: 'Waste' } }, { $group: { _id: null, total: { $sum: '$reducedQuantity' } } }]).toArray();
    const totalTransactions = await d.collection('stock_history').countDocuments(q);
    const mostUpdated = await d.collection('stock_history').aggregate([{ $group: { _id: '$productId', count: { $sum: 1 }, productNameEn: { $first: '$productNameEn' }, productNameTa: { $first: '$productNameTa' } } }, { $sort: { count: -1 } }, { $limit: 1 }]).toArray();
    return {
        addedToday: (addedToday[0] && addedToday[0].total) || 0,
        salesToday: (salesToday[0] && salesToday[0].total) || 0,
        wasteToday: (wasteToday[0] && wasteToday[0].total) || 0,
        totalTransactions: totalTransactions || 0,
        mostUpdatedEn: (mostUpdated[0] && mostUpdated[0].productNameEn) || '-',
        mostUpdatedTa: (mostUpdated[0] && mostUpdated[0].productNameTa) || '-'
    };
}

export async function authenticateUser(username, password) {
    const d = await ensureConnected();
    if (!username || !password) return null;
    const user = await d.collection('users').findOne({ username });
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password);
    if (!match) return null;
    return { username: user.username, role: user.role };
}


