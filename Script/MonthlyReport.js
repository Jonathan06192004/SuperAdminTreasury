const SUPABASE_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';

const MONTH_NAMES = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

const GROUPS = [
    {
        key: 'missions', label: 'Missions / Conferences', cls: 'missions',
        institutions: [
            { key: 'CMM',  name: 'CENTRAL MINDANAO MISSION' },
            { key: 'NCMC', name: 'NORTH CENTRAL MINDANAO CONFERENCE' },
            { key: 'NMM',  name: 'NORTHEASTERN MINDANAO MISSION' },
            { key: 'WMC',  name: 'WESTERN MINDANAO CONFERENCE' },
            { key: 'ZPM',  name: 'ZAMBOANGA PENINSULA MISSION' },
        ]
    },
    {
        key: 'medical', label: 'Medical Centers', cls: 'medical',
        institutions: [
            { key: 'AMC-ILIGAN',   name: 'ADVENTIST MEDICAL CENTER-ILIGAN' },
            { key: 'AMC-VALENCIA', name: 'ADVENTIST MEDICAL CENTER-VALENCIA' },
            { key: 'ADV HOSP-GINGOOG', name: 'ADVENTIST HOSPITAL-GINGOOG' },
        ]
    },
    {
        key: 'educational', label: 'Educational', cls: 'educational',
        institutions: [
            { key: 'MVC',      name: 'MOUNTAIN VIEW COLLEGE' },
            { key: 'AMC COLLEGE', name: 'AMC COLLEGE-ILIGAN' },
            { key: 'WMAA',     name: 'WESTERN MINDANAO ADV ACADEMY' },
            { key: 'MMA',      name: 'MINDANAO MISSION ACADEMY' },
            { key: 'MVC ACAD', name: 'MVC ACADEMY' },
            { key: 'NMA',      name: 'NORTHEASTERN MINDANAO ACADEMY' },
            { key: 'LVA',      name: 'LAKE VIEW ACADEMY' },
            { key: 'CAA',      name: 'CALDWEN ADVENTIST ACADEMY' },
        ]
    },
    {
        key: 'other', label: 'Other Institutions', cls: 'other',
        institutions: [
            { key: 'SULADS',   name: 'SULADS' },
            { key: 'LMS',      name: 'LITERATURE MINISTRY SEMINARY' },
            { key: 'HOPE CH.', name: 'HOPE CHANNEL-SOUTH PHILIPPINES' },
            { key: 'SAPD',     name: 'SOUTHERN ASIA PACIFIC DIVISION' },
            { key: 'SEPU',     name: 'SOUTHEASTERN PHILIPPINE UNION' },
        ]
    },
];

let mrScale = 1;

async function loadReport() {
    const year  = parseInt(document.getElementById('mrYear').value);
    const month = parseInt(document.getElementById('mrMonth').value);
    const label = `${MONTH_NAMES[month].toUpperCase()} ${year}`;

    document.getElementById('mrPeriodBadge').textContent = label;

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/monthly_report?year=eq.${year}&month=eq.${month}&order=sort_order.asc`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await res.json();

    renderInstList();
    renderTable(rows);
}

function renderTable(rows) {
    const tbody = document.getElementById('mrTableBody');
    tbody.innerHTML = '';

    GROUPS.forEach(g => {
        // group header row spanning all 8 columns
        const ghdr = document.createElement('tr');
        ghdr.className = `mr-group-row mr-group-row--${g.cls}`;
        ghdr.innerHTML = `<td colspan="8" class="mr-group-row-label">${g.label}</td>`;
        tbody.appendChild(ghdr);

        g.institutions.forEach(inst => {
            const r = rows.find(row =>
                row.institution_key === inst.key ||
                row.institution_name?.toUpperCase() === inst.name
            );
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mr-td-inst">${inst.name}</td>
                <td>${r ? fmtDate(r.fs_date_received)   : '<span class="mr-empty-cell">—</span>'}</td>
                <td>${r ? fmtNum(r.working_capital)      : '<span class="mr-empty-cell">—</span>'}</td>
                <td>${r ? fmtNum(r.liquidity)            : '<span class="mr-empty-cell">—</span>'}</td>
                <td>${r ? fmtDate(r.tr_date_received)    : '<span class="mr-empty-cell">—</span>'}</td>
                <td>${r ? fmtNum(r.remittance)           : '<span class="mr-empty-cell">—</span>'}</td>
                <td>${r ? fmtDate(r.recon_date_received) : '<span class="mr-empty-cell">—</span>'}</td>
                <td>${r ? fmtNum(r.outstanding)          : '<span class="mr-empty-cell">—</span>'}</td>
            `;
            tbody.appendChild(tr);
        });
    });
}


function fmtDate(val) {
    if (!val) return '<span class="mr-empty-cell">—</span>';
    const d = new Date(val);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtNum(val) {
    if (val === null || val === undefined || val === '') return '<span class="mr-empty-cell">—</span>';
    const n = parseFloat(val);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mrZoom(dir) {
    mrScale = Math.min(1.5, Math.max(0.5, mrScale + dir * 0.1));
    document.getElementById('mrZoomOuter').style.transform = `scale(${mrScale})`;
    document.getElementById('mrZoomLabel').textContent = Math.round(mrScale * 100) + '%';
}

// Clock
function tickClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const date = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('mrClockTime').textContent    = time;
    document.getElementById('mrClockWeekday').textContent = weekday;
    document.getElementById('mrClockDate').textContent    = date;
}

/* ── CRUD Modal ─────────────────────────────────────────────────────────── */

const MR_HDR = () => ({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
});

function openMrCrud() {
    const y = parseInt(document.getElementById('mrYear').value);
    const m = parseInt(document.getElementById('mrMonth').value);
    document.getElementById('mrCrudYear').value  = y;
    document.getElementById('mrCrudMonth').value = m;
    document.getElementById('mrCrudOverlay').classList.remove('hidden');
    document.getElementById('mrCrudModal').classList.remove('hidden');
    mrCrudLoad();
}

function closeMrCrud() {
    document.getElementById('mrCrudOverlay').classList.add('hidden');
    document.getElementById('mrCrudModal').classList.add('hidden');
}

async function mrCrudLoad() {
    const y = parseInt(document.getElementById('mrCrudYear').value);
    const m = parseInt(document.getElementById('mrCrudMonth').value);
    const tbody = document.getElementById('mrCrudBody');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:rgba(238,243,255,0.4)">Loading…</td></tr>';
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/monthly_report?year=eq.${y}&month=eq.${m}&order=sort_order.asc`,
        { headers: MR_HDR() }
    );
    const rows = await res.json();
    const byKey = {};
    rows.forEach(r => { byKey[r.institution_key] = r; });
    renderMrCrudTable(byKey, y, m);
}

function renderMrCrudTable(byKey, y, m) {
    const tbody = document.getElementById('mrCrudBody');
    tbody.innerHTML = '';
    GROUPS.forEach(g => {
        // group header
        const ghdr = document.createElement('tr');
        ghdr.className = `mr-crud-group-row mr-crud-group--${g.cls}`;
        ghdr.innerHTML = `<td colspan="9">${g.label}</td>`;
        tbody.appendChild(ghdr);

        g.institutions.forEach(inst => {
            const r = byKey[inst.key] || null;
            const dbId = r ? r.id : '';
            const tr = document.createElement('tr');
            tr.setAttribute('data-mr-id', dbId);
            tr.setAttribute('data-mr-key', inst.key);
            tr.setAttribute('data-mr-name', inst.name);
            tr.setAttribute('data-mr-group', g.key);
            tr.innerHTML = `
                <td class="mr-crud-td-inst">${inst.name}</td>
                <td><input class="mr-crud-input" data-f="fs_date_received" type="date" value="${r?.fs_date_received || ''}"/></td>
                <td><input class="mr-crud-input num" data-f="working_capital" type="text" inputmode="decimal" value="${r?.working_capital ?? ''}"/></td>
                <td><input class="mr-crud-input num" data-f="liquidity" type="text" inputmode="decimal" value="${r?.liquidity ?? ''}"/></td>
                <td><input class="mr-crud-input" data-f="tr_date_received" type="date" value="${r?.tr_date_received || ''}"/></td>
                <td><input class="mr-crud-input num" data-f="remittance" type="text" inputmode="decimal" value="${r?.remittance ?? ''}"/></td>
                <td><input class="mr-crud-input" data-f="recon_date_received" type="date" value="${r?.recon_date_received || ''}"/></td>
                <td><input class="mr-crud-input num" data-f="outstanding" type="text" inputmode="decimal" value="${r?.outstanding ?? ''}"/></td>
                <td><button class="mr-crud-save-row" onclick="mrRowSave(this)">SAVE</button></td>
            `;
            tbody.appendChild(tr);
        });
    });
}

function mrParseNum(v) {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
}

function mrParseDate(v) {
    return v && v.trim() !== '' ? v.trim() : null;
}

async function mrRowSave(btn) {
    const tr  = btn.closest('tr');
    const rid = tr.getAttribute('data-mr-id');
    const y   = parseInt(document.getElementById('mrCrudYear').value);
    const m   = parseInt(document.getElementById('mrCrudMonth').value);

    const body = {
        year:  y, month: m,
        institution_key:   tr.getAttribute('data-mr-key'),
        institution_name:  tr.getAttribute('data-mr-name'),
        institution_group: tr.getAttribute('data-mr-group'),
        fs_date_received:   mrParseDate(tr.querySelector('[data-f="fs_date_received"]').value),
        working_capital:    mrParseNum(tr.querySelector('[data-f="working_capital"]').value),
        liquidity:          mrParseNum(tr.querySelector('[data-f="liquidity"]').value),
        tr_date_received:   mrParseDate(tr.querySelector('[data-f="tr_date_received"]').value),
        remittance:         mrParseNum(tr.querySelector('[data-f="remittance"]').value),
        recon_date_received:mrParseDate(tr.querySelector('[data-f="recon_date_received"]').value),
        outstanding:        mrParseNum(tr.querySelector('[data-f="outstanding"]').value),
    };

    // derive sort_order from master list position
    let sortIdx = 0;
    GROUPS.forEach((g, gi) => g.institutions.forEach((inst, ii) => {
        if (inst.key === body.institution_key) sortIdx = gi * 100 + ii + 1;
    }));
    body.sort_order = sortIdx;

    try {
        btn.disabled = true;
        let newId;
        if (rid && rid !== '') {
            await fetch(`${SUPABASE_URL}/rest/v1/monthly_report?id=eq.${rid}`, {
                method: 'PATCH', headers: MR_HDR(), body: JSON.stringify(body)
            });
        } else {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/monthly_report`, {
                method: 'POST', headers: MR_HDR(), body: JSON.stringify(body)
            });
            const ins = await res.json();
            newId = ins[0]?.id;
            if (newId) tr.setAttribute('data-mr-id', String(newId));
        }
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = 'SAVE'; }, 1200);
        // refresh view table
        const year  = parseInt(document.getElementById('mrYear').value);
        const month = parseInt(document.getElementById('mrMonth').value);
        if (y === year && m === month) loadReport();
    } catch(e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function mrSaveAll() {
    const btn = document.querySelector('.mr-crud-save-all');
    if (btn) { btn.disabled = true; btn.textContent = 'SAVING…'; }
    const rows = document.querySelectorAll('#mrCrudBody tr[data-mr-key]');
    const errors = [];
    for (const tr of rows) {
        const saveBtn = tr.querySelector('.mr-crud-save-row');
        if (saveBtn) try { await mrRowSave(saveBtn); } catch(e) { errors.push(e.message); }
    }
    if (btn) { btn.disabled = false; btn.textContent = errors.length ? 'ERRORS' : '✓ ALL SAVED'; }
    setTimeout(() => { if (btn) btn.textContent = '✓ SAVE ALL'; }, 2000);
    if (errors.length) alert('Some rows failed:\n' + errors.join('\n'));
}

// Init
loadReport();
tickClock();
setInterval(tickClock, 1000);
