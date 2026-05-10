/** Admin / viewer accounts: `users`, `union_users` (and optional `mission_users`) */
const USERS_SUPABASE_URL = 'https://fczudbtgtpkxteppckwb.supabase.co';
const USERS_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjenVkYnRndHBreHRlcHBja3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzczMzEsImV4cCI6MjA5MzU1MzMzMX0.AZKGqLFVB-VpBsDrg0ekOzX755t5kLfgWZPEJ92ELeU';

/** Treasury DB: `missions` reference for mission_code dropdown (same as Update / financial apps) */
const TREASURY_SUPABASE_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
const TREASURY_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';

const usersHeaders = {
    apikey: USERS_SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + USERS_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
};

const treasuryHeaders = {
    apikey: TREASURY_SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + TREASURY_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
};

let allUsers = [];
let allViewers = [];
let missions = [];
let modalMode = 'add';
let editingId = null;
let viewerModalMode = 'add';
let editingViewerId = null;
let resetTargetId = null;
let roleFilter = '';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sbUsers(path, options = {}) {
    const res = await fetch(USERS_SUPABASE_URL + '/rest/v1/' + path, {
        headers: usersHeaders,
        ...options
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.hint || res.statusText);
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') return null;
    return res.json();
}

async function sbTreasury(path, options = {}) {
    const res = await fetch(TREASURY_SUPABASE_URL + '/rest/v1/' + path, {
        headers: treasuryHeaders,
        ...options
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.hint || res.statusText);
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') return null;
    return res.json();
}

function copyToken(token, btn) {
    navigator.clipboard.writeText(token).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '&#10003;';
        btn.style.color = '#28d1a7';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
    });
}

function toggleTablePw(spanId) {
    const span = document.getElementById(spanId);
    const btn = span.nextElementSibling;
    const plain = span.dataset.pw;
    const isHidden = span.textContent.includes('•');
    span.textContent = isHidden ? plain : '•'.repeat(Math.min(plain.length, 10));
    btn.textContent = isHidden ? '🙈' : '👁️';
}

function toggleEye(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
}

function generateToken() {
    const token = 'tk_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    document.getElementById('f-token').value = token;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    await Promise.all([loadMissions(), loadUsers(), loadViewers()]);
}

async function loadMissions() {
    try {
        missions = await sbTreasury('missions?select=code,name&order=id');
        const sel = document.getElementById('f-mission');
        sel.innerHTML = '<option value="">— None —</option>';
        missions.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.code;
            opt.textContent = m.code + ' — ' + m.name;
            sel.appendChild(opt);
        });
    } catch (e) { /* non-critical */ }
}

async function loadUsers() {
    const area = document.getElementById('table-area');
    area.innerHTML = '<p class="placeholder-note">Loading…</p>';
    try {
        const data = await sbUsers(
            'users?select=id,username,full_name,role,mission_code,is_active,plain_password,token,created_at&order=created_at.asc'
        );
        // exclude viewers from admin table
        allUsers = data.filter(u => u.role !== 'viewer');
        renderTable();
    } catch (e) {
        area.innerHTML = '<p class="error-note">Failed to load users: ' + e.message + '</p>';
    }
}

async function loadViewers() {
    const area = document.getElementById('viewer-table-area');
    area.innerHTML = '<p class="placeholder-note">Loading…</p>';
    try {
        allViewers = await sbUsers(
            'union_users?select=id,username,full_name,email,phone,is_active,created_at&order=created_at.asc'
        );
        renderViewerTable();
    } catch (e) {
        area.innerHTML = '<p class="error-note">Failed to load viewers: ' + e.message + '</p>';
    }
}

// ── Filter & search ───────────────────────────────────────────────────────────

function setRoleFilter(btn, role) {
    roleFilter = role;
    document.querySelectorAll('.role-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable();
}

function applySearch() { renderTable(); }

function applyViewerSearch() { renderViewerTable(); }

function getFilteredUsers() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    return allUsers.filter(u => {
        const matchRole = !roleFilter || u.role === roleFilter;
        const matchSearch = !q ||
            u.full_name.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q);
        return matchRole && matchSearch;
    });
}

// ── Render admin table ────────────────────────────────────────────────────────

function renderTable() {
    const area = document.getElementById('table-area');
    const filtered = getFilteredUsers();

    document.getElementById('user-count').textContent =
        filtered.length + ' user' + (filtered.length !== 1 ? 's' : '');

    if (!filtered.length) {
        area.innerHTML = '<p class="placeholder-note">No users found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'users-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Password</th>
                <th>Token</th>
                <th>Role</th>
                <th>Mission</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');

    filtered.forEach(u => {
        const isSuperAdmin = u.role === 'superadmin';
        const tr = document.createElement('tr');
        const pwId = 'pw-' + u.id;
        tr.innerHTML = `
            <td class="name-cell">${u.full_name}</td>
            <td class="username-cell">${u.username}</td>
            <td class="pw-cell">
                <div class="pw-display">
                    <span class="pw-text" id="${pwId}" data-pw="${u.plain_password ?? ''}">${u.plain_password ? '•'.repeat(Math.min(u.plain_password.length, 10)) : '—'}</span>
                    <button type="button" class="eye-btn-sm" onclick="toggleTablePw('${pwId}')" ${!u.plain_password ? 'disabled' : ''}>&#128065;</button>
                </div>
            </td>
            <td class="token-cell">
                ${u.token
                    ? `<div class="token-display">
                        <span class="token-text" title="${u.token}">${u.token.slice(0, 16)}…</span>
                        <button type="button" class="copy-btn" onclick="copyToken('${u.token}', this)" title="Copy token">&#128203;</button>
                       </div>`
                    : '<span class="no-mission">—</span>'
                }
            </td>
            <td><span class="role-badge ${u.role}">${isSuperAdmin ? 'Super Admin' : 'Admin'}</span></td>
            <td>${u.mission_code ? '<span class="mission-tag">' + u.mission_code + '</span>' : '<span class="no-mission">—</span>'}</td>
            <td><span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
            <td class="action-cell">
                ${isSuperAdmin
                    ? '<span class="protected-label">Protected</span>'
                    : `<button class="btn-edit" onclick="openEditModal('${u.id}')">Edit</button>
                       <button class="btn-reset" onclick="openResetModal('${u.id}')">Reset PW</button>
                       <button class="btn-toggle ${u.is_active ? 'deactivate' : 'activate'}" onclick="toggleActive('${u.id}', ${u.is_active})">
                           ${u.is_active ? 'Deactivate' : 'Activate'}
                       </button>
                       <button class="btn-delete" onclick="deleteUser('${u.id}')">Delete</button>`
                }
            </td>
        `;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    area.innerHTML = '';
    area.appendChild(table);
}

// ── Render viewer table ───────────────────────────────────────────────────────

function renderViewerTable() {
    const area = document.getElementById('viewer-table-area');
    const q = document.getElementById('viewer-search-input').value.trim().toLowerCase();
    const filtered = allViewers.filter(v =>
        !q || v.full_name?.toLowerCase().includes(q) || v.username?.toLowerCase().includes(q)
    );

    document.getElementById('viewer-count').textContent =
        filtered.length + ' viewer' + (filtered.length !== 1 ? 's' : '');

    if (!filtered.length) {
        area.innerHTML = '<p class="placeholder-note">No viewers found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'users-table';
    table.innerHTML = `
        <thead><tr>
            <th>Full Name</th><th>Username</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th>
        </tr></thead>
    `;
    const tbody = document.createElement('tbody');
    filtered.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="name-cell">${v.full_name ?? '—'}</td>
            <td class="username-cell">${v.username}</td>
            <td>${v.email ?? '<span class="no-mission">—</span>'}</td>
            <td>${v.phone ?? '<span class="no-mission">—</span>'}</td>
            <td><span class="status-badge ${v.is_active ? 'active' : 'inactive'}">${v.is_active ? 'Active' : 'Inactive'}</span></td>
            <td class="action-cell">
                <button class="btn-edit" onclick="openEditViewerModal('${v.id}')">Edit</button>
                <button class="btn-toggle ${v.is_active ? 'deactivate' : 'activate'}" onclick="toggleViewerActive('${v.id}', ${v.is_active})">${v.is_active ? 'Deactivate' : 'Activate'}</button>
                <button class="btn-delete" onclick="deleteViewer('${v.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    area.innerHTML = '';
    area.appendChild(table);
}

// ── Add / Edit Admin Modal ────────────────────────────────────────────────────

function openAddModal() {
    modalMode = 'add';
    editingId = null;
    document.getElementById('modal-title').textContent = 'Add Admin';
    document.getElementById('f-fullname').value = '';
    document.getElementById('f-username').value = '';
    document.getElementById('f-mission').value = '';
    document.getElementById('f-password').value = '';
    document.getElementById('f-token').value = '';
    document.getElementById('password-label').textContent = 'Password';
    document.getElementById('modal-error').textContent = '';
    document.getElementById('modal').style.display = 'flex';
}

function openEditModal(id) {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    modalMode = 'edit';
    editingId = id;
    document.getElementById('modal-title').textContent = 'Edit Admin';
    document.getElementById('f-fullname').value = u.full_name;
    document.getElementById('f-username').value = u.username;
    document.getElementById('f-mission').value = u.mission_code ?? '';
    document.getElementById('f-password').value = '';
    document.getElementById('f-token').value = u.token ?? '';
    document.getElementById('password-label').textContent = 'New Password (leave blank to keep)';
    document.getElementById('modal-error').textContent = '';
    document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

async function saveModal() {
    const full_name = document.getElementById('f-fullname').value.trim();
    const username = document.getElementById('f-username').value.trim();
    const mission_code = document.getElementById('f-mission').value || null;
    const plainPassword = document.getElementById('f-password').value;
    const token = document.getElementById('f-token').value.trim() || null;
    const errEl = document.getElementById('modal-error');
    const saveBtn = document.getElementById('modal-save-btn');

    if (!full_name || !username) { errEl.textContent = 'Full name and username are required.'; return; }
    if (modalMode === 'add' && !plainPassword) { errEl.textContent = 'Password is required.'; return; }

    const duplicate = allUsers.find(u => u.username === username && u.id !== editingId);
    if (duplicate) { errEl.textContent = 'Username "' + username + '" is already taken.'; return; }

    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving…';
    errEl.textContent = '';

    try {
        const payload = { full_name, username, role: 'admin', mission_code, token };
        if (plainPassword) payload.plain_password = plainPassword;

        if (modalMode === 'add') {
            payload.is_active = true;
            await sbUsers('users', { method: 'POST', body: JSON.stringify(payload) });
        } else {
            await sbUsers('users?id=eq.' + encodeURIComponent(editingId), {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        }

        closeModal();
        loadUsers();
    } catch (e) {
        const msg = e.message || '';
        errEl.textContent = msg.includes('duplicate key') || msg.includes('unique constraint')
            ? 'Username "' + username + '" is already taken.'
            : 'Save failed: ' + msg;
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '&#10003; Save';
    }
}

// ── Add / Edit Viewer Modal ───────────────────────────────────────────────────

function openAddViewerModal() {
    viewerModalMode = 'add';
    editingViewerId = null;
    document.getElementById('viewer-modal-title').textContent = 'Add Viewer';
    ['vf-fullname', 'vf-username', 'vf-email', 'vf-phone', 'vf-password'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('viewer-password-label').textContent = 'Password';
    document.getElementById('viewer-modal-error').textContent = '';
    document.getElementById('viewer-modal').style.display = 'flex';
}

function openEditViewerModal(id) {
    const v = allViewers.find(v => v.id === id);
    if (!v) return;
    viewerModalMode = 'edit';
    editingViewerId = id;
    document.getElementById('viewer-modal-title').textContent = 'Edit Viewer';
    document.getElementById('vf-fullname').value = v.full_name ?? '';
    document.getElementById('vf-username').value = v.username;
    document.getElementById('vf-email').value = v.email ?? '';
    document.getElementById('vf-phone').value = v.phone ?? '';
    document.getElementById('vf-password').value = '';
    document.getElementById('viewer-password-label').textContent = 'New Password (leave blank to keep)';
    document.getElementById('viewer-modal-error').textContent = '';
    document.getElementById('viewer-modal').style.display = 'flex';
}

function closeViewerModal() {
    document.getElementById('viewer-modal').style.display = 'none';
}

async function saveViewerModal() {
    const full_name = document.getElementById('vf-fullname').value.trim();
    const username = document.getElementById('vf-username').value.trim();
    const email = document.getElementById('vf-email').value.trim() || null;
    const phone = document.getElementById('vf-phone').value.trim() || null;
    const password = document.getElementById('vf-password').value;
    const errEl = document.getElementById('viewer-modal-error');
    const saveBtn = document.getElementById('viewer-modal-save-btn');

    if (!full_name || !username) { errEl.textContent = 'Full name and username are required.'; return; }
    if (viewerModalMode === 'add' && !password) { errEl.textContent = 'Password is required.'; return; }

    const duplicate = allViewers.find(v => v.username === username && v.id !== editingViewerId);
    if (duplicate) { errEl.textContent = 'Username "' + username + '" is already taken.'; return; }

    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving…';
    errEl.textContent = '';

    try {
        const payload = { full_name, username, email, phone };
        if (password) payload.password_hash = password;

        if (viewerModalMode === 'add') {
            payload.is_active = true;
            await sbUsers('union_users', { method: 'POST', body: JSON.stringify(payload) });
        } else {
            await sbUsers('union_users?id=eq.' + encodeURIComponent(editingViewerId), {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        }
        closeViewerModal();
        loadViewers();
    } catch (e) {
        const msg = e.message || '';
        errEl.textContent = msg.includes('duplicate key') || msg.includes('unique constraint')
            ? 'Username "' + username + '" is already taken.'
            : 'Save failed: ' + msg;
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '&#10003; Save';
    }
}

async function toggleViewerActive(id, currentState) {
    try {
        await sbUsers('union_users?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify({ is_active: !currentState })
        });
        loadViewers();
    } catch (e) { alert('Failed to update status: ' + e.message); }
}

async function deleteViewer(id) {
    const v = allViewers.find(v => v.id === id);
    if (!confirm('Delete "' + (v?.full_name ?? 'this viewer') + '"? This cannot be undone.')) return;
    try {
        await sbUsers('union_users?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
        loadViewers();
    } catch (e) { alert('Delete failed: ' + e.message); }
}

// ── Reset Password Modal ──────────────────────────────────────────────────────

function openResetModal(id) {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    resetTargetId = id;
    document.getElementById('reset-modal-title').textContent = 'Reset Password';
    document.getElementById('reset-info').textContent =
        'Resetting password for: ' + u.full_name + ' (' + u.username + ')';
    document.getElementById('r-password').value = '';
    document.getElementById('r-confirm').value = '';
    document.getElementById('reset-error').textContent = '';
    document.getElementById('reset-modal').style.display = 'flex';
}

function closeResetModal() {
    document.getElementById('reset-modal').style.display = 'none';
    resetTargetId = null;
}

async function saveResetPassword() {
    const newPw = document.getElementById('r-password').value;
    const confirmPw = document.getElementById('r-confirm').value;
    const errEl = document.getElementById('reset-error');
    const saveBtn = document.getElementById('reset-save-btn');

    if (!newPw) { errEl.textContent = 'New password is required.'; return; }
    if (newPw.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (newPw !== confirmPw) { errEl.textContent = 'Passwords do not match.'; return; }

    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving…';
    errEl.textContent = '';

    try {
        await sbUsers('users?id=eq.' + encodeURIComponent(resetTargetId), {
            method: 'PATCH',
            body: JSON.stringify({ plain_password: newPw })
        });
        closeResetModal();
        loadUsers();
    } catch (e) {
        errEl.textContent = 'Reset failed: ' + e.message;
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '&#10003; Reset';
    }
}

// ── Toggle active / Delete ────────────────────────────────────────────────────

async function toggleActive(id, currentState) {
    try {
        await sbUsers('users?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify({ is_active: !currentState })
        });
        loadUsers();
    } catch (e) {
        alert('Failed to update status: ' + e.message);
    }
}

async function deleteUser(id) {
    const u = allUsers.find(u => u.id === id);
    if (!confirm('Delete "' + (u?.full_name ?? 'this user') + '"? This cannot be undone.')) return;
    try {
        await sbUsers('users?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
        loadUsers();
    } catch (e) {
        alert('Delete failed: ' + e.message);
    }
}

init();
