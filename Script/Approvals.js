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
let allRows = [];
let groupedRows = []; // aggregated per mission+month
let selectedKeys = new Set(); // key = missionCode|year|month

async function apiFetch(path) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: HDR() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function apiPatch(table, id, body) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id, {
        method: 'PATCH', headers: HDR(), body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
}

function fmt(n) {
    if (n == null) return '—';
    return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

// ── Load ──────────────────────────────────────────────────────────────────────

// Group raw rows into aggregated mission+month totals
function buildGrouped(rows) {
    const map = {};
    rows.forEach(r => {
        const code = r.churches?.districts?.missions?.code || '—';
        const name = r.churches?.districts?.missions?.name || '';
        const key  = code + '|' + r.year + '|' + r.month;
        if (!map[key]) map[key] = { key, code, name, year: r.year, month: r.month, totalAmount: 0, totalBudget: 0, ids: [], districtIds: new Set() };
        map[key].totalAmount += Number(r.amount) || 0;
        map[key].totalBudget += Number(r.budget) || 0;
        map[key].ids.push(r.id);
        if (r.churches?.district_id) map[key].districtIds.add(r.churches.district_id);
    });
    return Object.values(map).map(g => ({ ...g, districtCount: g.districtIds.size })).sort((a, b) =>
        a.code.localeCompare(b.code) || a.year - b.year || a.month - b.month
    );
}

async function loadAll() {
    document.getElementById('apvTableWrap').innerHTML = '<p class="apv-loading">Loading…</p>';
    selectedKeys.clear();
    updateBulkBar();

    try {
        allRows = await apiFetch(
            currentTab + '?status=eq.pending' +
            '&select=id,year,month,amount,budget,churches!inner(district_id,districts!inner(missions!inner(code,name)))' +
            '&order=year.asc,month.asc'
        );

        const rejRows = await apiFetch(currentTab + '?status=eq.rejected&select=id');

        groupedRows = buildGrouped(allRows);

        document.getElementById('statPending').textContent = groupedRows.length;
        document.getElementById('statConfirmed').textContent = '—';
        document.getElementById('statRejected').textContent = rejRows.length;

        const badge = document.getElementById('navPendingBadge');
        if (groupedRows.length > 0) {
            badge.textContent = groupedRows.length;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }

        buildMissionFilter();
        buildYearFilter();
        applyFilters();
    } catch (e) {
        document.getElementById('apvTableWrap').innerHTML =
            '<p class="apv-error">Failed to load: ' + e.message + '</p>';
    }
}

function buildMissionFilter() {
    const sel = document.getElementById('filterMission');
    const codes = [...new Set(groupedRows.map(r => r.code))].sort();
    sel.innerHTML = '<option value="">All Missions</option>' +
        codes.map(c => '<option value="' + c + '">' + c + '</option>').join('');
}

function buildYearFilter() {
    const sel = document.getElementById('filterYear');
    const years = [...new Set(groupedRows.map(r => r.year))].sort();
    sel.innerHTML = '<option value="">All Years</option>' +
        years.map(y => '<option value="' + y + '">' + y + '</option>').join('');
}

function applyFilters() {
    const mission = document.getElementById('filterMission').value;
    const year    = document.getElementById('filterYear').value;
    const month   = document.getElementById('filterMonth').value;

    let rows = groupedRows;
    if (mission) rows = rows.filter(r => r.code === mission);
    if (year)    rows = rows.filter(r => String(r.year) === year);
    if (month)   rows = rows.filter(r => String(r.month) === month);

    renderTable(rows);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderTable(rows) {
    const wrap = document.getElementById('apvTableWrap');
    document.getElementById('tableTitle').textContent =
        'Pending ' + (currentTab === 'tithes' ? 'Tithes' : 'Offerings');

    if (!rows.length) {
        wrap.innerHTML = '<p class="apv-empty">&#10003; No pending submissions. All clear!</p>';
        return;
    }

    const thead = `<thead><tr>
        <th><input type="checkbox" id="checkAll" onchange="toggleCheckAll(this)" /></th>
        <th>Mission</th>
        <th>Period</th>
        <th>Total Amount</th>
        <th>Total Budget</th>
        <th>Districts</th>
        <th>Churches</th>
        <th>Actions</th>
    </tr></thead>`;

    const tbody = rows.map(r => {
        const period  = MONTHS[r.month] + ' ' + r.year;
        const checked = selectedKeys.has(r.key) ? 'checked' : '';

        return `<tr data-key="${r.key}">
            <td><input type="checkbox" class="row-check" value="${r.key}" ${checked} onchange="toggleRowCheck(this)" /></td>
            <td><span class="apv-mission-tag">${r.code}</span><span class="apv-mission-name">${r.name}</span></td>
            <td class="apv-period">${period}</td>
            <td class="apv-amount">${fmt(r.totalAmount)}</td>
            <td class="apv-budget">${fmt(r.totalBudget)}</td>
            <td class="apv-district-count">${r.districtCount} district${r.districtCount !== 1 ? 's' : ''}</td>
            <td class="apv-church-count">${r.ids.length} church${r.ids.length !== 1 ? 'es' : ''}</td>
            <td class="apv-actions">
                <button class="apv-btn-confirm" onclick="confirmGroup('${r.key}')">&#10003; Confirm</button>
                <button class="apv-btn-reject"  onclick="rejectGroup('${r.key}')">&#10005; Reject</button>
            </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = '<div class="apv-table-scroll"><table class="apv-table">' + thead + '<tbody>' + tbody + '</tbody></table></div>';
}

// ── Selection ─────────────────────────────────────────────────────────────────

function toggleCheckAll(cb) {
    document.querySelectorAll('.row-check').forEach(c => {
        c.checked = cb.checked;
        cb.checked ? selectedKeys.add(c.value) : selectedKeys.delete(c.value);
    });
    updateBulkBar();
}

function toggleRowCheck(cb) {
    cb.checked ? selectedKeys.add(cb.value) : selectedKeys.delete(cb.value);
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('bulkBar');
    if (selectedKeys.size > 0) {
        bar.style.display = 'flex';
        document.getElementById('bulkCount').textContent = selectedKeys.size + ' group(s) selected';
    } else {
        bar.style.display = 'none';
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function patchGroup(key, status) {
    const group = groupedRows.find(g => g.key === key);
    if (!group) return;
    // Patch all individual church records for this mission+month
    await Promise.all(group.ids.map(id => apiPatch(currentTab, id, { status })));
}

async function confirmGroup(key) {
    const btn = document.querySelector(`tr[data-key="${key}"] .apv-btn-confirm`);
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        await patchGroup(key, 'confirmed');
        const group = groupedRows.find(g => g.key === key);
        allRows = allRows.filter(r => !group.ids.includes(r.id));
        groupedRows = groupedRows.filter(g => g.key !== key);
        selectedKeys.delete(key);
        document.getElementById('statPending').textContent = groupedRows.length;
        updateBulkBar();
        applyFilters();
        updateNavBadge();
    } catch (e) {
        alert('Failed: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = '✓ Confirm'; }
    }
}

async function rejectGroup(key) {
    const group = groupedRows.find(g => g.key === key);
    if (!group) return;
    if (!confirm('Reject ' + group.code + ' ' + MONTHS[group.month] + ' ' + group.year + '? (' + group.ids.length + ' church record(s) will be rejected)')) return;
    const btn = document.querySelector(`tr[data-key="${key}"] .apv-btn-reject`);
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        await patchGroup(key, 'rejected');
        allRows = allRows.filter(r => !group.ids.includes(r.id));
        groupedRows = groupedRows.filter(g => g.key !== key);
        selectedKeys.delete(key);
        document.getElementById('statPending').textContent = groupedRows.length;
        const cur = parseInt(document.getElementById('statRejected').textContent) || 0;
        document.getElementById('statRejected').textContent = cur + 1;
        updateBulkBar();
        applyFilters();
        updateNavBadge();
    } catch (e) {
        alert('Failed: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = '✗ Reject'; }
    }
}

async function bulkConfirm() {
    const keys = [...selectedKeys];
    if (!keys.length) return;
    if (!confirm('Confirm ' + keys.length + ' group(s)?')) return;
    for (const key of keys) await confirmGroup(key);
}

async function bulkReject() {
    const keys = [...selectedKeys];
    if (!keys.length) return;
    if (!confirm('Reject ' + keys.length + ' group(s)?')) return;
    for (const key of keys) await rejectGroup(key);
}

function updateNavBadge() {
    const badge = document.getElementById('navPendingBadge');
    // Re-fetch both tables to get accurate combined group count
    const HDR_PLAIN = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };
    Promise.all([
        fetch(SUPABASE_URL + '/rest/v1/tithes?status=eq.pending&select=year,month,churches!inner(districts!inner(missions!inner(code)))', { headers: HDR_PLAIN }).then(r => r.json()),
        fetch(SUPABASE_URL + '/rest/v1/offerings?status=eq.pending&select=year,month,churches!inner(districts!inner(missions!inner(code)))', { headers: HDR_PLAIN }).then(r => r.json())
    ]).then(([t, o]) => {
        const countGroups = rows => new Set(rows.map(r => (r.churches?.districts?.missions?.code || '?') + '|' + r.year + '|' + r.month)).size;
        const total = countGroups(t) + countGroups(o);
        if (!badge) return;
        if (total > 0) {
            badge.textContent = total;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }).catch(() => {});
}

// ── Tab switch ────────────────────────────────────────────────────────────────

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-tithes').classList.toggle('active', tab === 'tithes');
    document.getElementById('tab-offerings').classList.toggle('active', tab === 'offerings');
    loadAll();
}

loadAll();
