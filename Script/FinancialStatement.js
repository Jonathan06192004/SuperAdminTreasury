/**
 * Financial Statement — Supabase-backed Balance Sheet, Income Statement,
 * Financial Indicator; Cash Flow is static placeholder only.
 */
/** Treasury project — must match Supabase dashboard (API exposes `public` tables) */
const SUPABASE_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
const SUPABASE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_NAMES_UPPER = MONTH_NAMES.map((m) => m.toUpperCase());

const hdr = () => ({
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
});

let currentMonthIndex = 2; // March (0-based) — aligns with income statement reference period
let displayYearCurrent = 2026;
let displayYearPrev = 2025;

/** Live data cache */
let bsRowCurrent = null;
let bsRowPrev = null;
let bsRecordId = null;
let incomeLines = [];
let incomeBudgetMap = {};
let fiRow = null;

/** Zoom % per panel */
const zoom = { bs: 100, is: 100, cf: 100, fl: 100 };

/** Financial indicator % mode */
let flPctMode = false;

/** Cash flow — static demo rows only */
const CASH_FLOW_STATIC = [
    { type: 'section', label: 'OPERATING ACTIVITIES' },
    { type: 'data', label: 'CASH RECEIVED FROM TITHES', amount: 18450000 },
    { type: 'data', label: 'CASH RECEIVED FROM OFFERINGS', amount: 6230000 },
    { type: 'data', label: 'OTHER OPERATING RECEIPTS', amount: 2100000 },
    { type: 'data', label: 'CASH PAID FOR OPERATING EXPENSES', amount: -15230000 },
    { type: 'data', label: 'CASH PAID TO SUPPLIERS AND EMPLOYEES', amount: -8840000 },
    { type: 'subtotal', label: 'NET CASH FROM OPERATIONS', amount: 2710000 },

    { type: 'section', label: 'INVESTING ACTIVITIES' },
    { type: 'data', label: 'PURCHASE OF PROPERTY AND EQUIPMENT', amount: -5300000 },
    { type: 'data', label: 'PROCEEDS FROM SALE OF ASSETS', amount: 890000 },
    { type: 'subtotal', label: 'NET CASH FROM INVESTING', amount: -4410000 },

    { type: 'section', label: 'FINANCING ACTIVITIES' },
    { type: 'data', label: 'REPAYMENT OF LOANS', amount: -1200000 },
    { type: 'data', label: 'RESTRICTED CONTRIBUTIONS RECEIVED', amount: 3400000 },
    { type: 'subtotal', label: 'NET CASH FROM FINANCING', amount: 2200000 },

    { type: 'grand', label: 'NET INCREASE IN CASH', amount: 500000 },
    { type: 'grand', label: 'CASH — BEGINNING OF PERIOD', amount: 42800000 },
    { type: 'grand', label: 'CASH — END OF PERIOD', amount: 43300000 }
];

const CONF_CONTRIB_DEMO = [
    { code: 'NMM', amount: 11800000 },
    { code: 'NCMC', amount: 9200000 },
    { code: 'ZPM', amount: 7650000 },
    { code: 'CMM', amount: 5400000 },
    { code: 'WMC', amount: 6800000 }
];

async function apiGet(path) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: hdr() });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
    }
    return res.json();
}

async function apiPatch(table, id, body) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(String(id)), {
        method: 'PATCH',
        headers: hdr(),
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
}

async function apiPost(table, body) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function apiDelete(table, id) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(String(id)), {
        method: 'DELETE',
        headers: hdr()
    });
    if (!res.ok) throw new Error(await res.text());
}

function dbMonthFromUi(ui) {
    return ui + 1;
}

function uiMonthFromDb(m) {
    return m - 1;
}

function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function formatMoney(raw) {
    const v = num(raw);
    if (v === null) return '';
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const neg = v < 0;
    const inner = neg ? '(' + formatted + ')' : formatted;
    return inner;
}

/** Income statement & KPIs — peso prefix */
function formatMoneyPeso(raw) {
    const core = formatMoney(raw);
    if (core === '') return '';
    return '₱' + core;
}

function formatMoneyClass(raw) {
    const v = num(raw);
    if (v === null) return '';
    return v < 0 ? ' fs-amt-neg' : '';
}

function formatCompactM(raw) {
    const v = num(raw);
    if (v === null) return '—';
    const abs = Math.abs(v);
    const m = abs / 1e6;
    const neg = v < 0;
    const s = '₱' + m.toFixed(2) + 'M';
    return neg ? '(' + s + ')' : s;
}

/** Financial indicator — % of recommended minimum months (toggle on “IN MONTHS” rows only) */
function formatMonthsAsPctOfRecommended(monthsVal, recommendedVal) {
    const m = num(monthsVal);
    const r = num(recommendedVal);
    if (m === null || r === null || r === 0) return '';
    return ((m / r) * 100).toFixed(2) + '%';
}

function formatMonths(raw) {
    const v = num(raw);
    if (v === null) return '';
    const rounded = Math.round(v * 10) / 10;
    return rounded + ' MONTHS';
}

function formatMonthDelta(raw) {
    const v = num(raw);
    if (v === null) return '';
    const abs = Math.abs(v);
    const formatted = abs.toFixed(2);
    if (v < 0) return '(' + formatted + ') MO.';
    return formatted + ' MO.';
}

/** Optional marker dot in amount columns (balance sheet grand totals) */
function bsAmountCell(raw, dot) {
    const dotSpan =
        dot === 'gold'
            ? '<span class="fs-bs-dot fs-bs-dot-gold" aria-hidden="true"></span>'
            : dot === 'red'
              ? '<span class="fs-bs-dot fs-bs-dot-red" aria-hidden="true"></span>'
              : '';
    const inner =
        '<span class="fs-bs-amt-wrap">' +
        dotSpan +
        '<span class="fs-bs-amt-num">' +
        formatMoney(raw) +
        '</span></span>';
    return inner;
}

/* ─── Balance sheet layout ─────────────────────────────────────────────── */

function sumFields(row, keys) {
    if (!row) return null;
    let s = 0;
    let any = false;
    keys.forEach((k) => {
        const v = num(row[k]);
        if (v !== null) {
            any = true;
            s += v;
        }
    });
    return any ? s : null;
}

const BS_CURRENT_ASSET_KEYS = [
    'cash',
    'investments',
    'accounts_receivable',
    'cash_held_agency',
    'loans_receivable',
    'supplies'
];

/** Current liabilities (intermediate total); loans_payable shown under OTHER LIABILITIES */
const BS_CURRENT_LIAB_KEYS = ['accounts_payable', 'offerings_agency', 'interfund_ap'];
const BS_LIABILITY_KEYS = ['accounts_payable', 'offerings_agency', 'interfund_ap', 'loans_payable'];

const BS_NET_ASSET_KEYS = ['una_tithe', 'una_non_tithe', 'allocated_na', 'unexpended_plant', 'invested_plant'];

function buildBalanceSheetRows(row2026, row2025) {
    const rows = [];

    const ca2026 = sumFields(row2026, BS_CURRENT_ASSET_KEYS);
    const ca2025 = sumFields(row2025, BS_CURRENT_ASSET_KEYS);

    const fa2026 = num(row2026 ? row2026.fixed_assets : null);
    const fa2025 = num(row2025 ? row2025.fixed_assets : null);

    const onc2026 = sumFields(row2026, ['loans_nc', 'other_assets_nc']);
    const onc2025 = sumFields(row2025, ['loans_nc', 'other_assets_nc']);

    const ta2026 =
        ca2026 !== null && fa2026 !== null && onc2026 !== null
            ? ca2026 + fa2026 + onc2026
            : sumFields(row2026, BS_CURRENT_ASSET_KEYS.concat(['fixed_assets', 'loans_nc', 'other_assets_nc']));
    const ta2025 =
        ca2025 !== null && fa2025 !== null && onc2025 !== null
            ? ca2025 + fa2025 + onc2025
            : sumFields(row2025, BS_CURRENT_ASSET_KEYS.concat(['fixed_assets', 'loans_nc', 'other_assets_nc']));

    const tcl2026 = sumFields(row2026, BS_CURRENT_LIAB_KEYS);
    const tcl2025 = sumFields(row2025, BS_CURRENT_LIAB_KEYS);
    const tol2026 = num(row2026 ? row2026.loans_payable : null);
    const tol2025 = num(row2025 ? row2025.loans_payable : null);

    const tl2026 =
        tcl2026 !== null && tol2026 !== null
            ? tcl2026 + tol2026
            : sumFields(row2026, BS_LIABILITY_KEYS);
    const tl2025 =
        tcl2025 !== null && tol2025 !== null
            ? tcl2025 + tol2025
            : sumFields(row2025, BS_LIABILITY_KEYS);

    const tna2026 = sumFields(row2026, BS_NET_ASSET_KEYS);
    const tna2025 = sumFields(row2025, BS_NET_ASSET_KEYS);

    const tlan2026 =
        tl2026 !== null && tna2026 !== null ? tl2026 + tna2026 : null;
    const tlan2025 =
        tl2025 !== null && tna2025 !== null ? tl2025 + tna2025 : null;

    rows.push({ kind: 'main', label: 'ASSETS' });
    rows.push({ kind: 'sub', label: 'CURRENT ASSETS' });
    rows.push({
        kind: 'data',
        label: 'CASH AND CASH EQUIVALENTS (NOTE 3)',
        note: 'cash',
        cur: row2026 ? row2026.cash : null,
        prev: row2025 ? row2025.cash : null
    });
    rows.push({
        kind: 'data',
        label: 'INVESTMENTS (NOTE 4)',
        cur: row2026 ? row2026.investments : null,
        prev: row2025 ? row2025.investments : null
    });
    rows.push({
        kind: 'data',
        label: 'ACCOUNTS RECEIVABLE — NET (NOTE 5)',
        note: 'ar',
        cur: row2026 ? row2026.accounts_receivable : null,
        prev: row2025 ? row2025.accounts_receivable : null
    });
    rows.push({
        kind: 'data',
        label: 'CASH HELD FOR AGENCY (NOTE 3)',
        cur: row2026 ? row2026.cash_held_agency : null,
        prev: row2025 ? row2025.cash_held_agency : null
    });
    rows.push({
        kind: 'data',
        label: 'LOANS RECEIVABLE (NOTE 6)',
        cur: row2026 ? row2026.loans_receivable : null,
        prev: row2025 ? row2025.loans_receivable : null
    });
    rows.push({
        kind: 'data',
        label: 'SUPPLIES AND PREPAID EXPENSES (NOTE 7)',
        cur: row2026 ? row2026.supplies : null,
        prev: row2025 ? row2025.supplies : null
    });
    rows.push({ kind: 'subtotal', label: 'TOTAL CURRENT ASSETS', cur: ca2026, prev: ca2025 });

    rows.push({ kind: 'sub', label: 'FIXED ASSETS — NET (NOTE 8)' });
    rows.push({
        kind: 'data',
        label: 'FOR USE BY SOUTHWESTERN PHILIPPINE UNION CONFERENCE, NET',
        cur: row2026 ? row2026.fixed_assets : null,
        prev: row2025 ? row2025.fixed_assets : null
    });
    rows.push({ kind: 'subtotal', label: 'TOTAL FIXED ASSETS', cur: fa2026, prev: fa2025 });

    rows.push({ kind: 'sub', label: 'OTHER ASSETS' });
    rows.push({
        kind: 'data',
        label: 'LOANS RECEIVABLE — NON-CURRENT (NOTE 6)',
        cur: row2026 ? row2026.loans_nc : null,
        prev: row2025 ? row2025.loans_nc : null
    });
    rows.push({
        kind: 'data',
        label: 'OTHER ASSETS — NON-CURRENT',
        cur: row2026 ? row2026.other_assets_nc : null,
        prev: row2025 ? row2025.other_assets_nc : null
    });

    rows.push({
        kind: 'grand',
        label: 'TOTAL ASSETS',
        cur: ta2026,
        prev: ta2025,
        dot: 'gold'
    });

    rows.push({ kind: 'main', label: 'LIABILITIES' });
    rows.push({ kind: 'sub', label: 'CURRENT LIABILITIES' });
    rows.push({
        kind: 'data',
        label: 'ACCOUNTS PAYABLE (NOTE 10)',
        note: 'ap',
        cur: row2026 ? row2026.accounts_payable : null,
        prev: row2025 ? row2025.accounts_payable : null
    });
    rows.push({
        kind: 'data',
        label: 'OFFERINGS AND AGENCY (NOTE 11)',
        cur: row2026 ? row2026.offerings_agency : null,
        prev: row2025 ? row2025.offerings_agency : null
    });
    rows.push({
        kind: 'data',
        label: 'INTER-FUND ACCOUNTS PAYABLE — CURRENT (NOTE 12)',
        cur: row2026 ? row2026.interfund_ap : null,
        prev: row2025 ? row2025.interfund_ap : null
    });
    rows.push({
        kind: 'subtotal',
        label: 'TOTAL CURRENT LIABILITIES',
        cur: tcl2026,
        prev: tcl2025
    });

    rows.push({ kind: 'sub', label: 'OTHER LIABILITIES' });
    rows.push({
        kind: 'data',
        label: 'LOANS PAYABLE — NON-CURRENT (NOTE 13)',
        cur: row2026 ? row2026.loans_payable : null,
        prev: row2025 ? row2025.loans_payable : null
    });
    rows.push({
        kind: 'subtotal',
        label: 'TOTAL OTHER LIABILITIES',
        cur: tol2026,
        prev: tol2025
    });

    rows.push({
        kind: 'grand',
        label: 'TOTAL LIABILITIES',
        cur: tl2026,
        prev: tl2025,
        dot: 'red'
    });

    rows.push({ kind: 'main', label: 'NET ASSETS' });
    rows.push({
        kind: 'data',
        label: 'UNALLOCATED NET ASSETS — TITHE',
        cur: row2026 ? row2026.una_tithe : null,
        prev: row2025 ? row2025.una_tithe : null
    });
    rows.push({
        kind: 'data',
        label: 'UNALLOCATED NET ASSETS — NON-TITHE',
        cur: row2026 ? row2026.una_non_tithe : null,
        prev: row2025 ? row2025.una_non_tithe : null
    });
    rows.push({
        kind: 'data',
        label: 'ALLOCATED NET ASSETS',
        cur: row2026 ? row2026.allocated_na : null,
        prev: row2025 ? row2025.allocated_na : null
    });
    rows.push({
        kind: 'data',
        label: 'UNEXPENDED PLANT',
        cur: row2026 ? row2026.unexpended_plant : null,
        prev: row2025 ? row2025.unexpended_plant : null
    });
    rows.push({
        kind: 'data',
        label: 'INVESTED IN PLANT',
        cur: row2026 ? row2026.invested_plant : null,
        prev: row2025 ? row2025.invested_plant : null
    });
    rows.push({ kind: 'subtotal', label: 'TOTAL NET ASSETS', cur: tna2026, prev: tna2025 });

    rows.push({
        kind: 'grand',
        label: 'TOTAL LIABILITIES & NET ASSETS',
        cur: tlan2026,
        prev: tlan2025,
        dot: 'gold'
    });

    return rows;
}

function renderBalanceSheet() {
    const tbody = document.getElementById('bsTableBody');
    const rows = buildBalanceSheetRows(bsRowCurrent, bsRowPrev);
    let zebra = false;
    tbody.innerHTML = rows
        .map((r, idx) => {
            if (r.kind === 'data') zebra = !zebra;
            let cls = 'fs-tr-data';
            if (r.kind === 'main') cls = 'fs-tr-main-section';
            else if (r.kind === 'sub') cls = 'fs-tr-subsection';
            else if (r.kind === 'subtotal') cls = 'fs-tr-subtotal';
            else if (r.kind === 'grand') cls = 'fs-tr-grand';
            else if (r.kind === 'data') cls = 'fs-tr-data' + (zebra ? ' fs-tr-zebra' : '') + (r.note ? ' fs-tr-note' : '');

            const click =
                r.note === 'cash'
                    ? ' onclick="openCashNote()"'
                    : r.note === 'ar'
                      ? ' onclick="openArNote()"'
                      : r.note === 'ap'
                        ? ' onclick="openApNote()"'
                        : '';

            const indent = r.kind === 'data' ? ' fs-td-indent' : '';

            const useDot = r.kind === 'grand' && r.dot;
            const prevCell =
                '<td class="fs-td-num' +
                formatMoneyClass(r.prev) +
                (useDot ? ' fs-td-num-bs-dot' : '') +
                '">' +
                (useDot ? bsAmountCell(r.prev, r.dot) : formatMoney(r.prev)) +
                '</td>';
            const curCell =
                '<td class="fs-td-num' +
                formatMoneyClass(r.cur) +
                (useDot ? ' fs-td-num-bs-dot' : '') +
                '">' +
                (useDot ? bsAmountCell(r.cur, r.dot) : formatMoney(r.cur)) +
                '</td>';

            const labelText = escapeHtml(r.label) + (r.note ? ' <span class="fs-note-arrow">&gt;</span>' : '');

            return (
                '<tr class="' +
                cls +
                '"' +
                click +
                '>' +
                '<td class="' +
                indent +
                '">' +
                labelText +
                '</td>' +
                prevCell +
                curCell +
                '</tr>'
            );
        })
        .join('');

    const ra = rows.find((x) => x.label === 'TOTAL ASSETS');
    const rl = rows.find((x) => x.label === 'TOTAL LIABILITIES');
    const rn = rows.find((x) => x.label === 'TOTAL NET ASSETS');
    const rt = rows.find((x) => x.label === 'TOTAL LIABILITIES & NET ASSETS');
    document.getElementById('kpiBsAssets').textContent = formatCompactM(ra ? ra.cur : null);
    document.getElementById('kpiBsLiabilities').textContent = formatCompactM(rl ? rl.cur : null);
    document.getElementById('kpiBsNetAssets').textContent = formatCompactM(rn ? rn.cur : null);
    document.getElementById('kpiBsTotal').textContent = formatCompactM(rt ? rt.cur : null);

    const period =
        MONTH_NAMES_UPPER[currentMonthIndex] + ' ' + displayYearCurrent;
    ['kpiBsAssetsSub', 'kpiBsLiabilitiesSub', 'kpiBsNetAssetsSub', 'kpiBsTotalSub'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'As of ' + period;
    });
}

/* ─── Income statement ───────────────────────────────────────────────────── */

function classifyIncomeVisual(line) {
    const label = (line.label || '').trim();
    const lk = (line.line_key || '').toLowerCase();

    if (/INCREASE\s*\(DECREASE\)/i.test(label)) return 'bridge';
    if (/NET ASSETS,/i.test(label) && /JANUARY\s+1/i.test(label)) return 'data';
    if (
        lk.includes('net_assets_end') ||
        lk.includes('period_end') ||
        lk.includes('net_assets_period_end') ||
        (/NET ASSETS,/i.test(label) &&
            /\b2026\b/.test(label) &&
            !/JANUARY\s+1/i.test(label))
    ) {
        return 'grand';
    }
    if (/^TOTAL\b/i.test(label)) return 'subtotal';
    if (lk.includes('total') && !lk.includes('subtotal')) return 'subtotal';
    return 'data';
}

function renderIncomeStatement() {
    const tbody = document.getElementById('isTableBody');
    if (!incomeLines.length) {
        tbody.innerHTML =
            '<tr><td colspan="4" class="fs-loading-banner">No income statement lines for this period.</td></tr>';
        return;
    }

    let html = '';
    let lastMain = null;
    let lastSub = null;
    let zebra = false;

    incomeLines.forEach((line) => {
        const parts = (line.section || '')
            .split(/\s*\/\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
        const mainSec = parts[0] || line.section || '';
        const subSec = parts[1] || '';

        if (mainSec && mainSec !== lastMain) {
            html +=
                '<tr class="fs-tr-section fs-is-section"><td colspan="4">' +
                escapeHtml(mainSec.toUpperCase()) +
                '</td></tr>';
            lastMain = mainSec;
            lastSub = null;
        }
        if (subSec && subSec !== lastSub) {
            html +=
                '<tr class="fs-tr-subsection fs-is-subsection"><td colspan="4">' +
                escapeHtml(subSec.toUpperCase()) +
                '</td></tr>';
            lastSub = subSec;
        }

        const vis = classifyIncomeVisual(line);
        if (vis === 'data') zebra = !zebra;

        let rowCls = 'fs-tr-data fs-is-data';
        if (vis === 'bridge') rowCls = 'fs-tr-is-bridge';
        else if (vis === 'grand') rowCls = 'fs-tr-is-grand-footer';
        else if (vis === 'subtotal') rowCls = 'fs-tr-is-total-pink';
        else rowCls += zebra ? ' fs-tr-zebra' : '';

        const bAmount =
            incomeBudgetMap[line.id] !== undefined ? incomeBudgetMap[line.id] : null;

        const budgetCell =
            '<td class="fs-td-num fs-is-amt' +
            formatMoneyClass(bAmount) +
            '" data-line-id="' +
            line.id +
            '" title="Double-click to edit budget" ondblclick="openBudgetEditor(' +
            line.id +
            ')">' +
            formatMoneyPeso(bAmount) +
            '</td>';

        const c26 =
            '<td class="fs-td-num fs-is-amt' +
            formatMoneyClass(line.total_2026) +
            '">' +
            formatMoneyPeso(line.total_2026) +
            '</td>';
        const c25 =
            '<td class="fs-td-num fs-is-amt' +
            formatMoneyClass(line.total_2025) +
            '">' +
            formatMoneyPeso(line.total_2025) +
            '</td>';

        html +=
            '<tr class="' +
            rowCls +
            '">' +
            '<td class="fs-td-indent fs-is-label">' +
            escapeHtml(line.label) +
            '</td>' +
            c26 +
            budgetCell +
            c25 +
            '</tr>';
    });

    tbody.innerHTML = html;

    function pickLine(pred) {
        const found = incomeLines.find(pred);
        return found || null;
    }

    const rev =
        pickLine((l) => /total earned operating income/i.test(l.label || '')) ||
        pickLine((l) => (l.line_key || '').toLowerCase().includes('total_earned_operating'));
    const exp =
        pickLine((l) => /^TOTAL OPERATING EXPENSES$/i.test((l.label || '').trim())) ||
        pickLine((l) => (l.line_key || '').toLowerCase().includes('total_operating_expense'));
    const cap =
        pickLine((l) => (l.line_key || '').toUpperCase() === 'INCREASE_BEFORE_TRANSFERS') ||
        pickLine((l) => /INCREASE\s*\(DECREASE\)\s*BEFORE\s*TRANSFERS/i.test(l.label || '')) ||
        pickLine((l) => /net capital increase|capital activity/i.test(l.label || '')) ||
        pickLine((l) => (l.line_key || '').toLowerCase().includes('capital'));
    const na =
        [...incomeLines].reverse().find((l) => classifyIncomeVisual(l) === 'grand') ||
        [...incomeLines].reverse().find(
            (l) =>
                /NET ASSETS,/i.test(l.label || '') &&
                /\b2026\b/.test(l.label || '') &&
                !/JANUARY\s+1/i.test(l.label || '')
        );

    document.getElementById('kpiRevenue').textContent = formatCompactM(rev ? rev.total_2026 : null);
    document.getElementById('kpiExpenses').textContent = formatCompactM(exp ? exp.total_2026 : null);
    document.getElementById('kpiCapital').textContent = formatCompactM(cap ? cap.total_2026 : null);
    document.getElementById('kpiNetAssets').textContent = formatCompactM(na ? na.total_2026 : null);

    const sub =
        'As of ' + MONTH_NAMES_UPPER[currentMonthIndex] + ' ' + displayYearCurrent;
    ['kpiRevenueSub', 'kpiExpensesSub', 'kpiCapitalSub', 'kpiNetAssetsSub'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = sub;
    });
}

/* ─── Financial indicator ───────────────────────────────────────────────── */

function fiComputed(row) {
    if (!row) return {};
    const ce =
        num(row.core_operating_2026) !== null && num(row.core_remittance_2026) !== null
            ? num(row.core_operating_2026) + num(row.core_remittance_2026)
            : null;
    const cePrev =
        num(row.core_operating_2025) !== null && num(row.core_remittance_2025) !== null
            ? num(row.core_operating_2025) + num(row.core_remittance_2025)
            : null;

    const wc2026 =
        num(row.current_assets_2026) !== null &&
        num(row.current_liabilities_2026) !== null &&
        num(row.donor_restriction_2026) !== null
            ? num(row.current_assets_2026) -
              num(row.current_liabilities_2026) -
              num(row.donor_restriction_2026)
            : null;
    const wc2025 =
        num(row.current_assets_2025) !== null &&
        num(row.current_liabilities_2025) !== null &&
        num(row.donor_restriction_2025) !== null
            ? num(row.current_assets_2025) -
              num(row.current_liabilities_2025) -
              num(row.donor_restriction_2025)
            : null;

    const la2026 =
        num(row.cash_2026) !== null &&
        num(row.held_for_agency_2026) !== null &&
        num(row.investments_2026) !== null
            ? num(row.cash_2026) - num(row.held_for_agency_2026) + num(row.investments_2026)
            : null;
    const la2025 =
        num(row.cash_2025) !== null &&
        num(row.held_for_agency_2025) !== null &&
        num(row.investments_2025) !== null
            ? num(row.cash_2025) - num(row.held_for_agency_2025) + num(row.investments_2025)
            : null;

    const tc2026 = num(row.total_commitments_2026);
    const tc2025 = num(row.total_commitments_2025);
    const availLiq2026 =
        la2026 !== null && tc2026 !== null ? la2026 - tc2026 : la2026;
    const availLiq2025 =
        la2025 !== null && tc2025 !== null ? la2025 - tc2025 : la2025;

    const surplusWc2026 =
        num(row.working_months_2026) !== null && num(row.recommended_months_wc_2026) !== null
            ? num(row.working_months_2026) - num(row.recommended_months_wc_2026)
            : null;
    const surplusWc2025 =
        num(row.working_months_2025) !== null && num(row.recommended_months_wc_2025) !== null
            ? num(row.working_months_2025) - num(row.recommended_months_wc_2025)
            : null;

    const surplusLa2026 =
        num(row.liquid_months_2026) !== null && num(row.recommended_months_la_2026) !== null
            ? num(row.liquid_months_2026) - num(row.recommended_months_la_2026)
            : null;
    const surplusLa2025 =
        num(row.liquid_months_2025) !== null && num(row.recommended_months_la_2025) !== null
            ? num(row.liquid_months_2025) - num(row.recommended_months_la_2025)
            : null;

    return {
        ce,
        cePrev,
        wc2026,
        wc2025,
        la2026,
        la2025,
        tc2026,
        tc2025,
        availLiq2026,
        availLiq2025,
        surplusWc2026,
        surplusWc2025,
        surplusLa2026,
        surplusLa2025
    };
}

function renderFinancialIndicator() {
    const tbody = document.getElementById('flTableBody');
    if (!fiRow) {
        tbody.innerHTML =
            '<tr><td colspan="3" class="fs-loading-banner">No financial indicator row for this period.</td></tr>';
        return;
    }

    const row = fiRow;
    const x = fiComputed(row);

    const rows = [];

    rows.push({ kind: 'sub', label: 'CORE EXPENSES' });
    rows.push({
        kind: 'data',
        label: 'OPERATING EXPENSES',
        cur: row.core_operating_2026,
        prev: row.core_operating_2025
    });
    rows.push({
        kind: 'data',
        label: 'NET OUTGOING REMITTANCE',
        cur: row.core_remittance_2026,
        prev: row.core_remittance_2025
    });
    rows.push({
        kind: 'subtotal',
        label: 'TOTAL CORE EXPENSES',
        cur: x.ce,
        prev: x.cePrev,
        coreRed: true
    });

    rows.push({ kind: 'sub', label: 'AVAILABLE WORKING CAPITAL' });
    rows.push({
        kind: 'data',
        label: 'CURRENT ASSETS',
        cur: row.current_assets_2026,
        prev: row.current_assets_2025
    });
    rows.push({
        kind: 'data',
        label: 'MINUS: CURRENT LIABILITIES',
        cur: row.current_liabilities_2026 !== null ? -num(row.current_liabilities_2026) : null,
        prev: row.current_liabilities_2025 !== null ? -num(row.current_liabilities_2025) : null
    });
    rows.push({
        kind: 'data',
        label: 'MINUS: CURRENT ASSETS HELD FOR DONOR RESTRICTION',
        cur: row.donor_restriction_2026 !== null ? -num(row.donor_restriction_2026) : null,
        prev: row.donor_restriction_2025 !== null ? -num(row.donor_restriction_2025) : null
    });
    rows.push({
        kind: 'data',
        label: 'AVAILABLE WORKING CAPITAL',
        cur: x.wc2026,
        prev: x.wc2025,
        emphasis: true
    });
    rows.push({
        kind: 'data',
        label: 'RECOMMENDED MINIMUM AVAILABLE WORKING CAPITAL',
        cur: row.recommended_months_wc_2026,
        prev: row.recommended_months_wc_2025,
        fmt: 'months'
    });
    rows.push({
        kind: 'data',
        label: 'SURPLUS (SHORTFALL) IN RECOMMENDED MINIMUM',
        cur: x.surplusWc2026,
        prev: x.surplusWc2025,
        fmt: 'monthsDelta'
    });

    rows.push({
        kind: 'bandMonths',
        bandKey: 'wc_months',
        label: 'AVAILABLE WORKING CAPITAL IN MONTHS',
        cur: row.working_months_2026,
        prev: row.working_months_2025,
        recCur: row.recommended_months_wc_2026,
        recPrev: row.recommended_months_wc_2025
    });

    rows.push({ kind: 'sub', label: 'AVAILABLE LIQUID ASSETS' });
    rows.push({
        kind: 'data',
        label: 'CASH AND CASH EQUIVALENTS',
        cur: row.cash_2026,
        prev: row.cash_2025
    });
    rows.push({
        kind: 'data',
        label: 'LESS: HELD FOR AGENCY',
        cur: row.held_for_agency_2026 !== null ? -num(row.held_for_agency_2026) : null,
        prev: row.held_for_agency_2025 !== null ? -num(row.held_for_agency_2025) : null
    });
    rows.push({
        kind: 'data',
        label: 'INVESTMENTS',
        cur: row.investments_2026,
        prev: row.investments_2025
    });
    rows.push({
        kind: 'subtotalPink',
        label: 'TOTAL LIQUID CURRENT ASSETS',
        cur: x.la2026,
        prev: x.la2025
    });
    rows.push({
        kind: 'data',
        label: 'MINUS: TOTAL COMMITMENTS',
        cur: x.tc2026 !== null ? -Math.abs(x.tc2026) : null,
        prev: x.tc2025 !== null ? -Math.abs(x.tc2025) : null,
        skipIfEmpty: true
    });
    rows.push({
        kind: 'subtotalPink',
        label: 'AVAILABLE LIQUID ASSETS',
        cur: x.availLiq2026,
        prev: x.availLiq2025
    });
    rows.push({
        kind: 'data',
        label: 'RECOMMENDED MINIMUM AVAILABLE LIQUID ASSETS',
        cur: row.recommended_months_la_2026,
        prev: row.recommended_months_la_2025,
        fmt: 'months'
    });
    rows.push({
        kind: 'data',
        label: 'SURPLUS (SHORTFALL) IN RECOMMENDED MINIMUM',
        cur: x.surplusLa2026,
        prev: x.surplusLa2025,
        fmt: 'monthsDelta'
    });

    rows.push({
        kind: 'bandMonths',
        bandKey: 'la_months',
        label: 'AVAILABLE LIQUID ASSETS IN MONTHS',
        cur: row.liquid_months_2026,
        prev: row.liquid_months_2025,
        recCur: row.recommended_months_la_2026,
        recPrev: row.recommended_months_la_2025
    });

    let zebra = false;
    const filtered = rows.filter((r) => {
        if (r.skipIfEmpty && r.cur == null && r.prev == null) return false;
        return true;
    });

    tbody.innerHTML = filtered
        .map((r) => {
            if (r.kind === 'data') zebra = !zebra;

            if (r.kind === 'bandMonths') {
                let fmtCur;
                let fmtPrev;
                if (flPctMode) {
                    fmtCur = formatMonthsAsPctOfRecommended(r.cur, r.recCur);
                    fmtPrev = formatMonthsAsPctOfRecommended(r.prev, r.recPrev);
                } else {
                    fmtCur = formatMonths(r.cur);
                    fmtPrev = formatMonths(r.prev);
                }
                return (
                    '<tr class="fs-fl-band-row">' +
                    '<td class="fs-fl-band-label">' +
                    escapeHtml(r.label) +
                    '</td>' +
                    '<td class="fs-fl-band-val' +
                    formatMoneyClass(r.cur) +
                    '">' +
                    fmtCur +
                    '</td>' +
                    '<td class="fs-fl-band-val' +
                    formatMoneyClass(r.prev) +
                    '">' +
                    fmtPrev +
                    '</td>' +
                    '</tr>'
                );
            }

            let cls = 'fs-tr-data';
            if (r.kind === 'sub') cls = 'fs-tr-subsection fs-fl-sub';
            else if (r.kind === 'subtotal') cls = 'fs-tr-subtotal' + (r.coreRed ? ' fs-fl-core-total' : '');
            else if (r.kind === 'subtotalPink') cls = 'fs-tr-subtotal fs-fl-liq-pink';
            else if (r.emphasis) cls = 'fs-tr-data fs-fl-wc-emphasis';
            else cls = 'fs-tr-data' + (zebra ? ' fs-tr-zebra' : '');

            let fmtCur;
            let fmtPrev;
            if (r.fmt === 'months') {
                fmtCur = formatMonths(r.cur);
                fmtPrev = formatMonths(r.prev);
            } else if (r.fmt === 'monthsDelta') {
                fmtCur = formatMonthDelta(r.cur);
                fmtPrev = formatMonthDelta(r.prev);
            } else {
                fmtCur = formatMoneyPeso(r.cur);
                fmtPrev = formatMoneyPeso(r.prev);
            }

            return (
                '<tr class="' +
                cls +
                '">' +
                '<td class="fs-td-indent">' +
                escapeHtml(r.label) +
                '</td>' +
                '<td class="fs-td-num' +
                formatMoneyClass(r.cur) +
                '">' +
                fmtCur +
                '</td>' +
                '<td class="fs-td-num' +
                formatMoneyClass(r.prev) +
                '">' +
                fmtPrev +
                '</td>' +
                '</tr>'
            );
        })
        .join('');

    document.getElementById('kpiWcMonths').textContent = flPctMode
        ? formatMonthsAsPctOfRecommended(row.working_months_2026, row.recommended_months_wc_2026)
        : formatMonths(row.working_months_2026);
    document.getElementById('kpiLaMonths').textContent = flPctMode
        ? formatMonthsAsPctOfRecommended(row.liquid_months_2026, row.recommended_months_la_2026)
        : formatMonths(row.liquid_months_2026);
}

/* ─── Cash flow (static) ─────────────────────────────────────────────────── */

function renderCashFlowStatic() {
    const tbody = document.getElementById('cfTableBody');
    let zebra = false;
    tbody.innerHTML = CASH_FLOW_STATIC.map((r) => {
        if (r.type === 'data') zebra = !zebra;
        let cls = 'fs-tr-data';
        if (r.type === 'section') cls = 'fs-tr-section';
        else if (r.type === 'subtotal') cls = 'fs-tr-subtotal';
        else if (r.type === 'grand') cls = 'fs-tr-grand';
        else cls = 'fs-tr-data' + (zebra ? ' fs-tr-zebra' : '');

        return (
            '<tr class="' +
            cls +
            '">' +
            '<td class="' +
            (r.type === 'data' ? 'fs-td-indent' : '') +
            '">' +
            escapeHtml(r.label) +
            '</td>' +
            '<td class="fs-td-num' +
            formatMoneyClass(r.amount) +
            '">' +
            formatMoney(r.amount) +
            '</td>' +
            '</tr>'
        );
    }).join('');
}

/* ─── Fetch all ──────────────────────────────────────────────────────────── */

async function loadBalanceSheetData() {
    const m = dbMonthFromUi(currentMonthIndex);
    const yCur = displayYearCurrent;
    const yPrev = displayYearPrev;

    const q =
        'balance_sheet?year=eq.' +
        yCur +
        '&month=eq.' +
        m +
        '&select=*';
    const qPrev =
        'balance_sheet?year=eq.' +
        yPrev +
        '&month=eq.' +
        m +
        '&select=*';

    const [curList, prevList] = await Promise.all([apiGet(q), apiGet(qPrev)]);

    bsRowCurrent = curList[0] || null;
    bsRowPrev = prevList[0] || null;
    bsRecordId = bsRowCurrent ? bsRowCurrent.id : null;
}

async function loadIncomeData() {
    const m = dbMonthFromUi(currentMonthIndex);
    const lines = await apiGet(
        'income_statement_lines?report_year=eq.' +
            displayYearCurrent +
            '&report_month=eq.' +
            m +
            '&order=sort_order.asc'
    );
    incomeLines = Array.isArray(lines) ? lines : [];

    incomeBudgetMap = {};
    if (incomeLines.length) {
        const ids = incomeLines.map((l) => l.id).join(',');
        const yCur = displayYearCurrent;
        const yPrev = displayYearPrev;
        /* Prefer budget_year = current display year; fall back to prior year (many DB rows use prior fiscal key). */
        const budgets = await apiGet(
            'income_statement_budgets?income_statement_line_id=in.(' +
                ids +
                ')&budget_year=in.(' +
                yCur +
                ',' +
                yPrev +
                ')&select=income_statement_line_id,budget_year,budget_amount'
        );
        const byLineYear = {};
        (budgets || []).forEach((b) => {
            const lid = b.income_statement_line_id;
            const y = Number(b.budget_year);
            if (!byLineYear[lid]) byLineYear[lid] = {};
            const v = num(b.budget_amount);
            if (v === null) return;
            byLineYear[lid][y] = (byLineYear[lid][y] || 0) + v;
        });
        incomeLines.forEach((line) => {
            const yMap = byLineYear[line.id];
            if (!yMap) {
                incomeBudgetMap[line.id] = null;
                return;
            }
            let amt = null;
            if (yMap[yCur] != null) amt = yMap[yCur];
            else if (yMap[yPrev] != null) amt = yMap[yPrev];
            incomeBudgetMap[line.id] = amt;
        });
    }
}

async function loadFinancialIndicatorData() {
    const m = dbMonthFromUi(currentMonthIndex);
    const rows = await apiGet(
        'financial_indicator?report_year=eq.' +
            displayYearCurrent +
            '&report_month=eq.' +
            m +
            '&limit=1'
    );
    fiRow = rows[0] || null;
}

async function renderAll(monthIndex) {
    if (typeof monthIndex === 'number') currentMonthIndex = monthIndex;

    syncMonthSelects();

    const periodLabel =
        MONTH_NAMES_UPPER[currentMonthIndex] + ' ' + displayYearCurrent;
    document.getElementById('bsPeriodLabel').textContent = periodLabel;
    document.getElementById('isPeriodLabel').textContent = periodLabel;
    document.getElementById('cfPeriodLabel').textContent = periodLabel;
    document.getElementById('flPeriodLabel').textContent = periodLabel;

    document.getElementById('bsColYear1').textContent = String(displayYearPrev);
    document.getElementById('bsColYear2').textContent = String(displayYearCurrent);

    document.getElementById('isColYear1').textContent = String(displayYearCurrent);
    document.getElementById('isColYear2').textContent = String(displayYearCurrent);
    document.getElementById('isColYear3').textContent = String(displayYearPrev);

    document.getElementById('flColYear1').textContent = String(displayYearCurrent);
    document.getElementById('flColYear2').textContent = String(displayYearPrev);

    document.getElementById('fsConfTitle').textContent =
        'CONFERENCE CONTRIBUTIONS — ' +
        MONTH_NAMES_UPPER[currentMonthIndex].slice(0, 3) +
        ' ' +
        displayYearCurrent;

    renderConferenceBars();

    try {
        await Promise.all([
            loadBalanceSheetData(),
            loadIncomeData(),
            loadFinancialIndicatorData()
        ]);

        renderBalanceSheet();
        renderIncomeStatement();
        renderFinancialIndicator();
    } catch (e) {
        console.error(e);
        const msg = escapeHtml(e.message || String(e));
        document.getElementById('bsTableBody').innerHTML =
            '<tr><td colspan="3" class="fs-error-banner">' + msg + '</td></tr>';
        document.getElementById('isTableBody').innerHTML =
            '<tr><td colspan="4" class="fs-error-banner">' + msg + '</td></tr>';
        document.getElementById('flTableBody').innerHTML =
            '<tr><td colspan="3" class="fs-error-banner">' + msg + '</td></tr>';
    }

    renderCashFlowStatic();
}

function syncMonthSelects() {
    ['bsMonthSelect', 'isMonthSelect', 'cfMonthSelect', 'flMonthSelect'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = String(currentMonthIndex);
    });
}

function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ─── Tabs & zoom ───────────────────────────────────────────────────────── */

function switchTab(tab, btn) {
    document.querySelectorAll('.fs-tab-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    document.getElementById('tab-balance').classList.toggle('active', tab === 'balance');
    document.getElementById('tab-income').classList.toggle('active', tab === 'income');
    document.getElementById('tab-cashflow').classList.toggle('active', tab === 'cashflow');
    document.getElementById('tab-equity').classList.toggle('active', tab === 'equity');

    document.getElementById('kpiCardsBalance').classList.toggle('hidden', tab !== 'balance');
    document.getElementById('kpiCardsIncome').classList.toggle(
        'hidden',
        tab !== 'income' && tab !== 'cashflow'
    );
    document.getElementById('kpiCardsEquity').classList.toggle('hidden', tab !== 'equity');

}

function applyZoom(panelKey, pct) {
    const map = {
        bs: 'bsTableScroll',
        is: 'isTableScroll',
        cf: 'cfTableScroll',
        fl: 'flTableScroll'
    };
    const labelMap = {
        bs: 'bsZoomLabel',
        is: 'isZoomLabel',
        cf: 'cfZoomLabel',
        fl: 'flZoomLabel'
    };
    const inner = document.getElementById(map[panelKey]);
    const scale = pct / 100;
    if (scale === 1) {
        inner.style.transform = '';
        inner.style.width = '';
        inner.parentElement.style.height = '';
    } else {
        inner.style.transformOrigin = 'top left';
        inner.style.transform = 'scale(' + scale + ')';
        inner.style.width = (100 / scale) + '%';
        inner.parentElement.style.height = (inner.scrollHeight * scale) + 'px';
    }
    document.getElementById(labelMap[panelKey]).textContent = pct + '%';
}

function bsZoom(delta) {
    zoom.bs = Math.min(140, Math.max(70, zoom.bs + delta * 10));
    applyZoom('bs', zoom.bs);
}
function isZoom(delta) {
    zoom.is = Math.min(140, Math.max(70, zoom.is + delta * 10));
    applyZoom('is', zoom.is);
}
function cfZoom(delta) {
    zoom.cf = Math.min(140, Math.max(70, zoom.cf + delta * 10));
    applyZoom('cf', zoom.cf);
}
function flZoom(delta) {
    zoom.fl = Math.min(140, Math.max(70, zoom.fl + delta * 10));
    applyZoom('fl', zoom.fl);
}

function toggleFlMode() {
    flPctMode = !flPctMode;
    const b = document.getElementById('flPctBtn');
    if (b) {
        b.classList.toggle('on', flPctMode);
        b.textContent = flPctMode ? 'VIEW MONTHS' : '% SEE PERCENTAGE';
    }
    renderFinancialIndicator();
}

function renderConferenceBars() {
    const wrap = document.getElementById('fsConfBars');
    const max = Math.max(...CONF_CONTRIB_DEMO.map((c) => c.amount), 1);
    wrap.innerHTML = CONF_CONTRIB_DEMO.map((c) => {
        const pct = Math.round((c.amount / max) * 100);
        return (
            '<div class="fs-conf-row">' +
            '<span class="fs-conf-code">' +
            escapeHtml(c.code) +
            '</span>' +
            '<div class="fs-conf-track"><div class="fs-conf-fill" style="width:' +
            pct +
            '%"></div></div>' +
            '<span class="fs-conf-val">' +
            formatMoney(c.amount) +
            '</span>' +
            '</div>'
        );
    }).join('');
}

function tickClock() {
    const now = new Date();
    const tEl = document.getElementById('fsClockTime');
    const dEl = document.getElementById('fsClockDate');
    if (!tEl || !dEl) return;
    tEl.textContent = now.toLocaleTimeString('en-PH', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    dEl.textContent = now.toLocaleDateString('en-PH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/* ─── Notes (read-only modals from DB) ───────────────────────────────────── */

async function fetchNoteRows(table) {
    const m = dbMonthFromUi(currentMonthIndex);
    return apiGet(
        table +
            '?year=eq.' +
            displayYearCurrent +
            '&month=eq.' +
            m +
            '&order=sort_order.asc'
    );
}

function displayNoteLabel(label) {
    return String(label || '')
        .trim()
        .toUpperCase();
}

/**
 * @returns {'category'|'total'|'deduction'|'drill'|'data'}
 */
function classifyBalanceSheetNoteRow(r) {
    const rt = String(r.row_type || '').toLowerCase();
    const label = String(r.label || '');
    if (rt === 'group' || rt === 'section') return 'category';
    if (rt === 'subtotal' || rt === 'total') return 'total';
    if (r.drill_key) return 'drill';
    if (/^\s*LESS:/i.test(label)) return 'deduction';
    return 'data';
}

function formatNoteCellAmount(v, visual) {
    if (visual === 'category' && num(v) === null) return '';
    return formatMoney(v);
}

function noteAmountCellClass(v) {
    const base = 'cn-td-num';
    const neg = formatMoneyClass(v);
    return base + neg;
}

/**
 * @param {string} tbodyId
 * @param {'ar'|'ap'|null} drill — enables click-through to SDA detail when row has drill_key
 */
function renderBalanceSheetNoteTable(rows, tbodyId, drill) {
    const tbody = document.getElementById(tbodyId);
    let zebra = false;
    tbody.innerHTML = rows
        .map((r) => {
            const visual = classifyBalanceSheetNoteRow(r);
            if (visual === 'data' || visual === 'deduction' || visual === 'drill') zebra = !zebra;

            let cls = 'cn-tr-data';
            if (visual === 'category') cls = 'cn-tr-category';
            else if (visual === 'total') cls = 'cn-tr-total';
            else if (visual === 'deduction') cls = 'cn-tr-deduction' + (zebra ? ' cn-tr-zebra-light' : '');
            else if (visual === 'drill') cls = 'cn-tr-drill' + (zebra ? ' cn-tr-zebra-light' : '');
            else cls += zebra ? ' cn-tr-zebra-light' : '';

            const indentCls = r.is_indent ? 'cn-td-indent' : '';
            let labelHtml = escapeHtml(displayNoteLabel(r.label));
            if (visual === 'drill') {
                labelHtml += '<span class="cn-drill-mark" aria-hidden="true"> &gt;</span>';
            }

            const curStr = formatNoteCellAmount(r.current_amount, visual);
            const prevStr = formatNoteCellAmount(r.previous_amount, visual);
            const curTd =
                '<td class="' +
                noteAmountCellClass(r.current_amount) +
                '">' +
                (curStr === '' ? '\u00a0' : curStr) +
                '</td>';
            const prevTd =
                '<td class="' +
                noteAmountCellClass(r.previous_amount) +
                '">' +
                (prevStr === '' ? '\u00a0' : prevStr) +
                '</td>';

            const drillAttr =
                visual === 'drill' && drill ? ' data-note-drill="' + escapeHtml(drill) + '"' : '';
            const tabIdx = visual === 'drill' && drill ? '0' : '-1';

            return (
                '<tr class="' +
                cls +
                '"' +
                drillAttr +
                ' tabindex="' +
                tabIdx +
                '">' +
                '<td class="' +
                indentCls +
                '">' +
                labelHtml +
                '</td>' +
                curTd +
                prevTd +
                '</tr>'
            );
        })
        .join('');

    if (!drill) return;
    tbody.querySelectorAll('tr[data-note-drill]').forEach((tr) => {
        tr.addEventListener('click', function () {
            const d = tr.getAttribute('data-note-drill');
            if (d === 'ar') openArSda();
            else if (d === 'ap') openApSda();
        });
        tr.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                tr.click();
            }
        });
    });
}

async function openCashNote() {
    document.getElementById('cashNoteOverlay').classList.remove('hidden');
    document.getElementById('cashNoteModal').classList.remove('hidden');
    try {
        const rows = await fetchNoteRows('balance_sheet_note_cash');
        renderBalanceSheetNoteTable(rows, 'cashNoteBody', null);
    } catch (e) {
        document.getElementById('cashNoteBody').innerHTML =
            '<tr><td colspan="3" class="fs-error-banner">' + escapeHtml(e.message) + '</td></tr>';
    }
}

function closeCashNote() {
    document.getElementById('cashNoteOverlay').classList.add('hidden');
    document.getElementById('cashNoteModal').classList.add('hidden');
}

async function openArNote() {
    document.getElementById('arNoteOverlay').classList.remove('hidden');
    document.getElementById('arNoteModal').classList.remove('hidden');
    try {
        const rows = await fetchNoteRows('balance_sheet_note_ar');
        renderBalanceSheetNoteTable(rows, 'arNoteBody', 'ar');
    } catch (e) {
        document.getElementById('arNoteBody').innerHTML =
            '<tr><td colspan="3" class="fs-error-banner">' + escapeHtml(e.message) + '</td></tr>';
    }
}

function closeArNote() {
    document.getElementById('arNoteOverlay').classList.add('hidden');
    document.getElementById('arNoteModal').classList.add('hidden');
}

async function openApNote() {
    document.getElementById('apNoteOverlay').classList.remove('hidden');
    document.getElementById('apNoteModal').classList.remove('hidden');
    try {
        const rows = await fetchNoteRows('balance_sheet_note_ap');
        renderBalanceSheetNoteTable(rows, 'apNoteBody', 'ap');
    } catch (e) {
        document.getElementById('apNoteBody').innerHTML =
            '<tr><td colspan="3" class="fs-error-banner">' + escapeHtml(e.message) + '</td></tr>';
    }
}

function closeApNote() {
    document.getElementById('apNoteOverlay').classList.add('hidden');
    document.getElementById('apNoteModal').classList.add('hidden');
}

async function openArSda() {
    document.getElementById('arSdaModal').classList.remove('hidden');
    const tbody = document.getElementById('arSdaBody');
    tbody.innerHTML =
        '<tr><td colspan="2" class="fs-loading-banner">Loading…</td></tr>';
    try {
        const rows = await fetchNoteRows('balance_sheet_note_ar_sda');
        if (!rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="2" class="fs-loading-banner">No SDA entity rows for this period.</td></tr>';
            return;
        }
        let zebra = false;
        tbody.innerHTML = rows
            .map((r) => {
                zebra = !zebra;
                return (
                    '<tr class="cn-sda-tr' +
                    (zebra ? ' cn-tr-zebra-light' : '') +
                    '">' +
                    '<td class="cn-sda-desc">' +
                    escapeHtml(displayNoteLabel(r.entity_name)) +
                    '</td>' +
                    '<td class="' +
                    noteAmountCellClass(r.amount) +
                    '">' +
                    formatMoney(r.amount) +
                    '</td>' +
                    '</tr>'
                );
            })
            .join('');
    } catch (e) {
        tbody.innerHTML =
            '<tr><td colspan="2" class="fs-error-banner">' + escapeHtml(e.message) + '</td></tr>';
    }
}

function closeArSda() {
    document.getElementById('arSdaModal').classList.add('hidden');
}

async function openApSda() {
    document.getElementById('apSdaModal').classList.remove('hidden');
    const tbody = document.getElementById('apSdaBody');
    tbody.innerHTML =
        '<tr><td colspan="3" class="fs-loading-banner">Loading…</td></tr>';
    try {
        const rows = await fetchNoteRows('balance_sheet_note_ap_sda');
        if (!rows.length) {
            tbody.innerHTML =
                '<tr><td colspan="3" class="fs-loading-banner">No SDA entity rows for this period.</td></tr>';
            return;
        }
        let zebra = false;
        tbody.innerHTML = rows
            .map((r) => {
                zebra = !zebra;
                return (
                    '<tr class="cn-sda-tr' +
                    (zebra ? ' cn-tr-zebra-light' : '') +
                    '">' +
                    '<td class="cn-sda-desc">' +
                    escapeHtml(displayNoteLabel(r.entity_name)) +
                    '</td>' +
                    '<td class="' +
                    noteAmountCellClass(r.base_amount) +
                    '">' +
                    formatMoney(r.base_amount) +
                    '</td>' +
                    '<td class="' +
                    noteAmountCellClass(r.current_amount) +
                    '">' +
                    formatMoney(r.current_amount) +
                    '</td>' +
                    '</tr>'
                );
            })
            .join('');
    } catch (e) {
        tbody.innerHTML =
            '<tr><td colspan="3" class="fs-error-banner">' + escapeHtml(e.message) + '</td></tr>';
    }
}

function closeApSda() {
    document.getElementById('apSdaModal').classList.add('hidden');
}

/* ─── Balance sheet CRUD ─────────────────────────────────────────────────── */

const BS_FIELD_DEFS = [
    ['cash',              'Cash'],
    ['investments',       'Investments'],
    ['accounts_receivable','Accounts Receivable'],
    ['cash_held_agency',  'Cash Held Agency'],
    ['loans_receivable',  'Loans Receivable'],
    ['supplies',          'Supplies'],
    ['fixed_assets',      'Fixed Assets'],
    ['loans_nc',          'Loans — Noncurrent'],
    ['other_assets_nc',   'Other Noncurrent Assets'],
    ['accounts_payable',  'Accounts Payable'],
    ['offerings_agency',  'Offerings Agency'],
    ['interfund_ap',      'Interfund AP'],
    ['loans_payable',     'Loans Payable'],
    ['una_tithe',         'UNA Tithe'],
    ['una_non_tithe',     'UNA Non-Tithe'],
    ['allocated_na',      'Allocated NA'],
    ['unexpended_plant',  'Unexpended Plant'],
    ['invested_plant',    'Invested Plant']
];

function bsCrudOpen() {
    document.getElementById('crudOverlay').classList.remove('hidden');
    document.getElementById('crudModal').classList.remove('hidden');
    document.getElementById('crudModalTitle').textContent = 'BALANCE SHEET';
    document.getElementById('crudDeleteBtn').style.display = 'none';
    document.getElementById('crudRecordIdWrap').style.display = bsRecordId ? 'block' : 'none';
    document.getElementById('crudRecordId').value = bsRecordId || '';

    // Populate year options dynamically around current year
    const yrSel = document.getElementById('crudYear');
    const curYrVal = String(displayYearCurrent);
    if (!Array.from(yrSel.options).some(o => o.value === curYrVal)) {
        yrSel.innerHTML = [displayYearCurrent - 1, displayYearCurrent, displayYearCurrent + 1]
            .map(y => '<option value="' + y + '">' + y + '</option>').join('');
    }
    yrSel.value = curYrVal;
    document.getElementById('crudMonth').value = String(dbMonthFromUi(currentMonthIndex));

    const grid = document.getElementById('crudFieldsGrid');
    const src = bsRowCurrent || {};
    grid.innerHTML = BS_FIELD_DEFS.map(
        ([key, label]) =>
            '<div class="crud-field"><label class="crud-label">' +
            escapeHtml(label.toUpperCase()) +
            '</label>' +
            '<input class="crud-input" id="bsf_' +
            key +
            '" type="number" step="0.01" value="' +
            (src[key] !== undefined && src[key] !== null ? escapeHtml(String(src[key])) : '') +
            '" /></div>'
    ).join('');
}

async function bsCrudLoad() {
    const y = parseInt(document.getElementById('crudYear').value, 10);
    const m = parseInt(document.getElementById('crudMonth').value, 10);
    // Update display year/prev when user changes year in CRUD
    displayYearCurrent = y;
    displayYearPrev = y - 1;
    bsCrudOpen();
    try {
        const list = await apiGet(
            'balance_sheet?year=eq.' + y + '&month=eq.' + m + '&select=*'
        );
        const rec = list[0];
        bsRecordId = rec ? rec.id : null;
        document.getElementById('crudRecordId').value = bsRecordId || '';
        document.getElementById('crudRecordIdWrap').style.display = bsRecordId ? 'block' : 'none';
        BS_FIELD_DEFS.forEach(([key]) => {
            const inp = document.getElementById('bsf_' + key);
            if (inp) inp.value = rec && rec[key] != null ? rec[key] : '';
        });
    } catch (e) {
        alert(e.message);
    }
}

async function crudSave() {
    const y = parseInt(document.getElementById('crudYear').value, 10);
    const m = parseInt(document.getElementById('crudMonth').value, 10);
    const body = { year: y, month: m };
    BS_FIELD_DEFS.forEach(([key]) => {
        const inp = document.getElementById('bsf_' + key);
        if (inp && inp.value !== '') body[key] = parseFloat(inp.value);
        else body[key] = null;
    });

    try {
        if (bsRecordId) {
            await apiPatch('balance_sheet', bsRecordId, body);
        } else {
            const inserted = await apiPost('balance_sheet', body);
            bsRecordId = inserted[0].id;
        }
        // Sync display year and month to what was saved
        displayYearCurrent = y;
        displayYearPrev = y - 1;
        const newMonthIndex = m - 1;
        currentMonthIndex = newMonthIndex;
        closeCrud();
        await renderAll(currentMonthIndex);
    } catch (e) {
        alert(e.message);
    }
}

function crudDelete() {}

function closeCrud() {
    document.getElementById('crudOverlay').classList.add('hidden');
    document.getElementById('crudModal').classList.add('hidden');
}

function toggleBsDropdown() {
    document.getElementById('bsEditMenu').classList.toggle('hidden');
}

function closeBsDropdown() {
    document.getElementById('bsEditMenu').classList.add('hidden');
}

/* ─── Budget editor ───────────────────────────────────────────────────────── */

function openBudgetEditor(lineId) {
    const line = incomeLines.find((l) => String(l.id) === String(lineId));
    if (!line) return;
    document.getElementById('budgetModal').classList.remove('hidden');
    document.getElementById('budgetLineId').value = String(line.id);
    document.getElementById('budgetLineKey').value = line.line_key;
    document.getElementById('budgetYear').value = String(displayYearCurrent);
    const existing = incomeBudgetMap[line.id];
    document.getElementById('budgetAmount').value =
        existing !== undefined && existing !== null ? String(existing) : '';
    document.getElementById('budgetExistingId').value = '';
}

function closeBudget() {
    document.getElementById('budgetModal').classList.add('hidden');
}

async function budgetSave() {
    const lineId = parseInt(document.getElementById('budgetLineId').value, 10);
    const budgetYear = parseInt(document.getElementById('budgetYear').value, 10);
    const amt = document.getElementById('budgetAmount').value;
    const payload = {
        income_statement_line_id: lineId,
        budget_year: budgetYear,
        budget_amount: amt === '' ? null : parseFloat(amt)
    };

    try {
        const existing = await apiGet(
            'income_statement_budgets?income_statement_line_id=eq.' +
                lineId +
                '&budget_year=eq.' +
                budgetYear +
                '&select=id'
        );
        if (existing && existing[0]) {
            await apiPatch('income_statement_budgets', existing[0].id, {
                budget_amount: payload.budget_amount
            });
        } else {
            await apiPost('income_statement_budgets', payload);
        }
        closeBudget();
        await renderAll(currentMonthIndex);
    } catch (e) {
        alert(e.message);
    }
}

/* ─── Balance sheet note CRUD (Cash / AR / AP / SDA) ───────────────────────── */

const BS_NOTE_TABLES = {
    cash: 'balance_sheet_note_cash',
    ar: 'balance_sheet_note_ar',
    ap: 'balance_sheet_note_ap'
};
const BS_NOTE_ROW_TYPES = ['data', 'group', 'section', 'subtotal', 'total'];
let _sdaSwpucKind = 'ar';

function syncYmSelects(yearId, monthId) {
    document.getElementById(yearId).value = String(displayYearCurrent);
    document.getElementById(monthId).value = String(dbMonthFromUi(currentMonthIndex));
}

async function fetchNoteRowsForYm(table, y, m) {
    return apiGet(
        table + '?year=eq.' + y + '&month=eq.' + m + '&order=sort_order.asc'
    );
}

function rowTypeSelectHtml(selected) {
    const s = String(selected || 'data').toLowerCase();
    return BS_NOTE_ROW_TYPES.map(function (t) {
        return '<option value="' + t + '"' + (s === t ? ' selected' : '') + '>' + t.toUpperCase() + '</option>';
    }).join('');
}

function parseAmtField(v) {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

function nextSortOrderFromList(container) {
    const list = typeof container === 'string' ? document.getElementById(container) : container;
    let m = 0;
    list
        .querySelectorAll('[data-bs-field="sort_order"], [data-sda-field="sort_order"]')
        .forEach(function (inp) {
            const n = parseInt(inp.value, 10);
            if (Number.isFinite(n)) m = Math.max(m, n);
        });
    return m > 0 ? m + 10 : 10;
}

function trimOrNull(v) {
    const t = String(v || '').trim();
    return t === '' ? null : t;
}

function balanceSheetNoteCardHtml(table, row) {
    const id = row && row.id != null ? String(row.id) : '';
    const sort = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : '';
    const label = escapeHtml(row.label || '');
    const dk = escapeHtml(row.drill_key || '');
    const indent = row.is_indent === true ? 'checked' : '';
    const rt = rowTypeSelectHtml(row.row_type);
    const cur = row.current_amount != null && row.current_amount !== '' ? escapeHtml(String(row.current_amount)) : '';
    const prev = row.previous_amount != null && row.previous_amount !== '' ? escapeHtml(String(row.previous_amount)) : '';
    return (
        '<div class="note-crud-card" data-bs-note-crud="" data-bs-table="' +
        escapeHtml(table) +
        '" data-bs-id="' +
        escapeHtml(id) +
        '">' +
        '<div class="note-crud-card-grid">' +
        '<div class="crud-field" style="grid-column: span 2;">' +
        '<label class="crud-label">LABEL</label>' +
        '<input class="crud-input" data-bs-field="label" type="text" value="' +
        label +
        '" placeholder="ROW LABEL"/></div>' +
        '<div class="crud-field"><label class="crud-label">ROW TYPE</label>' +
        '<select class="crud-input" data-bs-field="row_type">' +
        rt +
        '</select></div>' +
        '<div class="crud-field"><label class="crud-label">SORT ORDER</label>' +
        '<input class="crud-input" data-bs-field="sort_order" type="number" value="' +
        sort +
        '"/></div>' +
        '<div class="crud-field" style="display:flex;align-items:flex-end;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="checkbox" data-bs-field="is_indent" ' +
        indent +
        '/> INDENT</label></div>' +
        '<div class="crud-field" style="grid-column: span 2;">' +
        '<label class="crud-label">DRILL KEY (optional, e.g. sda)</label>' +
        '<input class="crud-input" data-bs-field="drill_key" type="text" value="' +
        dk +
        '"/></div>' +
        '<div class="crud-field"><label class="crud-label">CURRENT</label>' +
        '<input class="crud-input" data-bs-field="current_amount" type="text" inputmode="decimal" value="' +
        cur +
        '"/></div>' +
        '<div class="crud-field"><label class="crud-label">PREVIOUS</label>' +
        '<input class="crud-input" data-bs-field="previous_amount" type="text" inputmode="decimal" value="' +
        prev +
        '"/></div></div>' +
        '<div class="note-crud-card-actions">' +
        '<button type="button" class="crud-btn crud-btn-primary" onclick="balanceSheetNoteRowSave(this)">SAVE</button>' +
        '<button type="button" class="crud-btn crud-btn-danger" onclick="balanceSheetNoteRowDelete(this)"' +
        (id ? '' : ' style="opacity:0.35" disabled') +
        '>DELETE</button></div></div>'
    );
}

function readBsNotePayloadFromCard(card, yearId, monthId) {
    const y = parseInt(document.getElementById(yearId).value, 10);
    const m = parseInt(document.getElementById(monthId).value, 10);
    return {
        year: y,
        month: m,
        label: trimOrNull(card.querySelector('[data-bs-field="label"]').value) || '(untitled)',
        row_type: (
            trimOrNull(card.querySelector('[data-bs-field="row_type"]').value) || 'data'
        ).toLowerCase(),
        sort_order: parseInt(card.querySelector('[data-bs-field="sort_order"]').value, 10) || 0,
        is_indent: card.querySelector('[data-bs-field="is_indent"]').checked,
        drill_key: trimOrNull(card.querySelector('[data-bs-field="drill_key"]').value),
        current_amount: parseAmtField(card.querySelector('[data-bs-field="current_amount"]').value),
        previous_amount: parseAmtField(card.querySelector('[data-bs-field="previous_amount"]').value)
    };
}

function ymFromCard(btn, yearSel, monthSel) {
    return readBsNotePayloadFromCard(btn.closest('[data-bs-note-crud]'), yearSel, monthSel);
}

async function balanceSheetNoteRowSave(btn) {
    const card = btn.closest('[data-bs-note-crud]');
    const table = card.getAttribute('data-bs-table');
    let yearId,
        monthId,
        reload;
    if (table === BS_NOTE_TABLES.cash) {
        yearId = 'cashCrudYear';
        monthId = 'cashCrudMonth';
        reload = cashNoteCrudLoad;
    } else if (table === BS_NOTE_TABLES.ar) {
        yearId = 'arCrudYear';
        monthId = 'arCrudMonth';
        reload = arNoteCrudLoad;
    } else if (table === BS_NOTE_TABLES.ap) {
        yearId = 'apCrudYear';
        monthId = 'apCrudMonth';
        reload = apNoteCrudLoad;
    } else {
        alert('Unknown table.');
        return;
    }
    const body = readBsNotePayloadFromCard(card, yearId, monthId);
    const rid = card.getAttribute('data-bs-id');
    try {
        btn.disabled = true;
        if (rid && rid !== '') {
            await apiPatch(table, rid, body);
        } else {
            const ins = await apiPost(table, body);
            card.setAttribute('data-bs-id', String(ins[0].id));
            const delBt = card.querySelector('.crud-btn-danger');
            if (delBt) {
                delBt.disabled = false;
                delBt.style.opacity = '';
            }
        }
        await reload();
        if (
            body.year === displayYearCurrent &&
            body.month === dbMonthFromUi(currentMonthIndex)
        ) {
            await renderAll(uiMonthFromDb(body.month));
        }
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function balanceSheetNoteRowDelete(btn) {
    const card = btn.closest('[data-bs-note-crud]');
    const table = card.getAttribute('data-bs-table');
    const rid = card.getAttribute('data-bs-id');
    let yearId, monthId, reload;
    if (table === BS_NOTE_TABLES.cash) {
        yearId = 'cashCrudYear';
        monthId = 'cashCrudMonth';
        reload = cashNoteCrudLoad;
    } else if (table === BS_NOTE_TABLES.ar) {
        yearId = 'arCrudYear';
        monthId = 'arCrudMonth';
        reload = arNoteCrudLoad;
    } else {
        yearId = 'apCrudYear';
        monthId = 'apCrudMonth';
        reload = apNoteCrudLoad;
    }
    if (!rid || rid === '') return;
    if (!confirm('Delete this row?')) return;
    try {
        await apiDelete(table, rid);
        await reload();
        const payload = ymFromCard(btn, yearId, monthId);
        if (payload.year === displayYearCurrent && payload.month === dbMonthFromUi(currentMonthIndex)) {
            await renderAll(uiMonthFromDb(payload.month));
        }
    } catch (e) {
        alert(e.message);
    }
}

async function showLabelPicker(listId, table, cardFn, yearId, monthId) {
    const y = parseInt(document.getElementById(yearId).value, 10);
    const m = parseInt(document.getElementById(monthId).value, 10);
    // Fetch all distinct labels from this table (all years/months) for suggestions
    let labels = [];
    try {
        const rows = await apiGet(table + '?select=label&order=label.asc');
        const seen = new Set();
        rows.forEach(function (r) {
            const l = String(r.label || '').trim();
            if (l && !seen.has(l)) { seen.add(l); labels.push(l); }
        });
    } catch (_) {}

    // Remove any existing picker
    const existing = document.getElementById('_labelPickerWrap');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.id = '_labelPickerWrap';
    wrap.style.cssText = 'background:#1a2540;border:1px solid rgba(64,166,255,0.35);border-radius:8px;padding:14px;margin-bottom:10px;';

    const inner = labels.length
        ? '<div style="margin-bottom:8px;font-family:Montserrat,sans-serif;font-size:0.65rem;letter-spacing:1.5px;color:#40a6ff;">PICK A LABEL OR TYPE CUSTOM</div>' +
          '<select id="_labelPickerSel" class="crud-input" style="margin-bottom:8px;">' +
          '<option value="">— select existing label —</option>' +
          labels.map(function (l) { return '<option value="' + escapeHtml(l) + '">' + escapeHtml(l) + '</option>'; }).join('') +
          '</select>' +
          '<div style="margin-bottom:6px;font-family:Montserrat,sans-serif;font-size:0.6rem;letter-spacing:1px;color:#8899bb;">OR CUSTOM LABEL</div>'
        : '<div style="margin-bottom:8px;font-family:Montserrat,sans-serif;font-size:0.65rem;letter-spacing:1.5px;color:#40a6ff;">ENTER LABEL</div>';

    wrap.innerHTML = inner +
        '<input id="_labelPickerCustom" class="crud-input" type="text" placeholder="Custom label…" style="margin-bottom:10px;"/>' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" class="crud-btn crud-btn-primary" id="_labelPickerOk">ADD</button>' +
        '<button type="button" class="crud-btn crud-btn-ghost" id="_labelPickerCancel">CANCEL</button>' +
        '</div>';

    document.getElementById(listId).insertAdjacentElement('beforebegin', wrap);

    if (labels.length) {
        document.getElementById('_labelPickerSel').addEventListener('change', function () {
            document.getElementById('_labelPickerCustom').value = this.value;
        });
    }

    document.getElementById('_labelPickerCancel').addEventListener('click', function () {
        wrap.remove();
    });

    document.getElementById('_labelPickerOk').addEventListener('click', function () {
        const chosenLabel = document.getElementById('_labelPickerCustom').value.trim() ||
            (labels.length ? (document.getElementById('_labelPickerSel').value || '') : '');
        wrap.remove();
        const nextSort = nextSortOrderFromList(listId);
        document.getElementById(listId).insertAdjacentHTML(
            'beforeend',
            cardFn(table, {
                sort_order: nextSort,
                row_type: 'data',
                is_indent: false,
                label: chosenLabel
            })
        );
    });
}

function appendBlankBsNoteRow(listId, table) {
    document
        .getElementById(listId)
        .insertAdjacentHTML(
            'beforeend',
            balanceSheetNoteCardHtml(table, {
                sort_order: nextSortOrderFromList(listId),
                row_type: 'data',
                is_indent: false
            })
        );
}

async function cashNoteCrudLoad() {
    const y = parseInt(document.getElementById('cashCrudYear').value, 10);
    const m = parseInt(document.getElementById('cashCrudMonth').value, 10);
    const wrap = document.getElementById('cashCrudRowList');
    wrap.innerHTML = '<div class="fs-loading-banner">Loading…</div>';
    try {
        const rows = await fetchNoteRowsForYm(BS_NOTE_TABLES.cash, y, m);
        wrap.innerHTML = rows.length
            ? rows.map(function (r) {
                  return balanceSheetNoteCardHtml(BS_NOTE_TABLES.cash, r);
              }).join('')
            : '';
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner">' + escapeHtml(e.message) + '</div>';
    }
}

function openCashNoteCrud() {
    closeBsDropdown();
    document.getElementById('cashCrudOverlay').classList.remove('hidden');
    document.getElementById('cashCrudModal').classList.remove('hidden');
    syncYmSelects('cashCrudYear', 'cashCrudMonth');
    cashNoteCrudLoad();
}

function closeCashNoteCrud() {
    document.getElementById('cashCrudOverlay').classList.add('hidden');
    document.getElementById('cashCrudModal').classList.add('hidden');
}

function cashNoteCrudAddNew() {
    showLabelPicker('cashCrudRowList', BS_NOTE_TABLES.cash, balanceSheetNoteCardHtml, 'cashCrudYear', 'cashCrudMonth');
}

async function arNoteCrudLoad() {
    const y = parseInt(document.getElementById('arCrudYear').value, 10);
    const m = parseInt(document.getElementById('arCrudMonth').value, 10);
    const wrap = document.getElementById('arCrudRowList');
    wrap.innerHTML = '<div class="fs-loading-banner">Loading…</div>';
    try {
        const rows = await fetchNoteRowsForYm(BS_NOTE_TABLES.ar, y, m);
        wrap.innerHTML = rows.length
            ? rows.map(function (r) {
                  return balanceSheetNoteCardHtml(BS_NOTE_TABLES.ar, r);
              }).join('')
            : '';
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner">' + escapeHtml(e.message) + '</div>';
    }
}

function openArNoteCrud() {
    closeBsDropdown();
    document.getElementById('arCrudOverlay').classList.remove('hidden');
    document.getElementById('arCrudModal').classList.remove('hidden');
    syncYmSelects('arCrudYear', 'arCrudMonth');
    arNoteCrudLoad();
}

function closeArNoteCrud() {
    document.getElementById('arCrudOverlay').classList.add('hidden');
    document.getElementById('arCrudModal').classList.add('hidden');
}

function arNoteCrudAddNew() {
    showLabelPicker('arCrudRowList', BS_NOTE_TABLES.ar, balanceSheetNoteCardHtml, 'arCrudYear', 'arCrudMonth');
}

async function apNoteCrudLoad() {
    const y = parseInt(document.getElementById('apCrudYear').value, 10);
    const m = parseInt(document.getElementById('apCrudMonth').value, 10);
    const wrap = document.getElementById('apCrudRowList');
    wrap.innerHTML = '<div class="fs-loading-banner">Loading…</div>';
    try {
        const rows = await fetchNoteRowsForYm(BS_NOTE_TABLES.ap, y, m);
        wrap.innerHTML = rows.length
            ? rows.map(function (r) {
                  return balanceSheetNoteCardHtml(BS_NOTE_TABLES.ap, r);
              }).join('')
            : '';
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner">' + escapeHtml(e.message) + '</div>';
    }
}

function openApNoteCrud() {
    closeBsDropdown();
    document.getElementById('apCrudOverlay').classList.remove('hidden');
    document.getElementById('apCrudModal').classList.remove('hidden');
    syncYmSelects('apCrudYear', 'apCrudMonth');
    apNoteCrudLoad();
}

function closeApNoteCrud() {
    document.getElementById('apCrudOverlay').classList.add('hidden');
    document.getElementById('apCrudModal').classList.add('hidden');
}

function apNoteCrudAddNew() {
    showLabelPicker('apCrudRowList', BS_NOTE_TABLES.ap, balanceSheetNoteCardHtml, 'apCrudYear', 'apCrudMonth');
}

/* AR / AP standalone SDA modals */

function arSdaEntityCard(row, saveHandler, deleteHandler) {
    const saveFn = saveHandler || 'sdaArRowSave';
    const delFn = deleteHandler || 'sdaArRowDelete';
    const id = row && row.id != null ? String(row.id) : '';
    const nm = escapeHtml(row.entity_name || '');
    const amt = row.amount != null && row.amount !== '' ? escapeHtml(String(row.amount)) : '';
    const sor = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : '';
    return (
        '<div class="note-crud-card" data-bs-sda="ar" data-bs-id="' +
        escapeHtml(id) +
        '">' +
        '<div class="note-crud-card-grid">' +
        '<div class="crud-field" style="grid-column:span 2;">' +
        '<label class="crud-label">ENTITY NAME</label>' +
        '<input class="crud-input" data-sda-field="entity_name" type="text" value="' +
        nm +
        '"/></div>' +
        '<div class="crud-field"><label class="crud-label">SORT ORDER</label>' +
        '<input class="crud-input" data-sda-field="sort_order" type="number" value="' +
        sor +
        '"/></div>' +
        '<div class="crud-field"><label class="crud-label">AMOUNT</label>' +
        '<input class="crud-input" data-sda-field="amount" type="text" inputmode="decimal" value="' +
        amt +
        '"/></div></div>' +
        '<div class="note-crud-card-actions">' +
        '<button type="button" class="crud-btn crud-btn-primary" onclick="' +
        saveFn +
        '(this)">SAVE</button>' +
        '<button type="button" class="crud-btn crud-btn-danger" onclick="' +
        delFn +
        '(this)"' +
        (id ? '' : ' disabled style="opacity:0.35"') +
        '>DELETE</button></div></div>'
    );
}

function apSdaEntityCard(row, saveHandler, deleteHandler) {
    const saveFn = saveHandler || 'sdaApRowSave';
    const delFn = deleteHandler || 'sdaApRowDelete';
    const id = row && row.id != null ? String(row.id) : '';
    const nm = escapeHtml(row.entity_name || '');
    const ba = row.base_amount != null && row.base_amount !== '' ? escapeHtml(String(row.base_amount)) : '';
    const ca =
        row.current_amount != null && row.current_amount !== ''
            ? escapeHtml(String(row.current_amount))
            : '';
    const sor = Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : '';
    return (
        '<div class="note-crud-card" data-bs-sda="ap" data-bs-id="' +
        escapeHtml(id) +
        '">' +
        '<div class="note-crud-card-grid">' +
        '<div class="crud-field" style="grid-column:span 2;">' +
        '<label class="crud-label">ENTITY NAME</label>' +
        '<input class="crud-input" data-sda-field="entity_name" type="text" value="' +
        nm +
        '"/></div>' +
        '<div class="crud-field"><label class="crud-label">SORT ORDER</label>' +
        '<input class="crud-input" data-sda-field="sort_order" type="number" value="' +
        sor +
        '"/></div>' +
        '<div class="crud-field"><label class="crud-label">BASE AMOUNT</label>' +
        '<input class="crud-input" data-sda-field="base_amount" type="text" inputmode="decimal" value="' +
        ba +
        '"/></div>' +
        '<div class="crud-field"><label class="crud-label">CURRENT</label>' +
        '<input class="crud-input" data-sda-field="current_amount" type="text" inputmode="decimal" value="' +
        ca +
        '"/></div></div>' +
        '<div class="note-crud-card-actions">' +
        '<button type="button" class="crud-btn crud-btn-primary" onclick="' +
        saveFn +
        '(this)">SAVE</button>' +
        '<button type="button" class="crud-btn crud-btn-danger" onclick="' +
        delFn +
        '(this)"' +
        (id ? '' : ' disabled style="opacity:0.35"') +
        '>DELETE</button></div></div>'
    );
}

async function openArSdaCrud() {
    document.getElementById('arSdaCrudOverlay').classList.remove('hidden');
    document.getElementById('arSdaCrudModal').classList.remove('hidden');
    syncYmSelects('arSdaCrudYear', 'arSdaCrudMonth');
    arSdaCrudLoad();
}

function closeArSdaCrud() {
    document.getElementById('arSdaCrudOverlay').classList.add('hidden');
    document.getElementById('arSdaCrudModal').classList.add('hidden');
}

async function arSdaCrudLoad() {
    const y = parseInt(document.getElementById('arSdaCrudYear').value, 10);
    const m = parseInt(document.getElementById('arSdaCrudMonth').value, 10);
    const wrap = document.getElementById('arSdaCrudRowList');
    wrap.innerHTML = '<div class="fs-loading-banner">Loading…</div>';
    try {
        const rows = await fetchNoteRowsForYm('balance_sheet_note_ar_sda', y, m);
        wrap.innerHTML = rows.length
            ? rows.map(function (r) {
                  return arSdaEntityCard(r);
              }).join('')
            : '';
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner">' + escapeHtml(e.message) + '</div>';
    }
}

function arSdaCrudAddNew() {
    showSdaEntityPicker('arSdaCrudRowList', 'balance_sheet_note_ar_sda', 'ar', 'arSdaCrudYear', 'arSdaCrudMonth', null, null);
}

async function openApSdaCrud() {
    document.getElementById('apSdaCrudOverlay').classList.remove('hidden');
    document.getElementById('apSdaCrudModal').classList.remove('hidden');
    syncYmSelects('apSdaCrudYear', 'apSdaCrudMonth');
    apSdaCrudLoad();
}

function closeApSdaCrud() {
    document.getElementById('apSdaCrudOverlay').classList.add('hidden');
    document.getElementById('apSdaCrudModal').classList.add('hidden');
}

async function apSdaCrudLoad() {
    const y = parseInt(document.getElementById('apSdaCrudYear').value, 10);
    const m = parseInt(document.getElementById('apSdaCrudMonth').value, 10);
    const wrap = document.getElementById('apSdaCrudRowList');
    wrap.innerHTML = '<div class="fs-loading-banner">Loading…</div>';
    try {
        const rows = await fetchNoteRowsForYm('balance_sheet_note_ap_sda', y, m);
        wrap.innerHTML = rows.length
            ? rows.map(function (r) {
                  return apSdaEntityCard(r);
              }).join('')
            : '';
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner">' + escapeHtml(e.message) + '</div>';
    }
}

function apSdaCrudAddNew() {
    showSdaEntityPicker('apSdaCrudRowList', 'balance_sheet_note_ap_sda', 'ap', 'apSdaCrudYear', 'apSdaCrudMonth', null, null);
}

async function sdaArRowSave(btn) {
    const card = btn.closest('[data-bs-sda]');
    const y = parseInt(document.getElementById('arSdaCrudYear').value, 10);
    const m = parseInt(document.getElementById('arSdaCrudMonth').value, 10);
    const body = {
        year: y,
        month: m,
        sort_order: parseInt(card.querySelector('[data-sda-field="sort_order"]').value, 10) || 0,
        entity_name: trimOrNull(card.querySelector('[data-sda-field="entity_name"]').value) || '(entity)',
        amount: parseAmtField(card.querySelector('[data-sda-field="amount"]').value)
    };
    const rid = card.getAttribute('data-bs-id');
    try {
        btn.disabled = true;
        if (rid && rid !== '') await apiPatch('balance_sheet_note_ar_sda', rid, body);
        else {
            const ins = await apiPost('balance_sheet_note_ar_sda', body);
            card.setAttribute('data-bs-id', String(ins[0].id));
            card.querySelector('.crud-btn-danger').disabled = false;
            card.querySelector('.crud-btn-danger').style.opacity = '';
        }
        await arSdaCrudLoad();
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function sdaApRowSave(btn) {
    const card = btn.closest('[data-bs-sda]');
    const y = parseInt(document.getElementById('apSdaCrudYear').value, 10);
    const m = parseInt(document.getElementById('apSdaCrudMonth').value, 10);
    const body = {
        year: y,
        month: m,
        sort_order: parseInt(card.querySelector('[data-sda-field="sort_order"]').value, 10) || 0,
        entity_name: trimOrNull(card.querySelector('[data-sda-field="entity_name"]').value) || '(entity)',
        base_amount: parseAmtField(card.querySelector('[data-sda-field="base_amount"]').value),
        current_amount: parseAmtField(card.querySelector('[data-sda-field="current_amount"]').value)
    };
    const rid = card.getAttribute('data-bs-id');
    try {
        btn.disabled = true;
        if (rid && rid !== '') await apiPatch('balance_sheet_note_ap_sda', rid, body);
        else {
            const ins = await apiPost('balance_sheet_note_ap_sda', body);
            card.setAttribute('data-bs-id', String(ins[0].id));
            card.querySelector('.crud-btn-danger').disabled = false;
            card.querySelector('.crud-btn-danger').style.opacity = '';
        }
        await apSdaCrudLoad();
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function sdaArRowDelete(btn) {
    const card = btn.closest('[data-bs-sda]');
    const rid = card.getAttribute('data-bs-id');
    if (!rid) return;
    if (!confirm('Delete this entity?')) return;
    try {
        await apiDelete('balance_sheet_note_ar_sda', rid);
        await arSdaCrudLoad();
        const y = parseInt(document.getElementById('arSdaCrudYear').value, 10);
        const m = parseInt(document.getElementById('arSdaCrudMonth').value, 10);
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    }
}

async function sdaApRowDelete(btn) {
    const card = btn.closest('[data-bs-sda]');
    const rid = card.getAttribute('data-bs-id');
    if (!rid) return;
    if (!confirm('Delete this entity?')) return;
    try {
        await apiDelete('balance_sheet_note_ap_sda', rid);
        await apSdaCrudLoad();
        const y = parseInt(document.getElementById('apSdaCrudYear').value, 10);
        const m = parseInt(document.getElementById('apSdaCrudMonth').value, 10);
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    }
}

/* Combined SDA modal (dropdown entry) */

function setSdaSwpucKind(which) {
    _sdaSwpucKind = which === 'ap' ? 'ap' : 'ar';
    document.getElementById('sdaSwTabAr').classList.toggle('active', _sdaSwpucKind === 'ar');
    document.getElementById('sdaSwTabAp').classList.toggle('active', _sdaSwpucKind === 'ap');
    sdaSwpucCrudLoad();
}

async function sdaSwpucCrudLoad() {
    const y = parseInt(document.getElementById('sdaSwpucYear').value, 10);
    const m = parseInt(document.getElementById('sdaSwpucMonth').value, 10);
    const wrap = document.getElementById('sdaSwpucRowList');
    wrap.innerHTML = '<div class="fs-loading-banner">Loading…</div>';
    const tbl =
        _sdaSwpucKind === 'ap' ? 'balance_sheet_note_ap_sda' : 'balance_sheet_note_ar_sda';
    try {
        const rows = await fetchNoteRowsForYm(tbl, y, m);
        if (_sdaSwpucKind === 'ap') {
            wrap.innerHTML = rows.length
                ? rows.map(function (r) {
                      return apSdaEntityCard(r, 'sdaSwpucApSave', 'sdaSwpucApDel');
                  }).join('')
                : '';
        } else {
            wrap.innerHTML = rows.length
                ? rows.map(function (r) {
                      return arSdaEntityCard(r, 'sdaSwpucArSave', 'sdaSwpucArDel');
                  }).join('')
                : '';
        }
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner">' + escapeHtml(e.message) + '</div>';
    }
}

function openSdaSwpucCrud() {
    closeBsDropdown();
    document.getElementById('sdaSwpucOverlay').classList.remove('hidden');
    document.getElementById('sdaSwpucCrudModal').classList.remove('hidden');
    syncYmSelects('sdaSwpucYear', 'sdaSwpucMonth');
    setSdaSwpucKind(_sdaSwpucKind === 'ap' ? 'ap' : 'ar');
}

function closeSdaSwpucCrud() {
    document.getElementById('sdaSwpucOverlay').classList.add('hidden');
    document.getElementById('sdaSwpucCrudModal').classList.add('hidden');
}

function sdaSwpucCrudAddNew() {
    const tbl = _sdaSwpucKind === 'ap' ? 'balance_sheet_note_ap_sda' : 'balance_sheet_note_ar_sda';
    const saveFn = _sdaSwpucKind === 'ap' ? 'sdaSwpucApSave' : 'sdaSwpucArSave';
    const delFn = _sdaSwpucKind === 'ap' ? 'sdaSwpucApDel' : 'sdaSwpucArDel';
    showSdaEntityPicker('sdaSwpucRowList', tbl, _sdaSwpucKind, 'sdaSwpucYear', 'sdaSwpucMonth', saveFn, delFn);
}

async function sdaSwpucArSave(btn) {
    const card = btn.closest('[data-bs-sda]');
    const y = parseInt(document.getElementById('sdaSwpucYear').value, 10);
    const m = parseInt(document.getElementById('sdaSwpucMonth').value, 10);
    const body = {
        year: y,
        month: m,
        sort_order: parseInt(card.querySelector('[data-sda-field="sort_order"]').value, 10) || 0,
        entity_name: trimOrNull(card.querySelector('[data-sda-field="entity_name"]').value) || '(entity)',
        amount: parseAmtField(card.querySelector('[data-sda-field="amount"]').value)
    };
    const rid = card.getAttribute('data-bs-id');
    try {
        btn.disabled = true;
        if (rid && rid !== '') await apiPatch('balance_sheet_note_ar_sda', rid, body);
        else await apiPost('balance_sheet_note_ar_sda', body);
        await sdaSwpucCrudLoad();
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function sdaSwpucApSave(btn) {
    const card = btn.closest('[data-bs-sda]');
    const y = parseInt(document.getElementById('sdaSwpucYear').value, 10);
    const m = parseInt(document.getElementById('sdaSwpucMonth').value, 10);
    const body = {
        year: y,
        month: m,
        sort_order: parseInt(card.querySelector('[data-sda-field="sort_order"]').value, 10) || 0,
        entity_name: trimOrNull(card.querySelector('[data-sda-field="entity_name"]').value) || '(entity)',
        base_amount: parseAmtField(card.querySelector('[data-sda-field="base_amount"]').value),
        current_amount: parseAmtField(card.querySelector('[data-sda-field="current_amount"]').value)
    };
    const rid = card.getAttribute('data-bs-id');
    try {
        btn.disabled = true;
        if (rid && rid !== '') await apiPatch('balance_sheet_note_ap_sda', rid, body);
        else await apiPost('balance_sheet_note_ap_sda', body);
        await sdaSwpucCrudLoad();
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function sdaSwpucArDel(btn) {
    const card = btn.closest('[data-bs-sda]');
    const rid = card.getAttribute('data-bs-id');
    if (!rid) return;
    if (!confirm('Delete this entity?')) return;
    try {
        await apiDelete('balance_sheet_note_ar_sda', rid);
        await sdaSwpucCrudLoad();
        const y = parseInt(document.getElementById('sdaSwpucYear').value, 10);
        const m = parseInt(document.getElementById('sdaSwpucMonth').value, 10);
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    }
}

async function sdaSwpucApDel(btn) {
    const card = btn.closest('[data-bs-sda]');
    const rid = card.getAttribute('data-bs-id');
    if (!rid) return;
    if (!confirm('Delete this entity?')) return;
    try {
        await apiDelete('balance_sheet_note_ap_sda', rid);
        await sdaSwpucCrudLoad();
        const y = parseInt(document.getElementById('sdaSwpucYear').value, 10);
        const m = parseInt(document.getElementById('sdaSwpucMonth').value, 10);
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    }
}

async function showSdaEntityPicker(listId, table, kind, yearId, monthId, saveFn, delFn) {
    let names = [];
    try {
        const rows = await apiGet(table + '?select=entity_name&order=entity_name.asc');
        const seen = new Set();
        rows.forEach(function (r) {
            const n = String(r.entity_name || '').trim();
            if (n && !seen.has(n)) { seen.add(n); names.push(n); }
        });
    } catch (_) {}

    const existing = document.getElementById('_sdaPickerWrap');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.id = '_sdaPickerWrap';
    wrap.style.cssText = 'background:#1a2540;border:1px solid rgba(64,166,255,0.35);border-radius:8px;padding:14px;margin-bottom:10px;';

    const inner = names.length
        ? '<div style="margin-bottom:8px;font-family:Montserrat,sans-serif;font-size:0.65rem;letter-spacing:1.5px;color:#40a6ff;">PICK AN ENTITY OR TYPE CUSTOM</div>' +
          '<select id="_sdaPickerSel" class="crud-input" style="margin-bottom:8px;">' +
          '<option value="">— select existing entity —</option>' +
          names.map(function (n) { return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>'; }).join('') +
          '</select>' +
          '<div style="margin-bottom:6px;font-family:Montserrat,sans-serif;font-size:0.6rem;letter-spacing:1px;color:#8899bb;">OR CUSTOM NAME</div>'
        : '<div style="margin-bottom:8px;font-family:Montserrat,sans-serif;font-size:0.65rem;letter-spacing:1.5px;color:#40a6ff;">ENTER ENTITY NAME</div>';

    wrap.innerHTML = inner +
        '<input id="_sdaPickerCustom" class="crud-input" type="text" placeholder="Custom entity name…" style="margin-bottom:10px;"/>' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" class="crud-btn crud-btn-primary" id="_sdaPickerOk">ADD</button>' +
        '<button type="button" class="crud-btn crud-btn-ghost" id="_sdaPickerCancel">CANCEL</button>' +
        '</div>';

    document.getElementById(listId).insertAdjacentElement('beforebegin', wrap);

    if (names.length) {
        document.getElementById('_sdaPickerSel').addEventListener('change', function () {
            document.getElementById('_sdaPickerCustom').value = this.value;
        });
    }

    document.getElementById('_sdaPickerCancel').addEventListener('click', function () {
        wrap.remove();
    });

    document.getElementById('_sdaPickerOk').addEventListener('click', function () {
        const chosenName = document.getElementById('_sdaPickerCustom').value.trim() ||
            (names.length ? (document.getElementById('_sdaPickerSel').value || '') : '');
        wrap.remove();
        const nextSort = nextSortOrderFromList(listId);
        if (kind === 'ap') {
            document.getElementById(listId).insertAdjacentHTML(
                'beforeend',
                apSdaEntityCard({ sort_order: nextSort, entity_name: chosenName }, saveFn || 'sdaApRowSave', delFn || 'sdaApRowDelete')
            );
        } else {
            document.getElementById(listId).insertAdjacentHTML(
                'beforeend',
                arSdaEntityCard({ sort_order: nextSort, entity_name: chosenName }, saveFn || 'sdaArRowSave', delFn || 'sdaArRowDelete')
            );
        }
    });
}

/* ─── Income Statement Lines CRUD ───────────────────────────────────────── */

const IS_MASTER = [
    { label: 'TITHE INCOME, NET (NOTE 14)',              section: 'OPERATING INCOME',        sort_order: 10,  line_key: 'TITHE_INCOME' },
    { label: 'OFFERING INCOME & SPECIFIC DONATIONS',     section: 'OPERATING INCOME',        sort_order: 20,  line_key: 'OFFERING_INCOME' },
    { label: 'INVESTMENT INCOME (NOTE 4)',               section: 'OPERATING INCOME',        sort_order: 30,  line_key: 'INVESTMENT_INCOME' },
    { label: 'OTHER OPERATING INCOME',                  section: 'OPERATING INCOME',        sort_order: 40,  line_key: 'OTHER_OPERATING_INCOME' },
    { label: 'TOTAL EARNED OPERATING INCOME',           section: 'OPERATING INCOME',        sort_order: 50,  line_key: 'TOTAL_EARNED_OPERATING_INCOME' },
    { label: 'EMPLOYEE RELATED EXPENSES (NOTE 19)',     section: 'OPERATING EXPENSES',      sort_order: 60,  line_key: 'EMPLOYEE_RELATED_EXPENSES' },
    { label: 'PROGRAM SPECIFIC EXPENSES (NOTE 21)',     section: 'OPERATING EXPENSES',      sort_order: 70,  line_key: 'PROGRAM_SPECIFIC_EXPENSES' },
    { label: 'ADMINISTRATIVE EXPENSES (NOTE 19)',       section: 'OPERATING EXPENSES',      sort_order: 80,  line_key: 'ADMINISTRATIVE_EXPENSES' },
    { label: 'OFFICE EXPENSES (NOTE 20a)',              section: 'OPERATING EXPENSES',      sort_order: 90,  line_key: 'OFFICE_EXPENSES' },
    { label: 'GENERAL EXPENSES (NOTE 20b)',             section: 'OPERATING EXPENSES',      sort_order: 100, line_key: 'GENERAL_EXPENSES' },
    { label: 'PLANT OPERATION EXPENSES (NOTE 21)',      section: 'OPERATING EXPENSES',      sort_order: 110, line_key: 'PLANT_OPERATION_EXPENSES' },
    { label: 'TOTAL OPERATING EXPENSES',               section: 'OPERATING EXPENSES',      sort_order: 120, line_key: 'TOTAL_OPERATING_EXPENSES' },
    { label: 'INCREASE (DECREASE) BEFORE APPROP',      section: 'OPERATING EXPENSES',      sort_order: 130, line_key: 'INCREASE_BEFORE_APPROP' },
    { label: 'TITHE APPROPRIATION RECEIVED (S-22)',     section: 'OPERATING APPROPRIATIONS',sort_order: 140, line_key: 'TITHE_APPROP_RECEIVED' },
    { label: 'TITHE APPROPRIATION DISBURSED (S-23)',    section: 'OPERATING APPROPRIATIONS',sort_order: 150, line_key: 'TITHE_APPROP_DISBURSED' },
    { label: 'NON-TITHE APPROPRIATION RECEIVED (S-24)', section: 'OPERATING APPROPRIATIONS',sort_order: 160, line_key: 'NON_TITHE_APPROP_RECEIVED' },
    { label: 'NON-TITHE APPROPRIATION DISBURSED (S-25)',section: 'OPERATING APPROPRIATIONS',sort_order: 170, line_key: 'NON_TITHE_APPROP_DISBURSED' },
    { label: 'NET APPROPRIATION RETAINED',             section: 'OPERATING APPROPRIATIONS',sort_order: 180, line_key: 'NET_APPROP_RETAINED' },
    { label: 'INCREASE (DECREASE) FROM OPERATIONS',    section: 'OPERATING APPROPRIATIONS',sort_order: 190, line_key: 'INCREASE_FROM_OPERATIONS' },
    { label: 'NET CAPITAL INCREASE (DECREASE)',        section: 'CAPITAL ACTIVITY',        sort_order: 200, line_key: 'NET_CAPITAL_INCREASE' },
    { label: 'INCREASE (DECREASE) BEFORE TRANSFERS',  section: 'CAPITAL ACTIVITY',        sort_order: 210, line_key: 'INCREASE_BEFORE_TRANSFERS' },
    { label: 'TRANSFERS BETWEEN FUNCTIONS/RESOURCES', section: 'TRANSFERS',               sort_order: 220, line_key: 'TRANSFERS_BETWEEN_FUNCTIONS' },
    { label: 'TRANSFERS BETWEEN FUNDS',               section: 'TRANSFERS',               sort_order: 230, line_key: 'TRANSFERS_BETWEEN_FUNDS' },
    { label: 'NET ASSETS INCREASE (DECREASE) FOR THE YEAR', section: 'NET ASSETS',        sort_order: 240, line_key: 'NET_ASSETS_INCREASE_YEAR' },
    { label: 'NET ASSETS, JANUARY 1, 2026',           section: 'NET ASSETS',              sort_order: 250, line_key: 'NET_ASSETS_BEGIN' },
    { label: 'NET ASSETS, MARCH 31, 2026',            section: 'NET ASSETS',              sort_order: 260, line_key: 'NET_ASSETS_END' },
];

async function isCrudLoad() {
    const y = parseInt(document.getElementById('isCrudYear').value, 10);
    const m = parseInt(document.getElementById('isCrudMonth').value, 10);
    const wrap = document.getElementById('isCrudFieldsGrid');
    wrap.innerHTML = '<div class="fs-loading-banner">Loading…</div>';
    try {
        const [rows, budgetRows] = await Promise.all([
            apiGet('income_statement_lines?report_year=eq.' + y + '&report_month=eq.' + m + '&order=sort_order.asc'),
            apiGet('income_statement_budgets?budget_year=eq.' + y + '&select=income_statement_line_id,id,budget_amount')
        ]);
        renderIsEditTable(rows, budgetRows, y, m);
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner">' + escapeHtml(e.message) + '</div>';
    }
}

function renderIsEditTable(rows, budgetRows, y, m) {
    const wrap = document.getElementById('isCrudFieldsGrid');

    // Build lookup maps
    const byLabel = {};
    rows.forEach(r => { byLabel[r.label] = r; });
    const budgetByLineId = {};
    (budgetRows || []).forEach(b => { budgetByLineId[b.income_statement_line_id] = b; });

    const thead = `<thead><tr>
        <th style="width:36%">LABEL</th>
        <th style="width:18%">SECTION</th>
        <th style="width:13%">TOTAL ${y}</th>
        <th style="width:13%">BUDGET ${y}</th>
        <th style="width:13%">TOTAL ${y - 1}</th>
        <th style="width:7%"></th>
    </tr></thead>`;

    const tbodyRows = IS_MASTER.map(master => {
        const r = byLabel[master.label];
        const dbId = r ? r.id : '';
        const t26 = r && r.total_2026 != null ? r.total_2026 : '';
        const t25 = r && r.total_2025 != null ? r.total_2025 : '';
        const budgetEntry = r ? budgetByLineId[r.id] : null;
        const budgetVal = budgetEntry ? budgetEntry.budget_amount : '';
        const budgetEntryId = budgetEntry ? budgetEntry.id : '';

        return `<tr data-is-id="${dbId}" data-is-lk="${escapeHtml(master.line_key)}" data-budget-id="${budgetEntryId}">
            <td><span class="is-edit-label-text">${escapeHtml(master.label)}</span></td>
            <td><span class="is-edit-label-text" style="font-size:0.7rem;color:rgba(238,243,255,0.45);">${escapeHtml(master.section)}</span></td>
            <td><input class="is-edit-input num" data-is-field="total_2026" type="text" inputmode="decimal" value="${t26}"/></td>
            <td><input class="is-edit-input num" data-is-field="budget" type="text" inputmode="decimal" value="${budgetVal}"/></td>
            <td><input class="is-edit-input num" data-is-field="total_2025" type="text" inputmode="decimal" value="${t25}"/></td>
            <td><button class="is-edit-save" onclick="isRowSave(this)">SAVE</button></td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `<div class="is-edit-scroll"><table class="is-edit-table">${thead}<tbody>${tbodyRows}</tbody></table></div>
        <button class="is-edit-save-all" onclick="isRowSaveAll()">&#10003; SAVE ALL</button>`;
}

async function isRowSave(btn) {
    const tr = btn.closest('tr');
    const rid = tr.getAttribute('data-is-id');
    const lk  = tr.getAttribute('data-is-lk');
    const y = parseInt(document.getElementById('isCrudYear').value, 10);
    const m = parseInt(document.getElementById('isCrudMonth').value, 10);

    const labelEl = tr.querySelector('.is-edit-label-text');
    const master  = IS_MASTER.find(x => x.line_key === lk);

    const body = {
        report_year:  y,
        report_month: m,
        label:        master ? master.label : (labelEl ? labelEl.textContent.trim() : ''),
        section:      master ? master.section : '',
        sort_order:   master ? master.sort_order : 0,
        line_key:     master ? master.line_key : lk,
        total_2026:   parseAmtField(tr.querySelector('[data-is-field="total_2026"]').value),
        total_2025:   parseAmtField(tr.querySelector('[data-is-field="total_2025"]').value)
    };

    const budgetAmt     = parseAmtField(tr.querySelector('[data-is-field="budget"]').value);
    const budgetEntryId = tr.getAttribute('data-budget-id');

    try {
        btn.disabled = true;
        let lineId = rid && rid !== '' ? parseInt(rid, 10) : null;

        if (lineId) {
            await apiPatch('income_statement_lines', lineId, body);
        } else {
            const ins = await apiPost('income_statement_lines', body);
            lineId = ins[0].id;
            tr.setAttribute('data-is-id', String(lineId));
        }

        // Save / update budget
        if (lineId && budgetAmt !== null) {
            if (budgetEntryId && budgetEntryId !== '') {
                await apiPatch('income_statement_budgets', budgetEntryId, { budget_amount: budgetAmt });
            } else {
                const ins = await apiPost('income_statement_budgets', {
                    income_statement_line_id: lineId,
                    budget_year: y,
                    budget_amount: budgetAmt
                });
                tr.setAttribute('data-budget-id', String(ins[0].id));
            }
        }

        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = 'SAVE'; }, 1200);

        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

function openIsCrud() {
    document.getElementById('isCrudOverlay').classList.remove('hidden');
    document.getElementById('isCrudModal').classList.remove('hidden');
    document.getElementById('isCrudYear').value  = String(displayYearCurrent);
    document.getElementById('isCrudMonth').value = String(dbMonthFromUi(currentMonthIndex));
    isCrudLoad();
}

function closeIsCrud() {
    document.getElementById('isCrudOverlay').classList.add('hidden');
    document.getElementById('isCrudModal').classList.add('hidden');
}

// stubs no longer needed but kept to avoid reference errors
function isCrudAddNew() {}
async function isCrudSaveAll() {}
async function isLineRowSave(btn) { return isRowSave(btn); }
async function isRowDelete(btn) {}
async function isLineRowDelete(btn) {}

async function isRowSaveAll() {
    const btn = document.querySelector('.is-edit-save-all');
    if (btn) { btn.disabled = true; btn.textContent = 'SAVING…'; }
    const rows = document.querySelectorAll('#isCrudFieldsGrid .is-edit-table tbody tr');
    const errors = [];
    for (const tr of rows) {
        const saveBtn = tr.querySelector('.is-edit-save');
        if (saveBtn) {
            try { await isRowSave(saveBtn); }
            catch (e) { errors.push(e.message); }
        }
    }
    if (btn) { btn.disabled = false; btn.textContent = errors.length ? 'ERRORS — CHECK ROWS' : '✓ ALL SAVED'; }
    setTimeout(() => { if (btn) btn.textContent = '✓ SAVE ALL'; }, 2000);
    if (errors.length) alert('Some rows failed:\n' + errors.join('\n'));
}

document.addEventListener('click', function (e) {
    const dd = document.getElementById('bsEditDropdown');
    if (dd && !dd.contains(e.target)) closeBsDropdown();
});

/* ─── Financial Indicator CRUD ───────────────────────────────────────────── */

const FI_MASTER = [
    { key: 'core_operating',        label: 'Operating Expenses',                      group: 'CORE EXPENSES' },
    { key: 'core_remittance',       label: 'Net Outgoing Remittance',                 group: 'CORE EXPENSES' },
    { key: 'current_assets',        label: 'Current Assets',                          group: 'WORKING CAPITAL' },
    { key: 'current_liabilities',   label: 'Current Liabilities',                     group: 'WORKING CAPITAL' },
    { key: 'donor_restriction',     label: 'Current Assets Held for Donor Restriction', group: 'WORKING CAPITAL' },
    { key: 'working_months',        label: 'Available Working Capital in Months',     group: 'WORKING CAPITAL' },
    { key: 'recommended_months_wc', label: 'Recommended Minimum WC (months)',         group: 'WORKING CAPITAL' },
    { key: 'cash',                  label: 'Cash and Cash Equivalents',               group: 'LIQUID ASSETS' },
    { key: 'held_for_agency',       label: 'Less: Held for Agency',                   group: 'LIQUID ASSETS' },
    { key: 'investments',           label: 'Investments',                             group: 'LIQUID ASSETS' },
    { key: 'liquid_months',         label: 'Available Liquid Assets in Months',       group: 'LIQUID ASSETS' },
    { key: 'recommended_months_la', label: 'Recommended Minimum LA (months)',         group: 'LIQUID ASSETS' },
];

let _fiRecordId = null;

function openFiCrud() {
    document.getElementById('fiCrudYear').value  = String(displayYearCurrent);
    document.getElementById('fiCrudMonth').value = String(dbMonthFromUi(currentMonthIndex));
    document.getElementById('fiCrudOverlay').classList.remove('hidden');
    document.getElementById('fiCrudModal').classList.remove('hidden');
    fiCrudLoad();
}

function closeFiCrud() {
    document.getElementById('fiCrudOverlay').classList.add('hidden');
    document.getElementById('fiCrudModal').classList.add('hidden');
}

async function fiCrudLoad() {
    const y = parseInt(document.getElementById('fiCrudYear').value, 10);
    const m = parseInt(document.getElementById('fiCrudMonth').value, 10);
    const wrap = document.getElementById('fiCrudFieldsGrid');
    wrap.innerHTML = '<div class="fs-loading-banner" style="margin:16px;">Loading…</div>';
    try {
        const rows = await apiGet('financial_indicator?report_year=eq.' + y + '&report_month=eq.' + m + '&limit=1');
        const rec = rows[0] || null;
        _fiRecordId = rec ? rec.id : null;
        renderFiEditTable(rec, y);
    } catch (e) {
        wrap.innerHTML = '<div class="fs-error-banner" style="margin:16px;">' + escapeHtml(e.message) + '</div>';
    }
}

function renderFiEditTable(rec, y) {
    const wrap = document.getElementById('fiCrudFieldsGrid');
    const yPrev = y - 1;

    // Group rows
    let lastGroup = '';
    const tbodyRows = FI_MASTER.map(f => {
        let groupHdr = '';
        if (f.group !== lastGroup) {
            lastGroup = f.group;
            groupHdr = `<tr class="fi-crud-group-row"><td colspan="3">${escapeHtml(f.group)}</td></tr>`;
        }
        const curKey  = f.key + '_' + y;
        const prevKey = f.key + '_' + yPrev;
        const curVal  = rec && rec[curKey]  != null ? rec[curKey]  : '';
        const prevVal = rec && rec[prevKey] != null ? rec[prevKey] : '';
        return groupHdr + `<tr data-fi-key="${escapeHtml(f.key)}">
            <td><span class="is-edit-label-text">${escapeHtml(f.label)}</span></td>
            <td><input class="is-edit-input num" data-fi-cur type="text" inputmode="decimal" value="${curVal}"/></td>
            <td><input class="is-edit-input num" data-fi-prev type="text" inputmode="decimal" value="${prevVal}"/></td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
        <div class="is-edit-scroll" style="max-height:60vh;">
            <table class="is-edit-table">
                <thead><tr>
                    <th style="width:46%">FIELD</th>
                    <th style="width:27%">CURRENT (${y})</th>
                    <th style="width:27%">PREVIOUS (${yPrev})</th>
                </tr></thead>
                <tbody>${tbodyRows}</tbody>
            </table>
        </div>
        <button class="is-edit-save-all" style="margin:12px 18px;width:calc(100% - 36px);" onclick="fiSaveAll()">&#10003; SAVE ALL</button>`;
}

async function fiSaveAll() {
    const btn = document.querySelector('#fiCrudFieldsGrid .is-edit-save-all');
    if (btn) { btn.disabled = true; btn.textContent = 'SAVING…'; }

    const y = parseInt(document.getElementById('fiCrudYear').value, 10);
    const m = parseInt(document.getElementById('fiCrudMonth').value, 10);
    const yPrev = y - 1;
    const body = { report_year: y, report_month: m };

    document.querySelectorAll('#fiCrudFieldsGrid tbody tr[data-fi-key]').forEach(tr => {
        const k    = tr.getAttribute('data-fi-key');
        const curV = parseAmtField(tr.querySelector('[data-fi-cur]').value);
        const preV = parseAmtField(tr.querySelector('[data-fi-prev]').value);
        body[k + '_' + y]     = curV;
        body[k + '_' + yPrev] = preV;
    });

    try {
        if (_fiRecordId) {
            await apiPatch('financial_indicator', _fiRecordId, body);
        } else {
            const ins = await apiPost('financial_indicator', body);
            _fiRecordId = ins[0].id;
        }
        if (btn) { btn.disabled = false; btn.textContent = '✓ ALL SAVED'; }
        setTimeout(() => { if (btn) btn.textContent = '✓ SAVE ALL'; }, 2000);
        if (y === displayYearCurrent && m === dbMonthFromUi(currentMonthIndex))
            await renderAll(uiMonthFromDb(m));
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'ERROR'; }
        alert(e.message);
    }
}

// stub kept for old HTML reference
async function fiCrudSave() { await fiSaveAll(); }

tickClock();
setInterval(tickClock, 1000);

renderAll(currentMonthIndex);
