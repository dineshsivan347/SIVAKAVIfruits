/**
 * Database entry: MongoDB (production/dev). In-memory only when NODE_ENV=test.
 */
import 'dotenv/config';

const useMemory = process.env.NODE_ENV === 'test' && !process.env.MONGO_URI;
const fallbackToMemoryOnMongoFail = process.env.NODE_ENV !== 'test' && process.env.MONGO_URI && process.env.MONGO_FALLBACK_ON_FAIL === '1';

// In test mode, prefer the in-memory DB regardless of whether MONGO_URI is set.
// This keeps smoke tests deterministic and avoids failures when Atlas is unreachable.
const forceUseMemoryInTests = process.env.NODE_ENV === 'test';



if (!useMemory && !process.env.MONGO_URI) {
    console.error(
        '[Database] MONGO_URI is not set. Create a .env file (see .env.example) with your MongoDB Atlas connection string.'
    );
}

let backend;
if (useMemory || forceUseMemoryInTests) {
    backend = await import('./db_memory.js');
} else {
    backend = await import('./db_mongo.js');

    // Optional: fall back to in-memory when Mongo is unreachable.
    if (fallbackToMemoryOnMongoFail) {
        try {
            await backend.getDashboardState();
        } catch {
            backend = await import('./db_memory.js');
        }
    }
}

if (useMemory) {
    console.log('[Database] In-memory (tests only)');
} else {
    console.log(`[Database] MongoDB → ${process.env.MONGO_DB_NAME || 'sk_fruits'}`);
}

export const getDashboardState = backend.getDashboardState;
export const updateProductStock = backend.updateProductStock;
export const saveSalesReportItems = backend.saveSalesReportItems;
export const recordSale = backend.recordSale;
export const recordRestock = backend.recordRestock;
export const recordWaste = backend.recordWaste;
export const addFruit = backend.addFruit;
export const updateFruit = backend.updateFruit;
export const removeFruit = backend.removeFruit;
export const getStockHistory = backend.getStockHistory;
export const getStockHistoryMetrics = backend.getStockHistoryMetrics;
export const authenticateUser = backend.authenticateUser;
