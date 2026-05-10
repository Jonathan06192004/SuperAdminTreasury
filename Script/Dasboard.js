const USERS_SUPABASE_URL = 'https://fczudbtgtpkxteppckwb.supabase.co';
const USERS_SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjenVkYnRndHBreHRlcHBja3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzczMzEsImV4cCI6MjA5MzU1MzMzMX0.AZKGqLFVB-VpBsDrg0ekOzX755t5kLfgWZPEJ92ELeU';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function fetchUsers() {
    const res = await fetch(
        USERS_SUPABASE_URL +
            '/rest/v1/users?select=id,full_name,username,role,mission_code,is_active,created_at,updated_at&order=created_at.desc',
        {
            headers: {
                apikey: USERS_SUPABASE_ANON_KEY,
                Authorization: 'Bearer ' + USERS_SUPABASE_ANON_KEY
            }
        }
    );
    return res.json();
}

function formatDate(iso) {
    const d = new Date(iso);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

async function loadDashboard() {
    // Set greeting
    const user = getSession();
    if (user) {
        document.getElementById('header-greeting').textContent =
            'Welcome back, ' + user.full_name + '.';
    }

    try {
        const users = await fetchUsers();
        const admins = users.filter(u => u.role === 'admin');
        const active = admins.filter(u => u.is_active);
        const inactive = admins.filter(u => !u.is_active);

        // Stat cards
        document.getElementById('stat-total').textContent = admins.length;
        document.getElementById('stat-active').textContent = active.length;
        document.getElementById('stat-inactive').textContent = inactive.length;

        // Recent activity — last 8 users by created_at (newest first, skip superadmin)
        renderActivity(admins.slice(0, 8));
        const actBadge = document.getElementById('activity-count');
        if (actBadge) actBadge.textContent = Math.min(admins.length, 8);

        // Active admins list
        renderActiveUsers(active);
        const actvBadge = document.getElementById('active-count');
        if (actvBadge) actvBadge.textContent = active.length;

    } catch (e) {
        document.getElementById('activity-area').innerHTML =
            '<p class="error-note">Failed to load: ' + e.message + '</p>';
    }
}

function renderActivity(users) {
    const area = document.getElementById('activity-area');
    if (!users.length) {
        area.innerHTML = '<p class="loading-note">No activity yet.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'dash-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Admin</th>
                <th>Mission</th>
                <th>Status</th>
                <th>Added</th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement('tbody');
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="user-cell">
                    <div class="user-avatar">${u.full_name.charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="user-name">${u.full_name}</div>
                        <div class="user-handle">@${u.username}</div>
                    </div>
                </div>
            </td>
            <td>${u.mission_code ? '<span class="mission-tag">' + u.mission_code + '</span>' : '<span class="no-val">—</span>'}</td>
            <td><span class="status-dot ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
            <td class="date-cell">${timeAgo(u.created_at)}</td>
        `;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    area.innerHTML = '';
    area.appendChild(table);
}

function renderActiveUsers(users) {
    const area = document.getElementById('active-area');
    if (!users.length) {
        area.innerHTML = '<p class="loading-note">No active admins.</p>';
        return;
    }

    const list = document.createElement('div');
    list.className = 'active-list';
    users.forEach(u => {
        const item = document.createElement('div');
        item.className = 'active-item';
        item.innerHTML = `
            <div class="user-avatar">${u.full_name.charAt(0).toUpperCase()}</div>
            <div class="active-info">
                <div class="user-name">${u.full_name}</div>
                <div class="user-handle">@${u.username}</div>
            </div>
            ${u.mission_code ? '<span class="mission-tag">' + u.mission_code + '</span>' : ''}
        `;
        list.appendChild(item);
    });
    area.innerHTML = '';
    area.appendChild(list);
}

loadDashboard();
