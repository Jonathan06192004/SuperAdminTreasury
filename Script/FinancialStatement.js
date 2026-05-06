const TREASURY_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
const TREASURY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── State ─────────────────────────────────────────────────────────────────────
let currentMonth = new Date().getMonth() + 1; // 1-based
let flPctMode = false;
const zoomState = { bs: 1, is: 1, cf: 1, fl: 1 };

// ── Supabase fetch helper ─────────────────────────────────────────────────────
async function tFetch(table, params = '') {
    const res = await fetch(`${TREASURY_URL}/rest/v1/${table}?${params}`, {
        headers: { apikey: TREASURY_KEY, Authorization: 'Bearer ' + TREASURY_KEY }
    });
    if (!res.ok) throw new Error(`Failed to fetch ${table}`);
    return res.json();
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmt(v) {
    if (v == null) return '—';
    const n = parseFloat(v);
    if (isNaN(n)) return '—';
    const abs = Math.abs(n);
    const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(${s})` : s;
}

function fmtClass(v) {
    return (v != null && parseFloat(v) < 0) ? 'fs-amount neg' : 'fs-amount';
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab, btn) {
    document.querySelectorAll('.fs-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.fs-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.kpi-cards').forEach(k => k.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    const kpiMap = { balance: 'kpiCardsBalance', income: 'kpiCardsIncome', equity: 'kpiCardsEquity' };
    if (kpiMap[tab]) document.getElementById(kpiMap[tab]).classList.remove('hidden');
}

// ── Zoom ──────────────────────────────────────────────────────────────────────
function applyZoom(key, scrollId, labelId) {
    const z = zoomState[key];
    document.getElementById(scrollId).style.transform = `scale(${z})`;
    document.getElementById(labelId).textContent = Math.round(z * 100) + '%';
}
function bsZoom(d) { zoomState.bs = Math.min(2, Math.max(0.5, zoomState.bs + d * 0.1)); applyZoom('bs','bsTableScroll','bsZoomLabel'); }
function isZoom(d) { zoomState.is = Math.min(2, Math.max(0.5, zoomState.is + d * 0.1)); applyZoom('is','isTableScroll','isZoomLabel'); }
function cfZoom(d) { zoomState.cf = Math.min(2, Math.max(0.5, zoomState.cf + d * 0.1)); applyZoom('cf','cfTableScroll','cfZoomLabel'); }
function flZoom(d) { zoomState.fl = Math.min(2, Math.max(0.5, zoomState.fl + d * 0.1)); applyZoom('fl','flTableScroll','flZoomLabel'); }

function toggleFlMode() {
    flPctMode = !flPctMode;
    document.getElementById('flPctBtn').textContent = flPctMode ? 'VIEW MONTHS' : '% SEE PERCENTAGE';
    renderAll(currentMonth - 1);
}

// ── Sync all month selects ────────────────────────────────────────────────────
function syncSelects(monthIdx) {
    ['bsMonthSelect','isMonthSelect','cfMonthSelect','flMonthSelect'].forEach(id => {
        document.getElementById(id).value = monthIdx;
    });
}

// ── Main render entry ─────────────────────────────────────────────────────────
async function renderAll(monthIdx) {
    currentMonth = monthIdx + 1;
    syncSelects(monthIdx);
    const label = MONTH_NAMES[monthIdx].toUpperCase() + ' 2026';
    ['bsPeriodLabel','isPeriodLabel','cfPeriodLabel','flPeriodLabel'].forEach(id => {
        document.getElementById(id).textContent = label;
    });

    await Promise.all([
        renderBalanceSheet(currentMonth),
        renderIncomeStatement(currentMonth),
        renderFinancialIndicator(currentMonth)
    ]);
}

// ══════════════════════════════════════════════════════════════════════════════
// BALANCE SHEET
// ══════════════════════════════════════════════════════════════════════════════
async function renderBalanceSheet(month) {
    const tbody = document.getElementById('bsTableBody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        // Fetch current (2026) and previous (2025) year data
        const [cur, prev] = await Promise.all([
            tFetch('balance_sheet', `year=eq.2026&month=eq.${month}&limit=1`),
            tFetch('balance_sheet', `year=eq.2025&month=eq.${month}&limit=1`)
        ]);

        const c = cur[0] || {};
        const p = prev[0] || {};

        // Computed totals
        const cCurrAssets = sum(c.cash, c.investments, c.accounts_receivable, c.cash_held_agency, c.loans_receivable, c.supplies);
        const pCurrAssets = sum(p.cash, p.investments, p.accounts_receivable, p.cash_held_agency, p.loans_receivable, p.supplies);
        const cNonCurrAssets = sum(c.fixed_assets, c.loans_nc, c.other_assets_nc);
        const pNonCurrAssets = sum(p.fixed_assets, p.loans_nc, p.other_assets_nc);
        const cTotalAssets = cCurrAssets + cNonCurrAssets;
        const pTotalAssets = pCurrAssets + pNonCurrAssets;

        const cCurrLiab = sum(c.accounts_payable, c.offerings_agency, c.interfund_ap, c.loans_payable);
        const pCurrLiab = sum(p.accounts_payable, p.offerings_agency, p.interfund_ap, p.loans_payable);
        const cNetAssets = sum(c.una_tithe, c.una_non_tithe, c.allocated_na, c.unexpended_plant, c.invested_plant);
        const pNetAssets = sum(p.una_tithe, p.una_non_tithe, p.allocated_na, p.unexpended_plant, p.invested_plant);
        const cTotalLiabNet = cCurrLiab + cNetAssets;
        const pTotalLiabNet = pCurrLiab + pNetAssets;

        const rows = [
            // ASSETS
            { type: 'section', label: 'ASSETS' },
            { type: 'sub', label: 'CURRENT ASSETS' },
            { label: 'Cash and Cash Equivalents', c: c.cash, p: p.cash, drill: 'cash' },
            { label: 'Investments', c: c.investments, p: p.investments },
            { label: 'Accounts Receivable', c: c.accounts_receivable, p: p.accounts_receivable, drill: 'ar' },
            { label: 'Cash Held for Agency', c: c.cash_held_agency, p: p.cash_held_agency },
            { label: 'Loans Receivable', c: c.loans_receivable, p: p.loans_receivable },
            { label: 'Supplies', c: c.supplies, p: p.supplies },
            { type: 'subtotal', label: 'TOTAL CURRENT ASSETS', c: cCurrAssets, p: pCurrAssets },
            { type: 'sub', label: 'NON-CURRENT ASSETS' },
            { label: 'Fixed Assets', c: c.fixed_assets, p: p.fixed_assets },
            { label: 'Loans Receivable (Non-Current)', c: c.loans_nc, p: p.loans_nc },
            { label: 'Other Non-Current Assets', c: c.other_assets_nc, p: p.other_assets_nc },
            { type: 'subtotal', label: 'TOTAL NON-CURRENT ASSETS', c: cNonCurrAssets, p: pNonCurrAssets },
            { type: 'total', label: 'TOTAL ASSETS', c: cTotalAssets, p: pTotalAssets },
            { type: 'spacer' },
            // LIABILITIES
            { type: 'section', label: 'LIABILITIES' },
            { type: 'sub', label: 'CURRENT LIABILITIES' },
            { label: 'Accounts Payable', c: c.accounts_payable, p: p.accounts_payable, drill: 'ap' },
            { label: 'Offerings Held for Agency', c: c.offerings_agency, p: p.offerings_agency },
            { label: 'Interfund Accounts Payable', c: c.interfund_ap, p: p.interfund_ap },
            { label: 'Loans Payable', c: c.loans_payable, p: p.loans_payable },
            { type: 'subtotal', label: 'TOTAL CURRENT LIABILITIES', c: cCurrLiab, p: pCurrLiab },
            { type: 'total', label: 'TOTAL LIABILITIES', c: cCurrLiab, p: pCurrLiab },
            { type: 'spacer' },
            // NET ASSETS
            { type: 'section', label: 'NET ASSETS' },
            { label: 'Unallocated Net Assets – Tithe', c: c.una_tithe, p: p.una_tithe },
            { label: 'Unallocated Net Assets – Non-Tithe', c: c.una_non_tithe, p: p.una_non_tithe },
            { label: 'Allocated Net Assets', c: c.allocated_na, p: p.allocated_na },
            { label: 'Unexpended Plant Fund', c: c.unexpended_plant, p: p.unexpended_plant },
            { label: 'Invested in Plant', c: c.invested_plant, p: p.invested_plant },
            { type: 'subtotal', label: 'TOTAL NET ASSETS', c: cNetAssets, p: pNetAssets },
            { type: 'spacer' },
            { type: 'total', label: 'TOTAL LIABILITIES AND NET ASSETS', c: cTotalLiabNet, p: pTotalLiabNet },
        ];

        tbody.innerHTML = rows.map(r => bsRow(r)).join('');

        // KPI
        document.getElementById('kpiBsAssets').textContent = fmt(cTotalAssets);
        document.getElementById('kpiBsAssetsSub').textContent = 'Prev: ' + fmt(pTotalAssets);
        document.getElementById('kpiBsLiabilities').textContent = fmt(cCurrLiab);
        document.getElementById('kpiBsLiabilitiesSub').textContent = 'Prev: ' + fmt(pCurrLiab);
        document.getElementById('kpiBsNetAssets').textContent = fmt(cNetAssets);
        document.getElementById('kpiBsNetAssetsSub').textContent = 'Prev: ' + fmt(pNetAssets);
        document.getElementById('kpiBsTotal').textContent = fmt(cTotalLiabNet);
        document.getElementById('kpiBsTotalSub').textContent = 'Prev: ' + fmt(pTotalLiabNet);

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function bsRow(r) {
    if (r.type === 'spacer') return '<tr class="spacer"><td colspan="3"></td></tr>';
    if (r.type === 'section') return `<tr class="section-header"><td colspan="3">${r.label}</td></tr>`;
    if (r.type === 'sub') return `<tr><td colspan="3" class="fs-label indent">${r.label}</td></tr>`;
    if (r.type === 'subtotal') return `<tr class="subtotal-row"><td class="fs-label">${r.label}</td><td class="${fmtClass(r.p)}">${fmt(r.p)}</td><td class="${fmtClass(r.c)}">${fmt(r.c)}</td></tr>`;
    if (r.type === 'total') return `<tr class="total-row highlight"><td class="fs-label">${r.label}</td><td class="fs-amount gold">${fmt(r.p)}</td><td class="fs-amount gold">${fmt(r.c)}</td></tr>`;
    const drillClick = r.drill === 'cash' ? `onclick="openCashNote(currentMonth)"` :
                       r.drill === 'ar'   ? `onclick="openArNote(currentMonth)"` :
                       r.drill === 'ap'   ? `onclick="openApNote(currentMonth)"` : '';
    const drillAttr = r.drill ? `class="bs-drilldown-row"` : '';
    const drillIcon = r.drill ? `<span class="drill-icon">▶</span>` : '';
    return `<tr ${drillAttr} ${drillClick}><td class="fs-label indent-sub">${r.label}${drillIcon}</td><td class="${fmtClass(r.p)}">${fmt(r.p)}</td><td class="${fmtClass(r.c)}">${fmt(r.c)}</td></tr>`;
}

function sum(...vals) {
    return vals.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
}

// ══════════════════════════════════════════════════════════════════════════════
// CASH NOTE MODAL — NOTE 3: CASH AND CASH EQUIVALENTS
// ══════════════════════════════════════════════════════════════════════════════
async function openCashNote(month) {
    const overlay = document.getElementById('cashNoteOverlay');
    const body    = document.getElementById('cashNoteBody');
    overlay.classList.remove('hidden');
    document.getElementById('cashNoteModal').classList.remove('hidden');
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const rows = await tFetch('balance_sheet_note_cash',
            `year=eq.2026&month=eq.${month}&order=sort_order.asc`);

        body.innerHTML = rows.map(r => {
            const isSubtotal = r.row_type === 'subtotal';
            const isNegCur   = r.current_amount  != null && parseFloat(r.current_amount)  < 0;
            const isNegPrev  = r.previous_amount != null && parseFloat(r.previous_amount) < 0;
            const curFmt     = r.current_amount  != null ? fmt(r.current_amount)  : '';
            const prevFmt    = r.previous_amount != null ? fmt(r.previous_amount) : '';
            const rowCls     = isSubtotal ? 'cn-subtotal-row' : '';
            const labelCls   = isSubtotal ? 'cn-label cn-label-bold' : (r.is_indent ? 'cn-label cn-label-indent' : 'cn-label');
            const curCls     = isSubtotal ? 'cn-amount cn-amount-bold' + (isNegCur  ? ' cn-neg' : '') :
                                            'cn-amount' + (isNegCur  ? ' cn-neg' : '');
            const prevCls    = isSubtotal ? 'cn-amount cn-amount-bold' + (isNegPrev ? ' cn-neg' : '') :
                                            'cn-amount' + (isNegPrev ? ' cn-neg' : '');
            return `<tr class="${rowCls}">
                <td class="${labelCls}">${r.label}</td>
                <td class="${curCls}">${curFmt}</td>
                <td class="${prevCls}">${prevFmt}</td>
            </tr>`;
        }).join('');

        if (!rows.length) body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">No data for this period.</td></tr>';
    } catch (e) {
        body.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function closeCashNote() {
    document.getElementById('cashNoteOverlay').classList.add('hidden');
    document.getElementById('cashNoteModal').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════════════════
// AR NOTE MODAL — NOTE 5: ACCOUNTS RECEIVABLE
// ══════════════════════════════════════════════════════════════════════════════
async function openArNote(month) {
    document.getElementById('cashNoteOverlay').classList.remove('hidden');
    document.getElementById('arNoteModal').classList.remove('hidden');
    const body = document.getElementById('arNoteBody');
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const rows = await tFetch('balance_sheet_note_ar',
            `year=eq.2026&month=eq.${month}&order=sort_order.asc`);

        body.innerHTML = rows.map(r => {
            if (r.row_type === 'group') {
                return `<tr class="cn-group-row"><td class="cn-group-label" colspan="3">${r.label}</td></tr>`;
            }
            const isSubtotal = r.row_type === 'subtotal';
            const isSda      = r.drill_key === 'sda';
            const isNegCur   = r.current_amount  != null && parseFloat(r.current_amount)  < 0;
            const isNegPrev  = r.previous_amount != null && parseFloat(r.previous_amount) < 0;
            const curFmt     = r.current_amount  != null ? fmt(r.current_amount)  : '';
            const prevFmt    = r.previous_amount != null ? fmt(r.previous_amount) : '';
            const rowCls     = isSubtotal ? 'cn-subtotal-row' : '';
            const labelCls   = isSubtotal ? 'cn-label cn-label-bold'
                             : r.is_indent ? 'cn-label cn-label-indent' : 'cn-label';
            const curCls     = (isSubtotal ? 'cn-amount cn-amount-bold' : 'cn-amount') + (isNegCur  ? ' cn-neg' : '');
            const prevCls    = (isSubtotal ? 'cn-amount cn-amount-bold' : 'cn-amount') + (isNegPrev ? ' cn-neg' : '');
            const sdaBtn     = isSda ? `<span class="cn-sda-dot" onclick="event.stopPropagation();openArSda(${month})">▸</span>` : '';
            return `<tr class="${rowCls}">
                <td class="${labelCls}">${r.label}${sdaBtn}</td>
                <td class="${curCls}">${curFmt}</td>
                <td class="${prevCls}">${prevFmt}</td>
            </tr>`;
        }).join('');

        if (!rows.length) body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">No data for this period.</td></tr>';
    } catch (e) {
        body.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function closeArNote() {
    document.getElementById('cashNoteOverlay').classList.add('hidden');
    document.getElementById('arNoteModal').classList.add('hidden');
    closeArSda();
}

// ── AR SDA drill-down ─────────────────────────────────────────────────────────
async function openArSda(month) {
    document.getElementById('arSdaModal').classList.remove('hidden');
    const body = document.getElementById('arSdaBody');
    body.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const rows = await tFetch('balance_sheet_note_ar_sda',
            `year=eq.2026&month=eq.${month}&order=sort_order.asc`);

        body.innerHTML = rows.map(r => {
            const isNeg = r.amount != null && parseFloat(r.amount) < 0;
            const amtFmt = r.amount != null ? fmt(r.amount) : '0';
            return `<tr>
                <td class="cn-label cn-label-indent">${r.entity_name}</td>
                <td class="cn-amount${isNeg ? ' cn-neg' : ''}">${amtFmt}</td>
            </tr>`;
        }).join('');

        if (!rows.length) body.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:20px;color:#64748b;">No data.</td></tr>';
    } catch (e) {
        body.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function closeArSda() {
    document.getElementById('arSdaModal').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════════════════
// AP NOTE MODAL — NOTE 10: ACCOUNTS PAYABLE
// ══════════════════════════════════════════════════════════════════════════════
async function openApNote(month) {
    document.getElementById('cashNoteOverlay').classList.remove('hidden');
    document.getElementById('apNoteModal').classList.remove('hidden');
    const body = document.getElementById('apNoteBody');
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const rows = await tFetch('balance_sheet_note_ap',
            `year=eq.2026&month=eq.${month}&order=sort_order.asc`);

        body.innerHTML = rows.map(r => {
            if (r.row_type === 'group') {
                return `<tr class="cn-group-row"><td class="cn-group-label" colspan="3">${r.label}</td></tr>`;
            }
            const isSubtotal = r.row_type === 'subtotal';
            const isSda      = r.drill_key === 'sdaAp';
            const isNegCur   = r.current_amount  != null && parseFloat(r.current_amount)  < 0;
            const isNegPrev  = r.previous_amount != null && parseFloat(r.previous_amount) < 0;
            const curFmt     = r.current_amount  != null ? fmt(r.current_amount)  : '';
            const prevFmt    = r.previous_amount != null ? fmt(r.previous_amount) : '';
            const rowCls     = isSubtotal ? 'cn-subtotal-row' : '';
            const labelCls   = isSubtotal ? 'cn-label cn-label-bold'
                             : r.is_indent ? 'cn-label cn-label-indent' : 'cn-label';
            const curCls     = (isSubtotal ? 'cn-amount cn-amount-bold' : 'cn-amount') + (isNegCur  ? ' cn-neg' : '');
            const prevCls    = (isSubtotal ? 'cn-amount cn-amount-bold' : 'cn-amount') + (isNegPrev ? ' cn-neg' : '');
            const sdaBtn     = isSda ? `<span class="cn-sda-dot" onclick="event.stopPropagation();openApSda(${month})">▸</span>` : '';
            return `<tr class="${rowCls}">
                <td class="${labelCls}">${r.label}${sdaBtn}</td>
                <td class="${curCls}">${curFmt}</td>
                <td class="${prevCls}">${prevFmt}</td>
            </tr>`;
        }).join('');

        if (!rows.length) body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">No data for this period.</td></tr>';
    } catch (e) {
        body.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function closeApNote() {
    document.getElementById('cashNoteOverlay').classList.add('hidden');
    document.getElementById('apNoteModal').classList.add('hidden');
    closeApSda();
}

// ── AP SDA drill-down ─────────────────────────────────────────────────────────
async function openApSda(month) {
    document.getElementById('apSdaModal').classList.remove('hidden');
    const body = document.getElementById('apSdaBody');
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const rows = await tFetch('balance_sheet_note_ap_sda',
            `year=eq.2026&month=eq.${month}&order=sort_order.asc`);

        body.innerHTML = rows.map(r => {
            const isNegBase = r.base_amount    != null && parseFloat(r.base_amount)    < 0;
            const isNegCur  = r.current_amount != null && parseFloat(r.current_amount) < 0;
            const baseFmt   = r.base_amount    != null ? fmt(r.base_amount)    : '0';
            const curFmt    = r.current_amount != null ? fmt(r.current_amount) : '0';
            return `<tr>
                <td class="cn-label cn-label-indent">${r.entity_name}</td>
                <td class="cn-amount${isNegBase ? ' cn-neg' : ''}">${baseFmt}</td>
                <td class="cn-amount${isNegCur  ? ' cn-neg' : ''}">${curFmt}</td>
            </tr>`;
        }).join('');

        if (!rows.length) body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">No data.</td></tr>';
    } catch (e) {
        body.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function closeApSda() {
    document.getElementById('apSdaModal').classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════════════════════
// INCOME STATEMENT
// ══════════════════════════════════════════════════════════════════════════════
// Keys that render as highlighted total rows
const IS_TOTAL_KEYS = new Set([
    'TOTAL_EARNED_OPERATING_INCOME','TOTAL_OPERATING_EXPENSES',
    'INCREASE_BEFORE_APPROP','INCREASE_FROM_OPERATIONS',
    'INCREASE_BEFORE_TRANSFERS','NET_ASSETS_INCREASE_YEAR',
    'NET_ASSETS_END'
]);
// Keys that render as subtotal rows
const IS_SUBTOTAL_KEYS = new Set([
    'NET_APPROP_RETAINED','NET_CAPITAL_INCREASE'
]);
// Key for the special budgeted-expenses row
const BUDGET_ROW_KEY = 'TOTAL_OPERATING_EXPENSES';

async function renderIncomeStatement(month) {
    const tbody = document.getElementById('isTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const [lines, budgets] = await Promise.all([
            tFetch('income_statement_lines', `report_year=eq.2026&report_month=eq.${month}&order=sort_order.asc`),
            tFetch('income_statement_budgets', `select=income_statement_line_id,budget_amount`)
        ]);

        // Map budgets by line id (use first match per line_id regardless of year)
        const budgetMap = {};
        budgets.forEach(b => {
            if (!(b.income_statement_line_id in budgetMap)) {
                budgetMap[b.income_statement_line_id] = b.budget_amount;
            }
        });

        const monthName = MONTH_NAMES[month - 1].toUpperCase();
        let html = '';
        let lastSection = null;

        lines.forEach(line => {
            const key = (line.line_key || '').toUpperCase();
            if (line.section !== lastSection) {
                html += `<tr class="section-header"><td colspan="4">${line.section}</td></tr>`;
                lastSection = line.section;
            }
            const budget = budgetMap[line.id];
            const isTotal    = IS_TOTAL_KEYS.has(key);
            const isSubtotal = IS_SUBTOTAL_KEYS.has(key);
            const rowClass   = isTotal ? 'income-highlight-row' : isSubtotal ? 'subtotal-row' : '';
            const labelClass = (isTotal || isSubtotal) ? 'fs-label' : 'fs-label indent-sub';

            html += `<tr class="${rowClass}">
                <td class="${labelClass}">${line.label}</td>
                <td class="${fmtClass(line.total_2026)}">${fmt(line.total_2026)}</td>
                <td class="${fmtClass(budget)}">${fmt(budget)}</td>
                <td class="${fmtClass(line.total_2025)}">${fmt(line.total_2025)}</td>
            </tr>`;

            // Insert "BUDGETED OP EXPENSES" row right after TOTAL_OPERATING_EXPENSES
            if (key === BUDGET_ROW_KEY) {
                html += `<tr class="income-budget-row">
                    <td class="fs-label">BUDGETED OP EXPENSES ${monthName} 2026</td>
                    <td class="fs-amount"></td>
                    <td class="${fmtClass(budget)}">${fmt(budget)}</td>
                    <td class="fs-amount"></td>
                </tr>`;
            }
        });

        tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#64748b;">No data for this period.</td></tr>';

        // KPI
        const find = key => lines.find(l => (l.line_key || '').toUpperCase() === key);
        const revenue  = find('TOTAL_EARNED_OPERATING_INCOME') || {};
        const expenses = find('TOTAL_OPERATING_EXPENSES') || {};
        const capital  = find('INCREASE_BEFORE_TRANSFERS') || find('NET_CAPITAL_INCREASE') || {};
        const netEnd   = find('NET_ASSETS_END') || {};

        document.getElementById('kpiRevenue').textContent   = fmt(revenue.total_2026);
        document.getElementById('kpiRevenueSub').textContent = MONTH_NAMES[month-1] + ' 2026';
        document.getElementById('kpiExpenses').textContent  = fmt(expenses.total_2026);
        document.getElementById('kpiExpensesSub').textContent = MONTH_NAMES[month-1] + ' 2026';
        document.getElementById('kpiCapital').textContent   = fmt(capital.total_2026);
        document.getElementById('kpiCapitalSub').textContent = MONTH_NAMES[month-1] + ' 2026';
        document.getElementById('kpiNetAssets').textContent = fmt(netEnd.total_2026);
        document.getElementById('kpiNetAssetsSub').textContent = MONTH_NAMES[month-1] + ', 2026';

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// FINANCIAL INDICATOR
// ══════════════════════════════════════════════════════════════════════════════
async function renderFinancialIndicator(month) {
    const tbody = document.getElementById('flTableBody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const data = await tFetch('financial_indicator', `report_year=eq.2026&report_month=eq.${month}&limit=1`);
        const d = data[0] || {};

        // Available working capital = current_assets - current_liabilities - donor_restriction
        const awc26 = (parseFloat(d.current_assets_2026)||0) - (parseFloat(d.current_liabilities_2026)||0) - (parseFloat(d.donor_restriction_2026)||0);
        const awc25 = (parseFloat(d.current_assets_2025)||0) - (parseFloat(d.current_liabilities_2025)||0) - (parseFloat(d.donor_restriction_2025)||0);

        // Recommended working capital minimum = core_expenses / 12 * recommended_months
        const recWc26 = (parseFloat(d.recommended_months_wc_2026)||0) * (parseFloat(d.core_operating_2026)||0) / 12;
        const recWc25 = (parseFloat(d.recommended_months_wc_2025)||0) * (parseFloat(d.core_operating_2025)||0) / 12;
        const surplusWc26 = awc26 - recWc26;
        const surplusWc25 = awc25 - recWc25;

        // Available liquid assets = cash - held_for_agency + investments
        const ala26 = (parseFloat(d.cash_2026)||0) - (parseFloat(d.held_for_agency_2026)||0) + (parseFloat(d.investments_2026)||0);
        const ala25 = (parseFloat(d.cash_2025)||0) - (parseFloat(d.held_for_agency_2025)||0) + (parseFloat(d.investments_2025)||0);
        const recLa26 = (parseFloat(d.recommended_months_la_2026)||0) * (parseFloat(d.core_operating_2026)||0) / 12;
        const recLa25 = (parseFloat(d.recommended_months_la_2025)||0) * (parseFloat(d.core_operating_2025)||0) / 12;
        const surplusLa26 = ala26 - recLa26;
        const surplusLa25 = ala25 - recLa25;

        const wm26 = parseFloat(d.working_months_2026);
        const wm25 = parseFloat(d.working_months_2025);
        const lm26 = parseFloat(d.liquid_months_2026);
        const lm25 = parseFloat(d.liquid_months_2025);

        // Percentage = months / required_months * 100
        const reqWc = parseFloat(d.required_months_wc) || 1;
        const reqLa = parseFloat(d.required_months_la) || 1;
        const wcPct26 = isNaN(wm26) ? null : (wm26 / reqWc * 100);
        const wcPct25 = isNaN(wm25) ? null : (wm25 / reqWc * 100);
        const laPct26 = isNaN(lm26) ? null : (lm26 / reqLa * 100);
        const laPct25 = isNaN(lm25) ? null : (lm25 / reqLa * 100);

        const rows = [
            { type: 'section', label: 'CORE EXPENSES' },
            { label: 'OPERATING EXPENSES',       c: d.core_operating_2026,   p: d.core_operating_2025 },
            { label: 'NET OUTGOING REMITTANCE',  c: d.core_remittance_2026,  p: d.core_remittance_2025 },
            { type: 'subtotal', label: 'TOTAL CORE EXPENSES',
              c: (parseFloat(d.core_operating_2026)||0)+(parseFloat(d.core_remittance_2026)||0),
              p: (parseFloat(d.core_operating_2025)||0)+(parseFloat(d.core_remittance_2025)||0) },
            { type: 'spacer' },
            { type: 'section', label: 'AVAILABLE WORKING CAPITAL' },
            { label: 'CURRENT ASSETS',                              c: d.current_assets_2026,      p: d.current_assets_2025 },
            { label: 'MINUS: CURRENT LIABILITIES',                  c: d.current_liabilities_2026, p: d.current_liabilities_2025 },
            { label: 'MINUS: CURRENT ASSETS HELD FOR DONOR RESTRICTION', c: d.donor_restriction_2026, p: d.donor_restriction_2025 },
            { type: 'subtotal', label: 'AVAILABLE WORKING CAPITAL', c: awc26, p: awc25 },
            { label: 'RECOMMENDED WORKING CAPITAL MINIMUM',         c: recWc26, p: recWc25 },
            { label: 'SURPLUS (SHORTFALL) IN RECOMMENDED MINIMUM',  c: surplusWc26, p: surplusWc25 },
            { type: 'months', label: 'AVAILABLE WORKING CAPITAL IN MONTHS',
              c: wm26, p: wm25, pct26: wcPct26, pct25: wcPct25 },
            { type: 'spacer' },
            { type: 'section', label: 'AVAILABLE LIQUID ASSETS' },
            { label: 'CASH AND CASH EQUIVALENTS', c: d.cash_2026,        p: d.cash_2025 },
            { label: 'LESS: HELD FOR AGENCY',     c: d.held_for_agency_2026, p: d.held_for_agency_2025 },
            { label: 'INVESTMENTS',               c: d.investments_2026,  p: d.investments_2025 },
            { type: 'subtotal', label: 'AVAILABLE LIQUID ASSETS', c: ala26, p: ala25 },
            { label: 'RECOMMENDED LIQUID ASSETS MINIMUM',          c: recLa26, p: recLa25 },
            { label: 'SURPLUS (SHORTFALL) IN RECOMMENDED MINIMUM', c: surplusLa26, p: surplusLa25 },
            { type: 'months', label: 'AVAILABLE LIQUID ASSETS IN MONTHS',
              c: lm26, p: lm25, pct26: laPct26, pct25: laPct25 },
        ];

        tbody.innerHTML = rows.map(r => flRow(r)).join('');

        // KPI cards
        const wcVal = wm26;
        const laVal = lm26;
        if (flPctMode) {
            document.getElementById('kpiWcMonths').innerHTML =
                wcPct26 != null ? `<span class="fl-month-val">${wcPct26.toFixed(2)}%</span>` : '<span class="fl-month-val">—</span>';
            document.getElementById('kpiLaMonths').innerHTML =
                laPct26 != null ? `<span class="fl-month-val">${laPct26.toFixed(2)}%</span>` : '<span class="fl-month-val">—</span>';
        } else {
            document.getElementById('kpiWcMonths').innerHTML = isNaN(wcVal)
                ? '<span class="fl-month-val">—</span>'
                : `<span class="fl-month-val">${Math.round(wcVal)}</span><span class="fl-month-label"> months</span>`;
            document.getElementById('kpiLaMonths').innerHTML = isNaN(laVal)
                ? '<span class="fl-month-val">—</span>'
                : `<span class="fl-month-val">${Math.round(laVal)}</span><span class="fl-month-label"> months</span>`;
        }

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function flRow(r) {
    if (r.type === 'spacer') return '<tr class="spacer"><td colspan="3"></td></tr>';
    if (r.type === 'section') return `<tr class="section-header"><td colspan="3">${r.label}</td></tr>`;

    if (r.type === 'months') {
        // Special highlighted row — shows months or percentage
        const v26 = flPctMode
            ? (r.pct26 != null ? r.pct26.toFixed(2) + '%' : '—')
            : (!isNaN(r.c) && r.c != null ? Math.round(r.c) + ' MONTHS' : '—');
        const v25 = flPctMode
            ? (r.pct25 != null ? r.pct25.toFixed(2) + '%' : '—')
            : (!isNaN(r.p) && r.p != null ? Math.round(r.p) + ' MONTHS' : '—');
        return `<tr class="fl-months-row">
            <td class="fs-label">${r.label}</td>
            <td class="fl-months-val">${v26}</td>
            <td class="fl-months-val">${v25}</td>
        </tr>`;
    }

    if (r.type === 'subtotal') {
        return `<tr class="subtotal-row">
            <td class="fs-label">${r.label}</td>
            <td class="${fmtClass(r.c)}">${fmt(r.c)}</td>
            <td class="${fmtClass(r.p)}">${fmt(r.p)}</td>
        </tr>`;
    }

    return `<tr>
        <td class="fs-label indent-sub">${r.label}</td>
        <td class="${fmtClass(r.c)}">${fmt(r.c)}</td>
        <td class="${fmtClass(r.p)}">${fmt(r.p)}</td>
    </tr>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
(function init() {
    const monthIdx = new Date().getMonth(); // 0-based
    syncSelects(monthIdx);
    renderAll(monthIdx);
})();
