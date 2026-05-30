import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve frontend files

const validTokens = new Set();

const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token || !validTokens.has(token)) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
};

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password are required' });
        }

        const user = await db.authenticateUser(username, password);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const token = crypto.randomBytes(24).toString('hex');
        validTokens.add(token);

        res.json({ success: true, token, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Routes
app.get('/api/state', requireAuth, async (req, res) => {
    try {
        const state = await db.getDashboardState();
        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/history', requireAuth, async (req, res) => {
    try {
        const history = await db.getStockHistory(req.query);
        const metrics = await db.getStockHistoryMetrics(req.query);
        res.json({ success: true, history, metrics });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/fruits', requireAuth, async (req, res) => {
    try {
        const state = await db.addFruit(req.body, 'SK Fruits Admin');
        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/fruits/:id', requireAuth, async (req, res) => {
    try {
        const state = await db.updateFruit(req.params.id, req.body, 'SK Fruits Admin');
        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/fruits/:id', requireAuth, async (req, res) => {
    try {
        const state = await db.removeFruit(req.params.id);
        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/transactions/:type', requireAuth, async (req, res) => {
    try {
        const { fruitId, qty, notes } = req.body;
        const type = req.params.type;
        let state;

        if (type === 'sell') {
            state = await db.recordSale(fruitId, qty, 'SK Fruits Admin');
        } else if (type === 'restock') {
            state = await db.recordRestock(fruitId, qty, 'SK Fruits Admin');
        } else if (type === 'waste') {
            state = await db.recordWaste(fruitId, qty, notes, 'SK Fruits Admin');
        } else {
            return res.status(400).json({ success: false, error: 'Invalid transaction type' });
        }

        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/daily-sales', (req, res) => {
    res.sendFile(path.join(__dirname, 'daily-sales.html'));
});

app.post('/api/sales-report', requireAuth, async (req, res) => {
    try {
        const reports = Array.isArray(req.body) ? req.body : req.body.reports;
        if (!Array.isArray(reports) || reports.length === 0) {
            return res.status(400).json({ success: false, error: 'Sales report payload must contain at least one item' });
        }

        const state = await db.saveSalesReportItems(reports, 'SK Fruits Admin');
        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/products/:id/stock', requireAuth, async (req, res) => {
    try {
        const stock = Number(req.body.stock);
        if (Number.isNaN(stock)) {
            return res.status(400).json({ success: false, error: 'Invalid stock value' });
        }
        const state = await db.updateProductStock(req.params.id, stock, 'SK Fruits Admin');
        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const startServer = (port) => {
    const server = app.listen(port, () => {
        console.log(`Fruit Analyzer Database Server running at http://localhost:${port}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[Server] Port ${port} is already in use. Trying port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('[Server] Failed to start:', err);
            process.exit(1);
        }
    });
    return server;
};

// Start server unless running tests
if (process.env.NODE_ENV !== 'test') {
    startServer(Number(process.env.PORT) || PORT);
}

export default app;