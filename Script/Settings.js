const USERS_SUPABASE_URL = 'https://fczudbtgtpkxteppckwb.supabase.co';
const USERS_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjenVkYnRndHBreHRlcHBja3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzczMzEsImV4cCI6MjA5MzU1MzMzMX0.AZKGqLFVB-VpBsDrg0ekOzX755t5kLfgWZPEJ92ELeU';

const sbHeaders = {
    apikey: USERS_SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + USERS_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
};

async function sb(path, options = {}) {
    const res = await fetch(USERS_SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders, ...options });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.statusText);
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') return null;
    return res.json();
}

// ── Load profile ──────────────────────────────────────────────────────────────

function loadProfile() {
    const user = getSession();
    if (!user) return;
    document.getElementById('profile-name').textContent = user.full_name;
    document.getElementById('profile-username').textContent = '@' + user.username;
    const initials = user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('avatar-initials').textContent = initials;
    document.getElementById('acct-avatar-initials').textContent = initials;
    document.getElementById('acct-trigger-name').textContent = user.full_name.split(' ')[0];
}

// ── Change password ───────────────────────────────────────────────────────────

async function changePassword() {
    const current = document.getElementById('s-current').value;
    const newPw = document.getElementById('s-new').value;
    const confirm = document.getElementById('s-confirm').value;
    const errEl = document.getElementById('pw-error');
    const okEl = document.getElementById('pw-success');

    errEl.textContent = '';
    okEl.textContent = '';

    if (!current || !newPw || !confirm) { errEl.textContent = 'All fields are required.'; return; }
    if (newPw.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; return; }
    if (newPw !== confirm) { errEl.textContent = 'New passwords do not match.'; return; }

    const user = getSession();
    try {
        // Verify current password
        const data = await sb('users?id=eq.' + encodeURIComponent(user.id) + '&select=plain_password');
        if (!data[0] || data[0].plain_password !== current) {
            errEl.textContent = 'Current password is incorrect.';
            return;
        }

        await sb('users?id=eq.' + encodeURIComponent(user.id), {
            method: 'PATCH',
            body: JSON.stringify({ plain_password: newPw })
        });

        document.getElementById('s-current').value = '';
        document.getElementById('s-new').value = '';
        document.getElementById('s-confirm').value = '';
        okEl.textContent = '✓ Password updated successfully.';
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
    }
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

function toggleDropdown() {
    const dd = document.getElementById('acctDropdown');
    dd.classList.toggle('open');
}

document.addEventListener('click', function(e) {
    const dd = document.getElementById('acctDropdown');
    if (dd && !dd.contains(e.target)) dd.classList.remove('open');
});

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(mode) {
    const isLight = mode === 'light';
    document.body.classList.toggle('light-mode', isLight);
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    const toggleIcon = document.getElementById('themeToggleIcon');
    const toggleLabel = document.getElementById('themeToggleLabel');
    const iconVal = isLight ? '\u2600\uFE0F' : '\u263E';
    const labelVal = isLight ? 'Dark Mode' : 'Light Mode';
    if (icon) icon.textContent = iconVal;
    if (label) label.textContent = labelVal;
    if (toggleIcon) toggleIcon.textContent = iconVal;
    if (toggleLabel) toggleLabel.textContent = labelVal;
}

function toggleTheme() {
    const isLight = document.body.classList.contains('light-mode');
    const next = isLight ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    applyTheme(next);
}

// Apply saved theme on load
applyTheme(localStorage.getItem('theme') || 'dark');

// ── Logout ────────────────────────────────────────────────────────────────────

function openLogoutModal() {
    document.getElementById('logoutOverlay').classList.remove('hidden');
    document.getElementById('logoutModal').classList.remove('hidden');
    document.getElementById('acctDropdown').classList.remove('open');
}

function closeLogoutModal() {
    document.getElementById('logoutOverlay').classList.add('hidden');
    document.getElementById('logoutModal').classList.add('hidden');
}

function confirmLogout() {
    openLogoutModal();
}

// ── Clear sessions ────────────────────────────────────────────────────────────

function clearSessions() {
    if (confirm('This will log you out immediately. Continue?')) logout();
}

// ── Eye toggle ────────────────────────────────────────────────────────────────

function togglePw(id, btn) {
    const input = document.getElementById(id);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
}

loadProfile();
