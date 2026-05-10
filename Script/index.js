/** Login reads `users` from the Users Supabase project (superadmin accounts). */
const USERS_SUPABASE_URL = 'https://fczudbtgtpkxteppckwb.supabase.co';
const USERS_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjenVkYnRndHBreHRlcHBja3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzczMzEsImV4cCI6MjA5MzU1MzMzMX0.AZKGqLFVB-VpBsDrg0ekOzX755t5kLfgWZPEJ92ELeU';

/** Holds the verified user row between step 1 and step 2 */
let _pendingUser = null;

function toggleLoginPw(btn) {
    const input = document.getElementById('password');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
}

function showStep(step) {
    document.getElementById('step-login').classList.toggle('hidden', step !== 'login');
    document.getElementById('step-2fa').classList.toggle('hidden', step !== '2fa');
    if (step === '2fa') {
        document.getElementById('tfa-code').value = '';
        document.getElementById('tfa-error').textContent = '';
        setTimeout(() => document.getElementById('tfa-code').focus(), 80);
    }
}

function backToLogin() {
    _pendingUser = null;
    showStep('login');
}

function verifyTfa() {
    const code = document.getElementById('tfa-code').value.trim();
    const errEl = document.getElementById('tfa-error');
    const btn = document.getElementById('tfa-verify-btn');
    errEl.textContent = '';

    if (!code || code.length !== 6) {
        errEl.textContent = 'Enter the 6-digit code from your authenticator app.';
        return;
    }

    if (!_pendingUser || !_pendingUser.totp_secret) {
        errEl.textContent = '2FA session expired. Please log in again.';
        backToLogin();
        return;
    }

    try {
        const totp = new OTPAuth.TOTP({
            secret: OTPAuth.Secret.fromBase32(_pendingUser.totp_secret),
            algorithm: 'SHA1',
            digits: 6,
            period: 30
        });

        // delta: ±1 window (±30s) to account for clock drift
        const delta = totp.validate({ token: code, window: 1 });

        if (delta === null) {
            errEl.textContent = 'Invalid code. Try again or wait for the next code.';
            return;
        }

        // Code is valid — set session and redirect
        sessionStorage.setItem('sa_user', JSON.stringify({
            id: _pendingUser.id,
            username: _pendingUser.username,
            full_name: _pendingUser.full_name
        }));
        window.location.href = 'Pages/Dashboard.html';
    } catch (e) {
        errEl.textContent = 'Verification error: ' + e.message;
    }
}

// Allow pressing Enter in the code input
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('tfa-code').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') verifyTfa();
    });
});

document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.querySelector('button[type="submit"]');

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
        const res = await fetch(
            USERS_SUPABASE_URL +
                '/rest/v1/users?username=eq.' +
                encodeURIComponent(username) +
                '&select=id,username,full_name,role,is_active,plain_password,two_fa_enabled,totp_secret',
            {
                headers: {
                    apikey: USERS_SUPABASE_ANON_KEY,
                    Authorization: 'Bearer ' + USERS_SUPABASE_ANON_KEY
                }
            }
        );
        const data = await res.json();
        const user = data[0];

        if (!user) { errEl.textContent = 'Username not found.'; return; }
        if (user.role !== 'superadmin') { errEl.textContent = 'Access denied. Super admin only.'; return; }
        if (!user.is_active) { errEl.textContent = 'This account is deactivated.'; return; }
        if (user.plain_password !== password) { errEl.textContent = 'Incorrect password.'; return; }

        // Credentials valid — check if 2FA is enabled
        if (user.two_fa_enabled && user.totp_secret) {
            _pendingUser = user;
            showStep('2fa');
        } else {
            // No 2FA — log in directly
            sessionStorage.setItem('sa_user', JSON.stringify({
                id: user.id,
                username: user.username,
                full_name: user.full_name
            }));
            window.location.href = 'Pages/Dashboard.html';
        }
    } catch (err) {
        errEl.textContent = 'Login failed: ' + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
});
