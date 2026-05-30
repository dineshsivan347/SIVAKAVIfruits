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

function triggerReportPrint(onBeforePrint) {
  if (typeof onBeforePrint === 'function') {
    onBeforePrint();
  }
  document.body.classList.add('is-printing-report');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('is-printing-report');
  }, { once: true });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
  });
}

function SoldQuantityInput({ row, onAdjust, onChange, compact = false }) {
  return (
    <>
      <span className="print-only-value">{Number(row.soldToday || 0).toFixed(2)} kg</span>
      <div className={`no-print print-hide-controls flex w-full items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/90 p-1${compact ? ' md:max-w-[220px]' : ''}`}>
        <button
          type="button"
          onClick={() => onAdjust(row.productId, -1)}
          className="print-hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-lg text-slate-200 transition hover:bg-slate-700"
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
          onChange={(e) => onChange(row.productId, e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-2xl border border-transparent bg-transparent px-2 text-center text-base text-white outline-none focus:border-fruitgreen focus:ring-2 focus:ring-fruitgreen/20"
        />
        <button
          type="button"
          onClick={() => onAdjust(row.productId, 1)}
          className="print-hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-lg text-slate-200 transition hover:bg-slate-700"
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
      {row.error && <p className="mt-2 text-xs text-red-300">{row.error}</p>}
    </>
  );
}

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
    const rangeSection = document.getElementById('daily-sales-range-section');
    if (rangeSection) rangeSection.classList.add('no-print');
    triggerReportPrint(() => {
      const meta = document.getElementById('daily-sales-print-meta');
      if (meta) {
        meta.textContent = `Report Date: ${todayLabel} | Generated: ${new Date().toLocaleString('en-IN')}`;
      }
    });
  };

  const handlePrintRange = async () => {
    if (fromDate || toDate) {
      await loadHistoryForRange(fromDate, toDate);
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }
    setReportMode('range');
    const rangeSection = document.getElementById('daily-sales-range-section');
    if (rangeSection) rangeSection.classList.remove('no-print');
    triggerReportPrint(() => {
      const meta = document.getElementById('daily-sales-print-meta');
      if (meta) {
        const rangeLabel = fromDate && toDate
          ? `${fromDate} to ${toDate}`
          : fromDate || toDate || todayLabel;
        meta.textContent = `Period: ${rangeLabel} | Generated: ${new Date().toLocaleString('en-IN')}`;
      }
    });
    window.addEventListener('afterprint', () => {
      if (rangeSection) rangeSection.classList.add('no-print');
    }, { once: true });
  };

  return (
    <div className="max-w-[1500px] mx-auto">
      <div className="no-print mb-6 flex flex-col gap-4">
        <div>
          <p className="text-sm text-emerald-300 uppercase tracking-[0.3em]">Daily report</p>
          <h1 className="mt-2 text-2xl font-semibold text-white leading-tight">Daily Sales Report</h1>
          <p className="mt-2 text-sm text-slate-400">Track sold quantities, remaining stock, and update inventory at the end of each day.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <button onClick={handlePrint} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            <span className="text-lg">📄</span> Print Report
          </button>
          <button onClick={downloadCSV} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400">
            <span className="text-lg">📥</span> Export CSV
          </button>
        </div>
      </div>

      <div id="report-print-area">
        <div className="report-print-header">
          <h1 className="report-print-title">SK Fruits — Daily Sales Report</h1>
          <p className="report-print-meta" id="daily-sales-print-meta"></p>
        </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <div className="glass-panel rounded-3xl border border-white/10 p-6 shadow-2xl shadow-slate-950/10">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Today&apos;s Sales Value</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="no-print inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-200">
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
            <div className="no-print inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-700/60 text-slate-100">
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
            <div className="no-print inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-200">
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
            <div className="no-print inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-500/10 text-pink-200">
              <span className="text-lg">✔️</span>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{bestSelling.productName || '-'}</p>
              <p className="text-sm text-slate-400">{bestSelling.soldToday > 0 ? `${bestSelling.soldToday} kg sold` : 'No sales entered yet'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-3xl border border-white/10 p-4 shadow-2xl shadow-slate-950/10 mb-4" style={{padding: '20px 16px'}}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-base font-semibold text-white">Sales Input Table</p>
            <p className="mt-1 text-sm text-slate-400">Update sold quantities for each fruit and preview revenue instantly.</p>
          </div>
          <div className="flex w-full flex-col gap-3 no-print">
            <button onClick={handleSaveReport} disabled={saving} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-fruitgreen px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
              <span className="text-lg">📝</span> {saving ? 'Saving...' : 'Save Today\'s Sales'}
            </button>
            <button onClick={downloadCSV} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800">
              <span className="text-lg">📥</span> Export CSV
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="no-print mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            <span className="inline text-base align-middle">⚠️</span> <span>{errorMessage}</span>
          </div>
        )}
        {statusMessage && (
          <div className="no-print mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Mobile: stacked cards with full-width controls */}
        <div className="sales-mobile-cards no-print mt-6 space-y-3 md:hidden">
          {loading ? (
            <p className="py-6 text-center text-slate-400">Loading inventory data...</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-slate-400">No products available.</p>
          ) : rows.map((row) => (
            <div key={row.productId} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-lg font-semibold text-white">{row.productName}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Current Stock</p>
                  <p className="mt-1 whitespace-nowrap font-medium text-white">{formatUnits(row.currentStock)}</p>
                </div>
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Selling Price</p>
                  <p className="mt-1 font-medium text-white">{formatCurrency(row.sellingPrice)}</p>
                </div>
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Sales Value</p>
                  <p className="mt-1 font-medium text-white">{formatCurrency(row.salesValue)}</p>
                </div>
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Remaining</p>
                  <p className="mt-1 whitespace-nowrap font-medium text-white">{formatUnits(row.remainingStock)}</p>
                </div>
              </div>
              <div className="mt-4 border-t border-white/5 pt-4">
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Sold Today</p>
                <SoldQuantityInput
                  row={row}
                  onAdjust={handleQuantityAdjust}
                  onChange={handleQuantityChange}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: full table */}
        <div className="sales-desktop-table mt-6 hidden table-scroll overflow-x-auto md:block">
          <table className="w-full border-separate border-spacing-0 text-left text-sm text-slate-300">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="rounded-tl-3xl px-4 py-4">Fruit Name</th>
                <th className="px-4 py-4">Current Stock</th>
                <th className="px-4 py-4">Selling Price</th>
                <th className="px-4 py-4">Sold Today</th>
                <th className="px-4 py-4">Sales Value</th>
                <th className="rounded-tr-3xl px-4 py-4">Remaining Stock</th>
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
                  <td className="whitespace-nowrap px-4 py-4">{formatUnits(row.currentStock)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.sellingPrice)}</td>
                  <td className="px-4 py-4">
                    <SoldQuantityInput
                      row={row}
                      onAdjust={handleQuantityAdjust}
                      onChange={handleQuantityChange}
                      compact
                    />
                  </td>
                  <td className="px-4 py-4 text-white">{formatCurrency(row.salesValue)}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-white">{formatUnits(row.remainingStock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div id="daily-sales-range-section" className="no-print glass-panel rounded-3xl border border-white/10 shadow-2xl shadow-slate-950/10" style={{padding: '20px 16px'}}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-base font-semibold text-white">Recent Sales Reports</p>
            <p className="mt-1 text-sm text-slate-400">Latest sale entries and remaining stock snapshots from today.</p>
          </div>
          <div className="no-print flex items-center gap-2 text-slate-400 text-sm">
            <span className="text-base">📝</span> <span>{todayLabel}</span>
          </div>
        </div>

        <div className="no-print mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-base text-white min-h-[52px]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-base text-white min-h-[52px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => loadHistoryForRange(fromDate, toDate)} disabled={rangeLoading} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-slate-500 min-h-[52px] w-full">
              {rangeLoading ? 'Loading...' : 'Load Report'}
            </button>
            <button onClick={() => handlePrintRange()} className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 min-h-[52px] w-full">
              📄 Print Range
            </button>
          </div>
        </div>

        <div className="sales-mobile-cards no-print mt-6 space-y-3 md:hidden">
          {history.length === 0 ? (
            <p className="py-6 text-center text-slate-400">No sales history available yet.</p>
          ) : history.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
              <p className="font-semibold text-white">{item.fruitEn}</p>
              <p className="mt-1 text-sm text-slate-400">{new Date(item.createdAt).toLocaleString('en-IN')}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Quantity Sold</p>
                  <p className="mt-1 whitespace-nowrap font-medium text-white">{formatUnits(item.reducedQuantity || item.qty)}</p>
                </div>
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Sales Value</p>
                  <p className="mt-1 font-medium text-white">{formatCurrency(item.value)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">Remaining Stock</p>
                  <p className="mt-1 whitespace-nowrap font-medium text-white">{formatUnits(item.updatedStock)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="sales-desktop-table mt-6 hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm text-slate-300">
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
                  <td className="whitespace-nowrap px-4 py-4">{formatUnits(item.reducedQuantity || item.qty)}</td>
                  <td className="px-4 py-4">{formatCurrency(item.value)}</td>
                  <td className="whitespace-nowrap px-4 py-4">{formatUnits(item.updatedStock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
