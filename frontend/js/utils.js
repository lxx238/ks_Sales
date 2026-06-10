function buildApiBaseUrl() {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    if (window.location.origin && /^https?:/i.test(window.location.origin)) {
        return `${window.location.origin}/api`;
    }
    const hostname = window.location.hostname || '';
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return `${protocol}//${hostname}:5000/api`;
    }
    return `${protocol}//127.0.0.1:5000/api`;
}

const KS_API_BASE_URL = buildApiBaseUrl();
window.KS_API_BASE_URL = KS_API_BASE_URL;

async function readApiJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        if (response.status === 413) {
            const limitMb = Math.round(64 * 1024 * 1024 / (1024 * 1024));
            throw new Error(`上传文件过大，当前限制为 ${limitMb}MB`);
        }
        const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
        const statusText = response.status ? `HTTP ${response.status}` : '接口';
        throw new Error(`${statusText} 返回了非 JSON 内容${snippet ? `: ${snippet}` : ''}`);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatFileSize(size) {
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    const mb = size / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)}MB`;
    const kb = size / 1024;
    return `${kb.toFixed(1)}KB`;
}

function buildFrontendPageUrl(target) {
    const normalizedTarget = String(target || '').trim() || 'login.html';
    const frontendBase = new URL('./', window.location.href);
    return new URL(normalizedTarget, frontendBase);
}

function resolveFrontendPageTarget(target) {
    try {
        const url = buildFrontendPageUrl(target);
        return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
        return String(target || '').trim() || 'login.html';
    }
}
