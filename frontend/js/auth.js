const AUTH_STORAGE_KEY = 'ks_auth_v1';

function getAuth() {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || !data.username || !data.role) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function setAuth(data) {
    if (!data) return;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
}

function clearAuth() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

function isLoginPage() {
    return /\/login\.html$/i.test(window.location.pathname) || /\\login\.html$/i.test(window.location.pathname);
}

function getPermissionFirstPage(auth) {
    if (!auth) return 'quotation';
    if (auth.role === 'admin') return 'quotation';
    const permPageMap = ['quotation', 'cad', 'database', 'records', 'questions'];
    const perms = auth.permissions || [];
    for (const perm of permPageMap) {
        if (perms.includes(perm)) return perm;
    }
    return 'quotation';
}

function buildPermissionTarget(auth) {
    if (!auth) return 'login.html';
    if (auth.role === 'admin') return resolveFrontendPageTarget(auth.target || 'admin.html');
    const baseTarget = auth.target || 'app.html?group=韩语组';
    const page = getPermissionFirstPage(auth);
    try {
        const url = buildFrontendPageUrl(baseTarget);
        url.searchParams.set('page', page);
        return `${url.pathname}${url.search}${url.hash}`;
    } catch (e) {
        return resolveFrontendPageTarget(baseTarget);
    }
}

function redirectToLogin() {
    if (!isLoginPage()) {
        window.location.href = 'login.html';
    }
}

function canAccess(auth, options = {}) {
    if (!auth) return false;
    const role = options.role;
    const adminOnly = options.adminOnly === true;
    const permission = options.permission;
    if (adminOnly) return auth.role === 'admin';
    if (permission) {
        if (auth.role === 'admin') return true;
        const perms = auth.permissions || [];
        return perms.includes(permission);
    }
    if (role) return auth.role === role || auth.role === 'admin';
    return true;
}

function handleAccessDenied(auth, options = {}) {
    if (!auth) {
        redirectToLogin();
        return;
    }
    const role = options.role;
    const adminOnly = options.adminOnly === true;
    if (adminOnly && auth.role !== 'admin') {
        window.location.href = buildPermissionTarget(auth);
        return;
    }
    if (role && auth.role !== role && auth.role !== 'admin') {
        window.location.href = buildPermissionTarget(auth);
        return;
    }
    redirectToLogin();
}

function requireAuth(options = {}) {
    const auth = getAuth();
    if (!auth) {
        redirectToLogin();
        return null;
    }
    if (!canAccess(auth, options)) {
        handleAccessDenied(auth, options);
        return null;
    }
    return auth;
}

async function fetchAuthMeDirect() {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const origin = window.location.origin && /^https?:/i.test(window.location.origin)
        ? window.location.origin
        : `${protocol}//${window.location.hostname || '127.0.0.1'}:5000`;

    const response = await fetch(`${origin}/api/auth/me`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const text = await response.text();
    let payload = {};
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch (error) {
            throw new Error(`登录校验返回内容无法解析: ${error.message}`);
        }
    }
    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `登录校验失败: ${response.status}`);
    }
    return payload.data || null;
}

async function syncCurrentAuth(options = {}) {
    const redirectOnFail = options.redirectOnFail === true;
    try {
        const account = typeof fetchCurrentAccount === 'function'
            ? await fetchCurrentAccount()
            : await fetchAuthMeDirect();
        if (!account) {
            throw new Error('未获取到当前登录信息');
        }
        setAuth(account);
        window._ksAuth = account;
        return account;
    } catch (error) {
        clearAuth();
        window._ksAuth = null;
        if (redirectOnFail) {
            redirectToLogin();
        }
        return null;
    }
}

async function logoutSession() {
    try {
        if (typeof requestAccountsApi === 'function') {
            await requestAccountsApi('/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
        } else {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin',
            });
        }
    } catch (error) {
    } finally {
        clearAuth();
        window._ksAuth = null;
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (isLoginPage()) {
        return;
    }
    window.ksAuthSyncPromise = syncCurrentAuth({ redirectOnFail: true }).then((auth) => {
        if (auth && !window._ksAuth) {
            window._ksAuth = auth;
        }
        return auth;
    });
});
