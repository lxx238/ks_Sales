const ACCOUNTS_API_BASE_URL = typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : buildApiBaseUrl();

function roleToTarget(role) {
    switch (role) {
        case 'admin': return 'admin.html';
        case '总助': return 'app.html?page=schedule';
        default: return 'app.html?group=韩语组';
    }
}

async function readAccountsApiJson(response) {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const rawText = await response.text();
    if (!rawText) return {};
    if (!contentType.includes('application/json')) {
        throw new Error(`接口返回了非 JSON 内容: ${rawText.slice(0, 200)}`);
    }
    try {
        return JSON.parse(rawText);
    } catch (error) {
        throw new Error(`接口返回 JSON 解析失败: ${error.message}`);
    }
}

async function requestAccountsApi(path, options = {}) {
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
    const url = `${ACCOUNTS_API_BASE_URL}${normalizedPath}`;
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
    });
    const payload = await readAccountsApiJson(response);
    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `请求失败: ${response.status}`);
    }
    return payload;
}

function normalizeAccountPayload(account) {
    if (!account) return null;
    return {
        ...account,
        target: account.target || roleToTarget(account.role),
    };
}

async function loginAccount(username, password) {
    const payload = await requestAccountsApi('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: String(username || '').trim(),
            password: String(password || '').trim(),
        }),
    });
    return normalizeAccountPayload(payload.data);
}

async function fetchCurrentAccount() {
    const payload = await requestAccountsApi('/auth/me', {
        method: 'GET',
        cache: 'no-store',
    });
    return normalizeAccountPayload(payload.data);
}

async function fetchAccounts() {
    const payload = await requestAccountsApi('/auth/accounts', {
        method: 'GET',
        cache: 'no-store',
    });
    return Array.isArray(payload.items) ? payload.items.map(normalizeAccountPayload) : [];
}

async function upsertAccount(account) {
    const payload = await requestAccountsApi('/auth/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: String(account?.username || '').trim(),
            password: String(account?.password || '').trim(),
            name: String(account?.name || '').trim(),
            role: String(account?.role || '').trim(),
            enabled: account?.enabled !== false,
            permissions: Array.isArray(account?.permissions) ? account.permissions : undefined,
            nickname: String(account?.nickname || '').trim(),
            mob: String(account?.mob || '').trim(),
            tel: String(account?.tel || '').trim(),
            fax: String(account?.fax || '').trim(),
            email: String(account?.email || '').trim(),
            dingtalkId: String(account?.dingtalkId || '').trim(),
            group: String(account?.group || '').trim(),
        }),
    });
    return normalizeAccountPayload(payload.data);
}

async function updateAccountPassword(username, password) {
    return requestAccountsApi(`/auth/accounts/${encodeURIComponent(username)}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: String(password || '').trim() }),
    });
}

async function toggleAccount(username, enabled) {
    return requestAccountsApi(`/auth/accounts/${encodeURIComponent(username)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !!enabled }),
    });
}

async function deleteAccount(username) {
    return requestAccountsApi(`/auth/accounts/${encodeURIComponent(username)}`, {
        method: 'DELETE',
    });
}

async function resetAccounts() {
    const payload = await requestAccountsApi('/auth/accounts/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });
    return Array.isArray(payload.items) ? payload.items.map(normalizeAccountPayload) : [];
}

async function importAccounts(file) {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${ACCOUNTS_API_BASE_URL}/auth/accounts/import`;
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
    });
    const payload = await readAccountsApiJson(response);
    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `导入失败: ${response.status}`);
    }
    return payload;
}

async function importDingtalkUserids(file) {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${ACCOUNTS_API_BASE_URL}/auth/accounts/import-userids`;
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
    });
    const payload = await readAccountsApiJson(response);
    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `导入失败: ${response.status}`);
    }
    return payload;
}

function downloadImportTemplate() {
    const url = `${ACCOUNTS_API_BASE_URL}/auth/accounts/import-template`;
    const link = document.createElement('a');
    link.href = url;
    link.download = '账号导入模板.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
