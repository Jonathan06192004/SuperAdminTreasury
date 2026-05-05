// Redirect to login if no session
(function () {
    const user = sessionStorage.getItem('sa_user');
    if (!user) window.location.replace('../index.html');
})();

function getSession() {
    return JSON.parse(sessionStorage.getItem('sa_user') || 'null');
}

function logout() {
    sessionStorage.removeItem('sa_user');
    window.location.replace('../index.html');
}
