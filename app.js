/**
 * Fruit Stock Analyzer - Core Application Engine
 * Handles State, Bilingual (Tamil / English) Translation, Dynamic Chart.js dashboard,
 * transaction simulation, and AI predictive calendar insights.
 */

// HTML Escaping Utility
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        };
        return charsToReplace[tag] || tag;
    });
}

// Centralized fetch wrapper to handle JWT auth automatically
async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('sk_auth_token');
    if (!options.headers) {
        options.headers = {};
    }
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, options);
    if (response.status === 401 || response.status === 403) {
        // Token is invalid or expired
        localStorage.removeItem('sk_auth_token');
        window.location.href = 'login.html';
        throw new Error('Authentication failed or expired');
    }
    return response;
}

// Global State Object
const AppState = {
    language: 'en', // 'en' or 'ta'
    dbConnected: false, // Database connection status
    metrics: {
        totalStock: 0, // in kg
        totalStockLimit: 0, // Or a reasonable default if you want a limit
        todaySales: 0, // in INR
        todaySalesTrend: 0, // %
        netProfit: 0, // in INR
        netProfitTrend: 0, // %
        addedToday: 0,
        salesToday: 0,
        wasteToday: 0,
        totalTransactions: 0,
        mostUpdatedEn: '-',
        mostUpdatedTa: '-'
    },
    inventory: [
        { id: 'f1', nameEn: 'Salem Mango', nameTa: 'சேலம் மாம்பழம்', stock: 450, limit: 1000, price: 180, cost: 120, unitEn: 'kg', unitTa: 'கிலோ', statusEn: 'Optimal', statusTa: 'சரியானது', emoji: '🥭', accent: '#fbbf24', accentGlow: 'rgba(251, 191, 36, 0.4)' },
        { id: 'f2', nameEn: 'Red Banana', nameTa: 'செவ்வாழை', stock: 85, limit: 500, price: 90, cost: 60, unitEn: 'kg', unitTa: 'கிலோ', statusEn: 'Low Stock', statusTa: 'குறைந்த இருப்பு', emoji: '🍌', accent: '#ef4444', accentGlow: 'rgba(239, 68, 68, 0.4)' },
        { id: 'f3', nameEn: 'Green Apple', nameTa: 'பச்சை ஆப்பிள்', stock: 210, limit: 600, price: 240, cost: 180, unitEn: 'kg', unitTa: 'கிலோ', statusEn: 'Optimal', statusTa: 'சரியானது', emoji: '🍏', accent: '#10b981', accentGlow: 'rgba(16, 185, 129, 0.4)' },
        { id: 'f4', nameEn: 'Watermelon', nameTa: 'தர்பூசணி', stock: 15, limit: 200, price: 40, cost: 25, unitEn: 'kg', unitTa: 'கிலோ', statusEn: 'Danger Alert', statusTa: 'அபாய எச்சரிக்கை', emoji: '🍉', accent: '#f43f5e', accentGlow: 'rgba(244, 63, 94, 0.4)' }
    ],
    recentActivity: [],
    charts: {} // Placeholder for ChartJS instances
};

// Comprehensive Localization Dictionary
const Translations = {
    en: {
        brand_title: 'Fruit Stock Analyzer',
        brand_subtitle: 'SIVAKAVI FRUITS',
        search_placeholder: 'Search fruit varieties, inventory, analytics...',
        clock_title: 'REALTIME (IST)',
        
        // Sidebar Navigation
        nav_dashboard: 'Dashboard',
        nav_inventory: 'Fruit Inventory',
        nav_inventory_update: 'Inventory Update',
        nav_stock_history: 'Stock History',
        nav_analytics: 'Sales Analytics',
        nav_predictions: 'Seasonal Demands',
        nav_suppliers: 'Orchard Suppliers',
        
        // Hero Metric Cards
        card_total_inv_amt: 'Total Inventory Amt',
        card_today_sales: "Today's Sales",
        card_net_profit: 'Net Retail Profit',
        metric_optimal: 'Capacity Optimal',
        metric_sale_trend: 'vs yesterday',
        metric_profit_trend: 'net gain margin',
        metric_asset_valuation: 'Asset Valuation',
        
        // Card Titles
        title_sales_trend: 'Daily Revenue & Profit Analytics',

        title_ai_insights: 'AI Seasonal Demand Insights',
        title_inventory_table: 'Regional Fruit Inventory Directory',
        title_recent_activity: 'Live Shop Operations Log',
        title_suppliers: 'Premium regional Suppliers',
        title_stock_history: 'Stock Transaction History',
        th_date: 'Date & Time',
        th_action: 'Action Type',
        
        summary_trans: 'Total Transactions',
        summary_added: 'Stock Added Today',
        summary_sales: 'Stock Sold Today',
        summary_waste: 'Stock Wasted Today',
        summary_most: 'Most Updated Product',
        lbl_cost_price_short: 'Cost (₹)',
        lbl_retail_price_short: 'Retail (₹)',
        th_notes: 'Notes',

        th_prev_stock: 'Previous',
        th_change: 'Change',
        th_new_stock: 'New Stock',
        th_user: 'Updated By',
        
        // Table Columns & Buttons
        th_fruit: 'Fruit Variety',
        th_stock: 'Current Stock',

        th_price: 'Retail Price',
        th_status: 'Stock Status',
        th_actions: 'Quick Operations',
        th_history: 'History',
        btn_add_fruit: 'Add Custom Fruit',
        btn_waste: 'Waste',
        modal_waste_title: 'Record Spoilage / Waste',
        lbl_waste_qty: 'Spoiled Quantity (kg)',
        btn_sell: 'Sell',
        btn_restock: 'Restock',
        filter_all: 'All Varieties',
        filter_low: 'Low/Danger',
        filter_optimal: 'Optimal',
        
        // Status terms
        status_optimal: 'Optimal',
        status_low: 'Low Stock',
        status_danger: 'Danger Alert',
        
        // Alerts & Recommendations
        no_alerts: 'No critical stock issues. Excellent status!',
        ai_powered: 'AI PREDICTIONS FOR TAMIL NADU FESTIVALS',
        
        // Modal Texts
        modal_sell_title: 'Record Fresh Sale',
        modal_restock_title: 'Replenish Inventory',
        modal_add_title: 'Register Custom Fruit Variety',
        lbl_fruit_name_en: 'Variety Name (English)',
        lbl_fruit_name_ta: 'Variety Name (Tamil)',
        lbl_threshold: 'Min Alert Threshold (kg)',
        lbl_cost_price: 'Cost Price (₹ per kg)',
        lbl_selling_price: 'Selling Price (₹ per kg)',
        lbl_sell_qty: 'Quantity to Sell (kg)',
        lbl_restock_qty: 'Quantity to Add (kg)',
        btn_cancel: 'Cancel',
        btn_confirm: 'Confirm Action',
        db_status_offline: 'DB OFFLINE',
        db_status_online: 'DB ONLINE'
    },
    ta: {
        brand_title: 'பழ இருப்பு பகுப்பாய்வி',
        brand_subtitle: 'சிவகவி பழங்கள் • தமிழ்நாடு',
        search_placeholder: 'பழ வகைகள், இருப்பு மற்றும் விவரங்களை தேடுக...',
        clock_title: 'நேரடி நேரம் (IST)',
        
        // Sidebar Navigation
        nav_dashboard: 'முகப்பு பலகை',
        nav_inventory: 'பழ இருப்பு பட்டியல்',
        nav_inventory_update: 'இருப்பு புதுப்பிப்பு',
        nav_stock_history: 'இருப்பு வரலாறு',
        nav_analytics: 'விற்பனை பகுப்பாய்வு',
        nav_predictions: 'பருவகால தேவைகள்',
        nav_suppliers: 'பழ விநியோகஸ்தர்கள்',
        
        // Hero Metric Cards
        card_total_inv_amt: 'மொத்த இருப்பு மதிப்பு',
        card_today_sales: 'இன்றைய விற்பனை',
        card_net_profit: 'நிகர சில்லறை லாபம்',
        metric_optimal: 'இருப்பு அளவு சரியானது',
        metric_sale_trend: 'நேற்றைய ஒப்பீடு',
        metric_profit_trend: 'நிகர லாப வரம்பு',
        metric_asset_valuation: 'இருப்பு சொத்து மதிப்பு',
        
        // Card Titles
        title_sales_trend: 'தினசரி வருவாய் மற்றும் லாப விவரங்கள்',

        title_ai_insights: 'ஏஐ பருவகால தேவை கணிப்புகள்',
        title_inventory_table: 'பிராந்திய பழ இருப்பு விபரம்',
        title_recent_activity: 'நேரடி கடை செயல்பாட்டு பதிவு',
        title_suppliers: 'பிராந்திய விநியோகஸ்தர்கள்',
        title_stock_history: 'இருப்பு பரிமாற்ற வரலாறு',
        th_date: 'தேதி மற்றும் நேரம்',
        th_action: 'செயல்பாட்டு வகை',

        summary_trans: 'மொத்த பரிமாற்றங்கள்',
        summary_added: 'இன்று சேர்த்த இருப்பு',
        summary_sales: 'இன்று விற்பனை செய்த இருப்பு',
        summary_waste: 'இன்று வீணான இருப்பு',
        summary_most: 'அதிகம் புதுப்பிக்கப்பட்ட பழம்',
        lbl_cost_price_short: 'அசல் (₹)',
        lbl_retail_price_short: 'விற்பனை (₹)',
        th_notes: 'குறிப்புகள்',

        th_prev_stock: 'முந்தைய',
        th_change: 'மாற்றம்',
        th_new_stock: 'புதிய இருப்பு',
        th_user: 'புதுப்பித்தவர்',
        
        // Table Columns & Buttons
        th_fruit: 'பழ வகை',

        th_stock: 'தற்போதைய இருப்பு', // Changed from நேரடி இருப்பு to தற்போதைய இருப்பு
        // th_available_stock: 'கிடைக்கக்கூடிய இருப்பு', // Removed as per new requirement
        th_price: 'விற்பனை விலை',
        th_status: 'இருப்பு நிலை',
        th_actions: 'விரைவான செயல்பாடுகள்',
        th_history: 'வரலாறு',
        btn_add_fruit: 'புதிய பழ வகை சேர்',
        btn_waste: 'சேதம்',
        modal_waste_title: 'சேதமடைந்த பழங்களை பதிவு செய்',
        lbl_waste_qty: 'சேதமடைந்த அளவு (கிலோ)',
        btn_sell: 'விற்பனை',
        btn_restock: 'இருப்பு சேர்',
        filter_all: 'அனைத்து பழங்கள்',
        filter_low: 'குறைந்த இருப்பு',
        filter_optimal: 'போதுமான இருப்பு',
        
        // Status terms
        status_optimal: 'சரியானது',
        status_low: 'குறைந்த இருப்பு',
        status_danger: 'அபாய எச்சரிக்கை',
        
        // Alerts & Recommendations
        no_alerts: 'அபாய எச்சரிக்கைகள் எதுவும் இல்லை. அருமை!',
        ai_powered: 'தமிழக விழாக்கள் சார்ந்த ஏஐ கணிப்புகள்',
        
        // Modal Texts
        modal_sell_title: 'புதிய விற்பனையை பதிவு செய்',
        modal_restock_title: 'பழ இருப்பை அதிகரி',
        modal_add_title: 'புதிய பழ வகையை பதிவு செய்',
        lbl_fruit_name_en: 'பழத்தின் பெயர் (ஆங்கிலம்)',
        lbl_fruit_name_ta: 'பழத்தின் பெயர் (தமிழ்)',
        lbl_threshold: 'குறைந்த இருப்பு அளவு (கிலோ)',
        lbl_cost_price: 'அசல் விலை (1 கிலோவுக்கு ₹)',
        lbl_selling_price: 'விற்பனை விலை (1 கிலோவுக்கு ₹)',
        lbl_sell_qty: 'விற்பனை செய்ய வேண்டிய அளவு (கிலோ)',
        lbl_restock_qty: 'கூட்ட வேண்டிய அளவு (கிலோ)',
        btn_cancel: 'ரத்து செய்',
        btn_confirm: 'உறுதி செய்',
        db_status_offline: 'இணைப்பு இல்லை',
        db_status_online: 'தரவுத்தளம் நேரலை'
    }
};





// Initialize and Setup the Application
document.addEventListener('DOMContentLoaded', async () => {
    // Auth Guard: Redirect to login if not authenticated
    if (!localStorage.getItem('sk_auth_token')) {
        window.location.href = 'login.html';
        return;
    }

    updateClock();
    setInterval(updateClock, 1000);
    
    // Bind buttons
    bindDOMEvents();
    
    // 1. Sync with database server on startup
    await syncStateWithBackend();
    
    // 2. Render Components
    renderLanguage();
    initCharts();
    populateHistoryProductFilter();

    // 3. Populate dashboard metrics
    refreshDashboardUI();
});

// Real-time clock update (IST)
function updateClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    
    const now = new Date();
    // Format options to match local Chennai timezone
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
    const dateOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' };
    
    const timeStr = now.toLocaleTimeString('en-US', timeOptions);
    const dateStr = now.toLocaleTimeString('en-US', dateOptions).split(',')[0];
    
    const displayLabel = AppState.language === 'en' ? 'IST' : 'இந்திய நேரம்';
    clockEl.innerHTML = `${dateStr} | <span>${timeStr}</span> ${displayLabel}`;
}

// Translate dynamic elements
function renderLanguage() {
    const lang = AppState.language;
    const dict = Translations[lang];
    
    // HTML Lang tag
    document.documentElement.lang = lang;
    
    // Translate text of all elements with `data-translate` attribute
    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.getAttribute('data-translate');
        if (dict[key]) {
            el.textContent = dict[key];
            if (lang === 'ta') {
                el.classList.add('lang-ta');
            } else {
                el.classList.remove('lang-ta');
            }
        }
    });

    // Translate Placeholders
    document.querySelectorAll('[data-translate-placeholder]').forEach(el => {
        const key = el.getAttribute('data-translate-placeholder');
        if (dict[key]) {
            el.placeholder = dict[key];
            if (lang === 'ta') {
                el.classList.add('lang-ta');
            } else {
                el.classList.remove('lang-ta');
            }
        }
    });

    // Update charts labels if already instantiated
    updateChartsLocalization();
}

// Binds core actions, click triggers, overlay clicks
function bindDOMEvents() {
    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('sk_auth_token');
            window.location.href = 'login.html';
        });
    }

    // English Toggle Click
    document.getElementById('btn-lang-en').addEventListener('click', () => {
        AppState.language = 'en';
        document.getElementById('btn-lang-en').classList.add('active');
        document.getElementById('btn-lang-ta').classList.remove('active');
        renderLanguage();
        refreshDashboardUI();
    });

    // Tamil Toggle Click
    document.getElementById('btn-lang-ta').addEventListener('click', () => {
        AppState.language = 'ta';
        document.getElementById('btn-lang-ta').classList.add('active');
        document.getElementById('btn-lang-en').classList.remove('active');
        renderLanguage();
        refreshDashboardUI();
    });

    // Search bar event
    const searchInput = document.getElementById('navbar-search');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        renderInventoryTable(query);
        renderInventoryUpdateView(query);
    });

    // Stock History Search & Filters
    const historySearch = document.getElementById('history-search');
    if (historySearch) {
        historySearch.addEventListener('input', (e) => fetchStockHistory({ search: e.target.value }));
    }
    const historyActionFilter = document.getElementById('history-action-filter');
    if (historyActionFilter) {
        historyActionFilter.addEventListener('change', (e) => fetchStockHistory({ actionType: e.target.value }));
    }
    const historyProductFilter = document.getElementById('history-product-filter');
    if (historyProductFilter) {
        historyProductFilter.addEventListener('change', (e) => fetchStockHistory({ productId: e.target.value }));
    }

    // Add Fruit Modal triggers
    document.getElementById('btn-open-add-modal').addEventListener('click', () => {
        openModal('modal-add-variety');
    });

    // Global Modal close click handles
    document.querySelectorAll('.modal-close, .btn-cancel').forEach(el => {
        el.addEventListener('click', () => {
            closeAllModals();
        });
    });

    // Form Submissions
    document.getElementById('form-add-fruit').addEventListener('submit', handleAddFruitSubmit);
    document.getElementById('form-edit-fruit').addEventListener('submit', handleEditFruitSubmit);
    document.getElementById('form-sell-fruit').addEventListener('submit', handleSellFruitSubmit);
    document.getElementById('form-restock-fruit').addEventListener('submit', handleRestockFruitSubmit);
    document.getElementById('form-waste-fruit').addEventListener('submit', handleWasteFruitSubmit);
    
    // Filter inventory tabs
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filterType = e.target.getAttribute('data-filter');
            const updateFilterType = e.target.getAttribute('data-update-filter');
            
            if (filterType) {
                document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                renderInventoryTable(null, filterType);
            }
            
            if (updateFilterType) {
                document.querySelectorAll('[data-update-filter]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                renderInventoryUpdateView(null, updateFilterType);
            }
        });
    });

    // SPA Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.dataset.external === 'true') {
                return; // Allow external targets to navigate normally
            }
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            
            // Hide all views
            document.querySelectorAll('.page-view').forEach(el => el.style.display = 'none');
            // Show target view
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.style.display = 'block';

            if (targetId === 'view-dashboard') refreshDashboardUI();
            if (targetId === 'stock-history-view') fetchStockHistory();
            
            // Update active state
            document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
            link.closest('.menu-item').classList.add('active');
        });
    });

    // Mobile Sidebar Toggle
    const mobileToggle = document.getElementById('mobile-toggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.classList.toggle('mobile-open');
        });
    }

    // Delegated event listener for dynamically generated row buttons
    const inventoryTableBody = document.getElementById('inventory-table-body');
    if (inventoryTableBody) {
        inventoryTableBody.addEventListener('click', (e) => {
            const sellBtn = e.target.closest('.btn-sell');
            const restockBtn = e.target.closest('.btn-restock');
            const wasteBtn = e.target.closest('.btn-waste');
            const editBtn = e.target.closest('.btn-edit');
            const removeBtn = e.target.closest('.btn-remove');
            
            if (sellBtn) {
                triggerSellModal(sellBtn.getAttribute('data-id'));
            } else if (restockBtn) {
                triggerRestockModal(restockBtn.getAttribute('data-id'));
            } else if (wasteBtn) {
                triggerWasteModal(wasteBtn.getAttribute('data-id'));
            } else if (editBtn) {
                triggerEditModal(editBtn.getAttribute('data-id'));
            } else if (removeBtn) {
                handleRemoveFruit(removeBtn.getAttribute('data-id'));
            } else if (e.target.closest('.btn-history')) {
                viewItemHistory(e.target.closest('.btn-history').getAttribute('data-id'));
            }
        });
    }

    // Delegated event listener for inventory update view
    const inventoryUpdateList = document.getElementById('inventory-update-list');
    if (inventoryUpdateList) {
        // Handle manual typing to update the calculated stock preview
        inventoryUpdateList.addEventListener('input', (e) => {
            if (e.target.id && e.target.id.startsWith('inventory-update-val-')) {
                const id = e.target.id.replace('inventory-update-val-', '');
                updateStockPreview(id);
            }
        });

        inventoryUpdateList.addEventListener('click', (e) => {
            const incBtn = e.target.closest('.btn-stock-inc');
            const decBtn = e.target.closest('.btn-stock-dec');
            const saveBtn = e.target.closest('.btn-save-stock');
            
            if (incBtn || decBtn) {
                const id = (incBtn || decBtn).getAttribute('data-id');
                const input = document.getElementById(`inventory-update-val-${id}`);
                if (input) {
                    let val = parseInt(input.value);
                    if (incBtn) val++;
                    else if (decBtn && val > 0) val--;
                    input.value = val;
                    updateStockPreview(id);
                }
            } else if (saveBtn) {
                const id = saveBtn.getAttribute('data-id');
                handleQuickStockUpdate(id);
            }
        });
    }

    // Report Actions
    const btnPrint = document.getElementById('btn-print-report');
    if (btnPrint) btnPrint.addEventListener('click', printStockHistoryReport);
    
    const btnDownloadCSV = document.getElementById('btn-download-excel');
    if (btnDownloadCSV) btnDownloadCSV.addEventListener('click', downloadStockHistoryCSV);
}

// Opens a specific modal overlay
function openModal(id) {
    const modal = document.getElementById(id);
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    });
}

// Dynamic rendering of Fruit Stock cards (Top Mango, Banana, Apple, Watermelon)
function renderFruitCards() {
    const grid = document.getElementById('fruit-cards-container');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // Get top 4 fruits
    const topFour = AppState.inventory.slice(0, 4);
    
    topFour.forEach(f => {
        const name = escapeHTML(AppState.language === 'en' ? f.nameEn : f.nameTa);
        const status = escapeHTML(AppState.language === 'en' ? f.statusEn : f.statusTa);
        const unit = escapeHTML(AppState.language === 'en' ? f.unitEn : f.unitTa);
        const emoji = escapeHTML(f.emoji);
        
        let badgeClass = 'badge-optimal';
        if (f.stock < f.limit * 0.15) {
            badgeClass = 'badge-danger';
        } else if (f.stock < f.limit * 0.35) {
            badgeClass = 'badge-low';
        }

        const card = document.createElement('div');
        card.className = 'fruit-card';
        card.style.setProperty('--accent-color', f.accent);
        card.style.setProperty('--accent-color-glow', f.accentGlow);
        card.style.setProperty('--shadow-color', f.accentGlow.replace('0.4', '0.15'));
        
        card.innerHTML = `
            <div class="fruit-card-header">
                <div class="fruit-emoji-box">${emoji}</div>
                <span class="stock-badge ${badgeClass}">${status}</span>
            </div>
            <div class="fruit-card-body">
                <span class="fruit-name">${name}</span>
                <span class="fruit-stock-qty">${f.stock} <span class="lang-ta">${unit}</span></span>
            </div>
            <div class="fruit-card-footer">
                <span class="fruit-price-lbl" data-translate="th_price">Retail Price</span>
                <span class="fruit-price-val">₹${f.price}</span>
            </div>
        `;
        grid.appendChild(card);
    });
    
    // Perform text translation within the dynamically generated cards
    renderLanguage();
}

// Render dynamic stock inventory table
function renderInventoryTable(query = '', filter = 'all') {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    let filteredList = AppState.inventory;
    
    // Apply search query
    if (query) {
        filteredList = filteredList.filter(f => 
            f.nameEn.toLowerCase().includes(query) || 
            f.nameTa.includes(query)
        );
    }
    
    // Apply filter tabs
    if (filter === 'low') {
        filteredList = filteredList.filter(f => f.stock < f.limit * 0.35);
    } else if (filter === 'optimal') {
        filteredList = filteredList.filter(f => f.stock >= f.limit * 0.35);
    }
    
    if (filteredList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 32px 0;">
                    ${AppState.language === 'en' ? 'No fruits found matching criteria.' : 'குறிப்பிட்ட பழ வகைகள் எதுவும் இல்லை.'}
                </td>
            </tr>
        `;
        return;
    }
    
    filteredList.forEach(f => {
        const name = escapeHTML(AppState.language === 'en' ? f.nameEn : f.nameTa);
        const status = escapeHTML(AppState.language === 'en' ? f.statusEn : f.statusTa);
        const unit = escapeHTML(AppState.language === 'en' ? f.unitEn : f.unitTa);
        const emoji = escapeHTML(f.emoji);
        
        let statusClass = 'badge-optimal';
        let strokeColor = 'var(--neon-green)';
        if (f.stock < f.limit * 0.15) {
            statusClass = 'badge-danger';
            strokeColor = 'var(--apple-red)';
        } else if (f.stock < f.limit * 0.35) {
            statusClass = 'badge-low';
            strokeColor = 'var(--mango-gold)';
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="table-fruit-item">
                    <div class="table-fruit-img">${emoji}</div>
                    <div class="table-fruit-details">
                        <span class="table-fruit-name">${name}</span>
                    </div>
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; width: 180px;">
                    <span style="color: #fff; font-weight: 700; font-size: 1.1rem;">${f.stock.toFixed(2)} Kg</span>
                </div>
            </td>
            <td style="font-family: var(--font-heading); font-weight:600; color:#fff">
                ₹${f.price} <span style="font-size:0.7rem; color:var(--text-secondary)">/ ${unit}</span>
            </td>
            <td>
                <span class="stock-badge ${statusClass}">${status}</span>
            </td>
            <td>
                <div class="action-row-btns">
                    <button class="row-btn btn-sell" title="Record Sale" data-id="${f.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    </button>
                    <button class="row-btn btn-restock" title="Restock Inventory" data-id="${f.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                    </button>
                    <button class="row-btn btn-waste" title="Record Waste" data-id="${f.id}" style="color: var(--apple-red)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </button>
                    <button class="row-btn btn-edit" title="Edit Item" data-id="${f.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="row-btn btn-remove" title="Remove Item" data-id="${f.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                    <button class="row-btn btn-history" title="${Translations[AppState.language].th_history}" data-id="${f.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Render Inventory Update View (Adapted from custom design)
function renderInventoryUpdateView(query = '', filter = 'all') {
    const container = document.getElementById('inventory-update-list');
    if (!container) return;
    
    container.innerHTML = '';
    let filteredList = AppState.inventory;

    // Apply status filter
    if (filter === 'low') {
        filteredList = filteredList.filter(f => f.stock < f.limit * 0.35);
    } else if (filter === 'optimal') {
        filteredList = filteredList.filter(f => f.stock >= f.limit * 0.35);
    }
    
    if (query && typeof query === 'string') {
        filteredList = filteredList.filter(f => 
            f.nameEn.toLowerCase().includes(query) || f.nameTa.includes(query)
        );
    }
    
    if (filteredList.length === 0) {
        container.innerHTML = `<div class="glass-panel" style="text-align:center; padding: 40px; color: var(--text-secondary);">No matches found.</div>`;
        return;
    }

    filteredList.forEach(f => {
        const name = escapeHTML(AppState.language === 'en' ? f.nameEn : f.nameTa);
        const status = escapeHTML(AppState.language === 'en' ? f.statusEn : f.statusTa);
        const emoji = escapeHTML(f.emoji);
        
        let statusClass = 'badge-optimal';
        let barColor = 'var(--neon-green)';
        if (f.stock < f.limit * 0.15) { statusClass = 'badge-danger'; barColor = 'var(--apple-red)'; }
        else if (f.stock < f.limit * 0.35) { statusClass = 'badge-low'; barColor = 'var(--mango-gold)'; }

        const itemDiv = document.createElement('div');
        itemDiv.className = 'glass-panel';
        itemDiv.style.marginBottom = '20px';
        itemDiv.innerHTML = `
            <div style="display: flex; padding: 20px; gap: 24px;">
                <div class="table-fruit-img" style="width: 80px; height: 80px; font-size: 2.5rem; flex-shrink: 0;">${emoji}</div>
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <h3 style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 600; color: #fff;">${name}</h3>
                            <span class="stock-badge ${statusClass}">${status}</span>
                        </div>
                        <div style="margin-top: 8px; display: flex; align-items: baseline; gap: 5px;">
                            <span id="preview-stock-${f.id}" style="color: #fff; font-weight: 800; font-size: 1.5rem;">${f.stock.toFixed(2)}</span>
                            <span style="color: var(--text-secondary); font-size: 0.9rem;">Kg</span>
                        </div>
                    </div>
                    <div class="custom-progress" style="height: 6px;">
                        <div class="progress-fill" style="width: ${Math.min(100, (f.stock / f.limit) * 100)}%; background: ${barColor}; box-shadow: 0 0 10px ${barColor}"></div>
                    </div>
                </div>
            </div>
            <div style="background: rgba(255,255,255,0.02); padding: 12px 20px; border-top: 1px solid var(--glass-border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px;">
                <div class="stock-action-panel">
                    <div class="stock-attribute-group">
                        <span class="stock-attribute-label">
                            ${AppState.language === 'en' ? 'Add Stock (kg)' : 'இருப்பு சேர் (கிலோ)'}
                        </span>
                        <div class="stock-adjuster">
                            <button type="button" class="row-btn btn-stock-dec stock-adjuster-btn" data-id="${f.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                            <input id="inventory-update-val-${f.id}" type="number" value="0" min="0" step="any" class="stock-adjuster-input">
                            <button type="button" class="row-btn btn-stock-inc stock-adjuster-btn" data-id="${f.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                        </div>
                    </div>

                    <div class="stock-attribute-group">
                        <span class="stock-attribute-label">
                            ${Translations[AppState.language].lbl_cost_price_short}
                        </span>
                        <input id="inventory-update-cost-${f.id}" type="number" value="${f.cost}" step="any" class="stock-adjuster-input">
                    </div>
                    <div class="stock-attribute-group">
                        <span class="stock-attribute-label">
                            ${Translations[AppState.language].lbl_retail_price_short}
                        </span>
                        <input id="inventory-update-price-${f.id}" type="number" value="${f.price}" step="any" class="stock-adjuster-input">
                    </div>

                    <button class="table-action-btn btn-save-stock" data-id="${f.id}">
                        ${AppState.language === 'en' ? 'Update' : 'புதுப்பி'}
                    </button>
            </div>
        `;
        container.appendChild(itemDiv);
    });
}

// Stock History Logic
async function fetchStockHistory(filters = {}) {
    // Merge with current UI filter values if not provided
    const productId = filters.productId || document.getElementById('history-product-filter')?.value || 'All';
    const actionType = filters.actionType || document.getElementById('history-action-filter')?.value || 'All';
    const search = filters.search !== undefined ? filters.search : document.getElementById('history-search')?.value || '';
    
    const query = new URLSearchParams({ productId, actionType, search }).toString();
    const tbody = document.getElementById('history-table-body');

    try {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading history...</td></tr>';
        
        const response = await apiFetch(`/api/history?${query}`);
        const data = await response.json();
        if (data.success) {
            renderStockHistory(data.history);
            renderHistoryMetrics(data.metrics);
        }
    } catch (err) { 
        console.error('History fetch error:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--apple-red); padding: 20px;">Error loading history data.</td></tr>';
    }
}

function populateHistoryProductFilter() {
    const filter = document.getElementById('history-product-filter');
    if (!filter) return;
    
    const currentVal = filter.value;
    filter.innerHTML = `<option value="All">${AppState.language === 'en' ? 'All Varieties' : 'அனைத்து பழங்கள்'}</option>`;
    
    AppState.inventory.forEach(f => {
        const option = document.createElement('option');
        option.value = f.id;
        option.textContent = AppState.language === 'en' ? f.nameEn : f.nameTa;
        filter.appendChild(option);
    });
    filter.value = currentVal || 'All';
}

function viewItemHistory(id) {
    const filter = document.getElementById('history-product-filter');
    if (filter) {
        filter.value = id;
        const link = document.querySelector('[data-target="stock-history-view"]');
        if (link) {
            link.click(); // Switch to history tab
            fetchStockHistory({ productId: id });
        }
    }
}

function renderStockHistory(history) {
    const tbody = document.getElementById('history-table-body');
    const timeline = document.getElementById('history-timeline');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (timeline) timeline.innerHTML = '';

    history.forEach((h, index) => {
        const date = new Date(h.createdAt).toLocaleDateString(AppState.language === 'en' ? 'en-US' : 'ta-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const time = new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const name = AppState.language === 'en' ? h.productNameEn : h.productNameTa;
        const change = h.addedQuantity > 0 ? `+${h.addedQuantity}` : `-${h.reducedQuantity}`;
        const changeColor = h.addedQuantity > 0 ? 'var(--neon-green)' : 'var(--apple-red)';
        
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-primary/5 transition-colors duration-300';
        tr.innerHTML = `
            <td class="px-md py-md text-body-sm">
                <div class="text-on-surface font-semibold">${date}</div>
                <div class="text-on-surface-variant text-[12px]">${time}</div>
            </td>
            <td class="px-md py-md font-semibold">${name}</td>
            <td class="px-md py-md text-on-surface-variant">${h.previousStock} kg</td>
            <td class="px-md py-md font-bold" style="color: ${changeColor}">${change} kg</td>
            <td class="px-md py-md font-bold">${h.updatedStock} kg</td>
            <td class="px-md py-md">
                <span class="px-sm py-xs rounded-full text-label-sm" style="background: ${changeColor}22; color: ${changeColor}">${h.actionType}</span>
            </td>
            <td class="px-md py-md text-body-sm italic text-on-surface-variant">${h.notes || '-'}</td>
            <td class="px-md py-md text-body-sm">${h.userName}</td>
        `;
        tbody.appendChild(tr);

        // Timeline (Top 5 items)
        if (timeline && index < 5) {
            const tItem = document.createElement('div');
            tItem.className = 'relative pl-base mb-lg';
            tItem.innerHTML = `
                <div class="absolute left-0 top-[2px] w-[12px] h-[12px] rounded-full z-10 border-2 border-surface-container-lowest" style="background: ${changeColor}"></div>
                <div class="ml-lg">
                    <p class="text-label-md font-semibold">${time} — ${name} ${change} kg</p>
                    <p class="text-body-sm text-on-surface-variant">${h.actionType} by ${h.userName}</p>
                </div>
            `;
            timeline.appendChild(tItem);
        }
    });
}

function renderHistoryMetrics(m) {
    const updateText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = val;
    };
    
    updateText('summary-added-today', `+${m.addedToday || 0} <span style="font-size: 0.8rem; opacity: 0.7;">kg</span>`);
    updateText('summary-sales-today', `-${m.salesToday || 0} <span style="font-size: 0.8rem; opacity: 0.7;">kg</span>`);
    updateText('summary-waste-today', `-${m.wasteToday || 0} <span style="font-size: 0.8rem; opacity: 0.7;">kg</span>`);
    updateText('summary-total-trans', m.totalTransactions || 0);
    updateText('summary-most-updated', AppState.language === 'en' ? m.mostUpdatedEn : m.mostUpdatedTa);
}

function printStockHistoryReport() {
    const view = document.getElementById('stock-history-view');
    if (!view) {
        window.print();
        return;
    }

    const wasHidden = view.style.display === 'none';
    if (wasHidden) {
        view.style.display = 'block';
        fetchStockHistory();
    }

    document.body.classList.add('print-stock-history');

    const cleanup = () => {
        document.body.classList.remove('print-stock-history');
        if (wasHidden) view.style.display = 'none';
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    requestAnimationFrame(() => {
        requestAnimationFrame(() => window.print());
    });
}

async function downloadStockHistoryCSV() {
    try {
        const response = await apiFetch('/api/history');
        const data = await response.json();
        if (data.success) {
            let csv = 'Date,Time,Product,Previous,Change,New,Action,User\n';
            data.history.forEach(h => {
                const d = new Date(h.createdAt);
                const change = h.addedQuantity > 0 ? `+${h.addedQuantity}` : `-${h.reducedQuantity}`;
                csv += `${d.toLocaleDateString()},${d.toLocaleTimeString()},"${h.productNameEn}",${h.previousStock},${change},${h.updatedStock},${h.actionType},${h.userName}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Sivakavi_Fruits_Stock_History_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        }
    } catch (err) { console.error('CSV download error:', err); }
}

/**
 * Calculates and displays a preview of the final stock based on the input quantity
 */
function updateStockPreview(fruitId) {
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    const input = document.getElementById(`inventory-update-val-${fruitId}`);
    const previewEl = document.getElementById(`preview-stock-${fruitId}`);
    if (!fruit || !input || !previewEl) return;

    const enteredVal = parseFloat(input.value) || 0;
    // Logic: Always add entered quantity to existing stock
    const finalVal = fruit.stock + enteredVal;

    previewEl.innerHTML = `${finalVal}`;
}

async function handleQuickStockUpdate(id) {
    const fruit = AppState.inventory.find(f => f.id === id);
    if (!fruit) return;

    const enteredVal = parseFloat(document.getElementById(`inventory-update-val-${id}`).value) || 0;
    const newCost = parseFloat(document.getElementById(`inventory-update-cost-${id}`).value);
    const newPrice = parseFloat(document.getElementById(`inventory-update-price-${id}`).value);

    if (Number.isNaN(newCost) || Number.isNaN(newPrice) || newCost < 0 || newPrice < 0) {
        showToastNotification(AppState.language === 'en' ? 'Please enter valid prices.' : 'சரியான விலைகளை உள்ளிடவும்.', 'error');
        return;
    }

    const finalStock = fruit.stock + enteredVal;

    if (AppState.dbConnected) {
        try {
            const response = await apiFetch(`/api/fruits/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    nameEn: fruit.nameEn, 
                    nameTa: fruit.nameTa, 
                    stock: finalStock, 
                    price: newPrice, 
                    cost: newCost, 
                    limit: fruit.limit 
                })
            });
            const data = await response.json();
            if (data.success && data.state) {
                AppState.metrics = data.state.metrics;
                AppState.inventory = data.state.inventory;
                AppState.recentActivity = data.state.recentActivity;
                refreshDashboardUI();
                showToastNotification(
                    AppState.language === 'en' 
                    ? `Stock updated to ${finalStock}kg for ${fruit.nameEn}` 
                    : `${fruit.nameTa} இருப்பு ${finalStock}கிலோவாக புதுப்பிக்கப்பட்டது.`
                );
            }
        } catch (err) { console.error('[API Error] Sync failed:', err); }
    } else {
        fruit.stock = finalStock;
        updateFruitHealthStatus(fruit);
        refreshDashboardUI();
        showToastNotification(
            AppState.language === 'en' 
            ? `Stock updated to ${finalStock}kg (Offline Mode)` 
            : `இருப்பு ${finalStock}கிலோவாக புதுப்பிக்கப்பட்டது (ஆஃப்லைன்)`
        );
    }
}

// Render Sparklines inside Hero Metric Cards
function renderSparklines() {
    // Generate simulated sparklines using SVG
    const profitSparkline = document.getElementById('sparkline-profit');
    const salesSparkline = document.getElementById('sparkline-sales');
    
    if (profitSparkline) {
        profitSparkline.innerHTML = `
            <svg viewBox="0 0 100 20" width="100%" height="100%">
                <path d="M 0 18 Q 20 8 40 14 T 80 4 T 100 2" fill="none" stroke="var(--neon-green)" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M 0 18 Q 20 8 40 14 T 80 4 T 100 2 L 100 20 L 0 20 Z" fill="url(#sparkline-grad-profit)"/>
                <defs>
                    <linearGradient id="sparkline-grad-profit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--neon-green)" stop-opacity="0.2"/>
                        <stop offset="100%" stop-color="var(--neon-green)" stop-opacity="0.0"/>
                    </linearGradient>
                </defs>
            </svg>
        `;
    }
    
    if (salesSparkline) {
        salesSparkline.innerHTML = `
            <svg viewBox="0 0 100 20" width="100%" height="100%">
                <path d="M 0 16 Q 15 12 35 15 T 70 8 T 100 1" fill="none" stroke="var(--electric-blue)" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M 0 16 Q 15 12 35 15 T 70 8 T 100 1 L 100 20 L 0 20 Z" fill="url(#sparkline-grad-sales)"/>
                <defs>
                    <linearGradient id="sparkline-grad-sales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--electric-blue)" stop-opacity="0.2"/>
                        <stop offset="100%" stop-color="var(--electric-blue)" stop-opacity="0.0"/>
                    </linearGradient>
                </defs>
            </svg>
        `;
    }
}

// ChartJS Initializations with neon glows & transparency shadow drops
function initCharts() {
    renderSparklines();
    
    const revenueEl = document.getElementById('revenueChart');
    const profitEl = document.getElementById('profitChart');
    
    const labels = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString(AppState.language === 'en' ? 'en-US' : 'ta-IN', { day: 'numeric', month: 'short' }));
    }

    if (revenueEl) {
        const revCtx = revenueEl.getContext('2d');
        const revGrad = revCtx.createLinearGradient(0, 0, 0, 250);
        revGrad.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
        revGrad.addColorStop(1, 'rgba(59, 130, 246, 0)');

        AppState.charts.revenue = new Chart(revCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: AppState.language === 'en' ? "Today's Sales" : 'இன்றைய விற்பனை',
                    data: [0, 0, 0, 0, 0, 0],
                    borderColor: '#3b82f6',
                    backgroundColor: revGrad,
                    fill: true,
                    tension: 0.45,
                    borderWidth: 4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                }]
            },
            options: chartOptionsBase(true)
        });
    }

    if (profitEl) {
        const proCtx = profitEl.getContext('2d');
        AppState.charts.profit = new Chart(proCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: AppState.language === 'en' ? 'Net Retail Profit' : 'நிகர சில்லறை லாபம்',
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: '#10b981',
                    borderRadius: 12,
                    barPercentage: 0.5,
                    categoryPercentage: 0.8
                }]
            },
            options: chartOptionsBase(false)
        });
    }
}

// Base configuration for charts
function chartOptionsBase(showGridX = false) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(10, 16, 32, 0.95)',
                titleColor: '#ffffff',
                bodyColor: '#e5e7eb',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                bodyFont: { family: 'Inter' }
            }
        },
        scales: {
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#6b7280', font: { family: 'Inter', size: 10 } }
            },
            x: {
                grid: { display: showGridX, color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#6b7280', font: { family: 'Inter', size: 10 } }
            }
        }
    };
}

// Dynamically localizes charts upon language toggling
function updateChartsLocalization() {
    const isTa = AppState.language === 'ta';
    const lang = isTa ? 'ta-IN' : 'en-US';
    const labels = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString(lang, { day: 'numeric', month: 'short' }));
    }
    
    if (AppState.charts.revenue) {
        AppState.charts.revenue.data.labels = labels;
        AppState.charts.revenue.data.datasets[0].label = isTa ? 'இன்றைய விற்பனை' : "Today's Sales";
        AppState.charts.revenue.update();
    }
    if (AppState.charts.profit) {
        AppState.charts.profit.data.labels = labels;
        AppState.charts.profit.data.datasets[0].label = isTa ? 'நிகர சில்லறை லாபம்' : 'Net Retail Profit';
        AppState.charts.profit.update();
    }
}

// Simulation Modal Trigger: SELL
window.triggerSellModal = function(fruitId) {
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (!fruit) return;
    
    // Setup inputs
    document.getElementById('sell-fruit-id').value = fruit.id;
    document.getElementById('sell-fruit-name').textContent = AppState.language === 'en' ? fruit.nameEn : fruit.nameTa;
    document.getElementById('sell-qty').max = fruit.stock;
    document.getElementById('sell-qty').value = 0;
    
    openModal('modal-sell-variety');
};

// Simulation Modal Trigger: RESTOCK
window.triggerRestockModal = function(fruitId) {
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (!fruit) return;
    
    // Setup inputs
    document.getElementById('restock-fruit-id').value = fruit.id;
    document.getElementById('restock-fruit-name').textContent = AppState.language === 'en' ? fruit.nameEn : fruit.nameTa;
    document.getElementById('restock-qty').value = 0;
    
    openModal('modal-restock-variety');
};

// Simulation Modal Trigger: WASTE
window.triggerWasteModal = function(fruitId) {
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (!fruit) return;
    
    document.getElementById('waste-fruit-id').value = fruit.id;
    document.getElementById('waste-fruit-name').textContent = AppState.language === 'en' ? fruit.nameEn : fruit.nameTa;
    document.getElementById('waste-qty').max = fruit.stock;
    document.getElementById('waste-qty').value = 0;
    document.getElementById('waste-reason').value = '';
    
    openModal('modal-waste-variety');
};

// Quick percentage calculation for waste
window.calcWaste = function(percent) {
    const id = document.getElementById('waste-fruit-id').value;
    const fruit = AppState.inventory.find(f => f.id === id);
    if (fruit) {
        document.getElementById('waste-qty').value = (fruit.stock * (percent / 100)).toFixed(2);
    }
};

// Handler: Submit Waste Transaction
async function handleWasteFruitSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    const fruitId = document.getElementById('waste-fruit-id').value;
    const qty = parseFloat(document.getElementById('waste-qty').value);
    const notes = document.getElementById('waste-reason').value;
    
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (!fruit || Number.isNaN(qty) || qty <= 0 || qty > fruit.stock) {
        showToastNotification(AppState.language === 'en' ? 'Invalid quantity!' : 'தவறான அளவு!', 'error');
        return;
    }

    // Disable button to provide immediate visual feedback
    submitBtn.disabled = true;
    submitBtn.innerHTML = AppState.language === 'en' ? 'Recording...' : 'பதிவு செய்யப்படுகிறது...';

    if (AppState.dbConnected) {
        try {
            const response = await apiFetch('/api/transactions/waste', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fruitId, qty, notes })
            });
            const data = await response.json();
            if (data.success && data.state) {
                AppState.metrics = data.state.metrics;
                AppState.inventory = data.state.inventory;
                AppState.recentActivity = data.state.recentActivity;
                
                refreshDashboardUI();
                closeAllModals();
                showToastNotification(
                    AppState.language === 'en' ? `Recorded ${qty} kg waste for ${fruit.nameEn}` : 
                    `${qty} கிலோ ${fruit.nameTa} சேதமாக பதிவு செய்யப்பட்டது.`
                );
            }
            else { // Handle API error response even if data.success is false
                showToastNotification(AppState.language === 'en' ? `Failed to record waste: ${data.error || 'Unknown error'}` : `சேதத்தை பதிவு செய்ய முடியவில்லை: ${data.error || 'அறியப்படாத பிழை'}`, 'error');
            }
        } catch (err) {
            console.error('[API Error] Waste submission failed:', err);
            showToastNotification(AppState.language === 'en' ? 'Server connection error or API failed.' : 'சேவையக இணைப்பு பிழை அல்லது API தோல்வியடைந்தது.', 'error');
        }
    }
    else {
        // Fallback: Offline In-Memory logic
        fruit.stock -= qty;
        updateFruitHealthStatus(fruit);
        AppState.metrics.totalStock -= qty;

        // Add to recent activity (in-memory) for immediate UI feedback
        AppState.recentActivity.unshift({
            type: 'waste',
            fruitEn: fruit.nameEn,
            fruitTa: fruit.nameTa,
            qty: qty,
            value: 0, // Waste has no direct monetary value here
            timeEn: 'Just now',
            timeTa: 'சரியாக இப்போது'
        });

        refreshDashboardUI();
        closeAllModals();
        showToastNotification(
            AppState.language === 'en' ? `Recorded ${qty} kg waste for ${fruit.nameEn} (Offline Mode)` :
            `${qty} கிலோ ${fruit.nameTa} சேதமாக பதிவு செய்யப்பட்டது (ஆஃப்லைன்).`,
            'warning'
        );
    }
}

// Handler: Submit Sell Transaction
async function handleSellFruitSubmit(e) {
    e.preventDefault();
    
    const fruitId = document.getElementById('sell-fruit-id').value;
    const qty = parseFloat(document.getElementById('sell-qty').value);
    
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (!fruit || Number.isNaN(qty) || qty <= 0 || qty > fruit.stock) {
        showToastNotification(AppState.language === 'en' ? 'Invalid quantity!' : 'தவறான அளவு!', 'error');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const saleValue = qty * fruit.price;

    if (AppState.dbConnected) {
        try {
            const response = await apiFetch('/api/transactions/sell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fruitId, qty })
            });
            const data = await response.json();
            if (data.success && data.state) {
                AppState.metrics = data.state.metrics;
                AppState.inventory = data.state.inventory;
                AppState.recentActivity = data.state.recentActivity;
                
                refreshDashboardUI();
                closeAllModals();
                showToastNotification(
                    AppState.language === 'en' ? `Sold ${qty} kg ${fruit.nameEn} for ₹${saleValue}` : 
                    `${qty} கிலோ ${fruit.nameTa} ₹${saleValue} க்கு விற்கப்பட்டது.`
                );
                return;
            } else {
                showToastNotification(data.error || 'API Error', 'error');
            }
        } catch (err) {
            console.error('[API Error] Sale submission failed:', err);
            showToastNotification(AppState.language === 'en' ? 'Connection Error' : 'இணைப்பு பிழை', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    }
    
    // Fallback: Offline In-Memory logic
    const saleCost = qty * fruit.cost;
    const profit = saleValue - saleCost;
    fruit.stock -= qty;
    updateFruitHealthStatus(fruit);
    AppState.metrics.totalStock -= qty;
    AppState.metrics.todaySales += saleValue;
    AppState.metrics.netProfit += profit;
    
    AppState.recentActivity.unshift({
        type: 'sale',
        fruitEn: fruit.nameEn,
        fruitTa: fruit.nameTa,
        qty: qty,
        value: saleValue,
        timeEn: 'Just now',
        timeTa: 'சரியாக இப்போது'
    });
    
    refreshDashboardUI();
    closeAllModals();
    showToastNotification(
        AppState.language === 'en' ? `Sold ${qty} kg ${fruit.nameEn} for ₹${saleValue} (Offline Mode)` : 
        `${qty} கிலோ ${fruit.nameTa} ₹${saleValue} க்கு விற்கப்பட்டது. (ஆஃப்லைன்)`
    );
}

// Handler: Submit Restock Transaction
async function handleRestockFruitSubmit(e) {
    e.preventDefault();
    
    const fruitId = document.getElementById('restock-fruit-id').value;
    const qty = parseFloat(document.getElementById('restock-qty').value);
    
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (!fruit || Number.isNaN(qty) || qty <= 0) {
        showToastNotification(AppState.language === 'en' ? 'Invalid quantity!' : 'தவறான அளவு!', 'error');
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    
    const costValue = qty * fruit.cost;

    if (AppState.dbConnected) {
        try {
            const response = await apiFetch('/api/transactions/restock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fruitId, qty })
            });
            const data = await response.json();
            if (data.success && data.state) {
                AppState.metrics = data.state.metrics;
                AppState.inventory = data.state.inventory;
                AppState.recentActivity = data.state.recentActivity;
                
                refreshDashboardUI();
                closeAllModals();
                showToastNotification(
                    AppState.language === 'en' ? `Restocked ${qty} kg of ${fruit.nameEn}` : 
                    `${qty} கிலோ ${fruit.nameTa} இருப்பு சேர்க்கப்பட்டது.`
                );
                return;
            } else {
                showToastNotification(data.error || 'API Error', 'error');
            }
        } catch (err) {
            console.error('[API Error] Restock submission failed:', err);
            showToastNotification(AppState.language === 'en' ? 'Connection Error' : 'இணைப்பு பிழை', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    }
    
    // Fallback: Offline In-Memory logic
    fruit.stock += qty;
    updateFruitHealthStatus(fruit);
    AppState.metrics.totalStock += qty;
    
    AppState.recentActivity.unshift({
        type: 'restock',
        fruitEn: fruit.nameEn,
        fruitTa: fruit.nameTa,
        qty: qty,
        value: costValue,
        timeEn: 'Just now',
        timeTa: 'சரியாக இப்போது'
    });
    
    refreshDashboardUI();
    closeAllModals();
    showToastNotification(
        AppState.language === 'en' ? `Restocked ${qty} kg of ${fruit.nameEn} (Offline Mode)` : 
        `${qty} கிலோ ${fruit.nameTa} இருப்பு சேர்க்கப்பட்டது. (ஆஃப்லைன்)`
    );
}

// Handler: Add Custom Fruit Variety
async function handleAddFruitSubmit(e) {
    e.preventDefault();
    
    const nameEn = document.getElementById('add-name-en').value;
    const nameTa = document.getElementById('add-name-ta').value;
    const threshold = parseFloat(document.getElementById('add-threshold').value);
    const cost = parseFloat(document.getElementById('add-cost').value);
    const price = parseFloat(document.getElementById('add-price').value);
    
    if (!nameEn || !nameTa || Number.isNaN(cost) || Number.isNaN(price)) {
        showToastNotification(AppState.language === 'en' ? 'Please fill all fields!' : 'அனைத்து இடங்களையும் நிரப்பவும்!', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    if (AppState.dbConnected) {
        try {
            const response = await apiFetch('/api/fruits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nameEn,
                    nameTa,
                    price,
                    cost,
                    threshold
                })
            });
            const data = await response.json();
            if (data.success && data.state) {
                AppState.metrics = data.state.metrics;
                AppState.inventory = data.state.inventory;
                AppState.recentActivity = data.state.recentActivity;
                
                document.getElementById('form-add-fruit').reset();
                refreshDashboardUI();
                closeAllModals();
                showToastNotification(
                    AppState.language === 'en' ? `Added variety ${nameEn}` : `புதிய ${nameTa} சேர்க்கப்பட்டது.`
                );
                return;
            } else {
                showToastNotification(data.error || 'API Error', 'error');
                return;
            }
        } catch (err) {
            console.error('[API Error] Fruit registration failed:', err);
            showToastNotification(AppState.language === 'en' ? 'Connection Error' : 'இணைப்பு பிழை', 'error');
            return;
        } finally {
            submitBtn.disabled = false;
            return;
        }
    }
    
    // Fallback: Offline In-Memory logic
    const newFruit = {
        id: 'fruit-' + Date.now(),
        nameEn: nameEn,
        nameTa: nameTa,
        stock: 0,
        limit: threshold * 3,
        price: price,
        cost: cost,
        unitEn: 'kg',
        unitTa: 'கிலோ',
        statusEn: 'Optimal',
        statusTa: 'சரியானது',
        emoji: '🍇',
        accent: '#8b5cf6',
        accentGlow: 'rgba(139, 92, 246, 0.4)'
    };
    
    updateFruitHealthStatus(newFruit);
    AppState.inventory.push(newFruit);
    
    document.getElementById('form-add-fruit').reset();
    refreshDashboardUI();
    closeAllModals();
    showToastNotification(
        AppState.language === 'en' ? `Added variety ${nameEn} (Offline Mode)` : `புதிய ${nameTa} சேர்க்கப்பட்டது. (ஆஃப்லைன்)`
    );
}

// Handler: Remove Fruit Variety
async function handleRemoveFruit(fruitId) {
    if (!confirm(AppState.language === 'en' ? 'Are you sure you want to remove this fruit variety?' : 'இந்த பழ வகையை நீக்க உறுதியாக இருக்கிறீர்களா?')) {
        return;
    }

    if (AppState.dbConnected) {
        try {
            console.log(`[Frontend] Sending delete request for fruit: ${fruitId}`);
            const response = await apiFetch(`/api/fruits/${fruitId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success && data.state) {
                console.log(`[Frontend] Fruit deleted successfully. Updating UI...`);
                AppState.metrics = data.state.metrics;
                AppState.inventory = data.state.inventory;
                AppState.recentActivity = data.state.recentActivity;
                
                refreshDashboardUI();
                showToastNotification(
                    AppState.language === 'en' ? 'Fruit variety removed and database updated' : 'பழ வகை நீக்கப்பட்டு தரவுக்கோவை புதுப்பிக்கப்பட்டது'
                );
                return;
            } else {
                // Handle failed deletion with error message
                const errorMsg = data.error || 'Unknown error occurred';
                console.error(`[Frontend] Delete failed: ${errorMsg}`);
                showToastNotification(
                    AppState.language === 'en' ? `Failed to remove: ${errorMsg}` : `நீக்குவது தோல்வியடைந்தது: ${errorMsg}`,
                    'error'
                );
                return;
            }
        } catch (err) {
            console.error('[API Error] Fruit removal failed:', err);
            showToastNotification(
                AppState.language === 'en' ? 'Error removing fruit variety' : 'பழ வகை நீக்குவதில் பிழை',
                'error'
            );
        }
    }
    
    // Fallback: Offline In-Memory logic
    console.warn(`[Frontend] Database not connected. Removing fruit in offline mode.`);
    AppState.inventory = AppState.inventory.filter(f => f.id !== fruitId);
    refreshDashboardUI();
    showToastNotification(
        AppState.language === 'en' ? 'Fruit variety removed (Offline Mode - Changes not saved to DB)' : 'பழ வகை நீக்கப்பட்டது (ஆஃப்லைன் - மாற்றங்கள் சேமிக்கப்படவில்லை)',
        'warning'
    );
}

// Handler: Open Edit Modal
function triggerEditModal(fruitId) {
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (!fruit) return;
    
    document.getElementById('edit-fruit-id').value = fruit.id;
    document.getElementById('edit-name-en').value = fruit.nameEn;
    document.getElementById('edit-name-ta').value = fruit.nameTa;
    document.getElementById('edit-stock').value = fruit.stock;
    document.getElementById('edit-threshold').value = Math.floor(fruit.limit / 3);
    document.getElementById('edit-cost').value = fruit.cost;
    document.getElementById('edit-price').value = fruit.price;
    
    openModal('modal-edit-variety');
}

// Handler: Submit Edit Custom Fruit Variety
async function handleEditFruitSubmit(e) {
    e.preventDefault();
    
    const fruitId = document.getElementById('edit-fruit-id').value;
    const nameEn = document.getElementById('edit-name-en').value;
    const nameTa = document.getElementById('edit-name-ta').value;
    const stock = parseFloat(document.getElementById('edit-stock').value);
    const threshold = parseFloat(document.getElementById('edit-threshold').value);
    const cost = parseFloat(document.getElementById('edit-cost').value);
    const price = parseFloat(document.getElementById('edit-price').value);
    
    if (!fruitId || !nameEn || !nameTa || Number.isNaN(stock) || Number.isNaN(cost) || Number.isNaN(price) || Number.isNaN(threshold)) {
        alert('Please fill out all fields!');
        return;
    }

    const limit = threshold * 3;

    if (AppState.dbConnected) {
        try {
            const response = await apiFetch(`/api/fruits/${fruitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nameEn,
                    nameTa,
                    stock,
                    price,
                    cost,
                    limit
                })
            });
            const data = await response.json();
            if (data.success && data.state) {
                AppState.metrics = data.state.metrics;
                AppState.inventory = data.state.inventory;
                AppState.recentActivity = data.state.recentActivity;
                
                document.getElementById('form-edit-fruit').reset();
                refreshDashboardUI();
                closeAllModals();
                showToastNotification(
                    AppState.language === 'en' ? `Updated variety ${nameEn}` : `${nameTa} புதுப்பிக்கப்பட்டது.`
                );
                return;
            }
        } catch (err) {
            console.error('[API Error] Fruit update failed:', err);
        }
    }
    
    // Fallback: Offline In-Memory logic
    const fruit = AppState.inventory.find(f => f.id === fruitId);
    if (fruit) {
        fruit.nameEn = nameEn;
        fruit.nameTa = nameTa;

        fruit.stock = stock;
        fruit.limit = limit;
        fruit.price = price;
        fruit.cost = cost;
        updateFruitHealthStatus(fruit);
    }
    
    document.getElementById('form-edit-fruit').reset();
    refreshDashboardUI();
    closeAllModals();
    showToastNotification(
        AppState.language === 'en' ? `Updated variety ${nameEn} (Offline Mode)` : `${nameTa} புதுப்பிக்கப்பட்டது. (ஆஃப்லைன்)`
    );
}

// Internal health checking algorithm based on thresholds
function updateFruitHealthStatus(fruit) {
    const dangerLimit = fruit.limit * 0.15;
    const warningLimit = fruit.limit * 0.35;
    
    if (fruit.stock < dangerLimit) {
        fruit.statusEn = 'Danger Alert';
        fruit.statusTa = 'அபாய எச்சரிக்கை';
    } else if (fruit.stock < warningLimit) {
        fruit.statusEn = 'Low Stock';
        fruit.statusTa = 'குறைந்த இருப்பு';
    } else {
        fruit.statusEn = 'Optimal';
        fruit.statusTa = 'சரியானது';
    }
}

// Refresh whole dashboard layout views
function refreshDashboardUI() {
    // 1. Calculate Total Inventory Amount (Valuation: Stock * Cost)
    const totalInvVal = AppState.inventory.reduce((sum, item) => sum + (item.stock * item.cost), 0);
    document.getElementById('metric-total-inv-amt').textContent = `₹${totalInvVal.toLocaleString('en-IN')}`;

    // 2. Text Metrics
    document.getElementById('metric-today-sales').textContent = `₹${AppState.metrics.todaySales.toLocaleString('en-IN')}`;
    document.getElementById('metric-net-profit').textContent = `₹${AppState.metrics.netProfit.toLocaleString('en-IN')}`;
    
    // 2. Refresh dynamic tables, list activities, fruit cards
    renderInventoryTable();
    renderFruitCards();
    renderInventoryUpdateView();
    renderRecentActivity();

    // 3. Update History Summary Cards (Sales/Waste kg)
    renderHistoryMetrics(AppState.metrics);

    // Refresh history if the view is currently visible
    if (document.getElementById('stock-history-view').style.display !== 'none') {
        fetchStockHistory();
    }

    
    // 3. Update Chart.js datasets with fresh sales/profit
    if (AppState.charts.revenue) {
        const data = AppState.charts.revenue.data.datasets[0].data;
        data[data.length - 1] = AppState.metrics.todaySales;
        AppState.charts.revenue.update();
    }
    if (AppState.charts.profit) {
        const data = AppState.charts.profit.data.datasets[0].data;
        data[data.length - 1] = AppState.metrics.netProfit;
        AppState.charts.profit.update();
    }
}

// Render the Live Shop Operations Log (Recent Activity)
function renderRecentActivity() {
    const container = document.getElementById('activity-list');
    if (!container) return;

    container.innerHTML = '';
    
    if (AppState.recentActivity.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-secondary);">No recent activities.</div>`;
        return;
    }

    AppState.recentActivity.slice(0, 10).forEach(act => {
        const fruitName = AppState.language === 'en' ? act.fruitEn : act.fruitTa;
        const time = AppState.language === 'en' ? act.timeEn : act.timeTa;
        
        let icon = '';
        let color = '';
        let typeLabel = '';

        if (act.type === 'sale') {
            icon = '🛍️'; color = 'var(--electric-blue)'; typeLabel = AppState.language === 'en' ? 'Sale' : 'விற்பனை';
        } else if (act.type === 'restock') {
            icon = '📥'; color = 'var(--neon-green)'; typeLabel = AppState.language === 'en' ? 'Restock' : 'இருப்பு';
        } else if (act.type === 'waste') {
            icon = '⚠️'; color = 'var(--apple-red)'; typeLabel = AppState.language === 'en' ? 'Waste' : 'சேதம்';
        }

        const item = document.createElement('div');
        item.className = 'activity-item';
        item.style.borderLeft = `3px solid ${color}`;
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; gap: 12px; align-items: center;">
                    <span style="font-size: 1.2rem;">${icon}</span>
                    <div>
                        <div style="font-weight: 600; color: #fff; font-size: 0.9rem;">${fruitName}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${typeLabel}: ${act.qty} kg</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.7rem; color: var(--text-secondary);">${time}</div>
                    ${act.value > 0 ? `<div style="font-weight: 700; color: ${color}; font-size: 0.85rem;">₹${act.value}</div>` : ''}
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

// Simple CSS Toast Overlay builder
function showToastNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.background = 'rgba(10, 16, 32, 0.9)';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.border = '1px solid var(--neon-green)';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '12px';
    toast.style.color = '#ffffff';
    toast.style.fontSize = '0.85rem';
    toast.style.fontWeight = '600';
    toast.style.zIndex = '300';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.style.boxShadow = '0 8px 30px rgba(16, 185, 129, 0.25)';
    toast.className = AppState.language === 'ta' ? 'lang-ta' : '';
    
    if (type === 'error') {
        toast.style.border = '1px solid var(--apple-red)';
        toast.style.boxShadow = '0 8px 30px rgba(239, 68, 68, 0.25)';
    } else if (type === 'warning') {
        toast.style.border = '1px solid var(--mango-gold)';
        toast.style.boxShadow = '0 8px 30px rgba(245, 158, 11, 0.25)';
    }

    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Trigger transition
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);
    
    // Fade out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Syncs State with Backend API, fallback to LocalStorage/In-Memory on failure
async function syncStateWithBackend() {
    try {
        const response = await apiFetch('/api/state');
        if (!response.ok) throw new Error('API server returned error');
        const data = await response.json();
        if (data.success && data.state) {
            AppState.metrics = data.state.metrics;
            AppState.inventory = data.state.inventory;
            AppState.recentActivity = data.state.recentActivity;
            
            setDatabaseStatus(true);
            return true;
        }
    } catch (e) {
        console.warn('[Database System] API connection failed. Gracing down to offline mode:', e.message);
        setDatabaseStatus(false);
        return false;
    }
}

// Manage visual glowing status connection indicator badge
function setDatabaseStatus(connected) {
    AppState.dbConnected = connected;
    const badge = document.getElementById('db-status-badge');
    const text = document.getElementById('db-status-text');
    if (!badge || !text) return;

    if (connected) {
        badge.classList.add('connected');
        text.setAttribute('data-translate', 'db_status_online');
    } else {
        badge.classList.remove('connected');
        text.setAttribute('data-translate', 'db_status_offline');
    }
    
    renderLanguage();
}
