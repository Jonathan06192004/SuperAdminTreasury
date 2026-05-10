/** Login reads `users` from the Users Supabase project (superadmin accounts). */
const USERS_SUPABASE_URL = 'https://fczudbtgtpkxteppckwb.supabase.co';
const USERS_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjenVkYnRndHBreHRlcHBja3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzczMzEsImV4cCI6MjA5MzU1MzMzMX0.AZKGqLFVB-VpBsDrg0ekOzX755t5kLfgWZPEJ92ELeU';

function toggleLoginPw(btn) {
    const input = document.getElementById('password');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? '🙈' : '👁';
}

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
                '&select=id,username,full_name,role,is_active,plain_password',
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

        sessionStorage.setItem('sa_user', JSON.stringify({ id: user.id, username: user.username, full_name: user.full_name }));
        window.location.href = 'Pages/Dashboard.html';
    } catch (err) {
        errEl.textContent = 'Login failed: ' + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
});
