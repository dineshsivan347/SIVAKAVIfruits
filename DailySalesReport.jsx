const { useState, useEffect } = React;

const apiFetch = async (url, options = {}) => {
  const token = localStorage.getItem('sk_auth_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  if ([401, 403].includes(response.status)) {
    window.location.href = 'login.html';
    throw new Error('Unauthorized');
  }
  return response;
};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const formatUnits = (value) => `${Number(value || 0).toFixed(2)} kg`;
const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

function DailySalesReport() {
  const [inventory, setInventory] = useState([]);
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rangeLoading, setRangeLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadPageData();
  }, []);

  const normalizeRow = (item) => ({
    productId: item.id,
    productName: item.nameEn,
    currentStock: Number(item.stock || 0),
    sellingPrice: Number(item.price || 0),
    soldToday: 0,
    salesValue: 0,
    remainingStock: Number(item.stock || 0),
    error: ''
  });

  const loadPageData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const stateRes = await apiFetch('/api/state');
      const stateJson = await stateRes.json();
      if (!stateJson.success) {
        throw new Error(stateJson.error || 'Could not load inventory state');
      }
      const inventoryItems = Array.isArray(stateJson.state?.inventory) ? stateJson.state.inventory : [];
      setInventory(inventoryItems);
      setRows(inventoryItems.map(normalizeRow));
      await loadHistoryData(inventoryItems);
    } catch (err) {
      setErrorMessage(err.message || 'Unable to load report data');
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryData = async (currentInventory) => {
    try {
      const response = await apiFetch('/api/history');
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Unable to load sales history');
      }

      const rawHistory = Array.isArray(data.history)
        ? data.history.filter((item) => item.actionType === 'Sale').slice(0, 10)
        : [];

      const activeInventory = currentInventory || inventory;

      // Enrich salesHistory with salesValue by looking up fruit price from inventory
      const enrichedSalesHistory = rawHistory.map(item => {
        const fruit = activeInventory.find(f => f.id === item.productId);
        const sellingPrice = fruit ? fruit.price : 0;
        const quantitySold = item.reducedQuantity || item.qty || 0;
        const salesValue = quantitySold * sellingPrice;
        return { 
          ...item, 
          value: salesValue, 
          fruitEn: fruit ? fruit.nameEn : (item.productNameEn || item.fruitEn || '-') 
        };
      });

      setHistory(enrichedSalesHistory);
    } catch (err) {
      setErrorMessage(err.message || 'Unable to load history');
    }
  };

  const loadHistoryForRange = async (from, to) => {
    setRangeLoading(true);
    setErrorMessage('');
    try {
      const qs = [];
      if (from) qs.push(`from=${encodeURIComponent(from)}`);
      if (to) qs.push(`to=${encodeURIComponent(to)}`);
      const url = `/api/history${qs.length ? ('?' + qs.join('&')) : ''}`;
      const response = await apiFetch(url);
      const data = await response.json();

      if (!data.success) {
        // fallback: attempt to filter already-loaded history client-side
        const raw = Array.isArray(history) ? history : [];
        const filtered = raw.filter(it => {
          const d = new Date(it.createdAt);
          const fromD = from ? new Date(from) : null;
          const toD = to ? new Date(to) : null;
          if (fromD && d < fromD) return false;
          if (toD && d > new Date(new Date(to).setHours(23,59,59,999))) return false;
          return true;
        });
        setHistory(filtered);
        setReportMode('range');
        return;
      }

      const rawHistory = Array.isArray(data.history)
        ? data.history.filter((item) => item.actionType === 'Sale')
        : [];

      const activeInventory = inventory;
      const enrichedSalesHistory = rawHistory.map(item => {
        const fruit = activeInventory.find(f => f.id === item.productId);
        const sellingPrice = fruit ? fruit.price : 0;
        const quantitySold = item.reducedQuantity || item.qty || 0;
        const salesValue = quantitySold * sellingPrice;
        return {
          ...item,
          value: salesValue,
          fruitEn: fruit ? fruit.nameEn : (item.productNameEn || item.fruitEn || '-')
        };
      });

      const totalQuantitySoldRange = enrichedSalesHistory.reduce((sum, h) => sum + (h.reducedQuantity || h.qty || 0), 0);
      const totalSalesValueRange = enrichedSalesHistory.reduce((sum, h) => sum + (h.value || 0), 0);

      const byFruit = new Map();
      enrichedSalesHistory.forEach(h => {
        const pid = h.productId;
        const qty = Number(h.reducedQuantity || h.qty || 0);
        const name = h.fruitEn || '-';
        const prev = byFruit.get(pid) || { productId: pid, productName: name, soldToday: 0 };
        prev.soldToday += qty;
        byFruit.set(pid, prev);
      });
      const bestSellingRange = Array.from(byFruit.values()).reduce(
        (best, cur) => (cur.soldToday > best.soldToday ? cur : best),
        { soldToday: 0, productName: '-' }
      );

      // Remaining inventory estimate for the selected range:
      // Use current inventory snapshot and subtract total sold in range.
      const currentTotalStock = inventory.reduce((sum, f) => sum + Number(f.stock || 0), 0);
      const totalRemainingRange = currentTotalStock - totalQuantitySoldRange;

      setRangeMetrics({
        totalSalesValue: totalSalesValueRange,
        totalQuantitySold: totalQuantitySoldRange,
        totalRemaining: totalRemainingRange,
        bestSelling: bestSellingRange
      });

      setHistory(enrichedSalesHistory);
      setReportMode('range');
    } catch (err) {
      setErrorMessage(err.message || 'Unable to load history for range');
    } finally {
      setRangeLoading(false);
    }
  };

  const updateRow = (productId, updater) => {
    setRows((currentRows) => currentRows.map((row) => (row.productId === productId ? updater(row) : row)));
  };

  const handleQuantityChange = (productId, rawValue) => {
    const value = Number(rawValue);
    updateRow(productId, (row) => {
      const soldToday = Number.isFinite(value) && value > 0 ? Math.min(Math.max(0, value), row.currentStock) : 0;
      const error = soldToday > row.currentStock ? 'Sold quantity cannot exceed available stock.' : '';
      const remainingStock = row.currentStock - soldToday;
      return {
        ...row,
        soldToday,
        salesValue: soldToday * row.sellingPrice,
        remainingStock,
        error
      };
    });
  };

  const handleQuantityAdjust = (productId, delta) => {
    const row = rows.find((r) => r.productId === productId);
    if (!row) return;
    handleQuantityChange(productId, row.soldToday + delta);
  };

  const salesRows = rows.filter((row) => row.currentStock >= 0);
  const todayTotalQuantitySold = salesRows.reduce((sum, row) => sum + row.soldToday, 0);
  const todayTotalSalesValue = salesRows.reduce((sum, row) => sum + row.salesValue, 0);
  const todayTotalRemaining = salesRows.reduce((sum, row) => sum + row.remainingStock, 0);
  const todayBestSelling = salesRows.reduce((best, row) => (row.soldToday > best.soldToday ? row : best), { soldToday: 0, productName: '-' });

  const totalQuantitySold = reportMode === 'range' ? rangeMetrics.totalQuantitySold : todayTotalQuantitySold;
  const totalSalesValue = reportMode === 'range' ? rangeMetrics.totalSalesValue : todayTotalSalesValue;
  const totalRemaining = reportMode === 'range' ? rangeMetrics.totalRemaining : todayTotalRemaining;
  const bestSelling = reportMode === 'range' ? rangeMetrics.bestSelling : todayBestSelling;


  useEffect(() => {
    console.debug('DailySalesReport debug:', {
      rows,
      totalQuantitySold,
      totalSalesValue,
      totalRemaining,
      bestSelling
    });
  }, [rows]);

  const handleSaveReport = async () => {
    setErrorMessage('');
    setStatusMessage('');
    const salesItems = rows.filter((row) => row.soldToday > 0);
    if (salesItems.length === 0) {
      setErrorMessage('Enter at least one sold quantity before saving.');
      return;
    }
    const hasInvalid = salesItems.some((row) => row.error);
    if (hasInvalid) {
      setErrorMessage('Please fix invalid sold quantities before saving.');
      return;
    }

    setSaving(true);
    try {
      const payload = salesItems.map((row) => ({
        productId: row.productId,
        quantitySold: row.soldToday,
        salesValue: row.salesValue,
        previousStock: row.currentStock,
        remainingStock: row.remainingStock,
        date: new Date().toISOString()
      }));
      const response = await apiFetch('/api/sales-report', {
        method: 'POST',
        body: JSON.stringify({ reports: payload })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Save failed');
      }
      setStatusMessage('Today\'s sales report saved and stock updated successfully.');
      const inventoryItems = Array.isArray(data.state?.inventory) ? data.state.inventory : inventory;
      setInventory(inventoryItems);
      setRows(inventoryItems.map(normalizeRow));
      await loadHistoryData(inventoryItems);
    } catch (err) {
      setErrorMessage(err.message || 'Save report failed');
    } finally {
      setSaving(false);
    }
  };

  const downloadCSV = () => {
    const headers = ['Fruit Name', 'Current Stock', 'Selling Price', 'Sold Today', 'Sales Value', 'Remaining Stock'];
    const lines = [headers.join(',')];
    rows.forEach((row) => {
      lines.push([
        `"${row.productName}"`,
        row.currentStock,
        row.sellingPrice,
        row.soldToday,
        row.salesValue,
        row.remainingStock
      ].join(','));
    });
    lines.push('');
    lines.push(`Total Quantity Sold,${totalQuantitySold}`);
    lines.push(`Total Sales Value,${totalSalesValue}`);
    lines.push(`Remaining Inventory,${totalRemaining}`);
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `daily-sales-report-${new Date().toISOString().slice(0,10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const [reportMode, setReportMode] = useState('today'); // 'today' | 'range'
  const [rangeMetrics, setRangeMetrics] = useState({
    totalSalesValue: 0,
    totalQuantitySold: 0,
    totalRemaining: 0,
    bestSelling: { productName: '-', soldToday: 0 }
  });

  // Clear range selection and go back to today mode when inputs are emptied
  useEffect(() => {
    if (!fromDate && !toDate) {
      setReportMode('today');
      setRangeMetrics({
        totalSalesValue: 0,
        totalQuantitySold: 0,
        totalRemaining: 0,
        bestSelling: { productName: '-', soldToday: 0 }
      });
    }
  }, [fromDate, toDate]);


  const handlePrint = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const handlePrintRange = async () => {
    if (fromDate || toDate) {
      await loadHistoryForRange(fromDate, toDate);
    }
    setReportMode('range');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  return (
    <div className="max-w-[1500px] mx-auto daily-sales-print-root">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div>
          <p className="text-sm text-emerald-300 uppercase tracking-[0.3em]">Daily report</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Daily Sales Report</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">Track sold quantities, remaining stock, and update inventory automatically at the end of each day.</p>
        </div>
        <div className="flex flex-wrap gap-3 print-hidden">
          <button onClick={handlePrint} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
            <span className="text-lg">📄</span> Print Report
          </button>
          <button onClick={downloadCSV} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400">
            <span className="text-lg">📥</span> Export CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl shadow-slate-950/10">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Today&apos;s Sales Value</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-200">
              <span className="text-lg">↑</span>
            </div>
            <div>
              <p className="text-3xl font-semibold text-white">{formatCurrency(totalSalesValue)}</p>
              {reportMode === 'range' ? (
                <p className="text-sm text-slate-400">Calculated from selected range sales</p>
              ) : (
                <p className="text-sm text-slate-400">Calculated instantly from sold quantities</p>
              )}
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl shadow-slate-950/10">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Total Quantity Sold</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-700/60 text-slate-100">
              <span className="text-lg">📦</span>
            </div>
            <div>
              <p className="text-3xl font-semibold text-white">{formatUnits(totalQuantitySold)}</p>
              <p className="text-sm text-slate-400">Sum of all product sales today</p>
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl shadow-slate-950/10">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Remaining Inventory</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-200">
              <span className="text-lg">↗</span>
            </div>
            <div>
              <p className="text-3xl font-semibold text-white">{formatUnits(totalRemaining)}</p>
              <p className="text-sm text-slate-400">Estimated ending stock for current products</p>
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl shadow-slate-950/10">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Best Selling Fruit</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-500/10 text-pink-200">
              <span className="text-lg">✔️</span>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{bestSelling.productName || '-'}</p>
              <p className="text-sm text-slate-400">{bestSelling.soldToday > 0 ? `${bestSelling.soldToday} kg sold` : 'No sales entered yet'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl shadow-slate-950/10 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-white">Sales Input Table</p>
            <p className="mt-1 text-sm text-slate-400">Update sold quantities for each fruit and preview revenue instantly.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 print-hidden">
            <button onClick={handleSaveReport} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-fruitgreen px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
              <span className="text-lg">📝</span> {saving ? 'Saving...' : 'Save Today\'s Sales'}
            </button>
            <button onClick={downloadCSV} className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800">
              <span className="text-lg">📥</span> Export CSV
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            <span className="inline text-base align-middle">⚠️</span> <span>{errorMessage}</span>
          </div>
        )}
        {statusMessage && (
          <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="mt-6 table-scroll">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-300">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="px-4 py-4 rounded-tl-3xl">Fruit Name</th>
                <th className="px-4 py-4">Current Stock</th>
                <th className="px-4 py-4">Selling Price</th>
                <th className="px-4 py-4">Sold Today</th>
                <th className="px-4 py-4">Sales Value</th>
                <th className="px-4 py-4 rounded-tr-3xl">Remaining Stock</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-400">Loading inventory data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-400">No products available.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.productId} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-4 font-medium text-white">{row.productName}</td>
                  <td className="px-4 py-4">{formatUnits(row.currentStock)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.sellingPrice)}</td>
                  <td className="px-4 py-4">
                    <div className="print-hide-controls flex items-center gap-2 max-w-[220px] rounded-2xl border border-slate-700 bg-slate-950/90 p-1">
                      <button
                        type="button"
                        onClick={() => handleQuantityAdjust(row.productId, -1)}
                        className="print-hidden inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-slate-200 transition hover:bg-slate-700"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        max={row.currentStock}
                        step="any"
                        value={row.soldToday}
                        onChange={(e) => handleQuantityChange(row.productId, e.target.value)}
                        className="h-10 flex-1 min-w-[56px] rounded-2xl border border-transparent bg-transparent px-3 text-right text-white outline-none focus:border-fruitgreen focus:ring-2 focus:ring-fruitgreen/20"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityAdjust(row.productId, 1)}
                        className="print-hidden inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800 text-slate-200 transition hover:bg-slate-700"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    {row.error && <p className="mt-2 text-xs text-red-300">{row.error}</p>}
                  </td>
                  <td className="px-4 py-4 text-white">{formatCurrency(row.salesValue)}</td>
                  <td className="px-4 py-4 text-white">{formatUnits(row.remainingStock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl shadow-slate-950/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-white">Recent Sales Reports</p>
            <p className="mt-1 text-sm text-slate-400">Latest sale entries and remaining stock snapshots from today.</p>
          </div>
          <div className="flex items-center gap-3 text-slate-400 print-hidden">
                <span className="text-lg">📝</span> <span>{todayLabel}</span>
          </div>
        </div>

            <div className="mt-4 flex items-center gap-3 print-hidden">
              <label className="text-sm text-slate-400">From:</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" />
              <label className="text-sm text-slate-400">To:</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" />
              <button onClick={() => loadHistoryForRange(fromDate, toDate)} disabled={rangeLoading} className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500">
                {rangeLoading ? 'Loading...' : 'Load Report'}
              </button>
              <button onClick={() => handlePrintRange()} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400">
                📄 Print Range
              </button>
            </div>

            <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="px-4 py-4">Date</th>
                <th className="px-4 py-4">Fruit</th>
                <th className="px-4 py-4">Quantity Sold</th>
                <th className="px-4 py-4">Sales Value</th>
                <th className="px-4 py-4">Remaining Stock</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan="5" className="px-4 py-6 text-center text-slate-400">No sales history available yet.</td></tr>
              ) : history.map((item) => (
                <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-4">{new Date(item.createdAt).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-4">{item.fruitEn}</td>
                  <td className="px-4 py-4">{formatUnits(item.reducedQuantity || item.qty)}</td>
                  <td className="px-4 py-4">{formatCurrency(item.value)}</td>
                  <td className="px-4 py-4">{formatUnits(item.updatedStock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
