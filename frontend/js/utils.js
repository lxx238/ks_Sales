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

// 各案件默认打印参数（与后端 backend/core/print_settings.py 保持一致，单位：英寸）
// 必须与后端 CASE_DEFAULTS / SHEET_DEFAULTS 同步维护。
window.KS_PRINT_DEFAULTS = {
    ko_normal: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.75, margin_bottom: 0.75, margin_left: 0.7, margin_right: 0.7 },
    ko_simple: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.75, margin_bottom: 0.75, margin_left: 0.7, margin_right: 0.7 },
    ko_ksd: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.75, margin_bottom: 0.75, margin_left: 0.7, margin_right: 0.7 },
    ja_EST: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.75, margin_bottom: 0.75, margin_left: 0.7, margin_right: 0.7 },
    ja_normal: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: true, margin_top: 1.2 / 2.54, margin_bottom: 0.4 / 2.54, margin_left: 1.2 / 2.54, margin_right: 1.2 / 2.54 },
    ja_nv: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.75, margin_bottom: 0.75, margin_left: 0.25, margin_right: 0.25 },
    en_simple: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.75, margin_bottom: 0.75, margin_left: 0.7, margin_right: 0.7 },
    en_common: { orientation: 'portrait', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.5, margin_bottom: 0.5, margin_left: 0.25, margin_right: 0.25 },
    ap_common: { orientation: 'landscape', fit_mode: 'fit_width', horizontal_centered: false, margin_top: 0.75, margin_bottom: 0.75, margin_left: 0.7, margin_right: 0.7 },
};
window.KS_PRINT_LABELS = {
    ko_normal: '韩语-标准', ko_simple: '韩语-简易', ko_ksd: '韩语-KSD',
    ja_EST: '日语-EST', ja_normal: '日语-普通', ja_nv: '日语-NV',
    en_simple: '英语-简易', en_common: '英语-通用', ap_common: '亚太分销',
};
// 打印字段顺序（用于渲染表格）
window.KS_PRINT_FIELDS = ['orientation', 'fit_mode', 'horizontal_centered', 'margin_top', 'margin_bottom', 'margin_left', 'margin_right'];
