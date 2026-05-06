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
    document.getElementById('flPctBtn').textContent = flPctMode ? '# SEE AMOUNTS' : '% SEE PERCENTAGE';
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
    const drillAttr = r.drill ? `class="bs-drilldown-row"` : '';
    const drillIcon = r.drill ? `<span class="drill-icon">▶</span>` : '';
    return `<tr ${drillAttr}><td class="fs-label indent-sub">${r.label}${drillIcon}</td><td class="${fmtClass(r.p)}">${fmt(r.p)}</td><td class="${fmtClass(r.c)}">${fmt(r.c)}</td></tr>`;
}

function sum(...vals) {
    return vals.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
}

// ══════════════════════════════════════════════════════════════════════════════
// INCOME STATEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function renderIncomeStatement(month) {
    const tbody = document.getElementById('isTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#64748b;">Loading…</td></tr>';

    try {
        const [lines, budgets] = await Promise.all([
            tFetch('income_statement_lines', `report_year=eq.2026&report_month=eq.${month}&order=sort_order.asc`),
            tFetch('income_statement_budgets', `budget_year=eq.2026&select=income_statement_line_id,budget_amount`)
        ]);

        // Map budgets by line id
        const budgetMap = {};
        budgets.forEach(b => { budgetMap[b.income_statement_line_id] = b.budget_amount; });

        let html = '';
        let lastSection = null;

        lines.forEach(line => {
            if (line.section !== lastSection) {
                html += `<tr class="section-header"><td colspan="4">${line.section}</td></tr>`;
                lastSection = line.section;
            }
            const budget = budgetMap[line.id];
            const rowClass = line.line_key.includes('total') ? 'total-row highlight' :
                             line.line_key.includes('subtotal') ? 'subtotal-row' : '';
            const labelClass = rowClass ? 'fs-label' : 'fs-label indent-sub';
            html += `<tr class="${rowClass}">
                <td class="${labelClass}">${line.label}</td>
                <td class="${fmtClass(line.total_2026)}">${fmt(line.total_2026)}</td>
                <td class="${fmtClass(budget)}">${fmt(budget)}</td>
                <td class="${fmtClass(line.total_2025)}">${fmt(line.total_2025)}</td>
            </tr>`;
        });

        tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#64748b;">No data for this period.</td></tr>';

        // KPI — find key lines
        const find = key => lines.find(l => l.line_key === key);
        const revenue = find('total_earned_operating_income') || find('total_income') || {};
        const expenses = find('total_operating_expenses') || find('total_expenses') || {};
        const capital = find('capital_activity') || {};
        const netAssets = find('net_assets') || find('total_net_assets') || {};

        document.getElementById('kpiRevenue').textContent = fmt(revenue.total_2026);
        document.getElementById('kpiRevenueSub').textContent = 'Budget: ' + fmt(budgetMap[revenue.id]);
        document.getElementById('kpiExpenses').textContent = fmt(expenses.total_2026);
        document.getElementById('kpiExpensesSub').textContent = 'Budget: ' + fmt(budgetMap[expenses.id]);
        document.getElementById('kpiCapital').textContent = fmt(capital.total_2026);
        document.getElementById('kpiCapitalSub').textContent = 'Prev: ' + fmt(capital.total_2025);
        document.getElementById('kpiNetAssets').textContent = fmt(netAssets.total_2026);
        document.getElementById('kpiNetAssetsSub').textContent = 'Prev: ' + fmt(netAssets.total_2025);

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

        const pct = (v, total) => (total ? ((parseFloat(v) || 0) / total * 100).toFixed(1) + '%' : '—');
        const show = (v26, v25) => flPctMode ? '—' : [fmt(v26), fmt(v25)];

        const rows = [
            { type: 'section', label: 'OPERATING ACTIVITY' },
            { label: 'Core Operating Income', c: d.core_operating_2026, p: d.core_operating_2025 },
            { label: 'Core Remittance', c: d.core_remittance_2026, p: d.core_remittance_2025 },
            { type: 'spacer' },
            { type: 'section', label: 'LIQUIDITY' },
            { label: 'Current Assets', c: d.current_assets_2026, p: d.current_assets_2025 },
            { label: 'Current Liabilities', c: d.current_liabilities_2026, p: d.current_liabilities_2025 },
            { label: 'Donor Restriction', c: d.donor_restriction_2026, p: d.donor_restriction_2025 },
            { label: 'Cash', c: d.cash_2026, p: d.cash_2025 },
            { label: 'Cash Held for Agency', c: d.held_for_agency_2026, p: d.held_for_agency_2025 },
            { label: 'Investments', c: d.investments_2026, p: d.investments_2025 },
            { type: 'spacer' },
            { type: 'section', label: 'WORKING CAPITAL MONTHS' },
            { label: 'Available Working Capital (Months)', c: d.working_months_2026, p: d.working_months_2025, isMonths: true },
            { label: 'Recommended Months', c: d.recommended_months_wc_2026, p: d.recommended_months_wc_2025, isMonths: true },
            { label: 'Required Months', c: d.required_months_wc, p: d.required_months_wc, isMonths: true },
            { type: 'spacer' },
            { type: 'section', label: 'LIQUID ASSETS MONTHS' },
            { label: 'Available Liquid Assets (Months)', c: d.liquid_months_2026, p: d.liquid_months_2025, isMonths: true },
            { label: 'Recommended Months', c: d.recommended_months_la_2026, p: d.recommended_months_la_2025, isMonths: true },
            { label: 'Required Months', c: d.required_months_la, p: d.required_months_la, isMonths: true },
        ];

        tbody.innerHTML = rows.map(r => flRow(r)).join('');

        // KPI
        const wcVal = parseFloat(d.working_months_2026);
        const laVal = parseFloat(d.liquid_months_2026);
        document.getElementById('kpiWcMonths').innerHTML = isNaN(wcVal)
            ? '<span class="fl-month-val">—</span>'
            : `<span class="fl-month-val">${wcVal.toFixed(1)}</span><span class="fl-month-label">mos</span>`;
        document.getElementById('kpiLaMonths').innerHTML = isNaN(laVal)
            ? '<span class="fl-month-val">—</span>'
            : `<span class="fl-month-val">${laVal.toFixed(1)}</span><span class="fl-month-label">mos</span>`;

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:#dc2626;">Error: ${e.message}</td></tr>`;
    }
}

function flRow(r) {
    if (r.type === 'spacer') return '<tr class="spacer"><td colspan="3"></td></tr>';
    if (r.type === 'section') return `<tr class="section-header"><td colspan="3">${r.label}</td></tr>`;
    const fmtVal = r.isMonths
        ? v => (v != null && !isNaN(parseFloat(v)) ? parseFloat(v).toFixed(2) : '—')
        : v => fmt(v);
    return `<tr>
        <td class="fs-label indent-sub">${r.label}</td>
        <td class="${fmtClass(r.c)}">${fmtVal(r.c)}</td>
        <td class="${fmtClass(r.p)}">${fmtVal(r.p)}</td>
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
