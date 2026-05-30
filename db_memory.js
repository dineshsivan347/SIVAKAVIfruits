import bcrypt from 'bcrypt';

let client = null;
let db = null;

function createInMemoryStore() {
    const collections = {
        users: [],
        inventory: [],
        metrics: [],
        activity_log: [],
        stock_history: []
    };

    const matchFilter = (doc, q) => {
        if (!q || Object.keys(q).length === 0) return true;
        return Object.keys(q).every(k => {
            const v = q[k];
            if (v && v.$regex) return new RegExp(v.$regex, v.$options || '').test(doc[k] || '');
            if (v && typeof v === 'object' && v.$gte !== undefined) return doc[k] >= v.$gte;
            return doc[k] === v;
        });
    };

    const makeCollection = (arr) => ({
        async findOne(q) { return arr.find(d => matchFilter(d, q)) || null; },
        find(q) {
            const matched = arr.filter(d => matchFilter(d, q));
            let _sort = null;
            return {
                sort(o) { _sort = o; return this; },
                async toArray() {
                    if (!_sort) return matched.slice();
                    const [key] = Object.keys(_sort);
                    const dir = _sort[key] === -1 ? -1 : 1;
                    return matched.slice().sort((a,b)=> (a[key]>b[key]?1:-1)*dir);
                }
            };
        },
        async insertOne(doc) { arr.push(Object.assign({}, doc)); return { insertedId: doc._id || null }; },
        async insertMany(docs) { for (const d of docs) arr.push(Object.assign({}, d)); return { insertedCount: docs.length }; },
        async updateOne(filter, update, options = {}) {
            const idx = arr.findIndex(d => matchFilter(d, filter));
            if (idx === -1) {
                if (options.upsert) { const doc = Object.assign({}, filter, (update.$set || {})); arr.push(doc); return { upsertedCount: 1 }; }
                return { matchedCount: 0, modifiedCount: 0 };
            }
            const target = arr[idx];
            if (update.$set) Object.assign(target, update.$set);
            if (update.$inc) {
                for (const k of Object.keys(update.$inc)) target[k] = (target[k] || 0) + update.$inc[k];
            }
            arr[idx] = target;
            return { matchedCount: 1, modifiedCount: 1 };
        },
        async deleteOne(filter) { const idx = arr.findIndex(d => matchFilter(d, filter)); if (idx === -1) return { deletedCount: 0 }; arr.splice(idx,1); return { deletedCount: 1 }; },
        aggregate(pipeline = []) {
            let items = arr.slice();
            for (const stage of pipeline) {
                if (stage.$match) items = items.filter(d => matchFilter(d, stage.$match));
                else if (stage.$group) {
                    const g = stage.$group;
                    if (g._id === null) {
                        const out = {};
                        for (const k of Object.keys(g)) {
                            if (k === '_id') continue;
                            const acc = g[k];
                            if (acc.$sum) {
                                const fld = typeof acc.$sum === 'string' && acc.$sum.startsWith('$') ? acc.$sum.slice(1) : null;
                                out[k] = items.reduce((s, it) => s + (fld ? (it[fld] || 0) : 1), 0);
                            }
                        }
                        items = [out];
                    } else {
                        const groups = {};
                        const fld = g._id.startsWith('$') ? g._id.slice(1) : g._id;
                        for (const it of items) {
                            const key = it[fld];
                            groups[key] = groups[key] || { _id: key };
                            for (const outKey of Object.keys(g)) {
                                if (outKey === '_id') continue;
                                const acc = g[outKey];
                                if (acc.$sum === 1) groups[key][outKey] = (groups[key][outKey] || 0) + 1;
                                if (acc.$first) {
                                    const f = acc.$first.startsWith('$') ? acc.$first.slice(1) : acc.$first;
                                    groups[key][outKey] = groups[key][outKey] || it[f];
                                }
                            }
                        }
                        items = Object.values(groups);
                    }
                } else if (stage.$sort) {
                    const [k] = Object.keys(stage.$sort);
                    const dir = stage.$sort[k] === -1 ? -1 : 1;
                    items = items.sort((a,b)=> (a[k]>b[k]?1:-1)*dir);
                } else if (stage.$limit) items = items.slice(0, stage.$limit);
            }
            return { toArray: async () => items };
        },
        async countDocuments(filter = {}) { return arr.filter(d => matchFilter(d, filter)).length; },
        async createIndex() { return; }
    });

    const store = {
        collection: (name) => makeCollection(collections[name])
    };
    const clientStub = { startSession: () => ({ async withTransaction(cb) { return cb(); } }) };
    return { client: clientStub, db: store };
}

let connectPromise = null;

async function connect() {
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
        const inmem = createInMemoryStore();
        client = inmem.client;
        db = inmem.db;
        await seedInitialData(db);
        return db;
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

connect().catch(() => {});

function getStockStatus(stock, limit) {
    if (stock < limit * 0.15) return { statusEn: 'Danger Alert', statusTa: 'அபாயம்' };
    if (stock < limit * 0.35) return { statusEn: 'Low Stock', statusTa: 'குறைந்த இருப்பு' };
    return { statusEn: 'Optimal', statusTa: 'சரியானது' };
}

export async function getDashboardState() {
    const d = await connect();
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
    const d = await connect();
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
    const d = await connect();
    const session = client.startSession?.() || { withTransaction: async (cb) => cb() };
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
    const d = await connect();
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
    const d = await connect();
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
    const d = await connect();
    const id = 'fruit-' + Date.now();
    const limit = (fruitData.threshold || 100) * 3;
    const doc = { id, nameEn: fruitData.nameEn, nameTa: fruitData.nameTa, stock: 0, lastUpdatedStock: 0, limit, price: fruitData.price || 0, cost: fruitData.cost || 0, unitEn: fruitData.unitEn || 'kg', unitTa: fruitData.unitTa || 'கிலோ', statusEn: 'Danger Alert', statusTa: 'அபாயம்', emoji: fruitData.emoji || '🍇', accent: fruitData.accent || '#8b5cf6', accentGlow: fruitData.accentGlow || 'rgba(139, 92, 246, 0.4)' };
    await d.collection('inventory').insertOne(doc);
    await d.collection('stock_history').insertOne({ productId: id, productNameEn: doc.nameEn, productNameTa: doc.nameTa, previousStock: 0, addedQuantity: 0, reducedQuantity: 0, updatedStock: 0, actionType: 'Creation', userName: userName || 'Admin', createdAt: Date.now() });
    return getDashboardState();
}

export async function updateFruit(id, fruitData, userName) {
    const d = await connect();
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
    const d = await connect();
    const res = await d.collection('inventory').deleteOne({ id });
    if (res.deletedCount === 0) throw new Error('Fruit not found');
    const totalStock = await d.collection('inventory').aggregate([{ $group: { _id: null, total: { $sum: '$stock' } } }]).toArray();
    const total = (totalStock[0] && totalStock[0].total) || 0;
    await d.collection('metrics').updateOne({ key: 'totalStock' }, { $set: { value: total } }, { upsert: true });
    return getDashboardState();
}

export async function getStockHistory(filters = {}) {
    const d = await connect();
    const q = {};
    if (filters.productId && filters.productId !== 'All') q.productId = filters.productId;
    if (filters.actionType && filters.actionType !== 'All') q.actionType = filters.actionType;
    if (filters.search) q.$or = [{ productNameEn: { $regex: filters.search, $options: 'i' } }, { productNameTa: { $regex: filters.search, $options: 'i' } }, { userName: { $regex: filters.search, $options: 'i' } }];
    return d.collection('stock_history').find(q).sort({ createdAt: -1 }).toArray();
}

export async function getStockHistoryMetrics(filters = {}) {
    const d = await connect();
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
    const d = await connect();
    if (!username || !password) return null;
    const user = await d.collection('users').findOne({ username });
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password);
    if (!match) return null;
    return { username: user.username, role: user.role };
}


