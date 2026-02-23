// Auto-Logout on Server Restart (Synchronous)
// Using XMLHttpRequest with async: false to strictly block the browser
// from rendering any DOM elements until we verify the session ID

function checkServerSessionSync() {
    try {
        const xhr = new XMLHttpRequest();
        // The 'false' parameter makes it synchronous
        xhr.open('GET', 'http://localhost:3000/api/sys/session', false);
        xhr.send(null);

        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            const currentSession = window.localStorage.getItem('server_session_id');

            if (currentSession && currentSession !== data.sessionId) {
                // Server restarted, clear auth
                window.localStorage.removeItem('token');
                window.localStorage.removeItem('user');
                window.localStorage.setItem('server_session_id', data.sessionId);
                // We don't need to trigger a full reload if the DOM hasn't loaded yet.
                // Erasing local storage before DOMContentLoaded guarantees the site
                // renders the "Guest" state automatically!
            } else if (!currentSession) {
                window.localStorage.setItem('server_session_id', data.sessionId);
            }
        }
    } catch (e) {
        console.error("Session check failed", e);
    }
}

checkServerSessionSync();
