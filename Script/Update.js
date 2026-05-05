const SUPABASE_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

let currentCategory = 'tithes';
let currentMission = null;
let missions = [];

// Per-mission table state
let allRows = [];
let modalMode = 'edit';
let editingId = null;
let filterYear = '';
let filterMonth = '';

// Summary table state
let allSummaryRows = [];
let summaryFilterYear = '';
let summaryFilterMonth = '';

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
};

async function supabase(path, options = {}) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers, ...options });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.statusText);
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') return null;
    return res.json();
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function loadMissions() {
    try {
        missions = await supabase('missions?select=id,code,name&order=id');
        renderMissionButtons();
        if (missions.length) selectMissionById(missions[0]);
        loadSummary();
    } catch (e) {
        document.getElementById('mission-buttons').innerHTML =
            '<span class="error-note">Failed to load missions: ' + e.message + '</span>';
    }
}

function renderMissionButtons() {
    const container = document.getElementById('mission-buttons');
    container.innerHTML = '';
    missions.forEach((m, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mission-btn' + (i === 0 ? ' active' : '');
        btn.textContent = m.code;
        btn.onclick = () => {
            document.querySelectorAll('.mission-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectMissionById(m);
        };
        container.appendChild(btn);
    });
}

function selectCategory(cat) {
    currentCategory = cat;
    document.getElementById('btn-tithes').classList.toggle('active', cat === 'tithes');
    document.getElementById('btn-offerings').classList.toggle('active', cat === 'offerings');
    document.getElementById('summary-title').textContent =
        (cat === 'tithes' ? 'Tithes' : 'Offerings') + ' — All Missions Summary';
    summaryFilterYear = '';
    summaryFilterMonth = '';
    filterYear = '';
    filterMonth = '';
    loadSummary();
    if (currentMission) loadData();
}

function selectMissionById(m) {
    currentMission = m;
    filterYear = '';
    filterMonth = '';
    loadData();
}

// ── Summary table ─────────────────────────────────────────────────────────────

async function loadSummary() {
    const area = document.getElementById('summary-table-area');
    area.innerHTML = '<p class="placeholder-note">Loading…</p>';
    try {
        // Fetch all rows for current category joined with mission info
        allSummaryRows = await supabase(
            currentCategory + '?select=year,month,amount,budget,missions(code,name)&order=year,month'
        );
        buildSummaryFilterDropdown();
        applySummaryFilter();
    } catch (e) {
        area.innerHTML = '<p class="error-note">Error: ' + e.message + '</p>';
    }
}

function buildSummaryFilterDropdown() {
    const years = [...new Set(allSummaryRows.map(r => r.year))].sort();
    const yearSel = document.getElementById('summary-filter-year');
    const monthSel = document.getElementById('summary-filter-month');

    yearSel.innerHTML = '<option value="">All Years</option>';
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (String(y) === String(summaryFilterYear)) opt.selected = true;
        yearSel.appendChild(opt);
    });

    monthSel.innerHTML = '<option value="">All Months</option>';
    MONTHS.slice(1).forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = name;
        if (String(i + 1) === String(summaryFilterMonth)) opt.selected = true;
        monthSel.appendChild(opt);
    });
}

function applySummaryFilter() {
    summaryFilterYear = document.getElementById('summary-filter-year').value;
    summaryFilterMonth = document.getElementById('summary-filter-month').value;

    let rows = allSummaryRows;
    if (summaryFilterYear) rows = rows.filter(r => String(r.year) === summaryFilterYear);
    if (summaryFilterMonth) rows = rows.filter(r => String(r.month) === summaryFilterMonth);

    // Aggregate totals per mission
    const totals = {};
    missions.forEach(m => {
        totals[m.code] = { name: m.name, amount: 0, budget: 0 };
    });
    rows.forEach(r => {
        const code = r.missions?.code;
        if (code && totals[code]) {
            totals[code].amount += Number(r.amount) || 0;
            totals[code].budget += Number(r.budget) || 0;
        }
    });

    renderSummaryTable(totals);
    updateSummaryFilterLabel();
}

function clearSummaryFilter() {
    summaryFilterYear = '';
    summaryFilterMonth = '';
    document.getElementById('summary-filter-year').value = '';
    document.getElementById('summary-filter-month').value = '';
    applySummaryFilter();
}

function toggleSummaryFilter() {
    document.getElementById('summary-filter-dropdown').classList.toggle('open');
}

function updateSummaryFilterLabel() {
    const btn = document.getElementById('summary-filter-btn');
    const parts = [];
    if (summaryFilterYear) parts.push(summaryFilterYear);
    if (summaryFilterMonth) parts.push(MONTHS[parseInt(summaryFilterMonth)]);
    btn.classList.toggle('filter-active', parts.length > 0);
    document.getElementById('summary-filter-label').textContent = parts.length ? parts.join(' · ') : 'Filter';
}

function renderSummaryTable(totals) {
    const area = document.getElementById('summary-table-area');
    const label = currentCategory === 'tithes' ? 'Tithes' : 'Offerings';

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Mission</th>
                <th>Full Name</th>
                <th>Total Amount</th>
                <th>Total Budget</th>
                <th>Variance</th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');
    let grandAmount = 0, grandBudget = 0;

    Object.entries(totals).forEach(([code, data]) => {
        const variance = data.amount - data.budget;
        grandAmount += data.amount;
        grandBudget += data.budget;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="mission-tag">${code}</span></td>
            <td>${data.name}</td>
            <td>${fmt(data.amount)}</td>
            <td>${fmt(data.budget)}</td>
            <td class="${variance >= 0 ? 'variance-pos' : 'variance-neg'}">${variance >= 0 ? '+' : ''}${fmt(variance)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Grand total row
    const grandVariance = grandAmount - grandBudget;
    const totalTr = document.createElement('tr');
    totalTr.className = 'total-row';
    totalTr.innerHTML = `
        <td colspan="2">Grand Total</td>
        <td>${fmt(grandAmount)}</td>
        <td>${fmt(grandBudget)}</td>
        <td class="${grandVariance >= 0 ? 'variance-pos' : 'variance-neg'}">${grandVariance >= 0 ? '+' : ''}${fmt(grandVariance)}</td>
    `;
    tbody.appendChild(totalTr);
    table.appendChild(tbody);
    area.innerHTML = '';
    area.appendChild(table);
}

// ── Per-mission table ─────────────────────────────────────────────────────────

async function loadData() {
    const title = document.getElementById('update-title');
    const subtitle = document.getElementById('update-subtitle');
    const area = document.getElementById('table-area');
    const addBtn = document.getElementById('add-row-btn');
    const filterBtn = document.getElementById('filter-btn');

    const label = currentCategory === 'tithes' ? 'Tithes' : 'Offerings';
    title.textContent = label + ' — ' + currentMission.code;
    subtitle.textContent = currentMission.name;
    area.innerHTML = '<p class="placeholder-note">Loading…</p>';
    addBtn.style.display = 'none';
    filterBtn.style.display = 'none';

    try {
        allRows = await supabase(
            currentCategory + '?mission_id=eq.' + currentMission.id +
            '&select=id,year,month,amount,budget&order=year,month'
        );
        addBtn.style.display = '';
        filterBtn.style.display = '';
        buildFilterDropdown();
        applyFilter();
    } catch (e) {
        area.innerHTML = '<p class="error-note">Error: ' + e.message + '</p>';
    }
}

function buildFilterDropdown() {
    const years = [...new Set(allRows.map(r => r.year))].sort();
    const yearSel = document.getElementById('filter-year');
    const monthSel = document.getElementById('filter-month');

    yearSel.innerHTML = '<option value="">All Years</option>';
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (String(y) === String(filterYear)) opt.selected = true;
        yearSel.appendChild(opt);
    });

    monthSel.innerHTML = '<option value="">All Months</option>';
    MONTHS.slice(1).forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = name;
        if (String(i + 1) === String(filterMonth)) opt.selected = true;
        monthSel.appendChild(opt);
    });
}

function applyFilter() {
    filterYear = document.getElementById('filter-year').value;
    filterMonth = document.getElementById('filter-month').value;

    let rows = allRows;
    if (filterYear) rows = rows.filter(r => String(r.year) === filterYear);
    if (filterMonth) rows = rows.filter(r => String(r.month) === filterMonth);

    renderTable(rows);
    updateFilterLabel();
}

function clearFilter() {
    filterYear = '';
    filterMonth = '';
    document.getElementById('filter-year').value = '';
    document.getElementById('filter-month').value = '';
    applyFilter();
}

function toggleFilterDropdown() {
    document.getElementById('filter-dropdown').classList.toggle('open');
}

function updateFilterLabel() {
    const btn = document.getElementById('filter-btn');
    const parts = [];
    if (filterYear) parts.push(filterYear);
    if (filterMonth) parts.push(MONTHS[parseInt(filterMonth)]);
    btn.classList.toggle('filter-active', parts.length > 0);
    btn.querySelector('.filter-label').textContent = parts.length ? parts.join(' · ') : 'Filter';
}

function renderTable(rows) {
    const area = document.getElementById('table-area');
    if (!rows.length) {
        area.innerHTML = '<p class="placeholder-note">No entries found for the selected filter.</p>';
        return;
    }
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `
        <thead>
            <tr><th>Year</th><th>Month</th><th>Amount</th><th>Budget</th><th>Actions</th></tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.year}</td>
            <td>${MONTHS[row.month]}</td>
            <td>${row.amount != null ? fmt(row.amount) : '—'}</td>
            <td>${row.budget != null ? fmt(row.budget) : '—'}</td>
            <td class="action-cell">
                <button class="row-edit-btn" onclick="openEditModal(${row.id},${row.year},${row.month},${row.amount ?? 0},${row.budget ?? 0})">Edit</button>
                <button class="row-delete-btn" onclick="deleteRow(${row.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    area.innerHTML = '';
    area.appendChild(table);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openEditModal(id, year, month, amount, budget) {
    modalMode = 'edit';
    editingId = id;
    document.getElementById('modal-title').textContent = 'Edit Entry';
    document.getElementById('f-year').value = year;
    document.getElementById('f-month').value = month;
    document.getElementById('f-amount').value = amount;
    document.getElementById('f-budget').value = budget;
    document.getElementById('modal-error').textContent = '';
    document.getElementById('modal').style.display = 'flex';
}

function openAddModal() {
    modalMode = 'add';
    editingId = null;
    document.getElementById('modal-title').textContent = 'Add Entry';
    document.getElementById('f-year').value = new Date().getFullYear();
    document.getElementById('f-month').value = new Date().getMonth() + 1;
    document.getElementById('f-amount').value = '';
    document.getElementById('f-budget').value = '';
    document.getElementById('modal-error').textContent = '';
    document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

async function saveModal() {
    const year = parseInt(document.getElementById('f-year').value);
    const month = parseInt(document.getElementById('f-month').value);
    const amount = parseFloat(document.getElementById('f-amount').value) || null;
    const budget = parseFloat(document.getElementById('f-budget').value) || null;
    const errEl = document.getElementById('modal-error');
    const saveBtn = document.getElementById('modal-save-btn');

    if (!year || !month) { errEl.textContent = 'Year and month are required.'; return; }

    if (modalMode === 'add') {
        const duplicate = allRows.find(r => r.year === year && r.month === month);
        if (duplicate) {
            errEl.textContent = MONTHS[month] + ' ' + year + ' already exists for ' + currentMission.code + '. Use Edit to update it.';
            return;
        }
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving…';
    errEl.textContent = '';

    try {
        if (modalMode === 'edit') {
            await supabase(currentCategory + '?id=eq.' + editingId, {
                method: 'PATCH',
                body: JSON.stringify({ year, month, amount, budget })
            });
        } else {
            await supabase(currentCategory, {
                method: 'POST',
                body: JSON.stringify({ mission_id: currentMission.id, year, month, amount, budget })
            });
        }
        closeModal();
        loadData();
        loadSummary();
    } catch (e) {
        errEl.textContent = 'Save failed: ' + e.message;
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '&#10003; Save';
    }
}

async function deleteRow(id) {
    if (!confirm('Delete this entry?')) return;
    try {
        await supabase(currentCategory + '?id=eq.' + id, { method: 'DELETE' });
        loadData();
        loadSummary();
    } catch (e) {
        alert('Delete failed: ' + e.message);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
    return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

// Close dropdowns when clicking outside
document.addEventListener('click', function (e) {
    ['filter-wrapper', 'summary-filter-wrapper'].forEach(id => {
        const wrapper = document.getElementById(id);
        const dropdown = wrapper?.querySelector('.filter-dropdown');
        if (wrapper && dropdown && !wrapper.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });
});

loadMissions();
