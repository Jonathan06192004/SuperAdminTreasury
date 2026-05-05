// Super-Admin Treasury DB (users table)
const SUPABASE_URL = 'https://fczudbtgtpkxteppckwb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjenVkYnRndHBreHRlcHBja3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzczMzEsImV4cCI6MjA5MzU1MzMzMX0.AZKGqLFVB-VpBsDrg0ekOzX755t5kLfgWZPEJ92ELeU';

// Treasury DB (viewers data — missions list)
const TREASURY_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
const TREASURY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
};

let allUsers = [];
let missions = [];
let modalMode = 'add';
let editingId = null;
let resetTargetId = null;
let roleFilter = '';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sb(path, options = {}) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers, ...options });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.statusText);
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
    await Promise.all([loadMissions(), loadUsers()]);
}

async function loadMissions() {
    try {
        const res = await fetch(TREASURY_URL + '/rest/v1/missions?select=code,name&order=id', {
            headers: { 'apikey': TREASURY_KEY, 'Authorization': 'Bearer ' + TREASURY_KEY }
        });
        missions = await res.json();
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
        allUsers = await sb('users?select=id,username,full_name,role,mission_code,is_active,plain_password,token,created_at&order=created_at.asc');
        renderTable();
    } catch (e) {
        area.innerHTML = '<p class="error-note">Failed to load users: ' + e.message + '</p>';
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

// ── Render ────────────────────────────────────────────────────────────────────

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
            <td class="username-cell">@${u.username}</td>
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

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

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
            await sb('users', { method: 'POST', body: JSON.stringify(payload) });
        } else {
            await sb('users?id=eq.' + editingId, { method: 'PATCH', body: JSON.stringify(payload) });
        }

        closeModal();
        loadUsers();
    } catch (e) {
        errEl.textContent = 'Save failed: ' + e.message;
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '&#10003; Save';
    }
}

// ── Reset Password Modal ──────────────────────────────────────────────────────

function openResetModal(id) {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    resetTargetId = id;
    document.getElementById('reset-modal-title').textContent = 'Reset Password';
    document.getElementById('reset-info').textContent =
        'Resetting password for: ' + u.full_name + ' (@' + u.username + ')';
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
        await sb('users?id=eq.' + resetTargetId, {
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
        await sb('users?id=eq.' + id, {
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
        await sb('users?id=eq.' + id, { method: 'DELETE' });
        loadUsers();
    } catch (e) {
        alert('Delete failed: ' + e.message);
    }
}

init();
