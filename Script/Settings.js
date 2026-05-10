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

function renderQr(uri) {
    const img = document.getElementById('tfaQrImg');
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(uri);
    img.style.display = 'block';
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
    document.getElementById('acct-menu-name').textContent = user.full_name;
    document.getElementById('s-fullname').value = user.full_name || '';
    document.getElementById('s-username').value = user.username || '';
}

// ── Update profile ────────────────────────────────────────────────────────────

async function updateProfile() {
    const fullName = document.getElementById('s-fullname').value.trim();
    const username = document.getElementById('s-username').value.trim();
    const errEl = document.getElementById('profile-error');
    const okEl = document.getElementById('profile-success');
    errEl.textContent = '';
    okEl.textContent = '';

    if (!fullName || !username) { errEl.textContent = 'Name and username are required.'; return; }

    const user = getSession();
    try {
        await sb('users?id=eq.' + encodeURIComponent(user.id), {
            method: 'PATCH',
            body: JSON.stringify({ full_name: fullName, username: username })
        });
        const updated = { ...user, full_name: fullName, username: username };
        sessionStorage.setItem('superadmin_session', JSON.stringify(updated));
        loadProfile();
        okEl.textContent = '✓ Profile updated successfully.';
    } catch (e) {
        errEl.textContent = 'Failed: ' + e.message;
    }
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

// ── Two-Factor Authentication ─────────────────────────────────────────────

let _tfaNewSecret = null;

async function loadTfaStatus() {
    const user = getSession();
    if (!user) return;
    try {
        const data = await sb('users?id=eq.' + encodeURIComponent(user.id) + '&select=two_fa_enabled,totp_secret');
        const row = data[0];
        const enabled = row && row.two_fa_enabled && row.totp_secret;
        const dot = document.getElementById('tfaStatusDot');
        const text = document.getElementById('tfaStatusText');
        const setupBtn = document.getElementById('tfaSetupBtn');
        const viewBtn = document.getElementById('tfaViewBtn');
        const disableBtn = document.getElementById('tfaDisableBtn');

        if (enabled) {
            dot.className = 'tfa-status-dot tfa-dot-on';
            text.textContent = '2FA is enabled';
            setupBtn.style.display = 'none';
            viewBtn.style.display = '';
            disableBtn.style.display = '';
        } else {
            dot.className = 'tfa-status-dot tfa-dot-off';
            text.textContent = '2FA is disabled';
            setupBtn.style.display = '';
            viewBtn.style.display = 'none';
            disableBtn.style.display = 'none';
        }
    } catch (e) {
        document.getElementById('tfaStatusText').textContent = 'Could not load 2FA status.';
    }
}

function openTfaSetup() {
    const user = getSession();
    if (!user) return;

    const secret = new OTPAuth.Secret({ size: 20 });
    _tfaNewSecret = secret.base32;

    const totp = new OTPAuth.TOTP({
        issuer: 'SPUC Treasury',
        label: user.username || 'SuperAdmin',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: secret
    });

    document.getElementById('tfaSecretDisplay').textContent = _tfaNewSecret;
    document.getElementById('tfaConfirmCode').value = '';
    document.getElementById('tfa-setup-error').textContent = '';
    document.getElementById('tfa-setup-success').textContent = '';
    document.getElementById('tfaSetupWrap').classList.remove('hidden');
    document.getElementById('tfaSetupBtn').style.display = 'none';

    renderQr(totp.toString());
}

async function viewTfaQr() {
    const user = getSession();
    if (!user) return;
    try {
        const data = await sb('users?id=eq.' + encodeURIComponent(user.id) + '&select=totp_secret');
        const secret = data[0]?.totp_secret;
        if (!secret) return;

        const totp = new OTPAuth.TOTP({
            issuer: 'SPUC Treasury',
            label: user.username || 'SuperAdmin',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secret)
        });

        document.getElementById('tfaSecretDisplay').textContent = secret;
        document.getElementById('tfaConfirmCode').value = '';
        document.getElementById('tfa-setup-error').textContent = '';
        document.getElementById('tfa-setup-success').textContent = '';
        document.getElementById('tfaSetupWrap').classList.remove('hidden');
        document.getElementById('tfaViewBtn').style.display = 'none';
        document.getElementById('tfaDisableBtn').style.display = 'none';

        renderQr(totp.toString());
    } catch (e) {
        alert('Could not load QR code: ' + e.message);
    }
}

function cancelTfaSetup() {
    _tfaNewSecret = null;
    document.getElementById('tfaSetupWrap').classList.add('hidden');
    document.getElementById('tfaQrImg').style.display = 'none';
    loadTfaStatus();
}

async function confirmTfaSetup() {
    const code = document.getElementById('tfaConfirmCode').value.trim();
    const errEl = document.getElementById('tfa-setup-error');
    const okEl = document.getElementById('tfa-setup-success');
    errEl.textContent = '';
    okEl.textContent = '';

    if (!code || code.length !== 6) {
        errEl.textContent = 'Enter the 6-digit code from your authenticator app.';
        return;
    }
    if (!_tfaNewSecret) {
        errEl.textContent = 'Setup session expired. Please try again.';
        return;
    }

    try {
        const totp = new OTPAuth.TOTP({
            secret: OTPAuth.Secret.fromBase32(_tfaNewSecret),
            algorithm: 'SHA1',
            digits: 6,
            period: 30
        });

        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) {
            errEl.textContent = 'Incorrect code. Make sure your app is synced and try again.';
            return;
        }

        const user = getSession();
        await sb('users?id=eq.' + encodeURIComponent(user.id), {
            method: 'PATCH',
            body: JSON.stringify({ totp_secret: _tfaNewSecret, two_fa_enabled: true })
        });

        okEl.textContent = '✓ 2FA enabled successfully.';
        _tfaNewSecret = null;
        document.getElementById('tfaSetupWrap').classList.add('hidden');
        document.getElementById('tfaQrImg').style.display = 'none';
        loadTfaStatus();
    } catch (e) {
        errEl.textContent = 'Failed to enable 2FA: ' + e.message;
    }
}

async function disableTfa() {
    document.getElementById('disableTfaOverlay').classList.remove('hidden');
    document.getElementById('disableTfaModal').classList.remove('hidden');
}

function closeDisableTfaModal() {
    document.getElementById('disableTfaOverlay').classList.add('hidden');
    document.getElementById('disableTfaModal').classList.add('hidden');
}

async function confirmDisableTfa() {
    closeDisableTfaModal();
    const user = getSession();
    try {
        await sb('users?id=eq.' + encodeURIComponent(user.id), {
            method: 'PATCH',
            body: JSON.stringify({ two_fa_enabled: false, totp_secret: null })
        });
        loadTfaStatus();
    } catch (e) {
        alert('Failed to disable 2FA: ' + e.message);
    }
}

loadTfaStatus();
