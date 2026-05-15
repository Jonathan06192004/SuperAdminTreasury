const SUPABASE_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

const HDR = () => ({
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
});

let currentTab = 'tithes';
let currentMission = null;
let missions = [];
let allRows = [];
let modalMode = 'add';
let editingId = null;

function table() { return currentTab === 'tithes' ? 'dup-tithes' : 'dup-offerings'; }

async function apiFetch(path) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: HDR() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function apiPost(t, body) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + t, { method: 'POST', headers: HDR(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function apiPatch(t, id, body) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + t + '?id=eq.' + id, { method: 'PATCH', headers: HDR(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
}

async function apiDelete(t, id) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + t + '?id=eq.' + id, { method: 'DELETE', headers: HDR() });
    if (!res.ok) throw new Error(await res.text());
}

function fmt(n) {
    if (n == null) return '—';
    return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    try {
        missions = await apiFetch('dup-mission?select=id,code,name&order=id');
        renderMissionButtons();
        buildSummaryYearFilter();
        loadSummary();
        if (missions.length) selectMission(missions[0]);
    } catch (e) {
        document.getElementById('missionRow').innerHTML = '<p class="ud-error">Failed to load missions: ' + e.message + '</p>';
    }
}

function renderMissionButtons() {
    const row = document.getElementById('missionRow');
    row.innerHTML = '';
    missions.forEach((m, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ud-mission-btn' + (i === 0 ? ' active' : '');
        btn.innerHTML = '<span class="ud-mission-code">' + m.code + '</span><span class="ud-mission-name">' + m.name + '</span>';
        btn.onclick = () => {
            document.querySelectorAll('.ud-mission-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectMission(m);
        };
        row.appendChild(btn);
    });
}

function selectMission(m) {
    currentMission = m;
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '';
    loadData();
}

// ── Summary ───────────────────────────────────────────────────────────────────

async function buildSummaryYearFilter() {
    try {
        const rows = await apiFetch(table() + '?select=year&order=year.asc');
        const years = [...new Set(rows.map(r => r.year))];
        const sel = document.getElementById('summaryYear');
        sel.innerHTML = '<option value="">All Years</option>' + years.map(y => '<option value="' + y + '">' + y + '</option>').join('');
    } catch (_) {}
}

async function loadSummary() {
    document.getElementById('summaryTitle').textContent =
        (currentTab === 'tithes' ? 'Tithes' : 'Offerings') + ' — All Missions';
    const area = document.getElementById('summaryArea');
    area.innerHTML = '<p class="ud-loading">Loading…</p>';

    const year  = document.getElementById('summaryYear').value;
    const month = document.getElementById('summaryMonth').value;

    let q = table() + '?select=mission_code,amount,budget,year,month';
    if (year)  q += '&year=eq.' + year;
    if (month) q += '&month=eq.' + month;

    try {
        const rows = await apiFetch(q);
        const totals = {};
        missions.forEach(m => { totals[m.code] = { name: m.name, amount: 0, budget: 0 }; });
        rows.forEach(r => {
            if (totals[r.mission_code]) {
                totals[r.mission_code].amount += Number(r.amount) || 0;
                totals[r.mission_code].budget += Number(r.budget) || 0;
            }
        });

        let grandAmt = 0, grandBgt = 0;
        const tbody = Object.entries(totals).map(([code, d]) => {
            const v = d.amount - d.budget;
            grandAmt += d.amount; grandBgt += d.budget;
            return `<tr>
                <td><span class="ud-code-tag">${code}</span></td>
                <td>${d.name}</td>
                <td class="ud-num">${fmt(d.amount)}</td>
                <td class="ud-num">${fmt(d.budget)}</td>
                <td class="ud-num ${v >= 0 ? 'ud-pos' : 'ud-neg'}">${v >= 0 ? '+' : ''}${fmt(v)}</td>
            </tr>`;
        }).join('');

        const gv = grandAmt - grandBgt;
        area.innerHTML = `<div class="ud-table-wrap"><table class="ud-table">
            <thead><tr><th>Code</th><th>Mission</th><th>Total Amount</th><th>Total Budget</th><th>Variance</th></tr></thead>
            <tbody>${tbody}
                <tr class="ud-total-row">
                    <td colspan="2">Grand Total</td>
                    <td class="ud-num">${fmt(grandAmt)}</td>
                    <td class="ud-num">${fmt(grandBgt)}</td>
                    <td class="ud-num ${gv >= 0 ? 'ud-pos' : 'ud-neg'}">${gv >= 0 ? '+' : ''}${fmt(gv)}</td>
                </tr>
            </tbody>
        </table></div>`;
    } catch (e) {
        area.innerHTML = '<p class="ud-error">Error: ' + e.message + '</p>';
    }
}

// ── Per-mission data ──────────────────────────────────────────────────────────

async function loadData() {
    if (!currentMission) return;
    document.getElementById('tableTitle').textContent =
        (currentTab === 'tithes' ? 'Tithes' : 'Offerings') + ' — ' + currentMission.code;
    document.getElementById('tableSubtitle').textContent = currentMission.name;
    document.getElementById('addBtn').style.display = '';
    document.getElementById('tableArea').innerHTML = '<p class="ud-loading">Loading…</p>';

    try {
        allRows = await apiFetch(
            table() + '?mission_code=eq.' + encodeURIComponent(currentMission.code) +
            '&select=id,mission_code,year,month,amount,budget,status&order=year.asc,month.asc'
        );
        buildYearFilter();
        applyFilter();
    } catch (e) {
        document.getElementById('tableArea').innerHTML = '<p class="ud-error">Error: ' + e.message + '</p>';
    }
}

function buildYearFilter() {
    const years = [...new Set(allRows.map(r => r.year))].sort();
    const sel = document.getElementById('filterYear');
    sel.innerHTML = '<option value="">All Years</option>' + years.map(y => '<option value="' + y + '">' + y + '</option>').join('');
}

function applyFilter() {
    const year  = document.getElementById('filterYear').value;
    const month = document.getElementById('filterMonth').value;
    let rows = allRows;
    if (year)  rows = rows.filter(r => String(r.year) === year);
    if (month) rows = rows.filter(r => String(r.month) === month);
    renderTable(rows);
}

function renderTable(rows) {
    const area = document.getElementById('tableArea');
    if (!rows.length) {
        area.innerHTML = '<p class="ud-placeholder">No entries found.</p>';
        return;
    }
    const tbody = rows.map(r => `
        <tr>
            <td>${r.year}</td>
            <td>${MONTHS[r.month]}</td>
            <td class="ud-num">${fmt(r.amount)}</td>
            <td class="ud-num">${fmt(r.budget)}</td>
            <td><span class="ud-status-badge ud-status-${r.status}">${r.status}</span></td>
            <td class="ud-action-cell">
                <button class="ud-btn-edit" onclick="openEditModal(${r.id})">&#9998; Edit</button>
                <button class="ud-btn-delete" onclick="deleteRow(${r.id})">&#128465; Delete</button>
            </td>
        </tr>`).join('');

    area.innerHTML = `<div class="ud-table-wrap"><table class="ud-table">
        <thead><tr><th>Year</th><th>Month</th><th>Amount</th><th>Budget</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${tbody}</tbody>
    </table></div>`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openAddModal() {
    modalMode = 'add';
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Add Entry';
    document.getElementById('f-mission').value = currentMission.code;
    document.getElementById('f-year').value = new Date().getFullYear();
    document.getElementById('f-month').value = new Date().getMonth() + 1;
    document.getElementById('f-amount').value = '';
    document.getElementById('f-budget').value = '';
    document.getElementById('f-status').value = 'confirmed';
    document.getElementById('modalError').textContent = '';
    document.getElementById('modal').style.display = 'flex';
}

function openEditModal(id) {
    const r = allRows.find(r => r.id === id);
    if (!r) return;
    modalMode = 'edit';
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Entry';
    document.getElementById('f-mission').value = r.mission_code;
    document.getElementById('f-year').value = r.year;
    document.getElementById('f-month').value = r.month;
    document.getElementById('f-amount').value = r.amount ?? '';
    document.getElementById('f-budget').value = r.budget ?? '';
    document.getElementById('f-status').value = r.status ?? 'confirmed';
    document.getElementById('modalError').textContent = '';
    document.getElementById('modal').style.display = 'flex';
}

function closeModal() { document.getElementById('modal').style.display = 'none'; }

async function saveModal() {
    const year   = parseInt(document.getElementById('f-year').value);
    const month  = parseInt(document.getElementById('f-month').value);
    const amount = parseFloat(document.getElementById('f-amount').value) || null;
    const budget = parseFloat(document.getElementById('f-budget').value) || null;
    const status = document.getElementById('f-status').value;
    const errEl  = document.getElementById('modalError');
    const btn    = document.getElementById('modalSaveBtn');

    if (!year || !month) { errEl.textContent = 'Year and month are required.'; return; }

    if (modalMode === 'add') {
        const dup = allRows.find(r => r.year === year && r.month === month);
        if (dup) { errEl.textContent = MONTHS[month] + ' ' + year + ' already exists. Use Edit to update it.'; return; }
    }

    btn.disabled = true; btn.textContent = 'Saving…';
    errEl.textContent = '';

    try {
        const body = { mission_code: currentMission.code, year, month, amount, budget, status };
        if (modalMode === 'add') {
            await apiPost(table(), body);
        } else {
            await apiPatch(table(), editingId, body);
        }
        closeModal();
        await loadData();
        await loadSummary();
    } catch (e) {
        errEl.textContent = 'Save failed: ' + e.message;
    } finally {
        btn.disabled = false; btn.textContent = '✓ Save';
    }
}

async function deleteRow(id) {
    const r = allRows.find(r => r.id === id);
    if (!confirm('Delete ' + MONTHS[r?.month] + ' ' + r?.year + '? This cannot be undone.')) return;
    try {
        await apiDelete(table(), id);
        await loadData();
        await loadSummary();
    } catch (e) { alert('Delete failed: ' + e.message); }
}

// ── Tab switch ────────────────────────────────────────────────────────────────

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-tithes').classList.toggle('active', tab === 'tithes');
    document.getElementById('tab-offerings').classList.toggle('active', tab === 'offerings');
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '';
    buildSummaryYearFilter();
    loadSummary();
    if (currentMission) loadData();
}

init();
