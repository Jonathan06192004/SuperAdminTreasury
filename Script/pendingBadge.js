// Shared: loads pending count and shows nav badge on every page
// Badge shows number of unique mission+month groups awaiting approval
(function () {
    const SUPABASE_URL = 'https://bchvcxkocdlrkkzivuun.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjaHZjeGtvY2Rscmtreml2dXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODA3NjksImV4cCI6MjA5Mjg1Njc2OX0.oyfzu_VNk9nZocRcq02JTmxdgQEi3BqclZEKgHwqF5U';
    const HDR = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

    function countGroups(rows) {
        const keys = new Set();
        rows.forEach(r => {
            const code = r.churches?.districts?.missions?.code || '?';
            keys.add(code + '|' + r.year + '|' + r.month);
        });
        return keys.size;
    }

    async function loadPendingBadge() {
        try {
            const [t, o] = await Promise.all([
                fetch(SUPABASE_URL + '/rest/v1/tithes?status=eq.pending&select=year,month,churches!inner(districts!inner(missions!inner(code)))', { headers: HDR }).then(r => r.json()),
                fetch(SUPABASE_URL + '/rest/v1/offerings?status=eq.pending&select=year,month,churches!inner(districts!inner(missions!inner(code)))', { headers: HDR }).then(r => r.json())
            ]);
            const total = countGroups(t) + countGroups(o);
            const badge = document.getElementById('navPendingBadge');
            if (!badge) return;
            if (total > 0) {
                badge.textContent = total;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (_) {}
    }

    loadPendingBadge();
})();
