(() => {
    let auth = null;
    let currentUser = '';

    const state = {
        counts: { pending: 0, priced: 0, total: 0, project_count: 0 },
        items: [],
        projects: [],
        businesses: [],
        total: 0,
        page: 1,
        pageSize: 500,
        statusFilter: '',
        projectFilter: '',
        businessFilter: '',
        keyword: '',
        savingIds: new Set(),
        cacheItems: [],
        cacheKeyword: '',
        cacheType: '',
        cacheExpiry: '',
        selectedCacheIds: new Set(),
        collapsedCases: new Set(),
        caseTonPrices: {},
        caseValidUntil: {},
        casePack: {},
        isAdmin: false,
        canEditPrice: true,
        caseLocks: {},
        caseMetas: {},
        caseAttachments: {},
    };

    const elements = {};
    let containerEl = null;
    let cleanupFns = [];

    function getApiBaseUrl() {
        if (typeof KS_API_BASE_URL !== 'undefined' && KS_API_BASE_URL) return KS_API_BASE_URL;
        if (window.KS_API_BASE_URL) return window.KS_API_BASE_URL;
        if (typeof buildApiBaseUrl === 'function') return buildApiBaseUrl();
        const origin = window.location.origin || 'http://127.0.0.1:5000';
        return `${origin}/api`;
    }

    function buildApiUrl(path) {
        const base = getApiBaseUrl();
        const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
        return `${base}${normalizedPath}`;
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
        return text.replace(/\s+/g, ' ').trim().slice(0, 120) || `请求失败: ${response.status}`;
    }

    async function requestFile(path, options = {}) {
        const url = buildApiUrl(path);
        const fetchOptions = { credentials: 'same-origin', ...options };
        const response = await fetch(url, fetchOptions);
        if (!response.ok) throw new Error(await readErrorMessage(response));
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

    function buildAuthHeaders(extra = {}, options = {}) {
        const headers = { ...extra };
        const userValue = String(currentUser || '').trim();
        if (options.includeUser && userValue) {
            const isLatin1 = Array.from(userValue).every((ch) => ch.codePointAt(0) <= 0xFF);
            if (isLatin1) headers['X-KS-User'] = userValue;
        }
        return headers;
    }

    function num(value) {
        if (value === null || value === undefined || value === '') return '';
        const n = Number(value);
        return Number.isFinite(n) ? String(n) : '';
    }

    function _matchValidDays(validUntil) {
        if (!validUntil) return 7;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(validUntil.slice(0, 10));
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.round((target - today) / 86400000);
        if ([3, 7, 15].includes(diffDays)) return diffDays;
        return 7;
    }

    function _daysToDate(days) {
        const d = new Date();
        d.setDate(d.getDate() + Number(days));
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function fmt(value) {
        return String(value ?? '').trim() || '—';
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

    function ensureStyles() {
        if (document.getElementById('email-mgmt-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'email-mgmt-inline-styles';
        style.textContent = `
            .email-mgmt { display: grid; gap: 18px; margin-top: 20px; min-width: 0; overflow: hidden; }
            .email-mgmt .section-card {
                background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
                border: 1px solid #dbe7f5; border-radius: 18px; padding: 18px;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05); min-width: 0; overflow: hidden;
            }
            .email-mgmt .section-card h2 { margin: 0 0 6px; font-size: 20px; color: #0f172a; }
            .email-mgmt .section-card h3 { margin: 0 0 6px; font-size: 17px; color: #0f172a; }
            .email-mgmt .section-note { margin: 0 0 16px; color: #64748b; font-size: 13px; }
            .email-mgmt .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
            .email-mgmt .metric-card {
                border-radius: 16px; padding: 14px 16px; border: 1px solid #d8e5f5;
                background: linear-gradient(160deg, #ffffff 0%, #eef6ff 100%);
            }
            .email-mgmt .metric-label { font-size: 12px; color: #64748b; margin-bottom: 8px; }
            .email-mgmt .metric-value { font-size: 28px; line-height: 1.1; color: #0f172a; font-weight: 700; }
            .email-mgmt .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
            .email-mgmt .toolbar .form-field { min-width: 140px; }
            .email-mgmt .toolbar-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
            .email-mgmt .table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; max-width: 100%; }
            .email-mgmt .rate-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
            .email-mgmt .rate-card { border: 1px solid #d8e5f5; border-radius: 14px; padding: 14px 16px; background: linear-gradient(160deg, #ffffff 0%, #eef6ff 100%); min-width: 0; }
            .email-mgmt .rate-card-head { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
            .email-mgmt .rate-card-head::before { content: ""; width: 8px; height: 8px; border-radius: 999px; background: #2563eb; }
            .email-mgmt .rate-card-fields { display: flex; flex-direction: column; gap: 10px; }
            .email-mgmt .rate-field { display: flex; flex-direction: column; gap: 4px; }
            .email-mgmt .rate-field span { font-size: 12px; color: #475569; }
            .email-mgmt .rate-field input { padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
            .email-mgmt .rate-empty { grid-column: 1 / -1; padding: 28px 16px; text-align: center; color: #94a3b8; }
            .email-mgmt .rate-currency-row { display: flex; align-items: center; gap: 8px; }
            .email-mgmt .rate-currency-label { font-size: 12px; color: #475569; width: 56px; flex-shrink: 0; font-weight: 600; }
            .email-mgmt .rate-currency-row input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
            .email-mgmt .manual-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
            .email-mgmt .manual-price-grid .price-formula-wrap { width: 100%; display: flex; gap: 4px; align-items: center; }
            .email-mgmt .manual-price-grid .price-formula-wrap .formula-input { flex: 0 0 58px; }
            .email-mgmt .manual-price-grid .price-formula-wrap input { width: auto; flex: 1; min-width: 0; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; text-align: right; box-sizing: border-box; }
            .email-mgmt table { border-collapse: collapse; width: 100%; background: #fff; }
            .email-mgmt .items-table { min-width: 1260px; }
            .email-mgmt th, .email-mgmt td { white-space: nowrap; vertical-align: middle; padding: 6px 8px; border-bottom: 1px solid #eef2f7; }
            .email-mgmt thead th { background: #f1f5f9; color: #334155; font-size: 12px; font-weight: 600; position: sticky; top: 0; z-index: 1; }
            .email-mgmt tbody tr:hover { background: #f8fafc; }
            .email-mgmt td input.price-input {
                width: 92px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; text-align: right;
            }
            .email-mgmt td input.unit-input { width: 56px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
            .email-mgmt td input.valid-input { width: 110px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
            .email-mgmt .status-pill { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
            .email-mgmt .status-pill.pending { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
            .email-mgmt .status-pill.priced { background: #ecfdf5; color: #166534; border-color: #bbf7d0; }
            .email-mgmt .row-actions { display: flex; gap: 6px; }
            .email-mgmt .btn.small { padding: 4px 10px; font-size: 12px; }
            .email-mgmt .count-bar { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
            .email-mgmt .count-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: #f8fafc; border: 1px solid #dbe3ef; color: #334155; font-size: 12px; }
            .email-mgmt .empty-tip { padding: 32px 16px; text-align: center; color: #94a3b8; }
            .email-mgmt .case-list { display: grid; gap: 14px; }
            .email-mgmt .case-card { border: 1px solid #dbe7f5; border-radius: 14px; overflow: hidden; background: #fff; }
            .email-mgmt .case-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #eef4ff; cursor: pointer; user-select: none; flex-wrap: wrap; }
            .email-mgmt .case-head .case-toggle { font-weight: 700; color: #1e3a8a; font-size: 14px; }
            .email-mgmt .case-head .case-meta { color: #475569; font-size: 12px; }
            .email-mgmt .case-head .case-actions { margin-left: auto; display: flex; gap: 8px; }
            .email-mgmt .case-body { padding: 12px 14px; display: grid; gap: 14px; }
            .email-mgmt .case-body.collapsed { display: none; }
            .email-mgmt .sub-block-title { font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 6px; display:flex; align-items:center; gap:8px; }
            .email-mgmt .sub-block-title .hint { font-weight: 400; color: #94a3b8; font-size: 12px; }
            .email-mgmt .wrap-table { overflow: auto; border: 1px solid #e2e8f0; border-radius: 10px; }
            .email-mgmt .ton-table, .email-mgmt .det-table { width: 100%; border-collapse: collapse; background: #fff; }
            .email-mgmt .ton-table.min-wide, .email-mgmt .det-table.min-wide { min-width: 960px; }
            .email-mgmt .ton-table th, .email-mgmt .ton-table td,
            .email-mgmt .det-table th, .email-mgmt .det-table td { white-space: nowrap; padding: 4px 5px; border-bottom: 1px solid #eef2f7; vertical-align: middle; text-align: center; }
            .email-mgmt .ton-table thead th, .email-mgmt .det-table thead th { background: #f1f5f9; color: #334155; font-size: 12px; font-weight: 600; }
            .email-mgmt input.ton-input { width: 72px; padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; text-align: right; }
            .email-mgmt select.ton-input, .email-mgmt select.ton-select { padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; background: #fff; }
            .email-mgmt select.ton-select { width: 68px; }
            .email-mgmt select.cat-select { width: 72px; padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; background: #fff; }
            .email-mgmt input.ton-extra { width: 56px; padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; text-align: right; }
            .email-mgmt input.ton-remark { width: 90px; padding: 3px 5px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
            .email-mgmt .price-formula-wrap { display: inline-flex; gap: 3px; align-items: center; }
            .email-mgmt input.formula-input { width: 58px; padding: 3px 5px; border: 1px solid #c4b5fd; border-radius: 6px; font-size: 12px; text-align: right; color: #6d28d9; background: #faf5ff; box-sizing: border-box; }
            .email-mgmt .det-price { text-align: right; color: #0f766e; font-weight: 600; }
            .email-mgmt .det-price.dim { color: #94a3b8; font-weight: 400; }
            .email-mgmt .wb-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #ecfeff; color: #155e75; font-size: 11px; font-weight: 600; border: 1px solid #cffafe; }
            .email-mgmt .pagination { display: flex; justify-content: center; gap: 12px; margin-top: 14px; }
            .email-mgmt .pagination .btn:disabled { opacity: 0.4; cursor: not-allowed; }
            .email-mgmt .select-col { width: 38px; text-align: center; }
            .email-mgmt .muted-cell { color: #94a3b8; }
            .email-mgmt .modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
            .email-mgmt .modal-content { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; background: #fff; border-radius: 20px; padding: 20px; box-shadow: 0 30px 80px rgba(15, 23, 42, 0.25); }
            .email-mgmt .modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
            .email-mgmt .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .email-mgmt .form-field { display: flex; flex-direction: column; gap: 4px; }
            .email-mgmt .form-field span { font-size: 12px; color: #475569; }
            .email-mgmt-notification { position: fixed; top: 20px; right: 20px; z-index: 2000; max-width: min(420px, calc(100vw - 32px)); padding: 14px 18px; border-radius: 14px; background: #fff; box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18); border-left: 4px solid #2563eb; }
            .email-mgmt-notification.success { border-left-color: #16a34a; }
            .email-mgmt-notification.error { border-left-color: #dc2626; }
            @media (max-width: 768px) {
                .email-mgmt .toolbar, .email-mgmt .toolbar-actions { flex-direction: column; align-items: stretch; }
                .email-mgmt .form-grid { grid-template-columns: 1fr; }
            }
            @media (max-width: 640px) {
                .email-mgmt .rate-grid { grid-template-columns: 1fr; }
            }
        `;
        document.head.appendChild(style);
    }

    function buildMainMarkup() {
        return `
            <section class="email-mgmt">
              ${state.canEditPrice ? `<div class="section-card">
                <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;">
                  <div>
                    <h3>汇率与点数设置</h3>
                    <p class="section-note">按物料类别设置各自的汇率与点数（地桩/铝/铝配件/铁/外购件）。修改后点击保存即可生效。其他定价属性的物料需手动填写各币种单价。</p>
                  </div>
                  <div class="toolbar-actions">
                    <button class="btn" id="iq-rate-reload" type="button">重新载入</button>
                    <button class="btn primary" id="iq-rate-save" type="button">保存</button>
                  </div>
                </div>
                <div class="rate-grid" id="iq-rate-body">
                  <div class="rate-empty">加载中…</div>
                </div>
              </div>` : ''}

              <div class="section-card">
                <h3>询价填价</h3>
                <div class="toolbar">
                  <label class="form-field">
                    <span>状态</span>
                    <select class="input" id="iq-filter-status">
                      <option value="">全部</option>
                      <option value="pending">待报价</option>
                      <option value="priced">已报价</option>
                    </select>
                  </label>
                  <label class="form-field">
                    <span>项目名称</span>
                    <select class="input" id="iq-filter-project"><option value="">全部项目</option></select>
                  </label>
                  <label class="form-field">
                    <span>业务员</span>
                    <select class="input" id="iq-filter-business"><option value="">全部业务员</option></select>
                  </label>
                  <label class="form-field">
                    <span>搜索</span>
                    <input class="input" id="iq-filter-keyword" type="text" placeholder="编码 / 名称 / 规格" />
                  </label>
                  <div class="toolbar-actions">
                    <button class="btn primary" id="iq-search-btn" type="button">查询</button>
                    <button class="btn" id="iq-refresh-btn" type="button">刷新</button>
                    ${state.canEditPrice ? `<button class="btn" id="iq-history-btn" type="button">吨价历史</button>` : ''}
                    <button class="btn" id="iq-import-btn" type="button">导入询价</button>
                    <input type="file" id="iq-import-file" accept=".xlsx,.xls" style="display:none;" />
                  </div>
                </div>
                <div class="count-bar">
                  <span class="count-chip">当前页: <strong id="iq-visible-count">0</strong></span>
                  <span class="count-chip">总记录: <strong id="iq-total-count">0</strong></span>
                  <span class="count-chip">第 <strong id="iq-page-num">1</strong> / <strong id="iq-page-total">1</strong> 页</span>
                </div>
                <div id="iq-items-body" class="case-list"></div>
                <div class="pagination">
                  <button class="btn small" id="iq-prev-btn" type="button">上一页</button>
                  <button class="btn small" id="iq-next-btn" type="button">下一页</button>
                </div>
              </div>

              <div class="section-card">
                <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;">
                  <div>
                    <h3>价格库（已生效价格）</h3>
                    <p class="section-note">所有已填写并同步的价格缓存，后续报价会自动匹配这里的数据。</p>
                  </div>
                  <div class="toolbar-actions">
                    <input class="input" id="iq-cache-keyword" type="text" placeholder="物料编码 / 名称 / 规格" style="min-width:180px;" />
                    <select class="input" id="iq-cache-type">
                      <option value="">全部类型</option>
                      <option value="carbon">碳钢</option>
                      <option value="other">其他</option>
                    </select>
                    <select class="input" id="iq-cache-expiry">
                      <option value="">全部有效期</option>
                      <option value="valid">有效</option>
                      <option value="expired">已过期</option>
                      <option value="none">无有效期</option>
                    </select>
                    <button class="btn" id="iq-cache-search-btn" type="button">搜索</button>
                    <button class="btn" id="iq-cache-refresh-btn" type="button">刷新</button>
                    <button class="btn warn" id="iq-cache-delete-btn" type="button">删除选中</button>
                    <button class="btn primary" id="iq-cache-export-btn" type="button">导出 Excel</button>
                  </div>
                </div>
                <div class="count-bar">
                  <span class="count-chip">显示: <strong id="iq-cache-visible">0</strong></span>
                  <span class="count-chip">已选中: <strong id="iq-cache-selected">0</strong></span>
                </div>
                <div class="table-wrap">
                  <table id="iq-cache-table">
                    <thead>
                      <tr>
                        <th class="select-col"><input type="checkbox" id="iq-cache-select-all" /></th>
                        <th>物料编码</th>
                        <th>名称</th>
                        <th>规格</th>
                        <th>数量</th>
                        <th>单价(美元)</th>
                        <th>单价(人民币)</th>
                        <th>单价(欧元)</th>
                        <th>单位</th>
                        <th>有效期</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody id="iq-cache-body"></tbody>
                  </table>
                </div>
              </div>
            </section>
        `;
    }

    function cacheElements() {
        elements.countPending = document.getElementById('iq-count-pending');
        elements.countPriced = document.getElementById('iq-count-priced');
        elements.countTotal = document.getElementById('iq-count-total');
        elements.countProjects = document.getElementById('iq-count-projects');

        elements.rateBody = document.getElementById('iq-rate-body');
        elements.rateReloadBtn = document.getElementById('iq-rate-reload');
        elements.rateSaveBtn = document.getElementById('iq-rate-save');

        elements.filterStatus = document.getElementById('iq-filter-status');
        elements.filterProject = document.getElementById('iq-filter-project');
        elements.filterBusiness = document.getElementById('iq-filter-business');
        elements.filterKeyword = document.getElementById('iq-filter-keyword');
        elements.searchBtn = document.getElementById('iq-search-btn');
        elements.refreshBtn = document.getElementById('iq-refresh-btn');
        elements.historyBtn = document.getElementById('iq-history-btn');
        elements.importBtn = document.getElementById('iq-import-btn');
        elements.importFile = document.getElementById('iq-import-file');
        elements.itemsBody = document.getElementById('iq-items-body');
        elements.visibleCount = document.getElementById('iq-visible-count');
        elements.totalCount = document.getElementById('iq-total-count');
        elements.pageNum = document.getElementById('iq-page-num');
        elements.pageTotal = document.getElementById('iq-page-total');
        elements.prevBtn = document.getElementById('iq-prev-btn');
        elements.nextBtn = document.getElementById('iq-next-btn');

        elements.cacheKeyword = document.getElementById('iq-cache-keyword');
        elements.cacheType = document.getElementById('iq-cache-type');
        elements.cacheExpiry = document.getElementById('iq-cache-expiry');
        elements.cacheSearchBtn = document.getElementById('iq-cache-search-btn');
        elements.cacheRefreshBtn = document.getElementById('iq-cache-refresh-btn');
        elements.cacheDeleteBtn = document.getElementById('iq-cache-delete-btn');
        elements.cacheExportBtn = document.getElementById('iq-cache-export-btn');
        elements.cacheVisible = document.getElementById('iq-cache-visible');
        elements.cacheSelected = document.getElementById('iq-cache-selected');
        elements.cacheSelectAll = document.getElementById('iq-cache-select-all');
        elements.cacheBody = document.getElementById('iq-cache-body');
    }

    function renderStats() {
        const c = state.counts || {};
        if (elements.countPending) elements.countPending.textContent = String(c.pending ?? 0);
        if (elements.countPriced) elements.countPriced.textContent = String(c.priced ?? 0);
        if (elements.countTotal) elements.countTotal.textContent = String(c.total ?? 0);
        if (elements.countProjects) elements.countProjects.textContent = String(c.project_count ?? 0);
    }

    const RATE_CURRENCIES = [
        { key: 'usd', label: '美元' },
        { key: 'eur', label: '欧元' },
        { key: 'rmb_fx', label: '人民币外汇' },
    ];

    const RATE_CATEGORIES = [
        { key: 'dizhuang', label: '地桩', attrs: ['D'] },
        { key: 'lv', label: '铝', attrs: ['M'] },
        { key: 'lvpj', label: '铝配件', attrs: ['F', 'Q'] },
        { key: 'tie', label: '铁', attrs: ['WTX', 'WTP'] },
        { key: 'waigou', label: '外购件', attrs: ['W'] },
    ];
    const ATTR_TO_CATEGORY = {};
    RATE_CATEGORIES.forEach((cat) => cat.attrs.forEach((a) => { ATTR_TO_CATEGORY[a] = cat.key; }));
    const _catLabels = {};
    RATE_CATEGORIES.forEach((cat) => { _catLabels[cat.key] = cat.label; });

    function _categoryForAttr(attr) {
        return ATTR_TO_CATEGORY[String(attr || '').trim().toUpperCase()] || null;
    }

    function renderRateTable(settings) {
        if (!elements.rateBody) return;
        settings = settings || {};
        const sections = RATE_CATEGORIES.map((cat) => {
            const fields = RATE_CURRENCIES.map((cur) => {
                const ex = settings[`exchange_rate_${cat.key}_${cur.key}`] ?? '';
                if (cat.key === 'dizhuang') {
                    return `<div class="rate-currency-row">
                        <span class="rate-currency-label">${escapeHtml(cur.label)}</span>
                        <input class="input iq-rate-ex" data-cat="${cat.key}" data-cur="${cur.key}" type="number" step="any" value="${escapeHtml(String(ex ?? ''))}" placeholder="实时汇率" />
                    </div>`;
                }
                const pt = settings[`points_${cat.key}_${cur.key}`] ?? '';
                return `<div class="rate-currency-row">
                    <span class="rate-currency-label">${escapeHtml(cur.label)}</span>
                    <input class="input iq-rate-ex" data-cat="${cat.key}" data-cur="${cur.key}" type="number" step="any" value="${escapeHtml(String(ex ?? ''))}" placeholder="汇率" />
                    <input class="input iq-rate-pt" data-cat="${cat.key}" data-cur="${cur.key}" type="number" step="any" value="${escapeHtml(String(pt ?? ''))}" placeholder="点数" />
                </div>`;
            }).join('');
            let extra = '';
            if (cat.key === 'lvpj') {
                const coeff = settings['lvpj_coefficient'] ?? '1.03';
                extra = `<div class="rate-currency-row" style="margin-top:6px;border-top:1px dashed #dbe3ef;padding-top:6px;">
                    <span class="rate-currency-label" style="color:#dc2626;">系数</span>
                    <input class="input iq-rate-coeff" data-key="lvpj_coefficient" type="number" step="0.001" value="${escapeHtml(String(coeff ?? '1.03'))}" placeholder="系数" title="铝配件计算系数（base × 系数）" />
                    <span style="font-size:11px;color:#94a3b8;width:auto;">×系数</span>
                </div>`;
            }
            return `<div class="rate-card">
                <div class="rate-card-head">${escapeHtml(cat.label)} <span class="hint">属性: ${cat.attrs.join('、')}</span></div>
                <div class="rate-card-fields">${fields}${extra}</div>
            </div>`;
        }).join('');
        elements.rateBody.innerHTML = sections;
    }

    function collectRateSettings() {
        const settings = {};
        if (!elements.rateBody) return settings;
        RATE_CATEGORIES.forEach((cat) => {
            RATE_CURRENCIES.forEach((cur) => {
                const exEl = elements.rateBody.querySelector(`.iq-rate-ex[data-cat="${cat.key}"][data-cur="${cur.key}"]`);
                const ptEl = elements.rateBody.querySelector(`.iq-rate-pt[data-cat="${cat.key}"][data-cur="${cur.key}"]`);
                if (exEl) settings[`exchange_rate_${cat.key}_${cur.key}`] = exEl.value;
                if (ptEl) settings[`points_${cat.key}_${cur.key}`] = ptEl.value;
            });
        });
        const coeffEl = elements.rateBody.querySelector('.iq-rate-coeff');
        if (coeffEl) settings['lvpj_coefficient'] = coeffEl.value;
        return settings;
    }

    async function loadRates() {
        try {
            const result = await API.getRateSettings();
            renderRateTable(result.settings || {});
            _bindRateInputs();
            _refreshAllDetailPrices();
        } catch (error) {
            if (elements.rateBody) elements.rateBody.innerHTML = '<div class="rate-empty">加载失败</div>';
            showNotification(error.message || '加载汇率失败', 'error');
        }
    }

    function _bindRateInputs() {
        if (!elements.rateBody) return;
        elements.rateBody.querySelectorAll('.iq-rate-ex, .iq-rate-pt, .iq-rate-coeff').forEach((el) => {
            el.addEventListener('input', () => _refreshAllDetailPrices());
        });
    }

    async function saveRates() {
        if (!elements.rateSaveBtn) return;
        const btn = elements.rateSaveBtn;
        btn.disabled = true;
        const prevText = btn.textContent;
        btn.textContent = '保存中…';
        try {
            const result = await API.saveRateSettings(collectRateSettings());
            renderRateTable(result.settings || {});
            _bindRateInputs();
            showNotification('汇率与点数已保存', 'success');
        } catch (error) {
            showNotification(error.message || '保存失败', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = prevText;
        }
    }

    function renderProjects() {
        if (!elements.filterProject) return;
        const current = state.projectFilter;
        const options = ['<option value="">全部项目</option>']
            .concat(state.projects.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`));
        elements.filterProject.innerHTML = options.join('');
        elements.filterProject.value = current;
    }

    function renderBusinesses() {
        if (!elements.filterBusiness) return;
        const current = state.businessFilter;
        const options = ['<option value="">全部业务员</option>']
            .concat(state.businesses.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`));
        elements.filterBusiness.innerHTML = options.join('');
        elements.filterBusiness.value = current;
    }

    function statusPill(status) {
        if (status === 'priced') return '<span class="status-pill priced">已报价</span>';
        return '<span class="status-pill pending">待报价</span>';
    }

    const METER_UNITS = ['米', 'm', 'M', 'meter', 'Meter', 'METERS', 'meters'];

    function _isMeterUnit(unit) {
        return METER_UNITS.includes(String(unit || '').trim());
    }

    function _extractLengthMm(spec) {
        if (spec === null || spec === undefined || spec === '') return null;
        const s = String(spec);
        // 与后端 weight_utils.extract_length_from_spec 保持一致：返回长度(mm)
        const patterns = [
            [/(\d+(?:\.\d+)?)\s*mm/i, 1],
            [/(\d+(?:\.\d+)?)\s*毫米/, 1],
            [/长度[：:]?\s*(\d+(?:\.\d+)?)/, 1],
            [/长[：:]?\s*(\d+(?:\.\d+)?)/, 1],
            [/L[=:]?\s*(\d+(?:\.\d+)?)/i, 1],
            [/(\d+(?:\.\d+)?)\s*米/, 1000],
            [/(\d+(?:\.\d+)?)\s*m\b/i, 1000],
            [/(\d+(?:\.\d+)?)\s*$/, 1],
        ];
        for (const [re, mul] of patterns) {
            const m = s.match(re);
            if (m) {
                const mm = parseFloat(m[1]) * mul;
                if (mm > 0) return mm;
            }
        }
        return null;
    }

    function _lengthBucketFromSpec(spec) {
        const mm = _extractLengthMm(spec);
        if (mm === null || mm <= 0) return '0-1';
        const meters = mm / 1000;
        if (meters <= 1) return '0-1';
        if (meters <= 3) return '1-3';
        return '3+';
    }

    function _tonTierFromKg(kg) {
        const ton = (Number(kg) || 0) / 1000;
        if (ton <= 5) return '0-5';
        if (ton <= 50) return '5-50';
        return '50+';
    }

    // —— 与「临时价格设置」对齐的吨价设置键 ——
    const _LEN_TIER_KEY = { '0-1': '01', '1-3': '13', '3+': '3' };

    function _tonTypeFromCode(code, hasLength) {
        const c = String(code || '').trim();
        if (!c) return '';
        if (c.startsWith('FEPJ')) return c.replace(/-/g, '_'); // 配件：下划线以对齐临时价格设置
        if (!hasLength) return c; // 非米单位：完整编码
        const idx = c.indexOf('-'); // 米单位：取 '-' 前缀
        return idx > 0 ? c.substring(0, idx) : c;
    }

    function _weightTierKey(totalKg) {
        const ton = (Number(totalKg) || 0) / 1000;
        if (ton <= 5) return '05';
        if (ton <= 50) return '550';
        return '50999';
    }

    function _tonSettingKey(tonType, lenTier, totalKg, pack) {
        if (!tonType) return '';
        const pk = _normalizePack(pack);
        const wk = _weightTierKey(totalKg);
        if (!lenTier) return `ton_${tonType}_int_${wk}_${pk}`; // 无长度档（非米单位/配件）
        return `ton_${tonType}_int_${_LEN_TIER_KEY[lenTier] || '3'}_${wk}_${pk}`;
    }

    // 包装类型（简易包装/铁托），与临时价格设置一致
    const PACK_TYPES = [{ key: 'jybz', label: '简易包装' }, { key: 'tietuo', label: '铁托' }];
    const DEFAULT_PACK = 'jybz';
    const _VALID_PACKS = new Set(PACK_TYPES.map((p) => p.key));
    function _normalizePack(pack) {
        const pk = String(pack || '').trim().toLowerCase();
        return _VALID_PACKS.has(pk) ? pk : DEFAULT_PACK;
    }
    function _casePack(project) {
        return _normalizePack((state.casePack || {})[project]);
    }

    function _currentRates(category) {
        const rates = {};
        RATE_CURRENCIES.forEach((cur) => {
            const exEl = elements.rateBody && elements.rateBody.querySelector(`.iq-rate-ex[data-cat="${category}"][data-cur="${cur.key}"]`);
            const ptEl = elements.rateBody && elements.rateBody.querySelector(`.iq-rate-pt[data-cat="${category}"][data-cur="${cur.key}"]`);
            rates[cur.key] = {
                ex: Number(exEl ? exEl.value : 0) || 0,
                pt: Number(ptEl ? ptEl.value : 0) || 0,
            };
        });
        return rates;
    }

    // 吨价行：按所属汇率类别展示「使用汇率/点数」（地桩只用汇率，其余汇率×点数）
    function _tonRateCellHtml(category) {
        if (!category) {
            return '<span style="color:#94a3b8;font-size:11px;">—（请选类别）</span>';
        }
        const rates = _currentRates(category);
        const isDz = category === 'dizhuang';
        const parts = RATE_CURRENCIES.map((cur) => {
            const r = rates[cur.key] || {};
            if (!r.ex) return `${escapeHtml(cur.label)}: <span style="color:#dc2626;">未设</span>`;
            if (isDz || !r.pt) return `${escapeHtml(cur.label)} ${escapeHtml(r.ex)}`;
            return `${escapeHtml(cur.label)} ${escapeHtml(r.ex)}×${escapeHtml(r.pt)}`;
        });
        return `<span style="font-size:11px;color:#334155;white-space:nowrap;">${escapeHtml(_catLabels[category] || category)} · ${parts.join(' / ')}</span>`;
    }

    function _round2(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return '';
        return (Math.round(n * 100) / 100).toString();
    }

    // 与临时价格设置一致的数字格式：6 位小数、去尾零（同 temp_price.js 的 fmt）
    function _fmtPrice(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) && n ? n.toFixed(6).replace(/\.?0+$/, '') : '';
    }

    function _tonStateKey(project, mat, len) {
        return `${project}@@${mat}@@${len}`;
    }

    // —— 价格公式（四则运算）安全求值 ——
    // pricer_remark 结构：{手写备注}\n【价格公式备注】\n{公式备注}
    // 发送给业务/钉钉时只取「【价格公式备注】」之前的手写部分，公式备注不外发
    const _FORMULA_SEP = '【价格公式备注】';
    const _FORMULA_FIELD_LABELS = {
        ton_price: '吨价',
        unit_price_usd: '美元',
        unit_price_eur: '欧元',
        unit_price_cny: '外汇',
        unit_price_rmb: '人民币',
    };

    function _splitPricerRemark(full) {
        const s = String(full || '');
        const idx = s.indexOf(_FORMULA_SEP);
        if (idx < 0) return { manual: s.trim(), formula: '' };
        return { manual: s.slice(0, idx).trim(), formula: s.slice(idx + _FORMULA_SEP.length).trim() };
    }

    function _joinPricerRemark(manual, formula) {
        const m = String(manual || '').trim();
        const f = String(formula || '').trim();
        if (!f) return m;
        return `${m}\n${_FORMULA_SEP}\n${f}`;
    }

    // 安全四则运算：先白名单过滤，再递归下降解析（不使用 eval）
    function _evalFormula(raw) {
        if (raw == null) return null;
        let s = String(raw).trim();
        if (!s) return null;
        if (s.charAt(0) === '=') s = s.slice(1).trim();
        if (!s) return null;
        if (!/^[0-9+\-*/().\s]+$/.test(s)) return null;
        if (/^[0-9.]+$/.test(s)) {
            const n = Number(s);
            return isNaN(n) ? null : n;
        }
        try {
            return _calcExpr(s);
        } catch (e) {
            return null;
        }
    }

    function _calcExpr(input) {
        let pos = 0;
        const src = input;
        function skipWs() { while (pos < src.length && /\s/.test(src[pos])) pos++; }
        function peek() { return pos < src.length ? src[pos] : ''; }
        function parseExpr() {
            let v = parseTerm();
            skipWs();
            while (peek() === '+' || peek() === '-') {
                const op = src[pos++];
                const r = parseTerm();
                v = (op === '+') ? v + r : v - r;
                skipWs();
            }
            return v;
        }
        function parseTerm() {
            let v = parseFactor();
            skipWs();
            while (peek() === '*' || peek() === '/') {
                const op = src[pos++];
                const r = parseFactor();
                if (op === '*') { v = v * r; }
                else { if (r === 0) throw new Error('div0'); v = v / r; }
                skipWs();
            }
            return v;
        }
        function parseFactor() {
            skipWs();
            if (peek() === '(') {
                pos++;
                const v = parseExpr();
                skipWs();
                if (peek() !== ')') throw new Error('paren');
                pos++;
                return v;
            }
            if (peek() === '-' || peek() === '+') {
                const op = src[pos++];
                const v = parseFactor();
                return op === '-' ? -v : v;
            }
            let numStr = '';
            while (pos < src.length && /[0-9.]/.test(src[pos])) numStr += src[pos++];
            if (!numStr) throw new Error('num');
            const n = Number(numStr);
            if (isNaN(n)) throw new Error('nan');
            return n;
        }
        const result = parseExpr();
        skipWs();
        if (pos < src.length) throw new Error('trailing');
        return result;
    }

    function _formulaResultStr(result) {
        if (result == null || isNaN(result)) return '';
        return String(Math.round(result * 1e6) / 1e6);
    }

    function _effCategory(group, st) {
        const override = String((st || {}).category_override || '').trim().toLowerCase();
        return override || group.category || '';
    }

    function _initTonState(project, group) {
        const key = _tonStateKey(project, group.material_code, group.length_tier);
        if (state.caseTonPrices[key]) return state.caseTonPrices[key];
        const first = group.items[0] || {};
        // 手动类别覆盖（定价属性查不到时前端选择）
        let categoryOverride = '';
        if (!group.category && first.price_category) {
            categoryOverride = String(first.price_category).toLowerCase();
        }
        const effCat = categoryOverride || group.category || '';
        // 报价方式：铁默认吨价，其他默认单价
        let pricingMethod = String(first.pricing_method || '').toLowerCase();
        if (pricingMethod !== 'ton' && pricingMethod !== 'unit' && pricingMethod !== 'usd') {
            pricingMethod = (effCat === 'tie') ? 'ton' : 'unit';
        }
        // 基准价格：优先从临时吨价设置读取；售价(usd)回退已保存美元单价，采购单价/采购吨价回退已保存人民币单价
        const skey = _tonSettingKey(group.tonType || _tonTypeFromCode(group.material_code, !!group.length_tier), group.length_tier, group.totalKg, _casePack(project));
        const pref = (state.tonSettings && state.tonSettings.byKey) ? state.tonSettings.byKey[skey] : '';
        let basePrice = '';
        if (pref != null && pref !== '') basePrice = String(pref);
        else if (pricingMethod === 'usd') {
            if (first.unit_price_usd != null && first.unit_price_usd !== '') basePrice = String(first.unit_price_usd);
        } else if (first.unit_price_rmb != null && first.unit_price_rmb !== '') basePrice = String(first.unit_price_rmb);
        const st = {
            ton_price: basePrice,
            formula_ton_price: '',
            pricing_method: pricingMethod,
            category_override: categoryOverride,
            discount: String(first.discount || ''),
            mold_fee: String(first.mold_fee || ''),
            moq: String(first.moq || ''),
            remark: String(first.remark || ''),
        };
        state.caseTonPrices[key] = st;
        return st;
    }

    // 按临时价格设置公式由「基准价格 + 单重 + 汇率/点数」算各币种单价
    // 报价方式=采购吨价：base = 单重 × 采购吨价（按重量换算），外币 = base ÷ 汇率 ÷ 点数
    // 报价方式=采购单价：base = 采购单价 × 规格/1000（输入人民币成本），外币 = base ÷ 汇率 ÷ 点数
    // 报价方式=售价：输入即美元售价 × 规格/1000，反算人民币 base 后再换算欧元/外汇
    function _computeDetPrices(uw, price, category, pricingMethod, specFactor) {
        const w = Number(uw) || 0;
        const t = Number(price) || 0;
        const sf = Number(specFactor) || 1;
        if (!t) return null;
        const rates = _currentRates(category);
        let base;
        if (pricingMethod === 'usd') {
            // 售价模式：输入即美元/米，反算人民币后再换算其他币种
            const usdVal = t * sf;
            const rUsd = rates.usd || {};
            if (category === 'dizhuang') {
                base = rUsd.ex > 0 ? usdVal * rUsd.ex : 0;
            } else {
                base = (rUsd.ex > 0 && rUsd.pt > 0) ? usdVal * rUsd.ex * rUsd.pt : 0;
            }
            if (!base) return null;
            const out = { rmb: _fmtPrice(base), usd: _fmtPrice(usdVal), eur: '', rmb_fx: '' };
            ['eur', 'rmb_fx'].forEach((cur) => {
                const r = rates[cur] || {};
                if (category === 'dizhuang') {
                    if (r.ex > 0) out[cur] = _fmtPrice(base / r.ex);
                } else if (r.ex > 0 && r.pt > 0) {
                    out[cur] = _fmtPrice(base / r.ex / r.pt);
                }
            });
            return out;
        } else {
            // 采购吨价 / 采购单价：先算出人民币 base，再 ÷汇率÷点数 换算其他币种
            if (pricingMethod === 'ton' && w > 0) {
                // 采购吨价：base = 单重(已含规格系数) × 采购吨价
                base = w * t;
            } else {
                // 采购单价：base = 采购单价 × 规格/1000（输入人民币成本）
                base = t * sf;
            }
            if (category === 'lvpj') {
                const coeffEl = elements.rateBody && elements.rateBody.querySelector('.iq-rate-coeff');
                const coeff = Number(coeffEl ? coeffEl.value : 0) || 1.03;
                base *= coeff;
            }
            const out = { rmb: _fmtPrice(base), usd: '', eur: '', rmb_fx: '' };
            ['usd', 'eur', 'rmb_fx'].forEach((cur) => {
                const r = rates[cur] || {};
                if (category === 'dizhuang') {
                    if (r.ex > 0) out[cur] = _fmtPrice(base / r.ex);
                } else if (r.ex > 0 && r.pt > 0) {
                    out[cur] = _fmtPrice(base / r.ex / r.pt);
                }
            });
            return out;
        }
    }

    function _groupKeyOf(it) {
        const code = it.material_code;
        const hasLength = _isMeterUnit(it.unit); // 只有米单位才有长度档
        const len = hasLength ? _lengthBucketFromSpec(it.spec) : '';
        const tonType = _tonTypeFromCode(code, hasLength);
        return { key: hasLength ? `${code}@@${len}` : tonType, length_tier: len, tonType, hasLength };
    }

    // 凡有单重(>0)的物料都进吨价汇总；长度档仅对米单位生效（先合并总重定吨位档，再按编码/长度区分）
    function _buildTonGroups(items) {
        const map = new Map();
        items.forEach((it) => {
            const gk = _groupKeyOf(it);
            if (!map.has(gk.key)) {
                map.set(gk.key, {
                    material_code: it.material_code,
                    name: it.name || it.material_code || '—',
                    length_tier: gk.length_tier,
                    tonType: gk.tonType,
                    hasLength: gk.hasLength,
                    pricing_attr: it.pricing_attr || '',
                    category: _categoryForAttr(it.pricing_attr),
                    items: [],
                    totalKg: 0,
                    hasUw: false,
                    specs: [],
                });
            }
            const g = map.get(gk.key);
            g.items.push(it);
            const uw = Number(it.unit_weight || 0);
            if (uw > 0) g.hasUw = true;
            g.totalKg += Number(it.total_weight || 0);
            const sp = String(it.spec || '').trim();
            if (sp && g.specs.indexOf(sp) < 0) g.specs.push(sp);
        });
        // 同一编码先合并所有长度总重 → 由合并总重决定吨位档（先区分重量，再区分长度）
        const codeTotals = {};
        for (const g of map.values()) {
            codeTotals[g.material_code] = (codeTotals[g.material_code] || 0) + g.totalKg;
        }
        const groups = Array.from(map.values());
        groups.forEach((g) => { g.totalKg = codeTotals[g.material_code] || g.totalKg; });
        return groups;
    }

    function _validDaysOptions(selectedDays) {
        return [3, 7, 15].map((d) => `<option value="${d}"${selectedDays === d ? ' selected' : ''}>${d}天</option>`).join('');
    }

    function renderItems() {
        if (!elements.itemsBody) return;
        const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
        if (elements.visibleCount) elements.visibleCount.textContent = String(state.items.length);
        if (elements.totalCount) elements.totalCount.textContent = String(state.total);
        if (elements.pageNum) elements.pageNum.textContent = String(state.page);
        if (elements.pageTotal) elements.pageTotal.textContent = String(totalPages);
        if (elements.prevBtn) elements.prevBtn.disabled = state.page <= 1;
        if (elements.nextBtn) elements.nextBtn.disabled = state.page >= totalPages;

        if (!state.items.length) {
            elements.itemsBody.innerHTML = '<div class="empty-tip">当前没有询价项，可在报价生成后提交</div>';
            return;
        }

        const caseMap = new Map();
        const caseOrder = [];
        state.caseValidUntil = {};
        state.items.forEach((it) => {
            const project = it.project_name || '';
            if (!caseMap.has(project)) {
                caseMap.set(project, { project, business: '', items: [] });
                caseOrder.push(project);
            }
            const c = caseMap.get(project);
            c.items.push(it);
            if (!c.business) c.business = it.business_name || it.inquirer || '';
            // 案件级有效期：取第一个非空 valid_until（req 5）
            if (!state.caseValidUntil[project] && it.valid_until) {
                state.caseValidUntil[project] = it.valid_until;
            }
        });

        const realProject = (p) => (p === '' ? '（未命名项目）' : p);
        elements.itemsBody.innerHTML = caseOrder.map((project) => {
            const c = caseMap.get(project);
            return _renderCaseCard(realProject(project), project, c.business, c.items);
        }).join('');

        _bindCaseEvents();
        _refreshAllDetailPrices();
    }

    function _isCaseLocked(lastPricedAt) {
        if (!lastPricedAt) return false;
        const t = new Date(String(lastPricedAt).replace(/-/g, '/'));
        if (isNaN(t.getTime())) return false;
        return (Date.now() - t.getTime()) > 7 * 24 * 60 * 60 * 1000;
    }

    function _fmtSize(bytes) {
        const b = Number(bytes) || 0;
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1024 / 1024).toFixed(1) + ' MB';
    }

    function _renderCaseMeta(realProject, remark, pricerRemark, atts) {
        const canEdit = state.canEditPrice;
        const remarkText = escapeHtml(String(remark || ''));
        const remarkDisp = remarkText || '<span style="color:#94a3b8;">（无）</span>';
        const pricerParts = _splitPricerRemark(pricerRemark);
        const manualText = escapeHtml(pricerParts.manual);
        const formulaText = escapeHtml(pricerParts.formula);
        const attLinks = (atts || []).map((a) => {
            const del = state.isAdmin ? ` <button class="btn small warn" type="button" data-att-del="${a.id}" style="padding:2px 6px;line-height:1;">×</button>` : '';
            return `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;">
                <a href="#" data-att-dl="${a.id}" style="color:#2563eb;text-decoration:none;">📎 ${escapeHtml(a.original_name || '附件')}</a>
                <span style="color:#94a3b8;font-size:11px;">${_fmtSize(a.file_size)}</span>${del}
            </span>`;
        }).join('');
        const formulaBlock = formulaText
            ? `<div style="font-size:11px;color:#6d28d9;background:#faf5ff;border:1px solid #ddd6fe;border-radius:6px;padding:4px 8px;margin-top:6px;white-space:pre-wrap;min-width:0;overflow-wrap:break-word;">${formulaText}</div>`
            : '';
        const editArea = canEdit
            ? `<div style="margin-top:6px;">
                <textarea class="input" data-pricer-remark="${escapeHtml(realProject)}" rows="2" style="width:100%;max-width:520px;font-size:12px;resize:vertical;" placeholder="报价人员备注（保存案件价格时一并发送给询价人）">${manualText}</textarea>
                <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
                    <button class="btn small" type="button" data-remark-save="${escapeHtml(realProject)}">保存备注</button>
                    ${state.isAdmin ? `<label class="btn small" style="cursor:pointer;">上传附件<input type="file" multiple data-att-upload="${escapeHtml(realProject)}" style="display:none;" /></label>` : ''}
                </div>
               </div>${formulaBlock}`
            : `<div style="font-size:13px;color:#334155;margin-top:4px;">${manualText || '<span style="color:#94a3b8;">（无）</span>'}</div>${formulaBlock}`;
        const validSelect = canEdit
            ? `<select class="valid-input" data-case-valid="${escapeHtml(realProject)}">${_validDaysOptions(_matchValidDays(state.caseValidUntil[realProject] || ''))}</select>`
            : '';
        return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;min-width:0;overflow:hidden;">
            ${canEdit ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 10px;background:#eff6ff;border-radius:8px;">
                <span style="font-size:14px;font-weight:700;color:#1e40af;">有效期</span>
                ${validSelect}
            </div>` : ''}
            <p class="sub-block-title" style="margin:0 0 4px;">案件备注与附件<span class="hint">业务备注（只读）+ 报价人员备注 + 附件</span></p>
            <div style="font-size:12px;color:#64748b;margin-bottom:2px;">业务备注：</div>
            <div style="font-size:13px;color:#334155;margin-bottom:6px;word-break:break-word;overflow-wrap:break-word;">${remarkDisp}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:2px;">报价人员备注${canEdit ? '' : '：'}</div>
            ${editArea}
            <div style="font-size:12px;margin-top:6px;word-break:break-word;overflow-wrap:break-word;">${attLinks || '<span style="color:#94a3b8;">（无附件）</span>'}</div>
        </div>`;
    }

    function _renderCaseCard(displayName, realProject, business, items) {
        const collapsed = state.collapsedCases.has(realProject);
        const readOnly = !state.canEditPrice;
        const groups = _buildTonGroups(items);
        const formulaCount = groups.filter((g) => g.category).length;
        const manualCount = groups.length - formulaCount;
        const pendingCount = items.filter((it) => it.status !== 'priced').length;

        const lock = state.caseLocks[realProject] || null;
        const lastPriced = (lock || {}).last_priced_at || '';
        const locked = !readOnly && _isCaseLocked(lastPriced);
        const showTonSection = !readOnly && groups.length > 0;

        const tonRows = showTonSection ? groups.map((g) => _renderTonRow(realProject, g)).join('') : '';
        const detRows = items.map((it, idx) => _renderDetailRow(realProject, it, idx)).join('');

        const meta = state.caseMetas[realProject] || {};
        const remarkBlock = _renderCaseMeta(realProject, meta.remark || '', meta.pricer_remark || '', state.caseAttachments[realProject] || []);

        let saveBtn = '';
        if (!readOnly) {
            saveBtn = locked
                ? `<button class="btn small" type="button" disabled title="超过7天已锁定">⛔ 已锁定</button>`
                : `<button class="btn small primary" type="button" data-case-save="${escapeHtml(realProject)}">保存本案件价格</button>`;
        }
        const downloadBtn = readOnly ? '' : `<button class="btn small" type="button" data-case-export="${escapeHtml(realProject)}">下载吨价/价格</button>`;
        const delCaseBtn = (state.isAdmin && realProject)
            ? `<button class="btn small warn" type="button" data-case-del="${escapeHtml(realProject)}">删除案件</button>`
            : '';

        let lockHint = '';
        if (!readOnly) {
            if (locked) {
                lockHint = `<span class="case-meta" style="color:#dc2626;">⛔ 已锁定（超过7天）${lastPriced ? '· ' + escapeHtml(lastPriced) : ''}</span>`;
            } else if (lastPriced) {
                lockHint = `<span class="case-meta" style="color:#16a34a;">⏳ 可修改（保存后7天内）· ${escapeHtml(lastPriced)}</span>`;
            }
        }

        const detHeader = readOnly
            ? `<tr><th>#</th><th>物料编码</th><th>名称</th><th>规格</th><th>数量</th><th>单重(kg)</th><th>总重量(kg)</th><th>定价属性</th><th>单位</th><th>状态</th></tr>`
            : `<tr><th>#</th><th>物料编码</th><th>名称</th><th>规格</th><th>数量</th><th>单重(kg)</th><th>总重量(kg)</th><th>定价属性</th><th>价格(美元)</th><th>价格(欧元)</th><th>价格(人民币外汇)</th><th>价格(人民币)</th><th>折扣</th><th>单位</th><th>状态</th><th>操作</th></tr>`;
        const detailHint = readOnly
            ? '只读视图（吨价填写仅管理员/设计组可见）'
            : '价格由上方汇总表统一计算；折扣随汇总表折扣自动同步';

        return `<div class="case-card" data-case="${escapeHtml(realProject)}">
            <div class="case-head" data-toggle="${escapeHtml(realProject)}">
                <span class="case-toggle">${collapsed ? '▶' : '▼'} 案件：${escapeHtml(displayName)}</span>
                <span class="case-meta">业务：${escapeHtml(business || '—')}</span>
                <span class="case-meta">共 ${items.length} 项（公式 ${formulaCount} / 手动 ${manualCount} 组）</span>
                <span class="case-meta">待报价 ${pendingCount}</span>
                ${lockHint}
                <span class="case-actions">
                    ${saveBtn}
                    ${downloadBtn}
                    ${delCaseBtn}
                </span>
            </div>
            <div class="case-body${collapsed ? ' collapsed' : ''}" data-case-body="${escapeHtml(realProject)}">
                ${remarkBlock}
                ${showTonSection ? `
                <div>
                    <p class="sub-block-title" style="margin:0 0 8px;">填写价格（吨价）<span class="hint">采购吨价：单重×采购吨价÷汇率÷点数；采购单价：输入人民币成本÷汇率÷点数；售价：输入美元售价自动反算。查不到定价属性的编码请在「类别」下拉选择</span></p>
                    <div style="margin:0 0 10px;display:flex;align-items:center;gap:8px;">
                        <span style="font-size:13px;font-weight:600;">碳钢包装价格：</span>
                        <select class="input" data-case-pack="${escapeHtml(realProject)}" style="width:120px;">
                            ${PACK_TYPES.map((p) => `<option value="${p.key}"${_casePack(realProject) === p.key ? ' selected' : ''}>${p.label}</option>`).join('')}
                        </select>
                        <span class="hint">选择后按对应包装吨价读取基准价格</span>
                    </div>
                    <div class="wrap-table">
                        <table class="ton-table min-wide">
                            <thead>
                                <tr>
                                    <th style="min-width:96px;">物料编码</th>
                                    <th>吨价类型</th>
                                    <th>类别</th>
                                    <th>报价方式</th>
                                    <th>长度范围</th>
                                    <th>吨位范围</th>
                                    <th>总重量</th>
                                    <th>价格</th>
                                    <th>折扣</th>
                                    <th>模具费</th>
                                    <th>起订量</th>
                                    <th>备注</th>
                                    <th>使用汇率/点数</th>
                                </tr>
                            </thead>
                            <tbody>${tonRows}</tbody>
                        </table>
                    </div>
                    <div style="display:flex;justify-content:flex-end;margin-top:10px;">
                        ${locked
                            ? `<button class="btn small" type="button" disabled title="超过7天已锁定">⛔ 已锁定</button>`
                            : `<button class="btn small primary" type="button" data-case-save="${escapeHtml(realProject)}">保存本案件价格</button>`}
                    </div>
                </div>` : ''}
                <div>
                    <p class="sub-block-title">明细<span class="hint">${detailHint}</span></p>
                    <div class="wrap-table">
                        <table class="det-table${readOnly ? '' : ' min-wide'}">
                            <thead>${detHeader}</thead>
                            <tbody>${detRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    const _CATEGORY_OPTIONS = [
        { key: '', label: '—选择—' },
        { key: 'dizhuang', label: '地桩' },
        { key: 'lv', label: '铝' },
        { key: 'lvpj', label: '铝配件' },
        { key: 'tie', label: '铁' },
        { key: 'waigou', label: '外购件' },
    ];

    function _renderTonRow(realProject, g) {
        const st = _initTonState(realProject, g);
        const bucket = _tonTierFromKg(g.totalKg);
        const tonType = g.tonType || _tonTypeFromCode(g.material_code, !!g.length_tier);
        const itemIds = g.items.map((it) => it.id).join(',');
        const effCat = _effCategory(g, st);
        const mat = escapeHtml(g.material_code);
        const len = escapeHtml(g.length_tier);
        const proj = escapeHtml(realProject);
        const method = st.pricing_method || (effCat === 'tie' ? 'ton' : 'unit');
        const pricePlaceholder = method === 'ton' ? '采购吨价' : (method === 'usd' ? '美元售价' : '采购单价(元)');
        const priceTitle = method === 'ton'
            ? '采购吨价模式：单重×采购吨价÷汇率÷点数 自动换算'
            : (method === 'usd'
                ? '售价模式：输入美元售价，自动反算人民币/欧元/外汇'
                : '采购单价模式：采购单价÷汇率÷点数 自动换算（输入人民币成本）');

        // 类别单元格：定价属性已知 → 只读显示；未知 → 下拉框选择
        let catCell;
        if (g.category) {
            catCell = `<span style="font-weight:600;">${escapeHtml(g.pricing_attr || _catLabels[g.category] || '—')}</span>`;
        } else {
            const opts = _CATEGORY_OPTIONS.map((o) => `<option value="${o.key}"${effCat === o.key ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
            catCell = `<select class="cat-select" data-cat-select data-project="${proj}" data-mat="${mat}" data-len="${len}">${opts}</select>`;
        }

        // 价格单元格：基准价格（吨价/单价）+ 公式
        const priceCell = `<div class="price-formula-wrap">
            <input class="formula-input" data-formula="ton_price" data-project="${proj}" data-mat="${mat}" data-len="${len}" value="${escapeHtml(st.formula_ton_price || '')}" placeholder="=5*4" title="公式（四则运算），自动计算" />
            <input class="ton-input" data-ton="ton_price" data-project="${proj}" data-mat="${mat}" data-len="${len}" value="${escapeHtml(st.ton_price)}" placeholder="${pricePlaceholder}" title="${priceTitle}" />
        </div>`;

        // 报价方式下拉：铁→采购吨价/采购单价；其他→采购单价/售价
        const isTie = effCat === 'tie';
        const methodOptions = isTie
            ? `<option value="ton"${method === 'ton' ? ' selected' : ''}>采购吨价</option>
               <option value="unit"${method === 'unit' ? ' selected' : ''}>采购单价</option>`
            : `<option value="unit"${method === 'unit' ? ' selected' : ''}>采购单价</option>
               <option value="usd"${method === 'usd' ? ' selected' : ''}>售价</option>`;
        const methodCell = `<select class="ton-select" data-method-select data-project="${proj}" data-mat="${mat}" data-len="${len}">${methodOptions}</select>`;

        // 长度范围：米单位显示长度档；非米单位显示规格汇总
        const lenCell = g.length_tier
            ? escapeHtml(g.length_tier) + ' 米'
            : (g.specs && g.specs.length
                ? `<span title="${escapeHtml(g.specs.join('、'))}" style="font-size:11px;color:#475569;">${escapeHtml(g.specs.slice(0, 3).join('、'))}${g.specs.length > 3 ? '…' : ''}</span>`
                : '<span style="color:#94a3b8;">—</span>');

        return `<tr data-ton-row data-mat="${mat}" data-len="${len}" data-cat="${escapeHtml(effCat)}" data-total="${escapeHtml(g.totalKg)}" data-ids="${escapeHtml(itemIds)}">
            <td style="font-weight:600;color:#1e40af;">${escapeHtml(g.material_code || '—')}</td>
            <td title="${escapeHtml(g.name)}">${escapeHtml(tonType || '—')}<div style="font-size:11px;color:#94a3b8;">${escapeHtml(String(g.name).slice(0, 10))}</div></td>
            <td>${catCell}</td>
            <td>${methodCell}</td>
            <td>${lenCell}</td>
            <td><span class="wb-pill">${bucket} 吨</span></td>
            <td>${_round2(g.totalKg)} kg</td>
            <td>${priceCell}</td>
            <td><input class="ton-extra" data-extra="discount" data-project="${proj}" data-mat="${mat}" data-len="${len}" value="${escapeHtml(st.discount)}" placeholder="折扣" title="折扣（如 95 表示95折）" /></td>
            <td><input class="ton-extra" data-extra="mold_fee" data-project="${proj}" data-mat="${mat}" data-len="${len}" value="${escapeHtml(st.mold_fee)}" placeholder="模具费" title="模具费" /></td>
            <td><input class="ton-extra" data-extra="moq" data-project="${proj}" data-mat="${mat}" data-len="${len}" value="${escapeHtml(st.moq)}" placeholder="起订量" title="起订量" /></td>
            <td><input class="ton-remark" data-extra="remark" data-project="${proj}" data-mat="${mat}" data-len="${len}" value="${escapeHtml(st.remark)}" placeholder="备注" title="备注" /></td>
            <td class="ton-rates">${_tonRateCellHtml(effCat)}</td>
        </tr>`;
    }

    function _renderDetailRow(realProject, it, idx) {
        const id = it.id;
        const uw = Number(it.unit_weight || 0);
        const readOnly = !state.canEditPrice;
        const delBtn = state.isAdmin ? `<button class="btn small warn" type="button" data-del="${id}">删除</button>` : '';

        const baseCells = `<td>${idx + 1}</td>
            <td style="font-weight:600;color:#1e40af;">${escapeHtml(it.material_code || '—')}</td>
            <td title="${escapeHtml(it.name || '')}">${escapeHtml((it.name || '—').slice(0, 12))}</td>
            <td title="${escapeHtml(it.spec || '')}" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;color:#64748b;">${escapeHtml(it.spec || '—')}</td>
            <td>${escapeHtml(num(it.quantity))}</td>
            <td style="color:#6366f1;">${escapeHtml(it.unit_weight != null ? num(it.unit_weight) : '—')}</td>
            <td style="color:#0f766e;font-weight:600;">${escapeHtml(it.total_weight != null ? num(it.total_weight) : '—')}</td>
            <td style="color:#475569;">${it.pricing_attr ? escapeHtml(it.pricing_attr) : '<span style="color:#94a3b8;">—</span>'}</td>`;

        if (readOnly) {
            return `<tr data-item-id="${id}">${baseCells}
                <td>${escapeHtml(it.unit || '—')}</td>
                <td>${statusPill(it.status)}</td>
            </tr>`;
        }

        // 所有可编辑物料都关联到吨价汇总组（data-det-row），价格由汇总表统一填写
        const gk = _groupKeyOf(it);
        // 米单位物料单重为 kg/m：每件实际重量 = 单重 × 规格(mm)/1000（与临时价格设置/报价引擎一致）
        const specMm = _isMeterUnit(it.unit) ? (_extractLengthMm(it.spec) || 0) : 0;
        const effUw = (uw > 0 && specMm > 0) ? uw * specMm / 1000 : uw;
        // 米单位规格系数（规格mm/1000）：采购单价/售价模式下按此系数折算每件价格
        const specFactor = specMm > 0 ? specMm / 1000 : 1;
        return `<tr data-det-row data-ton-mat="${escapeHtml(it.material_code)}" data-ton-len="${escapeHtml(gk.length_tier)}" data-uw="${escapeHtml(effUw)}" data-spec-factor="${escapeHtml(specFactor)}">
            ${baseCells}
            <td class="det-price det-usd dim">—</td>
            <td class="det-price det-eur dim">—</td>
            <td class="det-price det-cny dim">—</td>
            <td class="det-price det-rmb dim">—</td>
            <td class="det-discount" style="color:#6d28d9;">—</td>
            <td>${escapeHtml(it.unit || '—')}</td>
            <td>${statusPill(it.status)}</td>
            <td>${delBtn}</td>
        </tr>`;
    }

    function _refreshAllDetailPrices() {
        if (!elements.itemsBody) return;
        elements.itemsBody.querySelectorAll('.case-card').forEach((card) => {
            const realProject = card.getAttribute('data-case');
            card.querySelectorAll('tr[data-ton-row]').forEach((tr) => {
                const mat = tr.getAttribute('data-mat');
                const len = tr.getAttribute('data-len');
                _refreshDetailPricesForGroup(card, realProject, mat, len);
            });
        });
    }

    function _refreshDetailPricesForGroup(card, realProject, mat, len) {
        const st = state.caseTonPrices[_tonStateKey(realProject, mat, len)] || {};
        const rows = card.querySelectorAll(`tr[data-det-row][data-ton-mat="${_cssAttr(mat)}"][data-ton-len="${_cssAttr(len)}"]`);
        const tonTr = card.querySelector(`tr[data-ton-row][data-mat="${_cssAttr(mat)}"][data-len="${_cssAttr(len)}"]`);
        const category = tonTr ? (tonTr.getAttribute('data-cat') || '') : '';
        // 刷新本组「使用汇率/点数」单元格（随类别/汇率输入变化）
        const rateCell = tonTr ? tonTr.querySelector('.ton-rates') : null;
        if (rateCell) rateCell.innerHTML = _tonRateCellHtml(category);
        const method = st.pricing_method || (category === 'tie' ? 'ton' : 'unit');
        const discount = st.discount || '';
        rows.forEach((row) => {
            if (!category) {
                // 未选择类别：无法换算，仅显示折扣
                _setDetCellVal(row.querySelector('.det-usd'), '');
                _setDetCellVal(row.querySelector('.det-eur'), '');
                _setDetCellVal(row.querySelector('.det-cny'), '');
                _setDetCellVal(row.querySelector('.det-rmb'), '');
            } else {
                const uw = row.getAttribute('data-uw');
                const sf = row.getAttribute('data-spec-factor') || 1;
                const p = _computeDetPrices(uw, st.ton_price, category, method, sf) || {};
                _setDetCellVal(row.querySelector('.det-usd'), p.usd);
                _setDetCellVal(row.querySelector('.det-eur'), p.eur);
                _setDetCellVal(row.querySelector('.det-cny'), p.rmb_fx);
                _setDetCellVal(row.querySelector('.det-rmb'), p.rmb);
            }
            // 折扣随汇总表同步（req 6）
            const discCell = row.querySelector('.det-discount');
            if (discCell) {
                if (discount) { discCell.textContent = discount; discCell.classList.remove('dim'); }
                else { discCell.textContent = '—'; }
            }
        });
    }

    function _setDetCellVal(cell, val) {
        if (!cell) return;
        if (val === '' || val == null) {
            cell.textContent = '—';
            cell.classList.add('dim');
        } else {
            cell.textContent = val;
            cell.classList.remove('dim');
        }
    }

    function _cssAttr(v) {
        return String(v == null ? '' : v).replace(/"/g, '\\"');
    }

    function _bindCaseEvents() {
        if (!elements.itemsBody) return;
        elements.itemsBody.querySelectorAll('[data-toggle]').forEach((head) => {
            const handler = () => {
                const project = head.getAttribute('data-toggle');
                if (state.collapsedCases.has(project)) state.collapsedCases.delete(project);
                else state.collapsedCases.add(project);
                const body = elements.itemsBody.querySelector(`[data-case-body="${_cssAttr(project)}"]`);
                if (body) body.classList.toggle('collapsed');
                const toggle = head.querySelector('.case-toggle');
                if (toggle) toggle.textContent = `${state.collapsedCases.has(project) ? '▶' : '▼'} ${toggle.textContent.replace(/^[▼▶]\s*/, '')}`;
            };
            head.addEventListener('click', handler);
            cleanupFns.push(() => head.removeEventListener('click', handler));
        });

        elements.itemsBody.querySelectorAll('.ton-input, .formula-input, .det-table .price-input').forEach((el) => {
            const handler = (e) => { e.stopPropagation(); };
            el.addEventListener('click', handler);
            cleanupFns.push(() => el.removeEventListener('click', handler));
        });

        elements.itemsBody.querySelectorAll('.ton-input').forEach((input) => {
            const handler = () => {
                const project = input.getAttribute('data-project');
                const mat = input.getAttribute('data-mat');
                const len = input.getAttribute('data-len');
                const cur = input.getAttribute('data-ton');
                const key = _tonStateKey(project, mat, len);
                if (!state.caseTonPrices[key]) state.caseTonPrices[key] = {};
                state.caseTonPrices[key][cur] = input.value.trim();
                const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(project)}"]`);
                _refreshDetailPricesForGroup(card, project, mat, len);
            };
            input.addEventListener('input', handler);
            cleanupFns.push(() => input.removeEventListener('input', handler));
        });

        elements.itemsBody.querySelectorAll('.formula-input').forEach((input) => {
            const handler = () => {
                const project = input.getAttribute('data-project');
                const mat = input.getAttribute('data-mat');
                const len = input.getAttribute('data-len');
                const cur = input.getAttribute('data-formula');
                const key = _tonStateKey(project, mat, len);
                if (!state.caseTonPrices[key]) state.caseTonPrices[key] = {};
                state.caseTonPrices[key]['formula_' + cur] = input.value.trim();
                const result = _evalFormula(input.value);
                if (result == null || isNaN(result)) return;
                const resultStr = _formulaResultStr(result);
                const tonInput = elements.itemsBody.querySelector(`.ton-input[data-ton="${cur}"][data-mat="${_cssAttr(mat)}"][data-len="${_cssAttr(len)}"]`);
                if (tonInput) tonInput.value = resultStr;
                state.caseTonPrices[key][cur] = resultStr;
                const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(project)}"]`);
                _refreshDetailPricesForGroup(card, project, mat, len);
            };
            input.addEventListener('input', handler);
            cleanupFns.push(() => input.removeEventListener('input', handler));
        });

        elements.itemsBody.querySelectorAll('select[data-case-valid]').forEach((sel) => {
            const handler = () => {
                const project = sel.getAttribute('data-case-valid');
                state.caseValidUntil[project] = _daysToDate(sel.value);
            };
            sel.addEventListener('change', handler);
            cleanupFns.push(() => sel.removeEventListener('change', handler));
        });

        elements.itemsBody.querySelectorAll('select[data-method-select]').forEach((sel) => {
            const handler = () => {
                const project = sel.getAttribute('data-project');
                const mat = sel.getAttribute('data-mat');
                const len = sel.getAttribute('data-len');
                const key = _tonStateKey(project, mat, len);
                const st = state.caseTonPrices[key] || (state.caseTonPrices[key] = {});
                st.pricing_method = sel.value;
                // 同步价格输入框 placeholder
                const tonInput = elements.itemsBody.querySelector(`.ton-input[data-ton="ton_price"][data-mat="${_cssAttr(mat)}"][data-len="${_cssAttr(len)}"]`);
                if (tonInput) {
                    tonInput.placeholder = sel.value === 'ton' ? '采购吨价' : (sel.value === 'usd' ? '美元售价' : '采购单价(元)');
                    tonInput.title = sel.value === 'ton'
                        ? '采购吨价模式：单重×采购吨价÷汇率÷点数 自动换算'
                        : (sel.value === 'usd'
                            ? '售价模式：输入美元售价，自动反算人民币/欧元/外汇'
                            : '采购单价模式：采购单价÷汇率÷点数 自动换算（输入人民币成本）');
                }
                const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(project)}"]`);
                _refreshDetailPricesForGroup(card, project, mat, len);
            };
            sel.addEventListener('change', handler);
            cleanupFns.push(() => sel.removeEventListener('change', handler));
        });

        elements.itemsBody.querySelectorAll('select[data-cat-select]').forEach((sel) => {
            const handler = () => {
                const project = sel.getAttribute('data-project');
                const catValue = sel.value;
                const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(project)}"]`);
                const curTr = sel.closest('tr[data-ton-row]');

                // 类别变更应用到单行的统一函数
                function _applyCat(tr, val) {
                    const tMat = tr.getAttribute('data-mat');
                    const tLen = tr.getAttribute('data-len');
                    const tKey = _tonStateKey(project, tMat, tLen);
                    const tSt = state.caseTonPrices[tKey] || (state.caseTonPrices[tKey] = {});
                    tSt.category_override = val;
                    const isTieCat = val === 'tie';
                    const m = isTieCat ? 'ton' : 'unit';
                    tSt.pricing_method = m;
                    tr.setAttribute('data-cat', val);
                    // 重建报价方式下拉（铁→采购吨价/采购单价；其他→采购单价/售价）
                    const mSel = tr.querySelector('select[data-method-select]');
                    if (mSel) {
                        const opts = isTieCat
                            ? `<option value="ton"${m === 'ton' ? ' selected' : ''}>采购吨价</option><option value="unit"${m === 'unit' ? ' selected' : ''}>采购单价</option>`
                            : `<option value="unit"${m === 'unit' ? ' selected' : ''}>采购单价</option><option value="usd"${m === 'usd' ? ' selected' : ''}>售价</option>`;
                        mSel.innerHTML = opts;
                    }
                    const cSel = tr.querySelector('select[data-cat-select]');
                    if (cSel && cSel.value !== val) cSel.value = val;
                    const tIn = tr.querySelector('.ton-input[data-ton="ton_price"]');
                    if (tIn) {
                        tIn.placeholder = m === 'ton' ? '采购吨价' : (m === 'usd' ? '美元售价' : '采购单价(元)');
                        tIn.title = m === 'ton'
                            ? '采购吨价模式：单重×采购吨价÷汇率÷点数 自动换算'
                            : (m === 'usd'
                                ? '售价模式：输入美元售价，自动反算人民币/欧元/外汇'
                                : '采购单价模式：采购单价÷汇率÷点数 自动换算（输入人民币成本）');
                    }
                    _refreshDetailPricesForGroup(card, project, tMat, tLen);
                }

                // 当前行
                if (curTr) _applyCat(curTr, catValue);
                // 向下传播：后续所有行跟随当前类别
                if (curTr) {
                    let next = curTr.nextElementSibling;
                    while (next && next.matches('tr[data-ton-row]')) {
                        _applyCat(next, catValue);
                        next = next.nextElementSibling;
                    }
                }
            };
            sel.addEventListener('change', handler);
            cleanupFns.push(() => sel.removeEventListener('change', handler));
        });

        elements.itemsBody.querySelectorAll('input[data-extra]').forEach((input) => {
            const handler = () => {
                const project = input.getAttribute('data-project');
                const mat = input.getAttribute('data-mat');
                const len = input.getAttribute('data-len');
                const field = input.getAttribute('data-extra');
                const key = _tonStateKey(project, mat, len);
                const st = state.caseTonPrices[key] || (state.caseTonPrices[key] = {});
                st[field] = input.value.trim();
                // 折扣变更时同步明细折扣（req 6）
                if (field === 'discount') {
                    const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(project)}"]`);
                    _refreshDetailPricesForGroup(card, project, mat, len);
                    // 折扣自动向下传播：当前行之后的行折扣跟随当前值
                    const curTr = input.closest('tr[data-ton-row]');
                    if (curTr && card) {
                        let next = curTr.nextElementSibling;
                        while (next && next.matches('tr[data-ton-row]')) {
                            const nMat = next.getAttribute('data-mat');
                            const nLen = next.getAttribute('data-len');
                            const nKey = _tonStateKey(project, nMat, nLen);
                            const nSt = state.caseTonPrices[nKey] || (state.caseTonPrices[nKey] = {});
                            nSt.discount = input.value.trim();
                            const nInput = next.querySelector('input[data-extra="discount"]');
                            if (nInput && nInput.value !== input.value) nInput.value = input.value;
                            _refreshDetailPricesForGroup(card, project, nMat, nLen);
                            next = next.nextElementSibling;
                        }
                    }
                }
            };
            input.addEventListener('input', handler);
            cleanupFns.push(() => input.removeEventListener('input', handler));
        });

        // Tab 键跳转到下一行同列输入（req 7）
        elements.itemsBody.querySelectorAll('.ton-input, .formula-input, input[data-extra]').forEach((input) => {
            const handler = (e) => {
                if (e.key !== 'Tab') return;
                const tr = input.closest('tr[data-ton-row]');
                if (!tr) return;
                const col = input.getAttribute('data-ton') || input.getAttribute('data-formula') || input.getAttribute('data-extra') || '';
                if (!col) return;
                const nextTr = tr.nextElementSibling;
                if (!nextTr || !nextTr.matches('tr[data-ton-row]')) return;
                e.preventDefault();
                const target = nextTr.querySelector(`[data-ton="${col}"], [data-formula="${col}"], [data-extra="${col}"]`);
                if (target) { target.focus(); if (target.select) target.select(); }
            };
            input.addEventListener('keydown', handler);
            cleanupFns.push(() => input.removeEventListener('keydown', handler));
        });

        elements.itemsBody.querySelectorAll('[data-case-save]').forEach((btn) => {
            const handler = (e) => { e.stopPropagation(); saveCaseTonPrices(btn.getAttribute('data-case-save')); };
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });

        elements.itemsBody.querySelectorAll('[data-case-pack]').forEach((sel) => {
            const handler = (e) => { e.stopPropagation(); onCasePackChange(sel.getAttribute('data-case-pack'), sel.value); };
            sel.addEventListener('change', handler);
            cleanupFns.push(() => sel.removeEventListener('change', handler));
        });

        elements.itemsBody.querySelectorAll('[data-case-export]').forEach((btn) => {
            const handler = (e) => { e.stopPropagation(); exportCasePrice(btn.getAttribute('data-case-export')); };
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });

        elements.itemsBody.querySelectorAll('[data-remark-save]').forEach((btn) => {
            const handler = (e) => { e.stopPropagation(); saveRemark(btn.getAttribute('data-remark-save')); };
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });

        elements.itemsBody.querySelectorAll('[data-att-dl]').forEach((link) => {
            const handler = (e) => { e.preventDefault(); e.stopPropagation(); downloadAttachment(Number(link.getAttribute('data-att-dl'))); };
            link.addEventListener('click', handler);
            cleanupFns.push(() => link.removeEventListener('click', handler));
        });

        elements.itemsBody.querySelectorAll('[data-att-del]').forEach((btn) => {
            const handler = (e) => { e.preventDefault(); e.stopPropagation(); deleteAttachment(Number(btn.getAttribute('data-att-del'))); };
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });

        elements.itemsBody.querySelectorAll('[data-att-upload]').forEach((input) => {
            const handler = () => { if (input.files && input.files.length) uploadAttachments(input.getAttribute('data-att-upload'), input.files); input.value = ''; };
            input.addEventListener('change', handler);
            cleanupFns.push(() => input.removeEventListener('change', handler));
        });

        elements.itemsBody.querySelectorAll('[data-save]').forEach((btn) => {
            const handler = () => saveRowPrice(Number(btn.getAttribute('data-save')));
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });
        elements.itemsBody.querySelectorAll('[data-del]').forEach((btn) => {
            const handler = () => deleteItem(Number(btn.getAttribute('data-del')));
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });
        elements.itemsBody.querySelectorAll('[data-case-del]').forEach((btn) => {
            const handler = (e) => { e.stopPropagation(); deleteCase(btn.getAttribute('data-case-del')); };
            btn.addEventListener('click', handler);
            cleanupFns.push(() => btn.removeEventListener('click', handler));
        });
    }

    function _collectCaseEntries(realProject) {
        const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(realProject)}"]`);
        if (!card) return [];
        const validUntil = state.caseValidUntil[realProject] || '';
        const entries = [];
        card.querySelectorAll('tr[data-ton-row]').forEach((tr) => {
            const mat = tr.getAttribute('data-mat');
            const len = tr.getAttribute('data-len');
            const cat = tr.getAttribute('data-cat') || '';
            const totalKg = Number(tr.getAttribute('data-total') || 0);
            const itemIds = (tr.getAttribute('data-ids') || '').split(',').filter(Boolean).map(Number);
            const st = state.caseTonPrices[_tonStateKey(realProject, mat, len)] || {};
            entries.push({
                material_code: mat, length_tier: len, total_kg: totalKg,
                ton_price: st.ton_price || '',
                pricing_method: st.pricing_method || (cat === 'tie' ? 'ton' : 'unit'),
                price_category: st.category_override || '',
                pack: _casePack(realProject),
                discount: st.discount || '',
                mold_fee: st.mold_fee || '',
                moq: st.moq || '',
                remark: st.remark || '',
                valid_until: validUntil, item_ids: itemIds,
            });
        });
        return entries;
    }

    function _collectFormulaRemark(realProject) {
        const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(realProject)}"]`);
        if (!card) return '';
        const lines = [];
        const fields = ['ton_price'];
        card.querySelectorAll('tr[data-ton-row]').forEach((tr) => {
            const mat = tr.getAttribute('data-mat') || '';
            const len = tr.getAttribute('data-len') || '';
            const code = mat || '—';
            const st = state.caseTonPrices[_tonStateKey(realProject, mat, len)] || {};
            fields.forEach((field) => {
                const raw = (st['formula_' + field] || '').trim();
                if (!raw) return;
                const result = _evalFormula(raw);
                if (result == null || isNaN(result)) return;
                const label = _FORMULA_FIELD_LABELS[field] || field;
                const expr = raw.charAt(0) === '=' ? raw.slice(1).trim() : raw;
                lines.push(`${code} ${label}: ${expr}=${_formulaResultStr(result)}`);
            });
        });
        return lines.join('\n');
    }

    async function onCasePackChange(realProject, pack) {
        state.casePack[realProject] = _normalizePack(pack);
        // 重置该案件吨价状态，使其按新包装重新读取基准吨价
        const prefix = realProject + '@@';
        Object.keys(state.caseTonPrices).forEach((k) => {
            if (k.startsWith(prefix)) delete state.caseTonPrices[k];
        });
        if (state.canEditPrice) {
            try { await loadTonSettings(); } catch (e) { /* ignore */ }
        }
        renderItems();
    }

    async function saveCaseTonPrices(realProject) {
        const entries = _collectCaseEntries(realProject);
        if (!entries.length) { showNotification('该案件没有可填价格的物料', 'error'); return; }
        const card = elements.itemsBody.querySelector(`.case-card[data-case="${_cssAttr(realProject)}"]`);
        const ta = card ? card.querySelector(`textarea[data-pricer-remark="${_cssAttr(realProject)}"]`) : null;
        const manual = ta ? ta.value.trim() : '';
        const pricerRemark = _joinPricerRemark(manual, _collectFormulaRemark(realProject));
        const btn = card ? card.querySelector('[data-case-save]') : null;
        const original = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
        try {
            const resp = await API.saveCaseTonPrices({ project_name: realProject, entries, pricer_remark: pricerRemark, pack: _casePack(realProject) });
            const notify = resp && resp.notify ? resp.notify : null;
            let msg = '案件价格已保存并同步价格库';
            if (notify && notify.sent) {
                msg += '，已通知询价人';
            } else if (notify && notify.reason) {
                msg += `（钉钉通知未发送：${notify.reason}）`;
            }
            showNotification(msg, 'success');
            await Promise.all([loadStats(), loadItems(false)]);
        } catch (error) {
            showNotification(error.message || '保存失败', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = original || '保存本案件价格'; }
        }
    }

    function collectRowData(itemId) {
        const row = elements.itemsBody.querySelector(`tr[data-item-id="${itemId}"]`);
        if (!row) return null;
        const data = {};
        row.querySelectorAll('[data-field]').forEach((el) => {
            const field = el.getAttribute('data-field');
            if (el.getAttribute('data-type') === 'days') {
                data[field] = _daysToDate(el.value);
            } else {
                data[field] = el.value.trim();
            }
        });
        return data;
    }

    async function saveRowPrice(itemId) {
        const data = collectRowData(itemId);
        if (!data) return;
        const btn = elements.itemsBody.querySelector(`[data-save="${itemId}"]`);
        const original = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
        try {
            await API.savePrice(itemId, data);
            showNotification('价格已保存并同步到价格库', 'success');
            await Promise.all([loadStats(), loadItems(false)]);
        } catch (error) {
            showNotification(error.message || '保存失败', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = original || '保存'; }
        }
    }

    async function deleteItem(itemId) {
        if (!window.confirm('确认删除这条询价项吗？')) return;
        try {
            await API.deleteItem(itemId);
            showNotification('已删除', 'success');
            await Promise.all([loadStats(), loadItems(false)]);
        } catch (error) {
            showNotification(error.message || '删除失败', 'error');
        }
    }

    async function deleteCase(realProject) {
        const name = realProject ? realProject : '（未命名项目）';
        if (!window.confirm(`确认删除整个案件「${name}」吗？\n该操作会删除该案件下全部询价项、备注、附件，且不可恢复。`)) return;
        try {
            const result = await API.deleteCase(realProject);
            showNotification(result.message || '已删除案件', 'success');
            await Promise.all([loadStats(), loadItems(false)]);
        } catch (error) {
            showNotification(error.message || '删除案件失败', 'error');
        }
    }

    function openAddModal() {
        let modal = document.getElementById('iq-add-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'iq-add-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal-content">
              <div class="modal-head">
                <h3 style="margin:0;">手动新增询价项</h3>
                <button class="btn" type="button" id="iq-add-close">关闭</button>
              </div>
              <div class="form-grid">
                <label class="form-field">
                  <span>项目名称</span>
                  <input class="input" id="add-project_name" type="text" />
                </label>
                <label class="form-field">
                  <span>业务名称</span>
                  <input class="input" id="add-business_name" type="text" />
                </label>
                <label class="form-field">
                  <span>物料编码 *</span>
                  <input class="input" id="add-material_code" type="text" />
                </label>
                <label class="form-field">
                  <span>名称</span>
                  <input class="input" id="add-name" type="text" />
                </label>
                <label class="form-field">
                  <span>编码规格</span>
                  <input class="input" id="add-spec" type="text" />
                </label>
                <label class="form-field">
                  <span>单位</span>
                  <input class="input" id="add-unit" type="text" value="米" />
                </label>
                <label class="form-field">
                  <span>数量</span>
                  <input class="input" id="add-quantity" type="number" step="any" value="0" />
                </label>
                <label class="form-field">
                  <span>单重(kg)</span>
                  <input class="input" id="add-unit_weight" type="number" step="any" />
                </label>
                <label class="form-field" style="grid-column:1/-1;">
                  <span>总重量(kg)</span>
                  <input class="input" id="add-total_weight" type="number" step="any" />
                </label>
              </div>
              <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px;">
                <button class="btn" type="button" id="iq-add-cancel">取消</button>
                <button class="btn primary" type="button" id="iq-add-submit">提交</button>
              </div>
            </div>
        `;
        modal.style.display = 'flex';
        const close = () => { modal.style.display = 'none'; };
        document.getElementById('iq-add-close').onclick = close;
        document.getElementById('iq-add-cancel').onclick = close;
        modal.onclick = (e) => { if (e.target === modal) close(); };
        document.getElementById('iq-add-submit').onclick = async () => {
            const payload = {
                project_name: document.getElementById('add-project_name').value.trim(),
                business_name: document.getElementById('add-business_name').value.trim(),
                material_code: document.getElementById('add-material_code').value.trim(),
                name: document.getElementById('add-name').value.trim(),
                spec: document.getElementById('add-spec').value.trim(),
                unit: document.getElementById('add-unit').value.trim(),
                quantity: document.getElementById('add-quantity').value.trim(),
                unit_weight: document.getElementById('add-unit_weight').value.trim(),
                total_weight: document.getElementById('add-total_weight').value.trim(),
            };
            if (!payload.material_code) { showNotification('物料编码不能为空', 'error'); return; }
            const submitBtn = document.getElementById('iq-add-submit');
            submitBtn.disabled = true;
            submitBtn.textContent = '提交中...';
            try {
                await API.addItem(payload);
                showNotification('已新增询价项', 'success');
                close();
                await Promise.all([loadStats(), loadItems(false)]);
            } catch (error) {
                showNotification(error.message || '新增失败', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '提交';
            }
        };
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

    function cacheStatus(item) {
        if (!item || !item.valid_until) return { cls: 'pending', label: '无有效期' };
        return item.is_expired ? { cls: 'pending', label: '已过期' } : { cls: 'priced', label: '有效' };
    }

    function syncSelectedCacheIds() {
        const idSet = new Set(state.cacheItems.map((item) => Number(item.id)));
        state.selectedCacheIds = new Set(Array.from(state.selectedCacheIds).filter((id) => idSet.has(Number(id))));
    }

    function renderCacheTable() {
        if (!elements.cacheBody) return;
        const items = getFilteredCacheItems();
        if (elements.cacheVisible) elements.cacheVisible.textContent = String(items.length);
        if (elements.cacheSelected) elements.cacheSelected.textContent = String(state.selectedCacheIds.size);
        if (elements.cacheSelectAll) {
            const visibleIds = items.map((i) => Number(i.id));
            elements.cacheSelectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => state.selectedCacheIds.has(id));
        }
        if (!items.length) {
            elements.cacheBody.innerHTML = '<tr><td colspan="12" class="empty-tip">当前没有价格缓存</td></tr>';
            return;
        }
        elements.cacheBody.innerHTML = items.map((item) => {
            const st = cacheStatus(item);
            return `<tr>
                <td class="select-col"><input type="checkbox" data-cache-select="${item.id}" ${state.selectedCacheIds.has(Number(item.id)) ? 'checked' : ''} /></td>
                <td>${escapeHtml(item.material_code || '—')}</td>
                <td title="${escapeHtml(item.name || '')}">${escapeHtml((item.name || '—').slice(0, 10))}</td>
                <td>${escapeHtml(item.spec || '—')}</td>
                <td>${escapeHtml(item.is_carbon_steel ? (item.quantity ?? 0) : '—')}</td>
                <td>${escapeHtml(item.unit_price_usd ?? (item.unit_price && !item.unit_price_cny && !item.unit_price_eur ? item.unit_price : '—'))}</td>
                <td>${escapeHtml(item.unit_price_cny ?? '—')}</td>
                <td>${escapeHtml(item.unit_price_eur ?? '—')}</td>
                <td>${escapeHtml(item.unit || '—')}</td>
                <td class="${item.is_expired ? 'muted-cell' : ''}">${escapeHtml(fmt(item.valid_until))}</td>
                <td><span class="status-pill ${st.cls}">${st.label}</span></td>
                <td>${state.canEditPrice ? `<button class="btn small warn" type="button" data-cache-delete="${item.id}">删除</button>` : ''}</td>
            </tr>`;
        }).join('');

        elements.cacheBody.querySelectorAll('[data-cache-select]').forEach((checkbox) => {
            const handler = () => {
                const itemId = Number(checkbox.getAttribute('data-cache-select'));
                if (checkbox.checked) state.selectedCacheIds.add(itemId);
                else state.selectedCacheIds.delete(itemId);
                renderCacheTable();
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

    async function loadStats() {
        try {
            const result = await API.getStats();
            state.counts = { ...result.counts, project_count: result.project_count };
            renderStats();
        } catch (error) {
            state.counts = { pending: 0, priced: 0, total: 0, project_count: 0 };
            renderStats();
        }
    }

    async function loadTonSettings() {
        // 收集当前所有案件里带单重的分组（物料+长度+总重），向后台查对应基准吨价
        const groups = [];
        const seen = new Set();
        const caseMap = new Map();
        (state.items || []).forEach((it) => {
            const project = it.project_name || '';
            if (!caseMap.has(project)) caseMap.set(project, []);
            caseMap.get(project).push(it);
        });
        caseMap.forEach((items, project) => {
            const pack = _casePack(project);
            _buildTonGroups(items).forEach((g) => {
                const skey = _tonSettingKey(g.tonType || _tonTypeFromCode(g.material_code, !!g.length_tier), g.length_tier, g.totalKg, pack);
                if (skey && !seen.has(skey)) {
                    seen.add(skey);
                    groups.push({ material_code: g.material_code, length_tier: g.length_tier, total_kg: g.totalKg, pack });
                }
            });
        });
        try {
            const result = await API.getTonSettings(groups);
            const byKey = {};
            (result.ton_prices || []).forEach((tp) => {
                if (tp.setting_key && tp.ton_price != null && tp.ton_price !== '') {
                    byKey[tp.setting_key] = tp.ton_price;
                }
            });
            state.tonSettings = { byKey };
        } catch (error) {
            state.tonSettings = state.tonSettings || { byKey: {} };
        }
    }

    async function loadItems(resetPage = true) {
        if (resetPage) state.page = 1;
        try {
            const result = await API.getItems({
                status: state.statusFilter,
                project: state.projectFilter,
                business: state.businessFilter,
                keyword: state.keyword,
                page: state.page,
                pageSize: state.pageSize,
            });
            state.items = Array.isArray(result.items) ? result.items : [];
            state.total = result.total || 0;
            state.projects = Array.isArray(result.projects) ? result.projects : [];
            state.businesses = Array.isArray(result.businesses) ? result.businesses : [];
            state.caseTonPrices = {};
            state.caseLocks = result.case_locks || {};
            state.caseMetas = result.case_metas || {};
            state.caseAttachments = result.attachments || {};
            state.casePack = {};
            Object.keys(state.caseMetas || {}).forEach((p) => {
                state.casePack[p] = _normalizePack((state.caseMetas[p] || {}).pack);
            });
            if (typeof result.is_admin === 'boolean') state.isAdmin = result.is_admin;
            if (typeof result.can_edit_price === 'boolean') state.canEditPrice = result.can_edit_price;
            // 只读用户（业务员）不需要吨价设置，跳过该请求
            if (state.canEditPrice) {
                await loadTonSettings();
            }
            renderProjects();
            renderBusinesses();
            renderItems();
        } catch (error) {
            state.items = [];
            state.total = 0;
            renderItems();
            showNotification(error.message || '加载询价项失败', 'error');
        }
    }

    async function loadCache() {
        try {
            const result = await API.getPriceCache(state.cacheKeyword);
            state.cacheItems = Array.isArray(result.items) ? result.items : [];
            syncSelectedCacheIds();
            renderCacheTable();
        } catch (error) {
            state.cacheItems = [];
            renderCacheTable();
            showNotification(error.message || '加载价格库失败', 'error');
        }
    }

    async function deleteOneCacheItem(itemId) {
        if (!window.confirm('确认删除这条价格缓存吗？')) return;
        try {
            await API.deleteCacheItem(itemId);
            state.selectedCacheIds.delete(Number(itemId));
            showNotification('已删除', 'success');
            await Promise.all([loadCache(), loadStats()]);
        } catch (error) {
            showNotification(error.message || '删除失败', 'error');
        }
    }

    async function deleteSelectedCacheItems() {
        const ids = Array.from(state.selectedCacheIds);
        if (!ids.length) { showNotification('请先选择要删除的记录', 'error'); return; }
        if (!window.confirm(`确认删除选中的 ${ids.length} 条价格缓存吗？`)) return;
        try {
            const result = await API.deleteCacheItems(ids);
            state.selectedCacheIds.clear();
            showNotification(`已删除 ${result.deleted || 0} 条`, 'success');
            await Promise.all([loadCache(), loadStats()]);
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

    async function downloadTonHistory() {
        try {
            const result = await API.exportTonHistory(state.projectFilter || '');
            triggerBlobDownload(result.blob, result.filename || 'ton_price_history.xlsx');
            showNotification('导出完成', 'success');
        } catch (error) {
            showNotification(error.message || '导出失败', 'error');
        }
    }

    async function importInquiryExcel(file) {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        showNotification('正在导入询价表...', 'info');
        try {
            const result = await API.importExcel(formData);
            showNotification(result.message || '导入成功', 'success');
            await Promise.all([loadStats(), loadItems(true)]);
        } catch (error) {
            showNotification(error.message || '导入失败', 'error');
        }
    }

    async function exportCasePrice(realProject) {
        try {
            const result = await API.exportCasePrice(realProject);
            triggerBlobDownload(result.blob, result.filename || 'case_price.xlsx');
            showNotification('已下载吨价与价格', 'success');
        } catch (error) {
            showNotification(error.message || '下载失败', 'error');
        }
    }

    async function downloadAttachment(attId) {
        try {
            const result = await API.downloadAttachment(attId);
            triggerBlobDownload(result.blob, result.filename || 'attachment');
        } catch (error) {
            showNotification(error.message || '下载附件失败', 'error');
        }
    }

    async function deleteAttachment(attId) {
        if (!window.confirm('确认删除该附件吗？')) return;
        try {
            await API.deleteAttachment(attId);
            showNotification('附件已删除', 'success');
            await loadItems(false);
        } catch (error) {
            showNotification(error.message || '删除附件失败', 'error');
        }
    }

    async function saveRemark(realProject) {
        const ta = elements.itemsBody.querySelector(`textarea[data-pricer-remark="${_cssAttr(realProject)}"]`);
        const manual = ta ? ta.value.trim() : '';
        const existing = (state.caseMetas[realProject] || {}).pricer_remark || '';
        const pricerRemark = _joinPricerRemark(manual, _splitPricerRemark(existing).formula);
        try {
            await API.saveCaseMeta(realProject, pricerRemark);
            showNotification('报价人员备注已保存', 'success');
            await loadItems(false);
        } catch (error) {
            showNotification(error.message || '保存备注失败', 'error');
        }
    }

    async function uploadAttachments(realProject, files) {
        const formData = new FormData();
        formData.append('project_name', realProject);
        for (let i = 0; i < files.length; i++) formData.append('attachments', files[i]);
        try {
            const result = await API.uploadAttachments(realProject, formData);
            showNotification(result.message || '附件已上传', 'success');
            await loadItems(false);
        } catch (error) {
            showNotification(error.message || '上传附件失败', 'error');
        }
    }

    async function openHistoryModal() {
        let modal = document.getElementById('iq-history-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'iq-history-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal-content" style="width:min(860px, calc(100vw - 32px));">
              <div class="modal-head">
                <h3 style="margin:0;">吨价历史（保存 1 年，可回溯）</h3>
                <div style="display:flex;gap:8px;">
                  <button class="btn small" type="button" id="iq-history-export">导出 Excel</button>
                  <button class="btn" type="button" id="iq-history-close">关闭</button>
                </div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
                <label class="form-field" style="min-width:200px;">
                  <span>筛选项目（留空查全部）</span>
                  <input class="input" id="iq-history-project" type="text" placeholder="项目名称" />
                </label>
                <button class="btn primary" type="button" id="iq-history-search" style="align-self:flex-end;">查询</button>
              </div>
              <div class="wrap-table" style="max-height:60vh;overflow:auto;">
                <table class="det-table" style="width:100%;">
                  <thead>
                    <tr>
                      <th>保存时间</th><th>项目</th><th>物料编码</th><th>吨价类型</th><th>长度</th><th>吨位</th>
                      <th>吨价(基准)</th><th>有效期</th><th>保存人</th>
                      <th>价格(美元)</th><th>价格(人民币)</th><th>明细</th>
                    </tr>
                  </thead>
                  <tbody id="iq-history-body"><tr><td colspan="12" class="empty-tip">加载中…</td></tr></tbody>
                </table>
              </div>
            </div>`;
        modal.style.display = 'flex';
        const close = () => { modal.style.display = 'none'; };
        document.getElementById('iq-history-close').onclick = close;
        modal.onclick = (e) => { if (e.target === modal) close(); };

        const renderBody = async () => {
            const project = document.getElementById('iq-history-project').value.trim();
            const body = document.getElementById('iq-history-body');
            body.innerHTML = '<tr><td colspan="12" class="empty-tip">加载中…</td></tr>';
            try {
                const result = await API.getTonHistory(project);
                const items = result.items || [];
                if (!items.length) { body.innerHTML = '<tr><td colspan="12" class="empty-tip">暂无吨价历史</td></tr>'; return; }
                body.innerHTML = items.map((r) => {
                    const prices = r.prices || [];
                    const first = prices[0] || {};
                    return `<tr>
                        <td>${escapeHtml(r.saved_at || '—')}</td>
                        <td>${escapeHtml(r.project_name || '—')}</td>
                        <td style="color:#1e40af;font-weight:600;">${escapeHtml(r.material_code || '—')}</td>
                        <td>${escapeHtml(r.ton_type || '—')}</td>
                        <td>${r.length_tier ? escapeHtml(r.length_tier) + '米' : '—'}</td>
                        <td>${escapeHtml(r.weight_tier || '—')}</td>
                        <td style="color:#0f766e;font-weight:600;">${escapeHtml(r.ton_price != null ? num(r.ton_price) : '—')}</td>
                        <td>${escapeHtml(r.valid_until || '—')}</td>
                        <td>${escapeHtml(r.saved_by || '—')}</td>
                        <td>${escapeHtml(first.usd != null ? num(first.usd) : '—')}</td>
                        <td>${escapeHtml(first.rmb != null ? num(first.rmb) : '—')}</td>
                        <td>${escapeHtml(String(prices.length))}</td>
                    </tr>`;
                }).join('');
            } catch (error) {
                body.innerHTML = `<tr><td colspan="12" class="empty-tip">${escapeHtml(error.message || '加载失败')}</td></tr>`;
            }
        };
        document.getElementById('iq-history-search').onclick = renderBody;
        document.getElementById('iq-history-project').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderBody(); });
        document.getElementById('iq-history-export').onclick = async () => {
            const project = document.getElementById('iq-history-project').value.trim();
            try {
                const result = await API.exportTonHistory(project);
                triggerBlobDownload(result.blob, result.filename || 'ton_price_history.xlsx');
            } catch (error) {
                showNotification(error.message || '导出失败', 'error');
            }
        };
        renderBody();
    }

    function addEventListenerSafe(target, type, handler) {
        if (!target) return;
        target.addEventListener(type, handler);
        cleanupFns.push(() => { try { target.removeEventListener(type, handler); } catch (e) {} });
    }

    function bindEvents() {
        addEventListenerSafe(elements.rateReloadBtn, 'click', () => loadRates());
        addEventListenerSafe(elements.rateSaveBtn, 'click', () => saveRates());
        addEventListenerSafe(elements.searchBtn, 'click', () => {
            state.statusFilter = elements.filterStatus.value;
            state.projectFilter = elements.filterProject.value;
            state.businessFilter = elements.filterBusiness.value;
            state.keyword = elements.filterKeyword.value.trim();
            loadItems(true);
        });
        addEventListenerSafe(elements.filterKeyword, 'keydown', (e) => {
            if (e.key === 'Enter') elements.searchBtn.click();
        });
        addEventListenerSafe(elements.refreshBtn, 'click', () => {
            Promise.all([loadStats(), loadItems(false), loadCache()]);
        });
        addEventListenerSafe(elements.historyBtn, 'click', () => downloadTonHistory());
        addEventListenerSafe(elements.importBtn, 'click', () => {
            if (elements.importFile) elements.importFile.click();
        });
        addEventListenerSafe(elements.importFile, 'change', () => {
            if (elements.importFile.files && elements.importFile.files.length) {
                importInquiryExcel(elements.importFile.files[0]);
                elements.importFile.value = '';
            }
        });
        addEventListenerSafe(elements.prevBtn, 'click', () => {
            if (state.page > 1) { state.page -= 1; loadItems(false); }
        });
        addEventListenerSafe(elements.nextBtn, 'click', () => {
            const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
            if (state.page < totalPages) { state.page += 1; loadItems(false); }
        });

        addEventListenerSafe(elements.cacheSearchBtn, 'click', () => {
            state.cacheKeyword = elements.cacheKeyword.value.trim();
            loadCache();
        });
        addEventListenerSafe(elements.cacheKeyword, 'keydown', (e) => {
            if (e.key === 'Enter') elements.cacheSearchBtn.click();
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
            getFilteredCacheItems().forEach((item) => {
                const id = Number(item.id);
                if (checked) state.selectedCacheIds.add(id);
                else state.selectedCacheIds.delete(id);
            });
            renderCacheTable();
        });
    }

    const API = {
        getStats() {
            return requestJson('/inquiry-items/stats', { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        getItems(opts = {}) {
            const params = new URLSearchParams();
            if (opts.status) params.set('status', opts.status);
            if (opts.project) params.set('project', opts.project);
            if (opts.business) params.set('business', opts.business);
            if (opts.keyword) params.set('keyword', opts.keyword);
            if (opts.page) params.set('page', String(opts.page));
            if (opts.pageSize) params.set('page_size', String(opts.pageSize));
            const qs = params.toString();
            return requestJson(`/inquiry-items${qs ? '?' + qs : ''}`, { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        addItem(payload) {
            return requestJson('/inquiry-items', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify(payload),
            });
        },
        savePrice(itemId, payload) {
            return requestJson(`/inquiry-items/${itemId}/price`, {
                method: 'PUT',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify(payload),
            });
        },
        saveCaseTonPrices(payload) {
            return requestJson('/inquiry-items/case-price', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify(payload),
            });
        },
        getTonSettings(groups, pack) {
            return requestJson('/inquiry-items/ton-settings', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify({ groups, pack }),
            });
        },
        exportCasePrice(project) {
            const params = new URLSearchParams();
            if (project) params.set('project', project);
            const suffix = params.toString() ? `?${params.toString()}` : '';
            return requestFile(`/inquiry-items/case-price/export${suffix}`, { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        downloadAttachment(attId) {
            return requestFile(`/inquiry-items/attachments/${attId}/download`, { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        deleteAttachment(attId) {
            return requestJson(`/inquiry-items/attachments/${attId}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },
        saveCaseMeta(project, pricerRemark) {
            return requestJson('/inquiry-items/case-meta', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify({ project_name: project, pricer_remark: pricerRemark }),
            });
        },
        uploadAttachments(project, formData) {
            return requestJson('/inquiry-items/attachments', {
                method: 'POST',
                headers: buildAuthHeaders({}, { includeUser: true }),
                body: formData,
            });
        },
        importExcel(formData) {
            return requestJson('/inquiry-items/import-excel', {
                method: 'POST',
                headers: buildAuthHeaders({}, { includeUser: true }),
                body: formData,
            });
        },
        getTonHistory(project) {
            const params = new URLSearchParams({ page: '1', page_size: '500' });
            if (project) params.set('project', project);
            return requestJson(`/inquiry-items/ton-price-history?${params.toString()}`, { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        exportTonHistory(project) {
            const params = new URLSearchParams();
            if (project) params.set('project', project);
            const suffix = params.toString() ? `?${params.toString()}` : '';
            return requestFile(`/inquiry-items/ton-price-history/export${suffix}`, { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        deleteItem(itemId) {
            return requestJson(`/inquiry-items/${itemId}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },
        deleteCase(project) {
            const params = new URLSearchParams({ project: project || '' });
            return requestJson(`/inquiry-items/case?${params.toString()}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },
        getPriceCache(keyword) {
            const params = new URLSearchParams();
            params.set('limit', '2000');
            if (keyword) params.set('keyword', keyword);
            return requestJson(`/inquiry-price-cache?${params.toString()}`, { headers: buildAuthHeaders({}, { includeUser: true }) });
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
            return requestFile(`/email-mgmt/price-cache/export${suffix}`, { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        getRateSettings() {
            return requestJson('/temp-price/rate-settings', { headers: buildAuthHeaders({}, { includeUser: true }) });
        },
        saveRateSettings(settings) {
            return requestJson('/temp-price/rate-settings', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { includeUser: true }),
                body: JSON.stringify({ settings }),
            });
        },
    };

    function init(container) {
        auth = window._ksAuth || null;
        currentUser = auth?.username || 'anonymous';
        const _role = String(auth?.role || '').trim();
        const _group = String(auth?.group || '').trim();
        state.isAdmin = _role === 'admin';
        state.canEditPrice = state.isAdmin || _group === '设计组';
        Object.assign(state, {
            counts: { pending: 0, priced: 0, total: 0, project_count: 0 },
            items: [], projects: [], total: 0, page: 1, pageSize: 500,
            statusFilter: '', projectFilter: '', businessFilter: '', keyword: '',
            cacheItems: [], cacheKeyword: '', cacheType: '', cacheExpiry: '',
            selectedCacheIds: new Set(),
            collapsedCases: new Set(),
            caseTonPrices: {},
            caseValidUntil: {},
            casePack: {},
            tonSettings: { byKey: {} },
            caseLocks: {}, caseMetas: {}, caseAttachments: {},
        });

        containerEl = container;
        cleanupFns = [];

        ensureStyles();
        containerEl.innerHTML = buildMainMarkup();
        cacheElements();
        bindEvents();
        renderStats();
        renderItems();
        renderCacheTable();
        // 只读用户隐藏价格库删除类操作（避免无权限报错）
        if (!state.canEditPrice) {
            if (elements.cacheDeleteBtn) elements.cacheDeleteBtn.style.display = 'none';
        }
        if (state.canEditPrice) {
            loadRates();
        }
        Promise.all([loadStats(), loadItems(true), loadCache()]);
    }

    function destroy() {
        cleanupFns.forEach((fn) => { try { fn(); } catch (e) {} });
        cleanupFns = [];
        const addModal = document.getElementById('iq-add-modal');
        if (addModal) addModal.remove();
        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
        Object.keys(elements).forEach((key) => { elements[key] = null; });
    }

    window.EmailMgmtPage = { init, destroy };
})();
