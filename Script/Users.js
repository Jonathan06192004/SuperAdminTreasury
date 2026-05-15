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

const EYE_OPEN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function toggleTablePw(spanId) {
    const span = document.getElementById(spanId);
    const btn = span.nextElementSibling;
    const plain = span.dataset.pw;
    const isHidden = span.textContent.includes('•');
    span.textContent = isHidden ? plain : '•'.repeat(Math.min(plain.length, 10));
    btn.innerHTML = isHidden ? EYE_OFF : EYE_OPEN;
}

function toggleEye(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden ? EYE_OFF : EYE_OPEN;
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
            'users?select=id,username,full_name,role,mission_code,is_active,plain_password,created_at&order=created_at.asc'
        );
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
            'union_users?select=id,username,full_name,email,phone,is_active,two_fa_enabled,totp_secret,password_hash,created_at&order=created_at.asc'
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
                    <button type="button" class="eye-btn-sm" onclick="toggleTablePw('${pwId}')" ${!u.plain_password ? 'disabled' : ''}>${EYE_OPEN}</button>
                </div>
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
            <th>Full Name</th><th>Username</th><th>Password</th><th>Email</th><th>Phone</th><th>Status</th><th>2FA</th><th>Actions</th>
        </tr></thead>
    `;
    const tbody = document.createElement('tbody');
    filtered.forEach(v => {
        const pwId = 'vpw-' + v.id;
        const pwVal = v.password_hash ?? '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="name-cell">${v.full_name ?? '—'}</td>
            <td class="username-cell">${v.username}</td>
            <td class="pw-cell">
                <div class="pw-display">
                    <span class="pw-text" id="${pwId}" data-pw="${pwVal}">${pwVal ? '•'.repeat(Math.min(pwVal.length, 10)) : '—'}</span>
                    <button type="button" class="eye-btn-sm" onclick="toggleTablePw('${pwId}')" ${!pwVal ? 'disabled' : ''}>${EYE_OPEN}</button>
                </div>
            </td>
            <td>${v.email ?? '<span class="no-mission">—</span>'}</td>
            <td>${v.phone ?? '<span class="no-mission">—</span>'}</td>
            <td><span class="status-badge ${v.is_active ? 'active' : 'inactive'}">${v.is_active ? 'Active' : 'Inactive'}</span></td>
            <td><span class="status-badge ${v.two_fa_enabled ? 'active' : 'inactive'}">${v.two_fa_enabled ? 'ON' : 'OFF'}</span></td>
            <td class="action-cell">
                <button class="btn-edit" onclick="openEditViewerModal('${v.id}')">Edit</button>
                <button class="btn-reset" onclick="openViewerResetModal('${v.id}')">Reset PW</button>
                <button class="btn-2fa ${v.two_fa_enabled ? 'disable' : 'enable'}" onclick="manage2fa('${v.id}', ${!!v.two_fa_enabled})">${v.two_fa_enabled ? 'Disable 2FA' : 'Enable 2FA'}</button>
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
        const payload = { full_name, username, role: 'admin', mission_code };
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

// ── Viewer Reset Password Modal ──────────────────────────────────────────────

let resetViewerTargetId = null;

function openViewerResetModal(id) {
    const v = allViewers.find(v => v.id === id);
    if (!v) return;
    resetViewerTargetId = id;
    document.getElementById('reset-modal-title').textContent = 'Reset Viewer Password';
    document.getElementById('reset-info').textContent = 'Resetting password for: ' + (v.full_name ?? v.username);
    document.getElementById('r-password').value = '';
    document.getElementById('r-confirm').value = '';
    document.getElementById('reset-error').textContent = '';
    document.getElementById('reset-modal').style.display = 'flex';
    document.getElementById('reset-save-btn').onclick = saveViewerResetPassword;
}

async function saveViewerResetPassword() {
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
        await sbUsers('union_users?id=eq.' + encodeURIComponent(resetViewerTargetId), {
            method: 'PATCH',
            headers: { ...usersHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({ password_hash: newPw })
        });
        closeResetModal();
        loadViewers();
    } catch (e) {
        errEl.textContent = 'Reset failed: ' + e.message;
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '&#10003; Reset';
    }
}

// ── Viewer 2FA Management ─────────────────────────────────────────────────────

let twoFaTargetId = null;
let twoFaTargetViewer = null;
let pendingTotpSecret = null;

function manage2fa(id, isEnabled) {
    const v = allViewers.find(v => v.id === id);
    if (!v) return;
    twoFaTargetId = id;
    twoFaTargetViewer = v;

    if (isEnabled) {
        document.getElementById('twofa-modal-title').textContent = 'Disable 2FA';
        document.getElementById('twofa-setup-panel').style.display = 'none';
        document.getElementById('twofa-disable-panel').style.display = 'block';
        document.getElementById('twofa-disable-name').textContent = v.full_name ?? v.username;
    } else {
        document.getElementById('twofa-modal-title').textContent = 'Enable 2FA';
        document.getElementById('twofa-disable-panel').style.display = 'none';
        document.getElementById('twofa-setup-panel').style.display = 'block';
        document.getElementById('twofa-error').textContent = '';
        document.getElementById('twofa-code-input').value = '';
        const secret = generateBase32Secret();
        pendingTotpSecret = secret;
        const label = encodeURIComponent('SPUC Treasury:' + (v.username || 'user'));
        const issuer = encodeURIComponent('SPUC Treasury');
        const uri = 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + issuer + '&algorithm=SHA1&digits=6&period=30';
        document.getElementById('twofa-qr-img').src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(uri);
        document.getElementById('twofa-manual-key').value = secret;
        document.getElementById('twofa-viewer-name').textContent = v.full_name ?? v.username;
    }
    document.getElementById('twofa-modal').style.display = 'flex';
}

function closeTwoFaModal() {
    document.getElementById('twofa-modal').style.display = 'none';
    twoFaTargetId = null;
    twoFaTargetViewer = null;
    pendingTotpSecret = null;
}

async function confirmEnable2fa() {
    const code = document.getElementById('twofa-code-input').value.trim();
    const errEl = document.getElementById('twofa-error');
    if (code.length !== 6) { errEl.textContent = 'Enter a 6-digit code.'; return; }

    // Validate TOTP using otpauth library
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(pendingTotpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
    if (totp.validate({ token: code, window: 1 }) === null) { errEl.textContent = 'Invalid code. Try again.'; return; }

    try {
        await sbUsers('union_users?id=eq.' + encodeURIComponent(twoFaTargetId), {
            method: 'PATCH',
            headers: { ...usersHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({ totp_secret: pendingTotpSecret, two_fa_enabled: true })
        });
        closeTwoFaModal();
        loadViewers();
    } catch (e) { errEl.textContent = 'Failed to save: ' + e.message; }
}

async function confirmDisable2fa() {
    try {
        await sbUsers('union_users?id=eq.' + encodeURIComponent(twoFaTargetId), {
            method: 'PATCH',
            headers: { ...usersHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({ totp_secret: null, two_fa_enabled: false })
        });
        closeTwoFaModal();
        loadViewers();
    } catch (e) { alert('Failed to disable 2FA: ' + e.message); }
}

function generateBase32Secret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    const arr = new Uint8Array(20);
    crypto.getRandomValues(arr);
    arr.forEach(b => result += chars[b % 32]);
    return result;
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
