/**
 * SQLite persistence (sk_fruits.db). Used when MONGO_URI is not set.
 * Data is kept across server restarts.
 */
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'sk_fruits.db');

sqlite3.verbose();

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.CREATE, (err) => {
    if (err) {
        console.error('[Database] Failed to open database:', err.message);
        process.exit(1);
    }
    console.log(`[Database] SQLite Database initialized at: ${DB_PATH}`);
});

function execSQL(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

function runSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function getSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function allSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

async function initDatabase() {
    // 1. Metrics Table
    await execSQL(`
        CREATE TABLE IF NOT EXISTS metrics (
            key TEXT PRIMARY KEY,
            value REAL NOT NULL
        )
    `);

    // 2. Inventory Table
    await execSQL(`
        CREATE TABLE IF NOT EXISTS inventory (
            id TEXT PRIMARY KEY,
            nameEn TEXT NOT NULL,
            nameTa TEXT NOT NULL,
            stock INTEGER NOT NULL,
            lastUpdatedStock INTEGER NOT NULL DEFAULT 0,
            "limit" INTEGER NOT NULL,
            price INTEGER NOT NULL,
            cost INTEGER NOT NULL,
            unitEn TEXT NOT NULL,
            unitTa TEXT NOT NULL,
            statusEn TEXT NOT NULL,
            statusTa TEXT NOT NULL,
            emoji TEXT NOT NULL,
            accent TEXT NOT NULL,
            accentGlow TEXT NOT NULL
        )
    `);

    // Migration: Add lastUpdatedStock column if it doesn't exist
    try {
        await getSQL("SELECT lastUpdatedStock FROM inventory LIMIT 1");
    } catch (e) {
        console.log('[Database] Migrating: Adding lastUpdatedStock column to inventory...');
        await execSQL(`ALTER TABLE inventory ADD COLUMN lastUpdatedStock INTEGER NOT NULL DEFAULT 0`);
    }

    // Migrate legacy category columns without deleting inventory rows
    try {
        const colsRows = await allSQL("PRAGMA table_info('inventory')");
        const cols = Array.isArray(colsRows) ? colsRows.map(r => r?.name).filter(Boolean) : [];
        if (cols.includes('categoryEn') || cols.includes('categoryTa')) {
            console.log('[Database] Migrating inventory: removing legacy category columns (keeping all rows)...');
            await execSQL(`
                CREATE TABLE inventory_migrated (
                    id TEXT PRIMARY KEY,
                    nameEn TEXT NOT NULL,
                    nameTa TEXT NOT NULL,
                    stock INTEGER NOT NULL,
                    lastUpdatedStock INTEGER NOT NULL DEFAULT 0,
                    "limit" INTEGER NOT NULL,
                    price INTEGER NOT NULL,
                    cost INTEGER NOT NULL,
                    unitEn TEXT NOT NULL,
                    unitTa TEXT NOT NULL,
                    statusEn TEXT NOT NULL,
                    statusTa TEXT NOT NULL,
                    emoji TEXT NOT NULL,
                    accent TEXT NOT NULL,
                    accentGlow TEXT NOT NULL
                )
            `);
            const hasLastUpdated = cols.includes('lastUpdatedStock');
            await execSQL(`
                INSERT INTO inventory_migrated (
                    id, nameEn, nameTa, stock, lastUpdatedStock, "limit", price, cost,
                    unitEn, unitTa, statusEn, statusTa, emoji, accent, accentGlow
                )
                SELECT
                    id, nameEn, nameTa, stock,
                    ${hasLastUpdated ? 'lastUpdatedStock' : 'stock'},
                    "limit", price, cost, unitEn, unitTa, statusEn, statusTa, emoji, accent, accentGlow
                FROM inventory
            `);
            await execSQL('DROP TABLE inventory');
            await execSQL('ALTER TABLE inventory_migrated RENAME TO inventory');
        }
    } catch (e) {
        console.warn('[Database] Category migration skipped/failed:', e?.message || e);
    }

    // 3. Activity Log Table
    await execSQL(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            fruitEn TEXT NOT NULL,
            fruitTa TEXT NOT NULL,
            qty INTEGER NOT NULL,
            value INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            timeEn TEXT NOT NULL,
            timeTa TEXT NOT NULL
        )
    `);

    // 5. Users Table
    await execSQL(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user'
        )
    `);

    // 6. Stock History Table
    await execSQL(`
        CREATE TABLE IF NOT EXISTS stock_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId TEXT NOT NULL,
            productNameEn TEXT NOT NULL,
            productNameTa TEXT NOT NULL,
            previousStock INTEGER NOT NULL,
            addedQuantity INTEGER NOT NULL,
            reducedQuantity INTEGER NOT NULL,
            updatedStock INTEGER NOT NULL,
            actionType TEXT NOT NULL,
            notes TEXT,
            userName TEXT NOT NULL,
            createdAt INTEGER NOT NULL
        )
    `);

    // Migration: Add notes column to stock_history if it doesn't exist
    try {
        await getSQL("SELECT notes FROM stock_history LIMIT 1");
    } catch (e) {
        console.log('[Database] Migrating: Adding notes column to stock_history...');
        await execSQL(`ALTER TABLE stock_history ADD COLUMN notes TEXT`);
    }

    await seedInitialData();

    const userRow = await getSQL('SELECT * FROM users WHERE username = ?', ['admin']);
    const defaultAdminPassword = 'admin123';
    const saltRounds = 10;
    const hashedPassword = bcrypt.hashSync(defaultAdminPassword, saltRounds);

    if (!userRow) {
        await runSQL(`
            INSERT INTO users (username, password, role)
            VALUES (?, ?, ?)
        `, ['admin', hashedPassword, 'admin']);
        console.log('[Database] Admin user seeded successfully.');
    } else {
        try {
            const isDefaultValid = bcrypt.compareSync(defaultAdminPassword, userRow.password);
            if (!isDefaultValid) {
                console.warn('[Database] Admin password did not match default. Resetting password to admin123.');
                await runSQL('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, 'admin']);
            }
        } catch (err) {
            console.warn('[Database] Could not verify existing admin password, resetting to default.');
            await runSQL('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, 'admin']);
        }
    }
}

async function seedInitialData() {
    const invRow = await getSQL('SELECT COUNT(*) as count FROM inventory');
    if (invRow?.count > 0) {
        console.log('[Database] Existing inventory found. Seeding skipped.');
        return;
    }

    const historyRow = await getSQL('SELECT COUNT(*) as count FROM stock_history');
    const activityRow = await getSQL('SELECT COUNT(*) as count FROM activity_log');
    if ((historyRow?.count || 0) > 0 || (activityRow?.count || 0) > 0) {
        console.log('[Database] History/activity exists but inventory is empty — skipping default seed to preserve your records.');
        return;
    }

    console.log('[Database] First-run seeding (empty database)...');

    await runSQL('INSERT OR IGNORE INTO metrics (key, value) VALUES (?, ?)', ['totalStock', 0]);
    await runSQL('INSERT OR IGNORE INTO metrics (key, value) VALUES (?, ?)', ['totalStockLimit', 0]);
    await runSQL('INSERT OR IGNORE INTO metrics (key, value) VALUES (?, ?)', ['todaySales', 0]);
    await runSQL('INSERT OR IGNORE INTO metrics (key, value) VALUES (?, ?)', ['todaySalesTrend', 0]);
    await runSQL('INSERT OR IGNORE INTO metrics (key, value) VALUES (?, ?)', ['netProfit', 0]);
    await runSQL('INSERT OR IGNORE INTO metrics (key, value) VALUES (?, ?)', ['netProfitTrend', 0]);

    await runSQL(`
        INSERT INTO inventory (id, nameEn, nameTa, stock, lastUpdatedStock, "limit", price, cost, unitEn, unitTa, statusEn, statusTa, emoji, accent, accentGlow)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['f1', 'Apple', 'ఆపిల్', 50, 50, 150, 180, 120, 'kg', 'கிலோ', 'Optimal', 'சరியானது', '🍎', '#ef4444', 'rgba(239, 68, 68, 0.4)']);

    await runSQL(`
        INSERT INTO inventory (id, nameEn, nameTa, stock, lastUpdatedStock, "limit", price, cost, unitEn, unitTa, statusEn, statusTa, emoji, accent, accentGlow)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['f2', 'Banana', 'வாழைப்பழம்', 80, 80, 240, 60, 40, 'kg', 'கிலோ', 'Optimal', 'சరியானது', '🍌', '#fbbf24', 'rgba(251, 191, 36, 0.4)']);

    await logStockHistory({
        productId: 'f1',
        productNameEn: 'Apple',
        productNameTa: 'ஆப்பிள்',
        previousStock: 0,
        addedQuantity: 50,
        reducedQuantity: 0,
        updatedStock: 50,
        actionType: 'Restock',
        userName: 'System'
    });

    const now = Date.now();
    await runSQL(`
        INSERT INTO activity_log (type, fruitEn, fruitTa, qty, value, timestamp, timeEn, timeTa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['restock', 'Apple', 'ఆப்பிள்', 50, 6000, now, 'Just now', 'சరியாக இப்போது']);

    console.log('[Database] Database tables seeded successfully!');
}

// Retrieve consolidated dashboard state
export async function getDashboardState() {
    const metricsRows = await allSQL('SELECT * FROM metrics');
    const metrics = {};
    for (const row of Array.isArray(metricsRows) ? metricsRows : []) {
        metrics[row.key] = row.value;
    }

    const historyStats = await getStockHistoryMetrics();
    Object.assign(metrics, historyStats);

    const inventory = await allSQL('SELECT * FROM inventory');
    const recentActivity = await allSQL('SELECT * FROM activity_log ORDER BY id DESC');
    (Array.isArray(recentActivity) ? recentActivity : []).forEach(act => {
        act.time = act.timeEn;
    });

    return {
        metrics,
        inventory,
        recentActivity
    };
}

// Wrapper to execute logic within a database transaction
async function runInTransaction(fn) {
    await execSQL('BEGIN');
    try {
        const result = await fn();
        await execSQL('COMMIT');
        return result;
    } catch (e) {
        await execSQL('ROLLBACK');
        console.error('[Database] Transaction failed, rolled back:', e.message);
        throw e;
    }
}

// Helper to log history
async function logStockHistory(data) {
    const { productId, productNameEn, productNameTa, previousStock, addedQuantity, reducedQuantity, updatedStock, actionType, notes = null, userName } = data;
    await runSQL(`
        INSERT INTO stock_history (productId, productNameEn, productNameTa, previousStock, addedQuantity, reducedQuantity, updatedStock, actionType, notes, userName, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [productId, productNameEn, productNameTa, previousStock, addedQuantity, reducedQuantity, updatedStock, actionType, notes, userName, Date.now()]);
}

function getStockStatus(stock, limit) {
    if (stock < limit * 0.15) {
        return { statusEn: 'Danger Alert', statusTa: 'అపాయ్ ఎచ్ఛరிக்கை' };
    }
    if (stock < limit * 0.35) {
        return { statusEn: 'Low Stock', statusTa: 'குறைந்த இருப்பு' };
    }
    return { statusEn: 'Optimal', statusTa: 'சరியானது' };
}

export async function updateProductStock(productId, stock, userName) {
    return runInTransaction(async () => {
        const fruit = await getSQL('SELECT * FROM inventory WHERE id = ?', [productId]);
        if (!fruit || stock < 0) {
            throw new Error('Invalid product ID or stock value');
        }

        const { statusEn, statusTa } = getStockStatus(stock, fruit.limit);
        await runSQL('UPDATE inventory SET stock = ?, statusEn = ?, statusTa = ? WHERE id = ?', [stock, statusEn, statusTa, productId]);

        const stockDiff = stock - fruit.stock;
        const totalStock = await getSQL('SELECT value FROM metrics WHERE key = ?', ['totalStock']);
        const newTotalStock = Math.max(0, (totalStock?.value || 0) + stockDiff);
        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [newTotalStock, 'totalStock']);

        await logStockHistory({
            productId,
            productNameEn: fruit.nameEn,
            productNameTa: fruit.nameTa,
            previousStock: fruit.stock,
            addedQuantity: stockDiff > 0 ? stockDiff : 0,
            reducedQuantity: stockDiff < 0 ? Math.abs(stockDiff) : 0,
            updatedStock: stock,
            actionType: 'Stock Adjustment',
            notes: `Manual stock update by ${userName || 'Admin'}`,
            userName: userName || 'Admin'
        });

        return getDashboardState();
    });
}

export async function saveSalesReportItems(reports, userName) {
    if (!Array.isArray(reports)) {
        throw new Error('Reports payload must be an array');
    }

    return runInTransaction(async () => {
        const metricsRows = await allSQL('SELECT * FROM metrics');
        const m = {};
        for (const row of metricsRows) {
            m[row.key] = row.value;
        }

        for (const report of reports) {
            const { productId, quantitySold } = report;
            const fruit = await getSQL('SELECT * FROM inventory WHERE id = ?', [productId]);
            if (!fruit || typeof quantitySold !== 'number' || quantitySold <= 0 || quantitySold > fruit.stock) {
                throw new Error(`Invalid sale report for product ${productId}`);
            }

            const saleValue = quantitySold * fruit.price;
            const profit = saleValue - quantitySold * fruit.cost;
            const newStock = fruit.stock - quantitySold;
            const { statusEn, statusTa } = getStockStatus(newStock, fruit.limit);

            await runSQL('UPDATE inventory SET stock = ?, statusEn = ?, statusTa = ? WHERE id = ?', [newStock, statusEn, statusTa, productId]);

            m.totalStock = Math.max(0, (m.totalStock || 0) - quantitySold);
            m.todaySales = (m.todaySales || 0) + saleValue;
            m.netProfit = (m.netProfit || 0) + profit;

            await runSQL(`
                INSERT INTO activity_log (type, fruitEn, fruitTa, qty, value, timestamp, timeEn, timeTa)
                VALUES ('sale', ?, ?, ?, ?, ?, 'Just now', 'சరியாக இப்போது')
            `, [fruit.nameEn, fruit.nameTa, quantitySold, saleValue, Date.now()]);

            await logStockHistory({
                productId,
                productNameEn: fruit.nameEn,
                productNameTa: fruit.nameTa,
                previousStock: fruit.stock,
                addedQuantity: 0,
                reducedQuantity: quantitySold,
                updatedStock: newStock,
                actionType: 'Sale',
                userName: userName || 'POS System'
            });
        }

        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [m.totalStock, 'totalStock']);
        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [m.todaySales, 'todaySales']);
        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [m.netProfit, 'netProfit']);

        return getDashboardState();
    });
}

// Record sale operation
export async function recordSale(fruitId, qty, userName) {
    return runInTransaction(async () => {
        const fruit = await getSQL('SELECT * FROM inventory WHERE id = ?', [fruitId]);
        if (!fruit || qty <= 0 || qty > fruit.stock) {
            throw new Error('Invalid fruit or insufficient inventory stock');
        }

        const saleValue = qty * fruit.price;
        const saleCost = qty * fruit.cost;
        const profit = saleValue - saleCost;
        const newStock = fruit.stock - qty;

        let statusEn = 'Optimal';
        let statusTa = 'சరியானது';
        if (newStock < fruit.limit * 0.15) {
            statusEn = 'Danger Alert';
            statusTa = 'అపాయ్ ఎచ్ఛরிக்கை';
        } else if (newStock < fruit.limit * 0.35) {
            statusEn = 'Low Stock';
            statusTa = 'குறைந்த இருப்பு';
        }

        await runSQL('UPDATE inventory SET stock = ?, statusEn = ?, statusTa = ? WHERE id = ?', [newStock, statusEn, statusTa, fruitId]);
        const metricsRows = await allSQL('SELECT * FROM metrics');
        const m = {};
        for (const r of metricsRows) {
            m[r.key] = r.value;
        }

        const newTotalStock = Math.max(0, m.totalStock - qty);
        const newTodaySales = m.todaySales + saleValue;
        const newNetProfit = m.netProfit + profit;

        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [newTotalStock, 'totalStock']);
        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [newTodaySales, 'todaySales']);
        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [newNetProfit, 'netProfit']);

        await runSQL(`
            INSERT INTO activity_log (type, fruitEn, fruitTa, qty, value, timestamp, timeEn, timeTa)
            VALUES ('sale', ?, ?, ?, ?, ?, 'Just now', 'சరியாக இப்போது')
        `, [fruit.nameEn, fruit.nameTa, qty, saleValue, Date.now()]);

        await logStockHistory({
            productId: fruitId,
            productNameEn: fruit.nameEn,
            productNameTa: fruit.nameTa,
            previousStock: fruit.stock,
            addedQuantity: 0,
            reducedQuantity: qty,
            updatedStock: newStock,
            actionType: 'Sale',
            userName: userName || 'POS System'
        });

        return getDashboardState();
    });
}

// Record restock operation
export async function recordRestock(fruitId, qty, userName) {
    return runInTransaction(async () => {
        const fruit = await getSQL('SELECT * FROM inventory WHERE id = ?', [fruitId]);
        if (!fruit || qty <= 0) {
            throw new Error('Invalid fruit or replenishment quantity');
        }

        const costValue = qty * fruit.cost;
        const newStock = fruit.stock + qty;

        let statusEn = 'Optimal';
        let statusTa = 'சరியானது';
        if (newStock < fruit.limit * 0.15) {
            statusEn = 'Danger Alert';
            statusTa = 'అపాయ్ ఎచ్ఛరிக்கை';
        } else if (newStock < fruit.limit * 0.35) {
            statusEn = 'Low Stock';
            statusTa = 'குறைந்த இருப்பு';
        }

        await runSQL('UPDATE inventory SET stock = ?, statusEn = ?, statusTa = ? WHERE id = ?', [newStock, statusEn, statusTa, fruitId]);
        const totalStockVal = await getSQL("SELECT value FROM metrics WHERE key = 'totalStock'");
        await runSQL("UPDATE metrics SET value = ? WHERE key = 'totalStock'", [totalStockVal.value + qty]);

        await runSQL(`
            INSERT INTO activity_log (type, fruitEn, fruitTa, qty, value, timestamp, timeEn, timeTa)
            VALUES ('restock', ?, ?, ?, ?, ?, 'Just now', 'சரியாக இப்போது')
        `, [fruit.nameEn, fruit.nameTa, qty, costValue, Date.now()]);

        await logStockHistory({
            productId: fruitId,
            productNameEn: fruit.nameEn,
            productNameTa: fruit.nameTa,
            previousStock: fruit.stock,
            addedQuantity: qty,
            reducedQuantity: 0,
            updatedStock: newStock,
            actionType: 'Restock',
            userName: userName || 'Warehouse'
        });

        return getDashboardState();
    });
}

// Record waste/spoilage operation
export async function recordWaste(fruitId, qty, notes, userName) {
    return runInTransaction(async () => {
        const fruit = await getSQL('SELECT * FROM inventory WHERE id = ?', [fruitId]);
        if (!fruit || qty <= 0 || qty > fruit.stock) {
            throw new Error('Invalid fruit or insufficient inventory stock');
        }

        const newStock = fruit.stock - qty;
        let statusEn = 'Optimal';
        let statusTa = 'சరியானது';
        if (newStock < fruit.limit * 0.15) {
            statusEn = 'Danger Alert';
            statusTa = 'అపాయ్ ఎచ్ఛరிக்கை';
        } else if (newStock < fruit.limit * 0.35) {
            statusEn = 'Low Stock';
            statusTa = 'குறைந்த இருப்பு';
        }

        await runSQL('UPDATE inventory SET stock = ?, statusEn = ?, statusTa = ? WHERE id = ?', [newStock, statusEn, statusTa, fruitId]);
        await runSQL(`
            INSERT INTO activity_log (type, fruitEn, fruitTa, qty, value, timestamp, timeEn, timeTa)
            VALUES ('waste', ?, ?, ?, 0, ?, 'Just now', 'சரியாக இப்போது')
        `, [fruit.nameEn, fruit.nameTa, qty, Date.now()]);

        const totalStockRow = await getSQL("SELECT value FROM metrics WHERE key = 'totalStock'");
        await runSQL('UPDATE metrics SET value = ? WHERE key = ?', [Math.max(0, (totalStockRow ? totalStockRow.value : 0) - qty), 'totalStock']);

        await logStockHistory({
            productId: fruitId,
            productNameEn: fruit.nameEn,
            productNameTa: fruit.nameTa,
            previousStock: fruit.stock,
            addedQuantity: 0,
            reducedQuantity: qty,
            updatedStock: newStock,
            actionType: 'Waste',
            notes: notes || 'Spoilage',
            userName: userName || 'Admin'
        });

        return getDashboardState();
    });
}

// Add custom fruit variety
export async function addFruit(fruitData, userName) {
    return runInTransaction(async () => {
        const { nameEn, nameTa, price, cost, threshold } = fruitData;
        const id = 'fruit-' + Date.now();
        const limit = (threshold || 100) * 3;
        const statusEn = 'Danger Alert';
        const statusTa = 'అపాయ్ ఎచ్ఛరிக்கை';

        await runSQL(`
            INSERT INTO inventory (id, nameEn, nameTa, stock, lastUpdatedStock, "limit", price, cost, unitEn, unitTa, statusEn, statusTa, emoji, accent, accentGlow)
            VALUES (?, ?, ?, 0, 0, ?, ?, ?, 'kg', 'கிலோ', ?, ?, '🍇', '#8b5cf6', 'rgba(139, 92, 246, 0.4)')
        `, [id, nameEn, nameTa, limit, price, cost, statusEn, statusTa]);

        await logStockHistory({
            productId: id,
            productNameEn: nameEn,
            productNameTa: nameTa,
            previousStock: 0,
            addedQuantity: 0,
            reducedQuantity: 0,
            updatedStock: 0,
            actionType: 'Creation',
            userName: userName || 'Admin'
        });

        return getDashboardState();
    });
}

// Update custom fruit variety
export async function updateFruit(id, fruitData, userName) {
    return runInTransaction(async () => {
        const { nameEn, nameTa, stock, price, cost, limit, notes } = fruitData;
        const currentFruit = await getSQL('SELECT * FROM inventory WHERE id = ?', [id]);
        const lastUpdatedStock = currentFruit ? currentFruit.stock : stock;

        let statusEn = 'Optimal';
        let statusTa = 'சరியானது';
        if (stock < limit * 0.15) {
            statusEn = 'Danger Alert';
            statusTa = 'అపాయ్ ఎచ్ఛరிக்கை';
        } else if (stock < limit * 0.35) {
            statusEn = 'Low Stock';
            statusTa = 'குறைந்த இருப்பு';
        }

        await runSQL(`
            UPDATE inventory 
            SET nameEn = ?, nameTa = ?, stock = ?, lastUpdatedStock = ?, "limit" = ?, price = ?, cost = ?, statusEn = ?, statusTa = ?
            WHERE id = ?
        `, [nameEn, nameTa, stock, lastUpdatedStock, limit, price, cost, statusEn, statusTa, id]);

        const stockRow = await getSQL('SELECT SUM(stock) as total FROM inventory');
        await runSQL("UPDATE metrics SET value = ? WHERE key = 'totalStock'", [stockRow?.total || 0]);

        const stockDiff = stock - (currentFruit ? currentFruit.stock : 0);
        const priceChanged = currentFruit && currentFruit.price !== price;
        const costChanged = currentFruit && currentFruit.cost !== cost;

        if (stockDiff !== 0 || priceChanged || costChanged) {
            let action = 'Adjustment';
            const notesArr = [];
            if (priceChanged) notesArr.push(`Price: ₹${currentFruit.price} -> ₹${price}`);
            if (costChanged) notesArr.push(`Cost: ₹${currentFruit.cost} -> ₹${cost}`);
            if (priceChanged || costChanged) action = stockDiff === 0 ? 'Price Update' : 'Adjustment';

            await logStockHistory({
                productId: id,
                productNameEn: nameEn,
                productNameTa: nameTa,
                previousStock: currentFruit ? currentFruit.stock : 0,
                addedQuantity: stockDiff > 0 ? stockDiff : 0,
                reducedQuantity: stockDiff < 0 ? Math.abs(stockDiff) : 0,
                updatedStock: stock,
                actionType: action,
                notes: notes || notesArr.join(', ') || null,
                userName: userName || 'Admin'
            });
        }

        return getDashboardState();
    });
}

// Remove fruit variety
export async function removeFruit(id) {
    return runInTransaction(async () => {
        const result = await runSQL('DELETE FROM inventory WHERE id = ?', [id]);
        if (result.changes === 0) {
            throw new Error(`Fruit variety with ID "${id}" not found in inventory`);
        }

        const stockResult = await getSQL('SELECT SUM(stock) as total FROM inventory');
        const newTotalStock = stockResult?.total || 0;
        await runSQL("UPDATE metrics SET value = ? WHERE key = 'totalStock'", [newTotalStock]);

        console.log(`[Database] Fruit variety '${id}' removed successfully. New total stock: ${newTotalStock} kg`);
        return getDashboardState();
    });
}

// Fetch stock history with basic filtering
export async function getStockHistory(filters = {}) {
    const f = filters || {};
    let sql = 'SELECT * FROM stock_history WHERE 1=1';
    const params = [];

    if (f.productId && f.productId !== 'All') {
        sql += ' AND productId = ?';
        params.push(f.productId);
    }

    if (f.search) {
        sql += ' AND (productNameEn LIKE ? OR productNameTa LIKE ? OR userName LIKE ?)';
        const search = `%${f.search}%`;
        params.push(search, search, search);
    }

    if (f.actionType && f.actionType !== 'All') {
        sql += ' AND actionType = ?';
        params.push(f.actionType);
    }

    sql += ' ORDER BY createdAt DESC';
    return allSQL(sql, params);
}

export async function getStockHistoryMetrics(filters = {}) {
    const f = filters || {};
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    let whereClause = ' WHERE createdAt >= ?';
    const params = [startOfDay];

    if (f.productId && f.productId !== 'All') {
        whereClause += ' AND productId = ?';
        params.push(f.productId);
    }

    const addedTodayRow = await getSQL(`SELECT SUM(addedQuantity) as total FROM stock_history ${whereClause}`, params);
    const salesTodayRow = await getSQL(`SELECT SUM(reducedQuantity) as total FROM stock_history ${whereClause} AND actionType = 'Sale'`, params);
    const wasteTodayRow = await getSQL(`SELECT SUM(reducedQuantity) as total FROM stock_history ${whereClause} AND actionType = 'Waste'`, params);
    const totalTransactionsRow = await getSQL(`SELECT COUNT(*) as count FROM stock_history ${whereClause}`, params);
    const mostUpdated = await getSQL(`SELECT productNameEn, productNameTa FROM stock_history GROUP BY productId ORDER BY COUNT(*) DESC LIMIT 1`);

    return {
        addedToday: addedTodayRow?.total || 0,
        salesToday: salesTodayRow?.total || 0,
        wasteToday: wasteTodayRow?.total || 0,
        totalTransactions: totalTransactionsRow?.count || 0,
        mostUpdatedEn: mostUpdated ? mostUpdated.productNameEn : '-',
        mostUpdatedTa: mostUpdated ? mostUpdated.productNameTa : '-'
    };
}

// Authenticate user
export async function authenticateUser(username, password) {
    if (!username || !password) {
        return null;
    }

    const user = await getSQL('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !user.password) {
        return null;
    }

    try {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            return { username: user.username, role: user.role };
        }
    } catch (err) {
        console.warn('[Auth] bcrypt compare failed:', err.message);
    }

    return null;
}

await initDatabase();
