(() => {
    let auth = null;
    let currentUser = '';

    const state = {
        overview: null,
        unread: null,
        unreadError: '',
        records: [],
        cacheItems: [],
        recordStatus: '',
        recordDateFrom: '',
        recordDateTo: '',
        recordMainTab: 'sent',
        recordDirection: 'all',
        recordPage: 1,
        recordPageSize: 20,
        recordTotal: 0,
        cacheKeyword: '',
        cacheType: '',
        cacheExpiry: '',
        selectedCacheIds: new Set(),
        recordsLoading: false,
        cacheLoading: false,
        overviewLoading: false,
    };

    const elements = {};
    let containerEl = null;
    let cleanupFns = [];

    function getApiBaseUrl() {
        if (typeof KS_API_BASE_URL !== 'undefined' && KS_API_BASE_URL) {
            return KS_API_BASE_URL;
        }
        if (window.KS_API_BASE_URL) {
            return window.KS_API_BASE_URL;
        }
        if (typeof buildApiBaseUrl === 'function') {
            return buildApiBaseUrl();
        }
        const origin = window.location.origin || 'http://127.0.0.1:5000';
        return `${origin}/api`;
    }

    function buildApiUrl(path) {
        const base = getApiBaseUrl();
        const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
        return `${base}${normalizedPath}`;
    }

    function isLatin1Safe(value) {
        return Array.from(String(value || '')).every((char) => char.codePointAt(0) <= 0xFF);
    }

    function buildAuthHeaders(extra = {}, options = {}) {
        const headers = { ...extra };
        const roleValue = String(auth?.role || '').trim();
        const userValue = String(currentUser || '').trim();
        const needsAdminAuth = options.adminOnly === true;
        const includeUser = options.includeUser === true;

        if (needsAdminAuth && roleValue === 'admin') {
            headers['X-KS-Role'] = 'admin';
            if (userValue && isLatin1Safe(userValue)) {
                headers['X-KS-User'] = userValue;
            }
        } else if (includeUser && userValue && isLatin1Safe(userValue)) {
            headers['X-KS-User'] = userValue;
        }

        return headers;
    }

    async function requestJson(path, options = {}) {
        const url = buildApiUrl(path);
        const fetchOptions = { credentials: 'same-origin', ...options };
        let response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (error) {
            throw new Error(`无法连接接口: ${error.message}`);
        }
        const payload = await readApiJson(response);
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || `请求失败: ${response.status}`);
        }
        return payload;
    }

    function extractFilenameFromDisposition(disposition) {
        const header = String(disposition || '').trim();
        if (!header) return '';
        const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) {
            try { return decodeURIComponent(utf8Match[1]); } catch (error) { return utf8Match[1]; }
        }
        const basicMatch = header.match(/filename=\"?([^\";]+)\"?/i);
        return basicMatch && basicMatch[1] ? basicMatch[1] : '';
    }

    async function readErrorMessage(response) {
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            const payload = await readApiJson(response);
            return payload.message || `请求失败: ${response.status}`;
        }
        const text = await response.text();
        const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
        return snippet || `请求失败: ${response.status}`;
    }

    async function requestFile(path, options = {}) {
        const url = buildApiUrl(path);
        const fetchOptions = { credentials: 'same-origin', ...options };
        let response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (error) {
            throw new Error(`无法连接接口: ${error.message}`);
        }
        if (!response.ok) {
            throw new Error(await readErrorMessage(response));
        }
        const blob = await response.blob();
        return {
            blob,
            filename: extractFilenameFromDisposition(response.headers.get('content-disposition')) || '',
        };
    }

    function triggerBlobDownload(blob, filename) {
        const link = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = filename || 'download.bin';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    function ensureStyles() {
        if (document.getElementById('email-mgmt-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'email-mgmt-inline-styles';
        style.textContent = `
            .email-mgmt {
                display: grid;
                gap: 18px;
                margin-top: 20px;
                min-width: 0;
                overflow: hidden;
            }
            .email-mgmt .section-card {
                background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
                border: 1px solid #dbe7f5;
                border-radius: 18px;
                padding: 18px;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
                min-width: 0;
                overflow: hidden;
            }
            .email-mgmt .section-card h3 {
                margin: 0 0 6px;
                font-size: 18px;
                color: #0f172a;
            }
            .email-mgmt .section-note {
                margin: 0 0 16px;
                color: #64748b;
                font-size: 13px;
            }
            .email-mgmt .cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 12px;
            }
            .email-mgmt .metric-card {
                border-radius: 16px;
                padding: 14px 16px;
                border: 1px solid #d8e5f5;
                background: linear-gradient(160deg, #ffffff 0%, #eef6ff 100%);
            }
            .email-mgmt .metric-label {
                font-size: 12px;
                color: #64748b;
                margin-bottom: 8px;
            }
            .email-mgmt .metric-value {
                font-size: 28px;
                line-height: 1.1;
                color: #0f172a;
                font-weight: 700;
            }
            .email-mgmt .metric-sub {
                margin-top: 6px;
                font-size: 12px;
                color: #64748b;
            }
            .email-mgmt .toolbar-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 12px;
                align-items: end;
                margin-top: 16px;
                min-width: 0;
            }
            .email-mgmt .toolbar-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
                min-width: 0;
            }
            .email-mgmt .toolbar-actions .btn {
                min-width: 96px;
            }
            .email-mgmt .split-toolbar {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                min-width: 0;
            }
            .email-mgmt .filters {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: end;
                min-width: 0;
            }
            .email-mgmt .table-wrap {
                overflow: auto;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                background: #fff;
                max-width: 100%;
            }
            .email-mgmt table {
                min-width: 600px;
                width: 100%;
                background: #fff;
            }
            .email-mgmt #email-mgmt-cache-table {
                table-layout: fixed;
                width: auto;
                min-width: 0;
            }
            .email-mgmt #email-mgmt-cache-table th,
            .email-mgmt #email-mgmt-cache-table td {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .email-mgmt th,
            .email-mgmt td {
                white-space: nowrap;
                vertical-align: top;
            }
            .email-mgmt .muted-cell {
                color: #94a3b8;
            }
            .email-mgmt .status-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 600;
                border: 1px solid transparent;
            }
            .email-mgmt .status-pill.sent {
                background: #fff7ed;
                color: #9a3412;
                border-color: #fed7aa;
            }
            .email-mgmt .status-pill.parsed {
                background: #ecfdf5;
                color: #166534;
                border-color: #bbf7d0;
            }
            .email-mgmt .status-pill.failed {
                background: #fef2f2;
                color: #b91c1c;
                border-color: #fecaca;
            }
            .email-mgmt .status-pill.forwarded {
                background: #eff6ff;
                color: #1e40af;
                border-color: #bfdbfe;
            }
            .email-mgmt .status-pill.valid {
                background: #ecfdf5;
                color: #166534;
                border-color: #bbf7d0;
            }
            .email-mgmt .status-pill.expired {
                background: #fef2f2;
                color: #b91c1c;
                border-color: #fecaca;
            }
            .email-mgmt .status-pill.unknown {
                background: #f8fafc;
                color: #475569;
                border-color: #cbd5e1;
            }
            .email-mgmt .notice {
                margin-top: 12px;
            }
            .email-mgmt .count-bar {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin: 12px 0;
            }
            .email-mgmt .count-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 10px;
                border-radius: 999px;
                background: #f8fafc;
                border: 1px solid #dbe3ef;
                color: #334155;
                font-size: 12px;
            }
            .email-mgmt .empty-tip {
                padding: 32px 16px;
                text-align: center;
                color: #94a3b8;
            }
            .email-mgmt .select-col {
                width: 38px;
                text-align: center;
            }
            .email-mgmt .row-actions {
                display: flex;
                gap: 8px;
            }
            .email-mgmt-modal {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.45);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                padding: 16px;
            }
            .email-mgmt-modal-content {
                width: min(1080px, calc(100vw - 32px));
                max-height: calc(100vh - 32px);
                overflow: auto;
                background: #fff;
                border-radius: 20px;
                padding: 20px;
                box-shadow: 0 30px 80px rgba(15, 23, 42, 0.25);
            }
            .email-mgmt-modal-head {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 14px;
            }
            .email-mgmt-modal-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 14px;
            }
            .email-mgmt-modal-block {
                margin-top: 14px;
            }
            .email-mgmt-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 2000;
                max-width: min(420px, calc(100vw - 32px));
                padding: 14px 18px;
                border-radius: 14px;
                background: #fff;
                box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18);
                border-left: 4px solid #2563eb;
            }
            .email-mgmt-notification.success { border-left-color: #16a34a; }
            .email-mgmt-notification.error { border-left-color: #dc2626; }
            @media (max-width: 768px) {
                .email-mgmt .toolbar-grid,
                .email-mgmt .filters,
                .email-mgmt .split-toolbar,
                .email-mgmt .toolbar-actions {
                    flex-direction: column;
                    align-items: stretch;
                }
                .email-mgmt .toolbar-actions .btn {
                    width: 100%;
                }
            }
            .email-mgmt-tabs {
                display: flex;
                gap: 0;
                border-bottom: 2px solid #e2e8f0;
                margin-bottom: 14px;
            }
            .email-mgmt-tab {
                padding: 8px 18px;
                font-size: 13px;
                font-weight: 600;
                color: #64748b;
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                cursor: pointer;
                transition: color 0.15s, border-color 0.15s;
            }
            .email-mgmt-tab:hover {
                color: #0f766e;
            }
            .email-mgmt-tab.active {
                color: #0f766e;
                border-bottom-color: #0f766e;
            }
            .step-lights {
                display: inline-flex;
                align-items: center;
                gap: 0;
            }
            .step-dot {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                display: inline-block;
                flex-shrink: 0;
            }
            .step-dot.step-done {
                background: #22c55e;
                box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
            }
            .step-dot.step-pending {
                background: #d1d5db;
            }
            .step-dot.step-fail {
                background: #ef4444;
                box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);
            }
            .step-line {
                width: 18px;
                height: 2px;
                background: #d1d5db;
                display: inline-block;
            }
            .step-line.step-line-done {
                background: #22c55e;
            }
            .email-mgmt-pagination {
                display: flex;
                justify-content: center;
                gap: 12px;
                margin-top: 14px;
            }
            .email-mgmt-pagination .btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }

    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.email-mgmt-notification');
        if (existing) existing.remove();
        const notification = document.createElement('div');
        notification.className = `email-mgmt-notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        window.setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'all 0.3s ease';
            window.setTimeout(() => notification.remove(), 300);
        }, 2600);
    }

    function setNotice(element, message, type = 'info') {
        if (!element) return;
        if (!message) {
            element.style.display = 'none';
            element.textContent = '';
            return;
        }
        element.style.display = 'block';
        element.textContent = message;
        if (type === 'error') {
            element.style.background = '#fef2f2';
            element.style.borderColor = '#fecaca';
            element.style.color = '#991b1b';
        } else if (type === 'success') {
            element.style.background = '#ecfdf5';
            element.style.borderColor = '#bbf7d0';
            element.style.color = '#166534';
        } else {
            element.style.background = '#f8fafc';
            element.style.borderColor = '#cbd5e1';
            element.style.color = '#334155';
        }
    }

    function parseDateValue(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const normalized = raw.replace(' ', 'T');
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return null;
        return date;
    }

    function formatDate(value) {
        return String(value || '').trim() || '—';
    }

    function getRecordStatusClass(status) {
        if (status === 'parsed' || status === 'parsed_forwarded') return 'parsed';
        if (status === 'parsed_external') return 'parsed';
        if (status === 'forwarded_parse_failed') return 'forwarded';
        if (status === 'parse_failed') return 'failed';
        return 'sent';
    }

    function getRecordStatusLabel(status) {
        if (status === 'sent') return '已发送';
        if (status === 'parsed') return '已解析';
        if (status === 'parsed_forwarded') return '已转发+已解析';
        if (status === 'parsed_external') return '外部解析';
        if (status === 'forwarded_parse_failed') return '已转发/解析失败';
        if (status === 'parse_failed') return '解析失败';
        return status || '—';
    }

    function getRecordStatusPill(status) {
        return `<span class="status-pill ${getRecordStatusClass(status)}">${getRecordStatusLabel(status)}</span>`;
    }

    function getCacheStatus(item) {
        if (!item || !item.valid_until) {
            return {
                cls: 'unknown',
                label: '无有效期',
            };
        }
        if (item.is_expired) {
            return {
                cls: 'expired',
                label: '已过期',
            };
        }
        return {
            cls: 'valid',
            label: '有效',
        };
    }

    function buildMainMarkup() {
        return `
            <section class="email-mgmt">
              <div class="section-card">
                <h2>邮箱管理</h2>
                <p class="section-note">查看询价邮箱的轮询状态、回复处理情况，以及系统建立的临时价格缓存。</p>
                <div class="cards">
                  <div class="metric-card">
                    <div class="metric-label">轮询间隔</div>
                    <div class="metric-value" id="email-mgmt-poll-value">-</div>
                    <div class="metric-sub">分钟</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">未读邮件</div>
                    <div class="metric-value" id="email-mgmt-unread-value">-</div>
                    <div class="metric-sub" id="email-mgmt-unread-sub">IMAP 收件箱</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">已处理邮件</div>
                    <div class="metric-value" id="email-mgmt-processed-value">-</div>
                    <div class="metric-sub">已解析 + 解析失败</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">转发成功</div>
                    <div class="metric-value" id="email-mgmt-forwarded-value">-</div>
                    <div class="metric-sub">已回传给询价人</div>
                  </div>
                </div>
                <div class="toolbar-grid">
                  <label class="form-field">
                    <span>轮询间隔（分钟）</span>
                    <input class="input" id="email-mgmt-poll-input" type="number" min="1" max="120" step="1" placeholder="1-120" />
                  </label>
                  <div class="toolbar-actions">
                    <button class="btn primary" id="email-mgmt-save-poll-btn" type="button">保存间隔</button>
                    <button class="btn" id="email-mgmt-scan-btn" type="button">立即扫描</button>
                    <button class="btn" id="email-mgmt-refresh-overview-btn" type="button">刷新状态</button>
                  </div>
                </div>
                <div class="count-bar">
                  <span class="count-chip">调度器: <strong id="email-mgmt-scheduler-status">—</strong></span>
                  <span class="count-chip">上次扫描: <strong id="email-mgmt-last-scan">—</strong></span>
                  <span class="count-chip">缓存总数: <strong id="email-mgmt-cache-total">0</strong></span>
                  <span class="count-chip">碳钢: <strong id="email-mgmt-cache-carbon">0</strong></span>
                  <span class="count-chip">其他: <strong id="email-mgmt-cache-other">0</strong></span>
                  <span class="count-chip">有效: <strong id="email-mgmt-cache-valid">0</strong></span>
                  <span class="count-chip">过期: <strong id="email-mgmt-cache-expired">0</strong></span>
                </div>
                <div id="email-mgmt-overview-notice" class="notice" style="display:none;"></div>
              </div>

              <div class="section-card">
                <h3>邮件记录</h3>
                <div class="email-mgmt-tabs">
                  <button class="email-mgmt-tab active" data-record-tab="all">汇总</button>
                  <button class="email-mgmt-tab" data-record-tab="sent_inquiry">询价邮件</button>
                  <button class="email-mgmt-tab" data-record-tab="sent_forward">转发邮件</button>
                  <button class="email-mgmt-tab" data-record-tab="received_reply">回复邮件</button>
                  <button class="email-mgmt-tab" data-record-tab="received_forward">转发给我</button>
                </div>
                <div class="count-bar">
                  <span class="count-chip">当前页: <strong id="email-mgmt-record-visible-count">0</strong></span>
                  <span class="count-chip">总记录: <strong id="email-mgmt-record-total-count">0</strong></span>
                  <span class="count-chip">第 <strong id="email-mgmt-record-page-num">1</strong> / <strong id="email-mgmt-record-page-total">1</strong> 页</span>
                </div>
                <div class="table-wrap">
                  <table>
                    <thead id="email-mgmt-records-head"></thead>
                    <tbody id="email-mgmt-records-body"></tbody>
                  </table>
                </div>
                <div class="email-mgmt-pagination">
                  <button class="btn small" id="email-mgmt-record-prev" type="button">上一页</button>
                  <button class="btn small" id="email-mgmt-record-next" type="button">下一页</button>
                </div>
                <div id="email-mgmt-records-notice" class="notice" style="display:none;"></div>
              </div>

              <div class="section-card">
                <div class="split-toolbar">
                  <div>
                    <h3>临时数据库物料情况</h3>
                    <p class="section-note">这里展示从供应商回复中解析并写入的价格缓存，可按物料类型和有效期筛选。</p>
                  </div>
                  <div class="filters">
                    <label class="form-field">
                      <span>搜索</span>
                      <input class="input" id="email-mgmt-cache-keyword" type="text" placeholder="物料编码 / 名称 / 规格" />
                    </label>
                    <label class="form-field">
                      <span>物料类型</span>
                      <select class="input" id="email-mgmt-cache-type">
                        <option value="">全部</option>
                        <option value="carbon">碳钢</option>
                        <option value="other">其他</option>
                      </select>
                    </label>
                    <label class="form-field">
                      <span>有效期</span>
                      <select class="input" id="email-mgmt-cache-expiry">
                        <option value="">全部</option>
                        <option value="valid">有效</option>
                        <option value="expired">已过期</option>
                        <option value="none">无有效期</option>
                      </select>
                    </label>
                    <div class="toolbar-actions">
                      <button class="btn" id="email-mgmt-cache-search-btn" type="button">搜索</button>
                      <button class="btn" id="email-mgmt-cache-refresh-btn" type="button">刷新缓存</button>
                      <button class="btn warn" id="email-mgmt-cache-delete-btn" type="button">删除选中</button>
                      <button class="btn primary" id="email-mgmt-cache-export-btn" type="button">导出 Excel</button>
                    </div>
                  </div>
                </div>
                <div class="count-bar">
                  <span class="count-chip">当前显示: <strong id="email-mgmt-cache-visible-count">0</strong></span>
                  <span class="count-chip">已选中: <strong id="email-mgmt-cache-selected-count">0</strong></span>
                </div>
                <div class="table-wrap">
                  <table id="email-mgmt-cache-table">
                    <colgroup>
                      <col style="width:36px" />
                      <col style="width:110px" />
                      <col style="width:100px" />
                      <col style="width:80px" />
                      <col style="width:50px" />
                      <col style="width:80px" />
                      <col style="width:80px" />
                      <col style="width:80px" />
                      <col style="width:44px" />
                      <col style="width:80px" />
                      <col style="width:80px" />
                      <col style="width:60px" />
                      <col style="width:60px" />
                      <col style="width:120px" />
                      <col style="width:50px" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th class="select-col"><input type="checkbox" id="email-mgmt-cache-select-all" /></th>
                        <th>物料编码</th>
                        <th>名称</th>
                        <th>规格</th>
                        <th>数量</th>
                        <th>单价(美元)</th>
                        <th>单价(人民币)</th>
                        <th>单价(欧元)</th>
                        <th>单位</th>
                        <th>报价日期</th>
                        <th>有效期</th>
                        <th>状态</th>
                        <th>询价人</th>
                        <th>来源邮件</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody id="email-mgmt-cache-body"></tbody>
                  </table>
                </div>
                <div id="email-mgmt-cache-notice" class="notice" style="display:none;"></div>
              </div>
            </section>
        `;
    }

    function cacheElements() {
        elements.pollValue = document.getElementById('email-mgmt-poll-value');
        elements.unreadValue = document.getElementById('email-mgmt-unread-value');
        elements.unreadSub = document.getElementById('email-mgmt-unread-sub');
        elements.processedValue = document.getElementById('email-mgmt-processed-value');
        elements.forwardedValue = document.getElementById('email-mgmt-forwarded-value');
        elements.pollInput = document.getElementById('email-mgmt-poll-input');
        elements.savePollBtn = document.getElementById('email-mgmt-save-poll-btn');
        elements.scanBtn = document.getElementById('email-mgmt-scan-btn');
        elements.refreshOverviewBtn = document.getElementById('email-mgmt-refresh-overview-btn');
        elements.lastScan = document.getElementById('email-mgmt-last-scan');
        elements.schedulerStatus = document.getElementById('email-mgmt-scheduler-status');
        elements.cacheTotal = document.getElementById('email-mgmt-cache-total');
        elements.cacheCarbon = document.getElementById('email-mgmt-cache-carbon');
        elements.cacheOther = document.getElementById('email-mgmt-cache-other');
        elements.cacheValid = document.getElementById('email-mgmt-cache-valid');
        elements.cacheExpired = document.getElementById('email-mgmt-cache-expired');
        elements.overviewNotice = document.getElementById('email-mgmt-overview-notice');

        elements.recordStatus = document.getElementById('email-mgmt-record-status');
        elements.recordDateFrom = document.getElementById('email-mgmt-record-date-from');
        elements.recordDateTo = document.getElementById('email-mgmt-record-date-to');
        elements.recordRefreshBtn = document.getElementById('email-mgmt-record-refresh-btn');
        elements.recordVisibleCount = document.getElementById('email-mgmt-record-visible-count');
        elements.recordTotalCount = document.getElementById('email-mgmt-record-total-count');
        elements.recordPageNum = document.getElementById('email-mgmt-record-page-num');
        elements.recordPageTotal = document.getElementById('email-mgmt-record-page-total');
        elements.recordsBody = document.getElementById('email-mgmt-records-body');
        elements.recordsHead = document.getElementById('email-mgmt-records-head');
        elements.recordsNotice = document.getElementById('email-mgmt-records-notice');
        elements.recordPrev = document.getElementById('email-mgmt-record-prev');
        elements.recordNext = document.getElementById('email-mgmt-record-next');
        elements.recordTabs = containerEl.querySelectorAll('[data-record-tab]');

        elements.cacheKeyword = document.getElementById('email-mgmt-cache-keyword');
        elements.cacheType = document.getElementById('email-mgmt-cache-type');
        elements.cacheExpiry = document.getElementById('email-mgmt-cache-expiry');
        elements.cacheSearchBtn = document.getElementById('email-mgmt-cache-search-btn');
        elements.cacheRefreshBtn = document.getElementById('email-mgmt-cache-refresh-btn');
        elements.cacheDeleteBtn = document.getElementById('email-mgmt-cache-delete-btn');
        elements.cacheExportBtn = document.getElementById('email-mgmt-cache-export-btn');
        elements.cacheVisibleCount = document.getElementById('email-mgmt-cache-visible-count');
        elements.cacheSelectedCount = document.getElementById('email-mgmt-cache-selected-count');
        elements.cacheSelectAll = document.getElementById('email-mgmt-cache-select-all');
        elements.cacheBody = document.getElementById('email-mgmt-cache-body');
        elements.cacheNotice = document.getElementById('email-mgmt-cache-notice');
    }

    function setOverviewLoading(loading) {
        state.overviewLoading = loading;
        [elements.savePollBtn, elements.scanBtn, elements.refreshOverviewBtn, elements.pollInput]
            .forEach((el) => { if (el) el.disabled = loading; });
    }

    function setRecordsLoading(loading) {
        state.recordsLoading = loading;
        [elements.recordStatus, elements.recordDateFrom, elements.recordDateTo, elements.recordRefreshBtn]
            .forEach((el) => { if (el) el.disabled = loading; });
        if (loading && elements.recordsBody) {
            elements.recordsBody.innerHTML = '<tr><td colspan="8" class="empty-tip">正在加载记录...</td></tr>';
        }
    }

    function setCacheLoading(loading) {
        state.cacheLoading = loading;
        [
            elements.cacheKeyword,
            elements.cacheType,
            elements.cacheExpiry,
            elements.cacheSearchBtn,
            elements.cacheRefreshBtn,
            elements.cacheDeleteBtn,
            elements.cacheExportBtn,
            elements.cacheSelectAll,
        ].forEach((el) => { if (el) el.disabled = loading; });
        if (loading && elements.cacheBody) {
            elements.cacheBody.innerHTML = '<tr><td colspan="13" class="empty-tip">正在加载缓存...</td></tr>';
        }
    }

    function renderOverview() {
        const overview = state.overview || {};
        const records = overview.records || {};
        const cache = overview.cache || {};
        const processed = Number(records.parsed || 0) + Number(records.parse_failed || 0);
        const unreadText = state.unread === null
            ? '-'
            : state.unread < 0
                ? '读取失败'
                : String(state.unread);

        if (elements.pollValue) elements.pollValue.textContent = String(overview.poll_interval ?? '-');
        if (elements.pollInput && document.activeElement !== elements.pollInput) {
            elements.pollInput.value = overview.poll_interval ?? '';
        }
        if (elements.unreadValue) elements.unreadValue.textContent = unreadText;
        if (elements.unreadSub) {
            elements.unreadSub.textContent = state.unreadError
                ? state.unreadError
                : 'IMAP 收件箱';
        }
        if (elements.processedValue) elements.processedValue.textContent = String(processed);
        if (elements.forwardedValue) elements.forwardedValue.textContent = String(records.forwarded || 0);
        if (elements.lastScan) elements.lastScan.textContent = formatDate(overview.last_scan_time);
        if (elements.schedulerStatus) {
            const running = overview.scheduler_running;
            elements.schedulerStatus.textContent = running ? '运行中' : '未启动';
            elements.schedulerStatus.style.color = running ? '#166534' : '#b91c1c';
        }

        if (elements.cacheTotal) elements.cacheTotal.textContent = String(cache.total || 0);
        if (elements.cacheCarbon) elements.cacheCarbon.textContent = String(cache.carbon_steel || 0);
        if (elements.cacheOther) elements.cacheOther.textContent = String(cache.other || 0);
        if (elements.cacheValid) elements.cacheValid.textContent = String(cache.valid || 0);
        if (elements.cacheExpired) elements.cacheExpired.textContent = String(cache.expired || 0);
    }

    function getFilteredRecords() {
        const from = state.recordDateFrom ? new Date(`${state.recordDateFrom}T00:00:00`) : null;
        const to = state.recordDateTo ? new Date(`${state.recordDateTo}T23:59:59`) : null;
        return state.records.filter((item) => {
            if (state.recordStatus && item.status !== state.recordStatus) return false;
            if (from || to) {
                const time = parseDateValue(item.email_sent_at || item.created_at);
                if (!time) return false;
                if (from && time < from) return false;
                if (to && time > to) return false;
            }
            return true;
        });
    }

    function buildStepLights(item) {
        const s = item.status || '';
        const hasReply = !!item.reply_received_at || s !== 'sent';
        const hasParsed = s === 'parsed' || s === 'parsed_forwarded';
        const parseFailed = s === 'parse_failed' || s === 'forwarded_parse_failed';
        const hasForwarded = !!item.forwarded_to;
        const steps = [
            { label: '询价', done: true },
            { label: '回复', done: hasReply },
            { label: '转发', done: hasForwarded },
            { label: '解析', done: hasParsed, fail: parseFailed },
        ];
        return '<div class="step-lights">' + steps.map((st, i) => {
            const cls = st.fail ? 'step-fail' : (st.done ? 'step-done' : 'step-pending');
            const sep = i < steps.length - 1
                ? `<span class="step-line ${st.done && steps[i + 1].done ? 'step-line-done' : ''}"></span>` : '';
            return `<span class="step-dot ${cls}" title="${st.label}"></span>${sep}`;
        }).join('') + '</div>';
    }

    function renderRecords() {
        if (!elements.recordsBody) return;
        const records = getFilteredRecords();
        const totalPages = Math.max(1, Math.ceil(state.recordTotal / state.recordPageSize));
        if (elements.recordVisibleCount) elements.recordVisibleCount.textContent = String(records.length);
        if (elements.recordTotalCount) elements.recordTotalCount.textContent = String(state.recordTotal);
        if (elements.recordPageNum) elements.recordPageNum.textContent = String(state.recordPage);
        if (elements.recordPageTotal) elements.recordPageTotal.textContent = String(totalPages);
        if (elements.recordPrev) elements.recordPrev.disabled = state.recordPage <= 1;
        if (elements.recordNext) elements.recordNext.disabled = state.recordPage >= totalPages;

        const dir = state.recordDirection;
        const headMap = {
            all: '<tr><th>ID</th><th>项目名</th><th>询价人</th><th>物料数</th><th>进度</th><th>最后更新</th><th>操作</th></tr>',
            sent_inquiry: '<tr><th>ID</th><th>项目名</th><th>询价人</th><th>物料数</th><th>进度</th><th>邮件主题</th><th>发送时间</th><th>操作</th></tr>',
            sent_forward: '<tr><th>ID</th><th>项目名</th><th>询价人</th><th>物料数</th><th>转发时间</th><th>转发给</th><th>操作</th></tr>',
            received_reply: '<tr><th>ID</th><th>项目名</th><th>询价人</th><th>物料数</th><th>状态</th><th>回复时间</th><th>操作</th></tr>',
            received_forward: '<tr><th>ID</th><th>来源邮件</th><th>发件人</th><th>物料数</th><th>解析时间</th><th>操作</th></tr>',
        };
        if (elements.recordsHead) {
            elements.recordsHead.innerHTML = headMap[dir] || headMap.all;
        }

        if (!records.length) {
            const colCount = (elements.recordsHead?.querySelectorAll('th') || []).length || 7;
            elements.recordsBody.innerHTML = `<tr><td colspan="${colCount}" class="empty-tip">当前没有符合条件的记录</td></tr>`;
            return;
        }

        elements.recordsBody.innerHTML = records.map((item) => {
            const btn = `<button class="btn small primary" type="button" data-record-detail="${item.id}">详情</button>`;
            switch (dir) {
                case 'all':
                    return `<tr>
                        <td>${escapeHtml(item.id)}</td>
                        <td>${escapeHtml(item.project_name || '—')}</td>
                        <td>${escapeHtml(item.inquiry_requester || '—')}</td>
                        <td>${escapeHtml(item.material_count ?? 0)}</td>
                        <td>${buildStepLights(item)}</td>
                        <td>${escapeHtml(formatDate(item.reply_received_at || item.email_sent_at || item.created_at))}</td>
                        <td><div class="row-actions">${btn}</div></td>
                    </tr>`;
                case 'sent_inquiry':
                    return `<tr>
                        <td>${escapeHtml(item.id)}</td>
                        <td>${escapeHtml(item.project_name || '—')}</td>
                        <td>${escapeHtml(item.inquiry_requester || '—')}</td>
                        <td>${escapeHtml(item.material_count ?? 0)}</td>
                        <td>${buildStepLights(item)}</td>
                        <td>${escapeHtml(item.email_subject || '—')}</td>
                        <td>${escapeHtml(formatDate(item.email_sent_at || item.created_at))}</td>
                        <td><div class="row-actions">${btn}</div></td>
                    </tr>`;
                case 'sent_forward':
                    return `<tr>
                        <td>${escapeHtml(item.id)}</td>
                        <td>${escapeHtml(item.project_name || '—')}</td>
                        <td>${escapeHtml(item.inquiry_requester || '—')}</td>
                        <td>${escapeHtml(item.material_count ?? 0)}</td>
                        <td>${escapeHtml(formatDate(item.reply_received_at || item.created_at))}</td>
                        <td>${escapeHtml(item.forwarded_to || '—')}</td>
                        <td><div class="row-actions">${btn}</div></td>
                    </tr>`;
                case 'received_reply':
                    return `<tr>
                        <td>${escapeHtml(item.id)}</td>
                        <td>${escapeHtml(item.project_name || '—')}</td>
                        <td>${escapeHtml(item.inquiry_requester || '—')}</td>
                        <td>${escapeHtml(item.material_count ?? 0)}</td>
                        <td>${getRecordStatusPill(item.status)}</td>
                        <td>${escapeHtml(formatDate(item.reply_received_at || item.created_at))}</td>
                        <td><div class="row-actions">${btn}</div></td>
                    </tr>`;
                case 'received_forward':
                    return `<tr>
                        <td>${escapeHtml(item.id)}</td>
                        <td>${escapeHtml(item.project_name || item.email_subject || '—')}</td>
                        <td>${escapeHtml(item.inquiry_requester || '—')}</td>
                        <td>${escapeHtml(item.material_count ?? 0)}</td>
                        <td>${escapeHtml(formatDate(item.reply_received_at || item.created_at))}</td>
                        <td><div class="row-actions">${btn}</div></td>
                    </tr>`;
                default:
                    return '';
            }
        }).join('');

        elements.recordsBody.querySelectorAll('[data-record-detail]').forEach((b) => {
            const handler = () => showRecordDetail(Number(b.getAttribute('data-record-detail')));
            b.addEventListener('click', handler);
            cleanupFns.push(() => b.removeEventListener('click', handler));
        });
    }

    function getFilteredCacheItems() {
        return state.cacheItems.filter((item) => {
            if (state.cacheType === 'carbon' && !item.is_carbon_steel) return false;
            if (state.cacheType === 'other' && item.is_carbon_steel) return false;
            if (state.cacheExpiry === 'valid' && (item.is_expired || !item.valid_until)) return false;
            if (state.cacheExpiry === 'expired' && !item.is_expired) return false;
            if (state.cacheExpiry === 'none' && item.valid_until) return false;
            return true;
        });
    }

    function syncSelectedCacheIds() {
        const idSet = new Set(state.cacheItems.map((item) => Number(item.id)));
        state.selectedCacheIds = new Set(Array.from(state.selectedCacheIds).filter((id) => idSet.has(Number(id))));
    }

    function updateCacheSelectionSummary() {
        if (elements.cacheSelectedCount) {
            elements.cacheSelectedCount.textContent = String(state.selectedCacheIds.size);
        }
        const filtered = getFilteredCacheItems();
        if (elements.cacheSelectAll) {
            const visibleIds = filtered.map((item) => Number(item.id));
            elements.cacheSelectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => state.selectedCacheIds.has(id));
            elements.cacheSelectAll.indeterminate = visibleIds.some((id) => state.selectedCacheIds.has(id)) && !elements.cacheSelectAll.checked;
        }
    }

    function renderCacheTable() {
        if (!elements.cacheBody) return;
        const items = getFilteredCacheItems();
        if (elements.cacheVisibleCount) elements.cacheVisibleCount.textContent = String(items.length);
        updateCacheSelectionSummary();

        if (!items.length) {
            elements.cacheBody.innerHTML = '<tr><td colspan="15" class="empty-tip">当前没有符合条件的缓存物料</td></tr>';
            return;
        }

        elements.cacheBody.innerHTML = items.map((item) => {
            const status = getCacheStatus(item);
            return `
                <tr>
                  <td class="select-col">
                    <input type="checkbox" data-cache-select="${item.id}" ${state.selectedCacheIds.has(Number(item.id)) ? 'checked' : ''} />
                  </td>
                  <td>${escapeHtml(item.material_code || '—')}</td>
                  <td title="${escapeHtml(item.name || '')}">${escapeHtml((item.name || '—').slice(0, 10))}</td>
                  <td>${escapeHtml(item.spec || '—')}</td>
                  <td>${escapeHtml(item.is_carbon_steel ? (item.quantity ?? 0) : '—')}</td>
                  <td>${escapeHtml(item.unit_price_usd ?? (item.unit_price && !item.unit_price_cny && !item.unit_price_eur ? item.unit_price : '—'))}</td>
                  <td>${escapeHtml(item.unit_price_cny ?? '—')}</td>
                  <td>${escapeHtml(item.unit_price_eur ?? '—')}</td>
                  <td>${escapeHtml(item.unit || '—')}</td>
                  <td>${escapeHtml(formatDate(item.quotation_date))}</td>
                  <td class="${item.is_expired ? 'muted-cell' : ''}">${escapeHtml(formatDate(item.valid_until))}</td>
                  <td><span class="status-pill ${status.cls}">${status.label}</span></td>
                  <td>${escapeHtml(item.inquirer || '—')}</td>
                  <td title="${escapeHtml(item.source_email || '')}">${escapeHtml((item.source_email || '—').slice(0, 20))}</td>
                  <td>
                    <div class="row-actions">
                      <button class="btn small warn" type="button" data-cache-delete="${item.id}">删除</button>
                    </div>
                  </td>
                </tr>
            `;
        }).join('');

        elements.cacheBody.querySelectorAll('[data-cache-select]').forEach((checkbox) => {
            const handler = () => {
                const itemId = Number(checkbox.getAttribute('data-cache-select'));
                if (checkbox.checked) state.selectedCacheIds.add(itemId);
                else state.selectedCacheIds.delete(itemId);
                updateCacheSelectionSummary();
            };
            checkbox.addEventListener('change', handler);
            cleanupFns.push(() => checkbox.removeEventListener('change', handler));
        });

        elements.cacheBody.querySelectorAll('[data-cache-delete]').forEach((btn) => {
            const handler = () => deleteOneCacheItem(Number(btn.getAttribute('data-cache-delete')));
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });
    }

    async function loadOverview(options = {}) {
        const refreshUnread = options.refreshUnread !== false;
        try {
            setOverviewLoading(true);
            const tasks = [API.getOverview()];
            if (refreshUnread) tasks.push(API.getUnreadCount());
            const [overview, unreadResult] = await Promise.all(tasks);
            state.overview = overview;
            if (refreshUnread && unreadResult) {
                state.unread = Number(unreadResult.unread);
                state.unreadError = unreadResult.error ? String(unreadResult.error) : '';
            }
            renderOverview();
            setNotice(elements.overviewNotice, '邮箱状态已刷新', 'success');
        } catch (error) {
            setNotice(elements.overviewNotice, error.message || '加载邮箱状态失败', 'error');
        } finally {
            setOverviewLoading(false);
        }
    }

    async function loadRecords() {
        try {
            setRecordsLoading(true);
            const result = await API.getRecords({
                direction: state.recordDirection,
                page: state.recordPage,
                pageSize: state.recordPageSize,
            });
            state.records = Array.isArray(result.records) ? result.records : [];
            state.recordTotal = result.total || 0;
            renderRecords();
            setNotice(
                elements.recordsNotice,
                state.recordTotal > 0 ? `已加载 ${state.records.length} 条记录（共 ${state.recordTotal} 条）` : '当前没有记录',
                'success'
            );
        } catch (error) {
            state.records = [];
            state.recordTotal = 0;
            renderRecords();
            setNotice(elements.recordsNotice, error.message || '加载记录失败', 'error');
        } finally {
            setRecordsLoading(false);
        }
    }

    async function loadCache() {
        try {
            setCacheLoading(true);
            const result = await API.getPriceCache(state.cacheKeyword);
            state.cacheItems = Array.isArray(result.items) ? result.items : [];
            syncSelectedCacheIds();
            renderCacheTable();
            setNotice(
                elements.cacheNotice,
                state.cacheItems.length > 0 ? `已加载 ${state.cacheItems.length} 条缓存物料` : '当前没有缓存物料',
                'success'
            );
        } catch (error) {
            state.cacheItems = [];
            state.selectedCacheIds.clear();
            renderCacheTable();
            setNotice(elements.cacheNotice, error.message || '加载缓存物料失败', 'error');
        } finally {
            setCacheLoading(false);
        }
    }

    async function loadAll() {
        await Promise.all([
            loadOverview(),
            loadRecords(),
            loadCache(),
        ]);
    }

    function createRecordDetailHtml(record, detail) {
        const items = Array.isArray(detail.reply_json) ? detail.reply_json : [];
        const detailRows = items.length ? items.map((item) => `
            <tr>
              <td>${escapeHtml(item.material_code || item['物料编码'] || '—')}</td>
              <td>${escapeHtml(item.name || item['名称'] || '—')}</td>
              <td>${escapeHtml(item.spec || item['规格'] || '—')}</td>
              <td>${escapeHtml(item.quantity || item['数量'] || '—')}</td>
              <td>${escapeHtml(item.unit_price_usd ?? item['售价-美元'] ?? (item.unit_price && !item.unit_price_cny && !item.unit_price_eur ? item.unit_price : '—'))}</td>
              <td>${escapeHtml(item.unit_price_cny ?? item['售价-人民币'] ?? '—')}</td>
              <td>${escapeHtml(item.unit_price_eur ?? item['售价-欧元'] ?? '—')}</td>
              <td>${escapeHtml(item.unit || item['单位'] || '—')}</td>
              <td>${escapeHtml(item.valid_until || item['有效期'] || '—')}</td>
              <td>${escapeHtml(item.discount || item['折扣'] || '—')}</td>
            </tr>
        `).join('') : '<tr><td colspan="10" class="empty-tip">当前没有解析出的报价明细</td></tr>';

        return `
            <div class="email-mgmt-modal-content">
              <div class="email-mgmt-modal-head">
                <div>
                  <h3 style="margin:0;">询价记录详情</h3>
                  <div style="color:#64748b;font-size:13px;margin-top:4px;">查看当前询价邮件的解析结果与转发状态</div>
                </div>
                <button class="btn" type="button" id="email-mgmt-detail-close">关闭</button>
              </div>
              <div class="email-mgmt-modal-meta">
                <span class="count-chip">ID: <strong>${escapeHtml(record.id)}</strong></span>
                <span class="count-chip">项目名: <strong>${escapeHtml(record.project_name || '—')}</strong></span>
                <span class="count-chip">询价人: <strong>${escapeHtml(record.inquiry_requester || '—')}</strong></span>
                <span class="count-chip">状态: <strong>${getRecordStatusLabel(detail.status || record.status)}</strong></span>
                <span class="count-chip">发送时间: <strong>${escapeHtml(formatDate(record.email_sent_at || record.created_at))}</strong></span>
                <span class="count-chip">回复时间: <strong>${escapeHtml(formatDate(detail.reply_received_at))}</strong></span>
                <span class="count-chip">转发给: <strong>${escapeHtml(detail.forwarded_to || record.forwarded_to || '—')}</strong></span>
              </div>
              <div class="email-mgmt-modal-block">
                <h4 style="margin:0 0 8px;">报价明细</h4>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>物料编码</th>
                        <th>名称</th>
                        <th>规格</th>
                        <th>数量</th>
                        <th>单价(美元)</th>
                        <th>单价(人民币)</th>
                        <th>单价(欧元)</th>
                        <th>单位</th>
                        <th>有效期</th>
                        <th>折扣</th>
                      </tr>
                    </thead>
                    <tbody>${detailRows}</tbody>
                  </table>
                </div>
              </div>
            </div>
        `;
    }

    async function showRecordDetail(recordId) {
        const record = state.records.find((item) => Number(item.id) === Number(recordId));
        if (!record) return;

        let modal = document.getElementById('email-mgmt-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'email-mgmt-detail-modal';
            modal.className = 'email-mgmt-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = '<div class="email-mgmt-modal-content"><div class="empty-tip">正在加载详情...</div></div>';
        modal.style.display = 'flex';

        try {
            const detail = await API.getRecordDetail(recordId);
            modal.innerHTML = createRecordDetailHtml(record, detail);
            const closeBtn = document.getElementById('email-mgmt-detail-close');
            const closeHandler = () => { modal.style.display = 'none'; };
            closeBtn?.addEventListener('click', closeHandler);
            modal.addEventListener('click', (event) => {
                if (event.target === modal) modal.style.display = 'none';
            }, { once: true });
        } catch (error) {
            modal.style.display = 'none';
            showNotification(error.message || '加载详情失败', 'error');
        }
    }

    async function savePollInterval() {
        const minutes = Number.parseInt(String(elements.pollInput?.value || '').trim(), 10);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
            showNotification('轮询间隔必须是 1-120 之间的整数', 'error');
            return;
        }
        try {
            setOverviewLoading(true);
            const result = await API.setPollInterval(minutes);
            state.overview = {
                ...(state.overview || {}),
                poll_interval: result.interval,
            };
            renderOverview();
            setNotice(elements.overviewNotice, result.message || '轮询间隔已更新', 'success');
            showNotification(result.message || '轮询间隔已更新', 'success');
            await loadOverview({ refreshUnread: false });
        } catch (error) {
            setNotice(elements.overviewNotice, error.message || '保存轮询间隔失败', 'error');
            showNotification(error.message || '保存轮询间隔失败', 'error');
        } finally {
            setOverviewLoading(false);
        }
    }

    async function scanNow() {
        try {
            setOverviewLoading(true);
            const result = await API.scanNow();
            setNotice(elements.overviewNotice, result.message || '扫描完成', 'success');
            showNotification(result.message || '扫描完成', 'success');
            await Promise.all([
                loadOverview(),
                loadRecords(),
                loadCache(),
            ]);
        } catch (error) {
            setNotice(elements.overviewNotice, error.message || '立即扫描失败', 'error');
            showNotification(error.message || '立即扫描失败', 'error');
        } finally {
            setOverviewLoading(false);
        }
    }

    async function deleteOneCacheItem(itemId) {
        if (!window.confirm('确认删除这条缓存记录吗？')) return;
        try {
            await API.deleteCacheItem(itemId);
            state.selectedCacheIds.delete(Number(itemId));
            showNotification('缓存记录已删除', 'success');
            await Promise.all([
                loadOverview({ refreshUnread: false }),
                loadCache(),
            ]);
        } catch (error) {
            showNotification(error.message || '删除缓存记录失败', 'error');
        }
    }

    async function deleteSelectedCacheItems() {
        const ids = Array.from(state.selectedCacheIds);
        if (!ids.length) {
            showNotification('请先选择要删除的缓存记录', 'error');
            return;
        }
        if (!window.confirm(`确认删除选中的 ${ids.length} 条缓存记录吗？`)) return;
        try {
            const result = await API.deleteCacheItems(ids);
            state.selectedCacheIds.clear();
            showNotification(`已删除 ${result.deleted || 0} 条缓存记录`, 'success');
            await Promise.all([
                loadOverview({ refreshUnread: false }),
                loadCache(),
            ]);
        } catch (error) {
            showNotification(error.message || '批量删除失败', 'error');
        }
    }

    async function exportCache() {
        try {
            const result = await API.exportCache(state.cacheKeyword);
            triggerBlobDownload(result.blob, result.filename || 'price_cache_export.xlsx');
            showNotification('导出完成', 'success');
        } catch (error) {
            showNotification(error.message || '导出失败', 'error');
        }
    }

    function addEventListenerSafe(target, type, handler) {
        if (!target) return;
        target.addEventListener(type, handler);
        cleanupFns.push(() => {
            try {
                target.removeEventListener(type, handler);
            } catch (error) {
            }
        });
    }

    function bindEvents() {
        addEventListenerSafe(elements.savePollBtn, 'click', () => savePollInterval());
        addEventListenerSafe(elements.scanBtn, 'click', () => scanNow());
        addEventListenerSafe(elements.refreshOverviewBtn, 'click', () => loadOverview());

        if (elements.recordTabs) {
            elements.recordTabs.forEach((tab) => {
                const handler = () => {
                    elements.recordTabs.forEach((t) => t.classList.remove('active'));
                    tab.classList.add('active');
                    state.recordDirection = tab.getAttribute('data-record-tab') || 'all';
                    state.recordPage = 1;
                    loadRecords();
                };
                tab.addEventListener('click', handler);
                cleanupFns.push(() => tab.removeEventListener('click', handler));
            });
        }
        addEventListenerSafe(elements.recordPrev, 'click', () => {
            if (state.recordPage > 1) {
                state.recordPage -= 1;
                loadRecords();
            }
        });
        addEventListenerSafe(elements.recordNext, 'click', () => {
            const totalPages = Math.max(1, Math.ceil(state.recordTotal / state.recordPageSize));
            if (state.recordPage < totalPages) {
                state.recordPage += 1;
                loadRecords();
            }
        });

        addEventListenerSafe(elements.cacheKeyword, 'keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                state.cacheKeyword = elements.cacheKeyword.value.trim();
                loadCache();
            }
        });
        addEventListenerSafe(elements.cacheSearchBtn, 'click', () => {
            state.cacheKeyword = elements.cacheKeyword.value.trim();
            loadCache();
        });
        addEventListenerSafe(elements.cacheRefreshBtn, 'click', () => loadCache());
        addEventListenerSafe(elements.cacheType, 'change', () => {
            state.cacheType = elements.cacheType.value;
            renderCacheTable();
        });
        addEventListenerSafe(elements.cacheExpiry, 'change', () => {
            state.cacheExpiry = elements.cacheExpiry.value;
            renderCacheTable();
        });
        addEventListenerSafe(elements.cacheDeleteBtn, 'click', () => deleteSelectedCacheItems());
        addEventListenerSafe(elements.cacheExportBtn, 'click', () => exportCache());
        addEventListenerSafe(elements.cacheSelectAll, 'change', () => {
            const checked = !!elements.cacheSelectAll.checked;
            const visibleIds = getFilteredCacheItems().map((item) => Number(item.id));
            visibleIds.forEach((id) => {
                if (checked) state.selectedCacheIds.add(id);
                else state.selectedCacheIds.delete(id);
            });
            renderCacheTable();
        });
    }

    const API = {
        getOverview() {
            return requestJson('/email-mgmt/overview', {
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        getUnreadCount() {
            return requestJson('/email-mgmt/unread-count', {
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        setPollInterval(minutes) {
            return requestJson('/email-mgmt/poll-interval', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify({ minutes }),
            });
        },

        scanNow() {
            return requestJson('/inquiry-scan-now', {
                method: 'POST',
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        getRecords(opts = {}) {
            const params = new URLSearchParams();
            if (opts.direction && opts.direction !== 'all') params.set('direction', opts.direction);
            if (opts.page) params.set('page', String(opts.page));
            if (opts.pageSize) params.set('page_size', String(opts.pageSize));
            const qs = params.toString();
            return requestJson(`/inquiry-records${qs ? '?' + qs : ''}`, {
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        getRecordDetail(recordId) {
            return requestJson(`/inquiry-records/${recordId}/reply`, {
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        getPriceCache(keyword) {
            const params = new URLSearchParams();
            params.set('limit', '2000');
            if (keyword) params.set('keyword', keyword);
            return requestJson(`/inquiry-price-cache?${params.toString()}`, {
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        deleteCacheItem(itemId) {
            return requestJson(`/email-mgmt/price-cache/${itemId}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        deleteCacheItems(ids) {
            return requestJson('/email-mgmt/price-cache/batch-delete', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify({ ids }),
            });
        },

        exportCache(keyword) {
            const params = new URLSearchParams();
            if (keyword) params.set('keyword', keyword);
            const suffix = params.toString() ? `?${params.toString()}` : '';
            return requestFile(`/email-mgmt/price-cache/export${suffix}`, {
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },
    };

    function init(container) {
        auth = window._ksAuth || null;
        currentUser = auth?.username || 'anonymous';
        state.overview = null;
        state.unread = null;
        state.unreadError = '';
        state.records = [];
        state.cacheItems = [];
        state.recordStatus = '';
        state.recordDateFrom = '';
        state.recordDateTo = '';
        state.recordMainTab = 'sent';
        state.recordDirection = 'all';
        state.recordPage = 1;
        state.recordTotal = 0;
        state.cacheKeyword = '';
        state.cacheType = '';
        state.cacheExpiry = '';
        state.selectedCacheIds = new Set();

        containerEl = container;
        cleanupFns = [];

        ensureStyles();
        containerEl.innerHTML = '';
        containerEl.innerHTML = buildMainMarkup();

        cacheElements();
        bindEvents();
        renderOverview();
        renderRecords();
        renderCacheTable();
        loadAll();
    }

    function destroy() {
        cleanupFns.forEach((fn) => {
            try {
                fn();
            } catch (error) {
            }
        });
        cleanupFns = [];

        const detailModal = document.getElementById('email-mgmt-detail-modal');
        if (detailModal) detailModal.remove();

        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
        Object.keys(elements).forEach((key) => { elements[key] = null; });
    }

    window.EmailMgmtPage = { init, destroy };
})();
