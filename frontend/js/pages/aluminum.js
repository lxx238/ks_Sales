(() => {
    let auth = null;
    let isAdmin = false;
    let canSubmitDatabaseChanges = false;
    let canDownloadDatabase = false;
    let canViewChangeRecords = false;
    let canReviewRequests = false;
    let currentUser = '';
    let currentRole = '';
    let activeViewMode = 'db';
    let activeDatabase = 'aluminum';

    const ALUMINUM_HIDDEN_COLUMNS = ['图片_base64'];
    const ALUMINUM_REQUIRED_COLUMNS = ['工程编码', '规格说明(mm)/(米)', '工程品名', '计价单位'];
    const ALUMINUM_PRIMARY_KEY = '工程编码';
    const ALUMINUM_PREFERRED_ORDER = [
        '工程编码', '规格说明(mm)/(米)', '工程品名', '工程品名--韩语', '工程品名--英语', '工程品名--日语',
        '计价单位', '10u小氧化(美元)--组装', '10u大氧化(美元)--组装', '10u小氧化(RMB)--组装',
        '15u小氧化(美元)--组装', '18u小氧化(美元)--组装',
        '图片', '编码属性', '属性', '定价属性', '重量', '材质',
    ];

    const FENCE_HIDDEN_COLUMNS = ['image_base64'];
    const FENCE_REQUIRED_COLUMNS = ['code', 'category', 'name'];
    const FENCE_PRIMARY_KEY = 'code';
    const FENCE_PREFERRED_ORDER = [
        'code', 'category', 'name', 'spec', 'price_usd', 'price_rmb',
        'price_3_5_usd', 'remark', '日语名称', '材質表面処理_浸塑', '材質表面処理_热镀锌',
    ];

    const dbState = {
        currentPage: 1,
        pageSize: 10,
        searchFilters: {
            code: '',
            name: '',
            spec: '',
            name_ko: '',
        },
        totalRecords: 0,
        totalPages: 1,
        currentRowCount: 0,
        editingId: null,
        loading: false,
        imageBase64: '',
        imageEncoding: false,
        requestPage: 1,
        requestPageSize: 8,
        requestStatus: 'pending',
        requestTotal: 0,
        requestTotalPages: 1,
        requestRowCount: 0,
        requestLoading: false,
        recentImportCodes: [],
        recentImportPreview: [],
        recentImportPreviewLimit: 12,
        knownColumns: [],
    };

    const fenceState = {
        currentPage: 1,
        pageSize: 20,
        searchCategory: '',
        searchKeyword: '',
        totalRecords: 0,
        totalPages: 1,
        currentRowCount: 0,
        editingId: null,
        loading: false,
        imageBase64: '',
        imageEncoding: false,
        knownColumns: [],
    };

    const fenceStyleState = {
        searchMeshType: '',
        searchBaseType: '',
        data: [],
        loading: false,
        editingId: null,
        imageBase64: '',
        imageEncoding: false,
        selectedCodes: new Set(),
    };

    const gateStyleState = {
        searchGateType: '',
        searchBaseType: '',
        data: [],
        loading: false,
        editingId: null,
        imageBase64: '',
        imageEncoding: false,
        selectedCodes: new Set(),
    };

    const pilePriceState = {
        data: [],
        loading: false,
    };

    const VALID_FENCE_CATEGORIES = [
        '围栏配件', '围栏网片', '围栏立柱', '围栏地桩',
        '门配件', '门网片', '门地桩',
        '推拉门配件', '推拉门网片',
        '折叠门配件', '折叠门网片',
    ];

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

    function buildApiUrl(path, baseUrl) {
        const base = baseUrl || getApiBaseUrl();
        const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
        return `${base}${normalizedPath}`;
    }

    function hasPermission(permission) {
        if (isAdmin) return true;
        const perms = auth?.permissions || [];
        return perms.includes(permission);
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
        const baseUrl = getApiBaseUrl();
        const url = buildApiUrl(path, baseUrl);
        const fetchOptions = { credentials: 'same-origin', ...options };
        let response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (error) {
            throw new Error(`无法连接接口 ${url}，请确认后端服务已启动：${error.message}`);
        }
        const payload = await readApiJson(response);
        if (!response.ok || payload.success === false) {
            throw new Error(payload.error || payload.message || `请求失败: ${response.status}`);
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
            return payload.error || payload.message || `请求失败: ${response.status}`;
        }
        const text = await response.text();
        const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
        return snippet || `请求失败: ${response.status}`;
    }

    async function requestFile(path, options = {}) {
        const baseUrl = getApiBaseUrl();
        const url = buildApiUrl(path, baseUrl);
        const fetchOptions = { credentials: 'same-origin', ...options };
        let response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (error) {
            throw new Error(`无法连接接口 ${url}，请确认后端服务已启动：${error.message}`);
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

    function ensureSupportStyles() {
        if (document.getElementById('aluminum-db-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'aluminum-db-inline-styles';
        style.textContent = `
            .modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            .modal-content {
                background: #fff;
                border-radius: 18px;
                padding: 24px;
                width: min(960px, calc(100vw - 32px));
                max-width: 960px;
                max-height: calc(100vh - 64px);
                overflow-y: auto;
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
            }
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 14px 20px;
                border-radius: 12px;
                background: #fff;
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
                z-index: 2000;
                max-width: min(420px, calc(100vw - 32px));
            }
            .image-preview {
                width: 60px;
                height: 60px;
                object-fit: cover;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
                background: #f8fafc;
            }
            .aluminum-search-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 12px;
                margin-top: 8px;
            }
            .aluminum-actions-row {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 14px;
                align-items: center;
            }
            .aluminum-request-summary {
                display: grid;
                gap: 4px;
                font-size: 13px;
                color: #475569;
                line-height: 1.6;
            }
            .aluminum-request-summary strong {
                color: #0f172a;
            }
            .aluminum-empty-tip {
                text-align: center;
                color: #94a3b8;
                padding: 40px 16px;
            }
            .aluminum-help {
                margin-top: 12px;
                background: #ecfeff;
                border: 1px solid #a5f3fc;
                color: #155e75;
            }
            .aluminum-review-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .aluminum-request-meta {
                display: inline-flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
            }
            .image-upload-box {
                display: grid;
                gap: 10px;
            }
            .image-upload-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
            }
            .image-upload-tip {
                font-size: 13px;
                color: #64748b;
            }
            .aluminum-import-result-panel {
                margin-top: 16px;
                padding: 16px;
                border-radius: 14px;
                border: 1px solid #bbf7d0;
                background: #f0fdf4;
            }
            .aluminum-import-result-panel table {
                background: #fff;
            }
            .aluminum-import-result-title {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 10px;
            }
            .aluminum-import-result-note {
                font-size: 13px;
                color: #166534;
            }
            .aluminum-highlight-cell {
                display: inline-flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
            }
            .aluminum-highlight-row {
                background: #f0fdf4;
            }
            .aluminum-pagination-bar {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: center;
                justify-content: space-between;
                margin-top: 16px;
            }
            .aluminum-pagination-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
                justify-content: flex-end;
            }
            .aluminum-page-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
            }
            .aluminum-page-btn {
                min-width: 38px;
                padding: 6px 10px;
            }
            .aluminum-page-btn.is-active {
                background: #0f766e;
                border-color: #0f766e;
                color: #fff;
            }
            .aluminum-page-ellipsis {
                min-width: 24px;
                text-align: center;
                color: #64748b;
            }
            .aluminum-page-jump {
                display: inline-flex;
                gap: 6px;
                align-items: center;
                color: #475569;
                font-size: 13px;
            }
            .aluminum-page-jump input {
                width: 72px;
                min-width: 72px;
            }
            .notification.info { border-left: 4px solid #2563eb; }
            .notification.success { border-left: 4px solid #16a34a; }
            .notification.error { border-left: 4px solid #dc2626; }
            @media (max-width: 980px) {
                .aluminum-search-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }
            @media (max-width: 720px) {
                .aluminum-search-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function buildMainSectionMarkup() {
        const intro = canReviewRequests
            ? '维护 aluminum_pricing 表，并审核各组员提交的新增、修改、删除申请。'
            : '支持多条件查询，并将新增、修改、删除申请提交给 admin 审核后再写入数据库。';
        const actionTitle = isAdmin ? '新增产品' : '提交新增';
        const helpText = canReviewRequests
            ? '管理员可直接修改数据库；审核通过后，组员提交的变更才会真正写入数据库。'
            : '当前页面的新增、修改、删除不会直接写库，提交后会进入 admin 审核队列。';
        const addButtonMarkup = canSubmitDatabaseChanges
            ? `<button class="btn primary" id="aluminum-add-btn">${actionTitle}</button>`
            : '';
        const bulkActionButtons = [
            isAdmin ? '<button class="btn" id="aluminum-export-images-btn">批量下载图片</button>' : '',
            canSubmitDatabaseChanges ? '<button class="btn" id="aluminum-import-images-btn">批量上传图片</button>' : '',
            canSubmitDatabaseChanges ? '<button class="btn" id="aluminum-batch-price-btn">批量更新数据</button>' : '',
            canSubmitDatabaseChanges ? '<button class="btn" id="aluminum-add-column-btn">新增列</button>' : '',
            canDownloadDatabase ? '<button class="btn" id="aluminum-download-db-btn">下载完整数据库</button>' : '',
        ].filter(Boolean).join('');
        const bulkActionInputs = canSubmitDatabaseChanges
            ? `
              <input id="aluminum-import-images-input" type="file" accept=".zip,.xlsx,.xls,image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp" multiple hidden>
              <input id="aluminum-batch-price-input" type="file" accept=".xlsx,.xls" hidden>
            `
            : '';
        const bulkActionTips = canSubmitDatabaseChanges
            ? `
            <div class="image-upload-tip" style="margin-top: 4px;">图片文件名需与工程编码一致；支持上传Excel（A列图片、B列编码，可一对多）、多选图片或 ZIP。</div>
            <div class="image-upload-tip">批量更新数据：上传Excel，第一列为工程编码，其余列的表头需与数据库列名一致（图片列除外）。若表头包含数据库中不存在的列名，将自动新增该列。</div>
            `
            : '';

        const dbSwitcher = `
            <div class="aluminum-actions-row" style="margin-bottom: 12px;">
              <label class="form-field" style="min-width: 220px;">
                <span>数据库</span>
                <select class="input" id="db-switcher">
                  <option value="aluminum">铝材数据库</option>
                  <option value="fence">围栏/门物料数据库</option>
                  <option value="fence_styles">围栏款式数据库</option>
                  <option value="gate_styles">门款式数据库</option>
                  <option value="pile_price">地桩15/18um价格表</option>
                </select>
              </label>
            </div>
        `;

        const aluminumSection = `
            <div id="aluminum-db-content" style="display: ${activeDatabase === 'aluminum' ? '' : 'none'};">
            <h2>${canReviewRequests ? '铝材数据库管理' : '铝材数据库查询与变更提交'}</h2>
            <p>${intro}</p>
            <div class="toolbar" style="margin-bottom: 8px;">
              <span class="tag">当前页 <span id="aluminum-current-count">0</span></span>
              <span class="tag">总记录 <span id="aluminum-total-count">0</span></span>
              <span class="tag">查询条件 <span id="aluminum-search-state">全部数据</span></span>
            </div>
            <div id="aluminum-section-status" class="notice" style="display: none; margin-bottom: 14px;"></div>
            <div class="notice aluminum-help">${helpText}</div>
            <div class="aluminum-search-grid">
              <div class="form-field">
                <label for="aluminum-search-code">工程编码</label>
                <input class="input" id="aluminum-search-code" placeholder="按工程编码查询">
              </div>
              <div class="form-field">
                <label for="aluminum-search-name">工程品名</label>
                <input class="input" id="aluminum-search-name" placeholder="按工程品名查询">
              </div>
              <div class="form-field">
                <label for="aluminum-search-spec">规格说明</label>
                <input class="input" id="aluminum-search-spec" placeholder="按规格说明查询">
              </div>
              <div class="form-field">
                <label for="aluminum-search-name-ko">工程品名--韩语</label>
                <input class="input" id="aluminum-search-name-ko" placeholder="按韩语品名查询">
              </div>
            </div>
            <div class="aluminum-actions-row">
              <button class="btn primary" id="aluminum-search-btn">确认查询</button>
              <button class="btn" id="aluminum-search-reset-btn">重置条件</button>
              <button class="btn" id="aluminum-refresh-btn">刷新</button>
              ${addButtonMarkup}
            </div>
            ${bulkActionButtons ? `
            <div class="aluminum-actions-row" style="margin-top: 10px;">
              ${bulkActionButtons}
              ${bulkActionInputs}
            </div>
            ${bulkActionTips}
            ` : ''}
            ${canSubmitDatabaseChanges ? `
            <div id="aluminum-import-result-panel" class="aluminum-import-result-panel" style="display: none;">
              <div class="aluminum-import-result-title">
                <strong>本次图片匹配结果</strong>
                <span class="tag success" id="aluminum-import-result-count">0</span>
              </div>
              <div class="aluminum-import-result-note" id="aluminum-import-result-note">本次上传匹配到的物料会优先显示在这里。</div>
              <div style="overflow-x: auto; margin-top: 12px;">
                <table>
                  <thead>
                    <tr>
                      <th>工程编码</th>
                      <th>规格说明</th>
                      <th>工程品名</th>
                      <th>图片</th>
                      <th>韩语品名</th>
                    </tr>
                  </thead>
                  <tbody id="aluminum-import-result-body"></tbody>
                </table>
              </div>
            </div>
            ` : ''}
            <div style="overflow-x: auto; margin-top: 16px;">
              <table>
                <thead>
                  <tr>
                    <th>工程编码</th>
                    <th>工程品名</th>
                    <th>10u小氧化(美元)--组装</th>
                    <th>重量</th>
                    <th>图片</th>
                    <th>材质</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="aluminum-table-body"></tbody>
              </table>
            </div>
            <div class="aluminum-pagination-bar">
              <span id="aluminum-pagination-info">共 0 条记录</span>
              <div class="aluminum-pagination-controls">
                <button class="btn small" id="aluminum-prev-page">上一页</button>
                <div class="aluminum-page-buttons" id="aluminum-page-buttons"></div>
                <span id="aluminum-page-info">第 0 / 1 页</span>
                <button class="btn small" id="aluminum-next-page">下一页</button>
                <label class="aluminum-page-jump">
                  <span>跳到</span>
                  <input class="input" id="aluminum-page-jump-input" type="number" min="1" step="1" placeholder="页码">
                  <button class="btn small" id="aluminum-page-jump-btn" type="button">跳转</button>
                </label>
              </div>
            </div>
            </div>
        `;

        const fenceSection = buildFenceSectionMarkup();
        const fenceStyleSection = buildFenceStyleSectionMarkup();
        const gateStyleSection = buildGateStyleSectionMarkup();
        const pilePriceSection = buildPilePriceSectionMarkup();

        return dbSwitcher + aluminumSection + fenceSection + fenceStyleSection + gateStyleSection + pilePriceSection;
    }

    function buildFenceSectionMarkup() {
        const fenceAddButton = canSubmitDatabaseChanges
            ? '<button class="btn primary" id="fence-add-btn">新增物料</button>'
            : '';
        const fenceBulkButtons = [
            isAdmin ? '<button class="btn" id="fence-export-images-btn">批量下载图片</button>' : '',
            canSubmitDatabaseChanges ? '<button class="btn" id="fence-import-images-btn">批量上传图片</button>' : '',
            canSubmitDatabaseChanges ? '<button class="btn" id="fence-batch-update-btn">批量更新数据</button>' : '',
            canSubmitDatabaseChanges ? '<button class="btn primary" id="fence-batch-price-btn">批量更新价格</button>' : '',
            canSubmitDatabaseChanges ? '<button class="btn" id="fence-add-column-btn">新增列</button>' : '',
            canDownloadDatabase ? '<button class="btn" id="fence-download-db-btn">下载数据库</button>' : '',
        ].filter(Boolean).join('');

        const categoryOptions = ['<option value="">全部</option>']
            .concat(VALID_FENCE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`))
            .join('');

        return `
            <div id="fence-db-content" style="display: ${activeDatabase === 'fence' ? '' : 'none'};">
            <h2>围栏/门物料数据库</h2>
            <p>管理围栏和门使用的物料编码、规格、价格及图片。</p>
            <div class="toolbar" style="margin-bottom: 8px;">
              <span class="tag">当前页 <span id="fence-current-count">0</span></span>
              <span class="tag">总记录 <span id="fence-total-count">0</span></span>
            </div>
            <div id="fence-section-status" class="notice" style="display: none; margin-bottom: 14px;"></div>
            <div class="aluminum-search-grid">
              <div class="form-field">
                <label for="fence-search-category">分类</label>
                <select class="input" id="fence-search-category">${categoryOptions}</select>
              </div>
              <div class="form-field">
                <label for="fence-search-keyword">关键词</label>
                <input class="input" id="fence-search-keyword" placeholder="编码/名称/规格">
              </div>
            </div>
            <div class="aluminum-actions-row">
              <button class="btn primary" id="fence-search-btn">查询</button>
              <button class="btn" id="fence-search-reset-btn">重置</button>
              <button class="btn" id="fence-refresh-btn">刷新</button>
              ${fenceAddButton}
            </div>
            ${fenceBulkButtons ? `
            <div class="aluminum-actions-row" style="margin-top: 10px;">
              ${fenceBulkButtons}
              <input id="fence-import-images-input" type="file" accept=".zip,image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp" multiple hidden>
              <input id="fence-batch-update-input" type="file" accept=".xlsx,.xls" hidden>
              <input id="fence-batch-price-input" type="file" accept=".xlsx,.xls" hidden>
            </div>
            <div class="image-upload-tip" style="margin-top: 4px;">批量更新价格：上传Excel，第一列为"code"（物料编码），第二列为"price_usd"（美元单价），第三列为"price_rmb"（人民币单价）。只需包含需要更新的行。</div>
            ` : ''}
            <div style="overflow-x: auto; margin-top: 16px;">
              <table>
                <thead>
                  <tr>
                    <th>编码</th>
                    <th>分类</th>
                    <th>名称</th>
                    <th>规格</th>
                    <th>单价(USD)</th>
                    <th>单价(RMB)</th>
                    <th>备注</th>
                    <th>图片</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="fence-table-body"></tbody>
              </table>
            </div>
            <div class="aluminum-pagination-bar">
              <span id="fence-pagination-info">共 0 条记录</span>
              <div class="aluminum-pagination-controls">
                <button class="btn small" id="fence-prev-page">上一页</button>
                <div class="aluminum-page-buttons" id="fence-page-buttons"></div>
                <span id="fence-page-info">第 0 / 1 页</span>
                <button class="btn small" id="fence-next-page">下一页</button>
                <label class="aluminum-page-jump">
                  <span>跳到</span>
                  <input class="input" id="fence-page-jump-input" type="number" min="1" step="1" placeholder="页码">
                  <button class="btn small" id="fence-page-jump-btn" type="button">跳转</button>
                </label>
              </div>
            </div>
            </div>
        `;
    }

    function buildFenceStyleSectionMarkup() {
        return `
            <div id="fence-style-db-content" style="display: none;">
            <h2>围栏款式数据库</h2>
            <p>管理围栏款式配置：网片类型、立柱规格、基础类型与物料BOM关联。</p>
            <div class="toolbar" style="margin-bottom: 8px;">
              <span class="tag">总记录 <span id="fence-style-total-count">0</span></span>
            </div>
            <div id="fence-style-section-status" class="notice" style="display: none; margin-bottom: 14px;"></div>
            <div class="aluminum-search-grid">
              <div class="form-field">
                <label for="fence-style-search-mesh">网片类型</label>
                <select class="input" id="fence-style-search-mesh">
                  <option value="">全部</option>
                  <option value="74x150">74x150</option>
                  <option value="100x150">100x150</option>
                </select>
              </div>
              <div class="form-field">
                <label for="fence-style-search-base">基础类型</label>
                <select class="input" id="fence-style-search-base">
                  <option value="">全部</option>
                  <option value="concrete">混凝土基础</option>
                  <option value="pile">地桩基础</option>
                  <option value="direct">一体打入式</option>
                </select>
              </div>
            </div>
            <div class="aluminum-actions-row" style="margin-top: 10px;">
              <button class="btn primary" id="fence-style-search-btn">查询</button>
              <button class="btn" id="fence-style-search-reset-btn">重置</button>
              <button class="btn" id="fence-style-refresh-btn">刷新</button>
              ${canSubmitDatabaseChanges ? '<button class="btn primary" id="fence-style-add-btn">新增款式</button>' : ''}
              ${canSubmitDatabaseChanges ? '<button class="btn" id="fence-style-batch-delete-btn" disabled>批量删除</button>' : ''}
              ${canSubmitDatabaseChanges ? '<button class="btn" id="fence-style-batch-update-btn">Excel批量导入</button>' : ''}
              ${canDownloadDatabase ? '<button class="btn" id="fence-style-download-btn">下载Excel</button>' : ''}
              <input id="fence-style-batch-update-input" type="file" accept=".xlsx,.xls" hidden>
            </div>
            <div style="overflow-x: auto; margin-top: 16px;">
              <table>
                <thead>
                  <tr>
                    ${canSubmitDatabaseChanges ? '<th><input type="checkbox" id="fence-style-select-all"></th>' : ''}
                    <th>款式编号</th>
                    <th>网片类型</th>
                    <th>立柱规格</th>
                    <th>基础类型</th>
                    <th>高度</th>
                    <th>网片编码</th>
                    <th>厚线径编码</th>
                    <th>立柱编码</th>
                    <th>地桩编码</th>
                    <th>端盖编码</th>
                    <th>图片</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="fence-style-table-body"></tbody>
              </table>
            </div>
            </div>
        `;
    }

    function buildGateStyleSectionMarkup() {
        return `
            <div id="gate-style-db-content" style="display: none;">
            <h2>门款式数据库</h2>
            <p>管理门款式配置：单/双开门、宽度、高度、基础类型与整樘门价格。</p>
            <div class="toolbar" style="margin-bottom: 8px;">
              <span class="tag">总记录 <span id="gate-style-total-count">0</span></span>
            </div>
            <div id="gate-style-section-status" class="notice" style="display: none; margin-bottom: 14px;"></div>
            <div class="aluminum-search-grid">
              <div class="form-field">
                <label for="gate-style-search-type">门类型</label>
                <select class="input" id="gate-style-search-type">
                  <option value="">全部</option>
                  <option value="single">单开门</option>
                  <option value="double">双开门</option>
                  <option value="sliding">推拉门</option>
                  <option value="folding">折叠门</option>
                  <option value="telescopic">伸缩门</option>
                </select>
              </div>
              <div class="form-field">
                <label for="gate-style-search-base">基础类型</label>
                <select class="input" id="gate-style-search-base">
                  <option value="">全部</option>
                  <option value="concrete">混凝土基础</option>
                  <option value="integrated">一体式基础</option>
                  <option value="pile">地桩基础</option>
                </select>
              </div>
            </div>
            <div class="aluminum-actions-row" style="margin-top: 10px;">
              <button class="btn primary" id="gate-style-search-btn">查询</button>
              <button class="btn" id="gate-style-search-reset-btn">重置</button>
              <button class="btn" id="gate-style-refresh-btn">刷新</button>
              ${canSubmitDatabaseChanges ? '<button class="btn primary" id="gate-style-add-btn">新增款式</button>' : ''}
              ${canSubmitDatabaseChanges ? '<button class="btn" id="gate-style-batch-delete-btn" disabled>批量删除</button>' : ''}
              ${canSubmitDatabaseChanges ? '<button class="btn" id="gate-style-batch-update-btn">Excel批量导入</button>' : ''}
              ${canDownloadDatabase ? '<button class="btn" id="gate-style-download-btn">下载Excel</button>' : ''}
              <input id="gate-style-batch-update-input" type="file" accept=".xlsx,.xls" hidden>
            </div>
            <div style="overflow-x: auto; margin-top: 16px;">
              <table>
                <thead>
                  <tr>
                    ${canSubmitDatabaseChanges ? '<th><input type="checkbox" id="gate-style-select-all"></th>' : ''}
                    <th>款式编号</th>
                    <th>门类型</th>
                    <th>宽度(mm)</th>
                    <th>高度(mm)</th>
                    <th>基础类型</th>
                    <th>门网片编码</th>
                    <th>配件数量(扣/栓/盖)</th>
                    <th>图片</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="gate-style-table-body"></tbody>
              </table>
            </div>
            </div>
        `;
    }

    function buildPilePriceSectionMarkup() {
        return `
            <div id="pile-price-db-content" style="display: none;">
            <h2>地桩 15/18um 价格表</h2>
            <p>管理地桩产品在15um和18um涂层厚度下的单价（美元、欧元、人民币）。</p>
            <div class="toolbar" style="margin-bottom: 8px;">
              <span class="tag">总记录 <span id="pile-price-total-count">0</span></span>
            </div>
            <div id="pile-price-section-status" class="notice" style="display: none; margin-bottom: 14px;"></div>
            <div class="aluminum-actions-row">
              <button class="btn" id="pile-price-refresh-btn">刷新</button>
              ${canSubmitDatabaseChanges ? '<button class="btn" id="pile-price-batch-update-btn">批量更新价格</button>' : ''}
              <input id="pile-price-batch-update-input" type="file" accept=".xlsx,.xls" hidden>
            </div>
            <div class="image-upload-tip" style="margin-top: 4px;">批量更新价格：上传Excel，第一列为"产品编号"，其余列的表头需为"单价：美元"、"单价：欧元"、"单价：人民币"。</div>
            <div style="overflow-x: auto; margin-top: 16px;">
              <table>
                <thead>
                  <tr>
                    <th>产品编号</th>
                    <th>单价：美元</th>
                    <th>单价：欧元</th>
                    <th>单价：人民币</th>
                  </tr>
                </thead>
                <tbody id="pile-price-table-body"></tbody>
              </table>
            </div>
            </div>
        `;
    }

    function buildFenceStyleModalMarkup() {
        return `
            <div class="modal-content">
              <h3 id="fence-style-modal-title">新增围栏款式</h3>
              <form id="fence-style-form">
                <div class="form-row">
                  <div class="form-field">
                    <label for="fs-code">款式编号 *</label>
                    <input class="input" id="fs-code" required placeholder="例如：38CC-100" />
                  </div>
                  <div class="form-field">
                    <label for="fs-mesh-type">网片类型 *</label>
                    <select class="input" id="fs-mesh-type" required>
                      <option value="74x150">74x150</option>
                      <option value="100x150">100x150</option>
                    </select>
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="fs-pipe-spec">立柱规格 *</label>
                    <input class="input" id="fs-pipe-spec" required placeholder="例如：38×t1.5" />
                  </div>
                  <div class="form-field">
                    <label for="fs-base-type">基础类型 *</label>
                    <select class="input" id="fs-base-type" required>
                      <option value="concrete">混凝土基础</option>
                      <option value="pile">地桩基础</option>
                      <option value="direct">一体打入式</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label for="fs-height">高度(mm) *</label>
                    <select class="input" id="fs-height" required>
                      <option value="1000">1000</option>
                      <option value="1200">1200</option>
                      <option value="1500">1500</option>
                      <option value="1800">1800</option>
                      <option value="2000">2000</option>
                    </select>
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="fs-mesh-code">网片编码 *</label>
                    <input class="input" id="fs-mesh-code" required placeholder="例如：FN01-W0101-1000" />
                  </div>
                  <div class="form-field">
                    <label for="fs-mesh-thick-code">厚线径编码 *</label>
                    <input class="input" id="fs-mesh-thick-code" required placeholder="例如：FN01-W0102-1000" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="fs-post-code">立柱编码 *</label>
                    <input class="input" id="fs-post-code" required placeholder="例如：FN01-L0203-1160" />
                  </div>
                  <div class="form-field">
                    <label for="fs-pile-code">地桩编码</label>
                    <input class="input" id="fs-pile-code" placeholder="一体打入式留空" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="fs-end-cap-code">端盖编码 *</label>
                    <input class="input" id="fs-end-cap-code" required placeholder="例如：XJ-0017" />
                  </div>
                  <div class="form-field">
                    <label for="fs-rubber-code">橡胶环编码</label>
                    <input class="input" id="fs-rubber-code" placeholder="一体打入式留空" />
                  </div>
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label for="fs-image-file">图片上传</label>
                  <div class="image-upload-box">
                    <div class="image-upload-actions">
                      <input id="fs-image-file" type="file" accept="image/*" />
                      <button class="btn" type="button" id="fs-image-clear-btn">清除图片</button>
                    </div>
                    <div id="fs-image-status" class="image-upload-tip">选择本地图片后，前端会转成 base64。</div>
                  </div>
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label>图片预览</label>
                  <div id="fs-image-preview" class="notice">未设置图片</div>
                </div>
                <div class="form-actions" style="margin-top: 16px;">
                  <button class="btn primary" type="submit" id="fs-submit-btn">保存</button>
                  <button class="btn" type="button" id="fs-cancel-btn">取消</button>
                </div>
              </form>
            </div>
        `;
    }

    function buildGateStyleModalMarkup() {
        return `
            <div class="modal-content">
              <h3 id="gate-style-modal-title">新增门款式</h3>
              <form id="gate-style-form">
                <div class="form-row">
                  <div class="form-field">
                    <label for="gs-code">款式编号 *</label>
                    <input class="input" id="gs-code" required placeholder="例如：tsc120-100" />
                  </div>
                  <div class="form-field">
                    <label for="gs-gate-type">门类型 *</label>
                    <input class="input" id="gs-gate-type" list="gs-gate-type-list" required placeholder="选择或输入新类型" />
                    <datalist id="gs-gate-type-list">
                      <option value="single">单开门</option>
                      <option value="double">双开门</option>
                      <option value="sliding">推拉门</option>
                      <option value="folding">折叠门</option>
                      <option value="telescopic">伸缩门</option>
                    </datalist>
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-width">宽度(mm) *</label>
                    <input class="input" id="gs-width" type="number" min="600" step="100" value="1200" required placeholder="输入宽度" />
                  </div>
                  <div class="form-field">
                    <label for="gs-height">高度(mm) *</label>
                    <input class="input" id="gs-height" type="number" min="500" step="100" value="1500" required placeholder="输入高度" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-base-type">基础类型 *</label>
                    <select class="input" id="gs-base-type" required>
                      <option value="concrete">混凝土基础</option>
                      <option value="integrated">一体式基础</option>
                      <option value="pile">地桩基础</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label for="gs-mesh-base-code">门网片基础编码</label>
                    <input class="input" id="gs-mesh-base-code" placeholder="如 M0001-1000" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-buckle-code">门扣组件编码</label>
                    <input class="input" id="gs-buckle-code" value="FN-PJ-0002" />
                  </div>
                  <div class="form-field">
                    <label for="gs-buckle-qty">门扣数量</label>
                    <input class="input" id="gs-buckle-qty" type="number" min="0" step="1" value="0" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-bolt-code">螺栓组件编码</label>
                    <input class="input" id="gs-bolt-code" value="FN-PJ-0004" />
                  </div>
                  <div class="form-field">
                    <label for="gs-bolt-qty">螺栓数量</label>
                    <input class="input" id="gs-bolt-qty" type="number" min="0" step="1" value="0" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-end-cap-code">端盖编码</label>
                    <input class="input" id="gs-end-cap-code" value="XJ-0009" />
                  </div>
                  <div class="form-field">
                    <label for="gs-end-cap-qty">端盖数量</label>
                    <input class="input" id="gs-end-cap-qty" type="number" min="0" step="1" value="2" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-horizontal-pin-code">横插销编码</label>
                    <input class="input" id="gs-horizontal-pin-code" placeholder="双开门填 FN-PJ-0005" />
                  </div>
                  <div class="form-field">
                    <label for="gs-horizontal-pin-qty">横插销数量</label>
                    <input class="input" id="gs-horizontal-pin-qty" type="number" min="0" step="1" value="0" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-vertical-pin-code">竖插销编码</label>
                    <input class="input" id="gs-vertical-pin-code" placeholder="双开门填 FN-PJ-0006" />
                  </div>
                  <div class="form-field">
                    <label for="gs-vertical-pin-qty">竖插销数量</label>
                    <input class="input" id="gs-vertical-pin-qty" type="number" min="0" step="1" value="0" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-pile-code">地桩编码</label>
                    <input class="input" id="gs-pile-code" placeholder="地桩基础时填写" />
                  </div>
                  <div class="form-field">
                    <label for="gs-pile-qty">地桩数量</label>
                    <input class="input" id="gs-pile-qty" type="number" min="0" step="1" value="0" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-pile-bolt-code">地桩螺栓编码</label>
                    <input class="input" id="gs-pile-bolt-code" placeholder="如 FA-0137" />
                  </div>
                  <div class="form-field">
                    <label for="gs-pile-bolt-qty">地桩螺栓数量</label>
                    <input class="input" id="gs-pile-bolt-qty" type="number" min="0" step="1" value="0" />
                  </div>
                </div>
                <div class="form-row" style="margin-top: 8px;">
                  <div class="form-field">
                    <label for="gs-rubber-code">橡胶环编码</label>
                    <input class="input" id="gs-rubber-code" placeholder="地桩基础时填写" />
                  </div>
                  <div class="form-field">
                    <label for="gs-rubber-qty">橡胶环数量</label>
                    <input class="input" id="gs-rubber-qty" type="number" min="0" step="1" value="0" />
                  </div>
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label for="gs-image-file">图片上传</label>
                  <div class="image-upload-box">
                    <div class="image-upload-actions">
                      <input id="gs-image-file" type="file" accept="image/*" />
                      <button class="btn" type="button" id="gs-image-clear-btn">清除图片</button>
                    </div>
                    <div id="gs-image-status" class="image-upload-tip">选择本地图片后，前端会转成 base64。</div>
                  </div>
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label>图片预览</label>
                  <div id="gs-image-preview" class="notice">未设置图片</div>
                </div>
                <div class="form-actions" style="margin-top: 16px;">
                  <button class="btn primary" type="submit" id="gs-submit-btn">保存</button>
                  <button class="btn" type="button" id="gs-cancel-btn">取消</button>
                </div>
              </form>
            </div>
        `;
    }

    function buildFenceModalMarkup() {
        const categoryOptions = VALID_FENCE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
        return `
            <div class="modal-content">
              <h3 id="fence-modal-title">新增物料</h3>
              <form id="fence-form">
                <div id="fence-dynamic-fields"></div>
                <div class="form-field" style="margin-top: 12px;">
                  <label for="fence-image-file">图片上传</label>
                  <div class="image-upload-box">
                    <div class="image-upload-actions">
                      <input id="fence-image-file" type="file" accept="image/*" />
                      <button class="btn" type="button" id="fence-image-clear-btn">清除图片</button>
                    </div>
                    <div id="fence-image-status" class="image-upload-tip">选择本地图片后，前端会转成 base64，一并提交。</div>
                  </div>
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label>图片预览</label>
                  <div id="fence-image-preview" class="notice">未设置图片</div>
                </div>
                <div class="form-actions" style="margin-top: 16px;">
                  <button class="btn primary" type="submit" id="fence-submit-btn">保存</button>
                  <button class="btn" type="button" id="fence-cancel-btn">取消</button>
                </div>
              </form>
            </div>
        `;
    }

    function buildFenceDynamicFieldHtml(colName, value, isReadonly, isRequired) {
        const escapedName = escapeHtml(colName);
        const escapedValue = escapeHtml(String(value || ''));
        const readonlyAttr = isReadonly ? ' readonly' : '';
        const requiredMark = isRequired ? ' *' : '';
        return `<div class="form-field">
                    <label>${escapedName}${requiredMark}</label>
                    <input class="input fence-dynamic-input" data-column="${escapedName}" value="${escapedValue}"${readonlyAttr} />
                  </div>`;
    }

    function renderFenceDynamicFields(data, mode) {
        const container = document.getElementById('fence-dynamic-fields');
        if (!container) return;
        let columns;
        if (mode === 'edit' && data) {
            columns = Object.keys(data).filter(k => !FENCE_HIDDEN_COLUMNS.includes(k));
            fenceState.knownColumns = Array.from(new Set([...fenceState.knownColumns, ...Object.keys(data)]));
        } else {
            columns = fenceState.knownColumns.length > 0
                ? fenceState.knownColumns.filter(k => !FENCE_HIDDEN_COLUMNS.includes(k))
                : FENCE_PREFERRED_ORDER.filter(k => !FENCE_HIDDEN_COLUMNS.includes(k));
        }
        columns = sortColumnsForDisplay(columns, FENCE_PREFERRED_ORDER);
        let html = '';
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const isReadonly = col === FENCE_PRIMARY_KEY && mode === 'edit';
            const isRequired = FENCE_REQUIRED_COLUMNS.includes(col);
            const val = data ? (data[col] !== undefined && data[col] !== null ? data[col] : '') : '';
            if (i % 2 === 0) html += '<div class="form-row" style="margin-top: 8px;">';
            html += buildFenceDynamicFieldHtml(col, val, isReadonly, isRequired);
            if (i % 2 === 1 || i === columns.length - 1) html += '</div>';
        }
        container.innerHTML = html;
    }

    function buildReviewSectionMarkup() {
        const title = canReviewRequests ? '待审核变更' : '我的申请记录';
        const intro = canReviewRequests
            ? '组员提交的新增、修改、删除申请会先进入这里，只有审核通过后才会写入数据库。'
            : '这里显示当前账号已提交的新增、修改、删除申请，以及每条申请的审核状态。';
        const refreshText = canReviewRequests ? '刷新申请列表' : '刷新我的申请';

        return `
            <h2>${title}</h2>
            <p>${intro}</p>
            <div class="toolbar" style="margin-bottom: 8px;">
              <span class="tag">当前页 <span id="aluminum-request-current-count">0</span></span>
              <span class="tag">总申请 <span id="aluminum-request-total-count">0</span></span>
            </div>
            <div id="aluminum-request-section-status" class="notice" style="display: none; margin-bottom: 14px;"></div>
            <div class="aluminum-actions-row">
              <label class="form-field" style="min-width: 220px;">
                <span>审核状态</span>
                <select class="input" id="aluminum-request-status-filter">
                  <option value="pending">待审核</option>
                  <option value="">全部</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已驳回</option>
                  <option value="withdrawn">已撤回</option>
                </select>
              </label>
              <button class="btn primary" id="aluminum-request-refresh-btn">${refreshText}</button>
            </div>
            <div style="overflow-x: auto; margin-top: 16px;">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>类型</th>
                    <th>工程编码</th>
                    <th>申请人</th>
                    <th>提交时间</th>
                    <th>内容</th>
                    <th>状态</th>
                    <th>${canReviewRequests ? '操作' : '处理结果'}</th>
                  </tr>
                </thead>
                <tbody id="aluminum-request-table-body"></tbody>
              </table>
            </div>
            <div class="aluminum-pagination-bar">
              <span id="aluminum-request-page-label">第 0 / 1 页</span>
              <div class="aluminum-pagination-controls">
                <button class="btn small" id="aluminum-request-prev-page">上一页</button>
                <div class="aluminum-page-buttons" id="aluminum-request-page-buttons"></div>
                <button class="btn small" id="aluminum-request-next-page">下一页</button>
                <label class="aluminum-page-jump">
                  <span>跳到</span>
                  <input class="input" id="aluminum-request-page-jump-input" type="number" min="1" step="1" placeholder="页码">
                  <button class="btn small" id="aluminum-request-page-jump-btn" type="button">跳转</button>
                </label>
              </div>
            </div>
        `;
    }

    function buildModalMarkup() {
        return `
            <div class="modal-content">
              <h3 id="modal-title">新增产品</h3>
              <div id="aluminum-flow-tip" class="notice" style="margin-bottom: 12px; display: none;"></div>
              <form id="aluminum-form">
                <div id="aluminum-dynamic-fields"></div>
                <div class="form-field" style="margin-top: 12px;">
                  <label for="aluminum-image-file">图片上传</label>
                  <div class="image-upload-box">
                    <div class="image-upload-actions">
                      <input id="aluminum-image-file" type="file" accept="image/*" />
                      <button class="btn" type="button" id="aluminum-image-clear-btn">清除图片</button>
                    </div>
                    <div id="aluminum-image-status" class="image-upload-tip">选择本地图片后，前端会转成 base64，一并提交。</div>
                  </div>
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label>图片预览</label>
                  <div id="aluminum-image-preview" class="notice">未设置图片</div>
                </div>
                <div class="form-actions" style="margin-top: 16px;">
                  <button class="btn primary" type="submit" id="aluminum-submit-btn">保存</button>
                  <button class="btn" type="button" id="aluminum-cancel-btn">取消</button>
                </div>
              </form>
            </div>
        `;
    }

    function sortColumnsForDisplay(columns, preferredOrder) {
        const ordered = [];
        const remaining = [];
        const colSet = new Set(columns);
        for (const col of preferredOrder) {
            if (colSet.has(col)) ordered.push(col);
        }
        for (const col of columns) {
            if (!preferredOrder.includes(col)) remaining.push(col);
        }
        return ordered.concat(remaining);
    }

    function buildDynamicFieldHtml(colName, value, isReadonly, isRequired) {
        const escapedName = escapeHtml(colName);
        const escapedValue = escapeHtml(String(value || ''));
        const readonlyAttr = isReadonly ? ' disabled' : '';
        const requiredMark = isRequired ? ' *' : '';
        return `<div class="form-field">
                    <label>${escapedName}${requiredMark}</label>
                    <input class="input aluminum-dynamic-input" data-column="${escapedName}" value="${escapedValue}"${readonlyAttr} />
                  </div>`;
    }

    function renderAluminumDynamicFields(data, mode) {
        const container = document.getElementById('aluminum-dynamic-fields');
        if (!container) return;
        let columns;
        if (mode === 'edit' && data) {
            columns = Object.keys(data).filter(k => !ALUMINUM_HIDDEN_COLUMNS.includes(k));
            dbState.knownColumns = Array.from(new Set([...dbState.knownColumns, ...Object.keys(data)]));
        } else {
            columns = dbState.knownColumns.length > 0
                ? dbState.knownColumns.filter(k => !ALUMINUM_HIDDEN_COLUMNS.includes(k))
                : ALUMINUM_PREFERRED_ORDER.filter(k => !ALUMINUM_HIDDEN_COLUMNS.includes(k));
        }
        columns = sortColumnsForDisplay(columns, ALUMINUM_PREFERRED_ORDER);
        let html = '';
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const isImageCol = col === '图片';
            const isReadonly = col === ALUMINUM_PRIMARY_KEY && mode === 'edit';
            const isRequired = ALUMINUM_REQUIRED_COLUMNS.includes(col);
            const val = data ? (data[col] || '') : '';
            if (i % 2 === 0) html += '<div class="form-row" style="margin-top: 12px;">';
            if (isImageCol) {
                html += buildDynamicFieldHtml(col, val, false, false);
            } else {
                html += buildDynamicFieldHtml(col, val, isReadonly, isRequired);
            }
            if (i % 2 === 1 || i === columns.length - 1) html += '</div>';
        }
        container.innerHTML = html;
    }

    function cacheElements() {
        elements.searchCodeInput = document.getElementById('aluminum-search-code');
        elements.searchNameInput = document.getElementById('aluminum-search-name');
        elements.searchSpecInput = document.getElementById('aluminum-search-spec');
        elements.searchNameKoInput = document.getElementById('aluminum-search-name-ko');
        elements.searchButton = document.getElementById('aluminum-search-btn');
        elements.searchResetButton = document.getElementById('aluminum-search-reset-btn');
        elements.addButton = document.getElementById('aluminum-add-btn');
        elements.refreshButton = document.getElementById('aluminum-refresh-btn');
        elements.exportImagesButton = document.getElementById('aluminum-export-images-btn');
        elements.importImagesButton = document.getElementById('aluminum-import-images-btn');
        elements.downloadDatabaseButton = document.getElementById('aluminum-download-db-btn');
        elements.batchPriceButton = document.getElementById('aluminum-batch-price-btn');
        elements.batchPriceInput = document.getElementById('aluminum-batch-price-input');
        elements.addColumnButton = document.getElementById('aluminum-add-column-btn');
        elements.importImagesInput = document.getElementById('aluminum-import-images-input');
        elements.importResultPanel = document.getElementById('aluminum-import-result-panel');
        elements.importResultCount = document.getElementById('aluminum-import-result-count');
        elements.importResultNote = document.getElementById('aluminum-import-result-note');
        elements.importResultBody = document.getElementById('aluminum-import-result-body');
        elements.tableBody = document.getElementById('aluminum-table-body');
        elements.paginationInfo = document.getElementById('aluminum-pagination-info');
        elements.pageInfo = document.getElementById('aluminum-page-info');
        elements.prevButton = document.getElementById('aluminum-prev-page');
        elements.nextButton = document.getElementById('aluminum-next-page');
        elements.pageButtons = document.getElementById('aluminum-page-buttons');
        elements.pageJumpInput = document.getElementById('aluminum-page-jump-input');
        elements.pageJumpButton = document.getElementById('aluminum-page-jump-btn');
        elements.sectionStatus = document.getElementById('aluminum-section-status');
        elements.currentCount = document.getElementById('aluminum-current-count');
        elements.totalCount = document.getElementById('aluminum-total-count');
        elements.searchState = document.getElementById('aluminum-search-state');
        elements.modal = document.getElementById('aluminum-modal');
        elements.modalTitle = document.getElementById('modal-title');
        elements.flowTip = document.getElementById('aluminum-flow-tip');
        elements.form = document.getElementById('aluminum-form');
        elements.imageFileInput = document.getElementById('aluminum-image-file');
        elements.imageClearButton = document.getElementById('aluminum-image-clear-btn');
        elements.imageStatus = document.getElementById('aluminum-image-status');
        elements.imagePreview = document.getElementById('aluminum-image-preview');
        elements.submitButton = document.getElementById('aluminum-submit-btn');
        elements.cancelButton = document.getElementById('aluminum-cancel-btn');

        elements.requestStatusFilter = document.getElementById('aluminum-request-status-filter');
        elements.requestRefreshButton = document.getElementById('aluminum-request-refresh-btn');
        elements.requestTableBody = document.getElementById('aluminum-request-table-body');
        elements.requestSectionStatus = document.getElementById('aluminum-request-section-status');
        elements.requestCurrentCount = document.getElementById('aluminum-request-current-count');
        elements.requestTotalCount = document.getElementById('aluminum-request-total-count');
        elements.requestPageLabel = document.getElementById('aluminum-request-page-label');
        elements.requestPrevButton = document.getElementById('aluminum-request-prev-page');
        elements.requestNextButton = document.getElementById('aluminum-request-next-page');
        elements.requestPageButtons = document.getElementById('aluminum-request-page-buttons');
        elements.requestPageJumpInput = document.getElementById('aluminum-request-page-jump-input');
        elements.requestPageJumpButton = document.getElementById('aluminum-request-page-jump-btn');

        elements.dbSwitcher = document.getElementById('db-switcher');
        elements.fenceDbContent = document.getElementById('fence-db-content');
        elements.aluminumDbContent = document.getElementById('aluminum-db-content');
        elements.fenceSearchCategory = document.getElementById('fence-search-category');
        elements.fenceSearchKeyword = document.getElementById('fence-search-keyword');
        elements.fenceSearchBtn = document.getElementById('fence-search-btn');
        elements.fenceSearchResetBtn = document.getElementById('fence-search-reset-btn');
        elements.fenceRefreshBtn = document.getElementById('fence-refresh-btn');
        elements.fenceAddBtn = document.getElementById('fence-add-btn');
        elements.fenceExportImagesBtn = document.getElementById('fence-export-images-btn');
        elements.fenceImportImagesBtn = document.getElementById('fence-import-images-btn');
        elements.fenceImportImagesInput = document.getElementById('fence-import-images-input');
        elements.fenceBatchUpdateBtn = document.getElementById('fence-batch-update-btn');
        elements.fenceBatchUpdateInput = document.getElementById('fence-batch-update-input');
        elements.fenceAddColumnBtn = document.getElementById('fence-add-column-btn');
        elements.fenceDownloadDbBtn = document.getElementById('fence-download-db-btn');
        elements.fenceTableBody = document.getElementById('fence-table-body');
        elements.fenceCurrentCount = document.getElementById('fence-current-count');
        elements.fenceTotalCount = document.getElementById('fence-total-count');
        elements.fencePaginationInfo = document.getElementById('fence-pagination-info');
        elements.fencePageInfo = document.getElementById('fence-page-info');
        elements.fencePrevButton = document.getElementById('fence-prev-page');
        elements.fenceNextButton = document.getElementById('fence-next-page');
        elements.fencePageButtons = document.getElementById('fence-page-buttons');
        elements.fencePageJumpInput = document.getElementById('fence-page-jump-input');
        elements.fencePageJumpButton = document.getElementById('fence-page-jump-btn');
        elements.fenceSectionStatus = document.getElementById('fence-section-status');
        elements.fenceModal = document.getElementById('fence-modal');
        elements.fenceModalTitle = document.getElementById('fence-modal-title');
        elements.fenceForm = document.getElementById('fence-form');
        elements.fenceImageFileInput = document.getElementById('fence-image-file');
        elements.fenceImageClearBtn = document.getElementById('fence-image-clear-btn');
        elements.fenceImageStatus = document.getElementById('fence-image-status');
        elements.fenceImagePreview = document.getElementById('fence-image-preview');
        elements.fenceSubmitBtn = document.getElementById('fence-submit-btn');
        elements.fenceCancelBtn = document.getElementById('fence-cancel-btn');

        elements.fenceStyleDbContent = document.getElementById('fence-style-db-content');
        elements.fenceStyleTotalCount = document.getElementById('fence-style-total-count');
        elements.fenceStyleSectionStatus = document.getElementById('fence-style-section-status');
        elements.fenceStyleSearchMesh = document.getElementById('fence-style-search-mesh');
        elements.fenceStyleSearchBase = document.getElementById('fence-style-search-base');
        elements.fenceStyleSearchBtn = document.getElementById('fence-style-search-btn');
        elements.fenceStyleSearchResetBtn = document.getElementById('fence-style-search-reset-btn');
        elements.fenceStyleRefreshBtn = document.getElementById('fence-style-refresh-btn');
        elements.fenceStyleAddBtn = document.getElementById('fence-style-add-btn');
        elements.fenceStyleTableBody = document.getElementById('fence-style-table-body');
        elements.fenceStyleModal = document.getElementById('fence-style-modal');
        elements.fenceStyleModalTitle = document.getElementById('fence-style-modal-title');
        elements.fenceStyleForm = document.getElementById('fence-style-form');

        elements.gateStyleDbContent = document.getElementById('gate-style-db-content');
        elements.gateStyleTotalCount = document.getElementById('gate-style-total-count');
        elements.gateStyleSectionStatus = document.getElementById('gate-style-section-status');
        elements.gateStyleSearchType = document.getElementById('gate-style-search-type');
        elements.gateStyleSearchBase = document.getElementById('gate-style-search-base');
        elements.gateStyleSearchBtn = document.getElementById('gate-style-search-btn');
        elements.gateStyleSearchResetBtn = document.getElementById('gate-style-search-reset-btn');
        elements.gateStyleRefreshBtn = document.getElementById('gate-style-refresh-btn');
        elements.gateStyleAddBtn = document.getElementById('gate-style-add-btn');
        elements.gateStyleTableBody = document.getElementById('gate-style-table-body');
        elements.gateStyleModal = document.getElementById('gate-style-modal');
        elements.gateStyleModalTitle = document.getElementById('gate-style-modal-title');
        elements.gateStyleForm = document.getElementById('gate-style-form');

        elements.pilePriceDbContent = document.getElementById('pile-price-db-content');
        elements.pilePriceTotalCount = document.getElementById('pile-price-total-count');
        elements.pilePriceSectionStatus = document.getElementById('pile-price-section-status');
        elements.pilePriceRefreshBtn = document.getElementById('pile-price-refresh-btn');
        elements.pilePriceBatchUpdateBtn = document.getElementById('pile-price-batch-update-btn');
        elements.pilePriceBatchUpdateInput = document.getElementById('pile-price-batch-update-input');
        elements.pilePriceTableBody = document.getElementById('pile-price-table-body');
    }

    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        window.setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'all 0.3s ease';
            window.setTimeout(() => notification.remove(), 300);
        }, 2600);
    }

    function setStatusBox(element, message, type = 'info') {
        if (!element) return;
        if (!message) {
            element.style.display = 'none';
            element.textContent = '';
            return;
        }
        element.style.display = 'block';
        element.textContent = message;
        if (type === 'error') {
            element.style.background = '#fee2e2';
            element.style.borderColor = '#fecaca';
            element.style.color = '#991b1b';
        } else if (type === 'success') {
            element.style.background = '#dcfce7';
            element.style.borderColor = '#bbf7d0';
            element.style.color = '#166534';
        } else {
            element.style.background = '#f1f5f9';
            element.style.borderColor = '#e2e8f0';
            element.style.color = '#475569';
        }
    }

    function setSectionStatus(message, type = 'info') {
        setStatusBox(elements.sectionStatus, message, type);
    }

    function setRequestSectionStatus(message, type = 'info') {
        setStatusBox(elements.requestSectionStatus, message, type);
    }

    function setLoading(loading, message = '') {
        dbState.loading = loading;
        [
            elements.searchCodeInput,
            elements.searchNameInput,
            elements.searchSpecInput,
            elements.searchNameKoInput,
            elements.searchButton,
            elements.searchResetButton,
            elements.addButton,
            elements.refreshButton,
            elements.exportImagesButton,
            elements.importImagesButton,
            elements.batchPriceButton,
            elements.downloadDatabaseButton,
            elements.importImagesInput,
            elements.batchPriceInput,
            elements.prevButton,
            elements.nextButton,
            elements.submitButton,
            elements.imageFileInput,
            elements.imageClearButton,
        ].forEach((element) => {
            if (element) {
                element.disabled = loading || (dbState.imageEncoding && (
                    element === elements.submitButton ||
                    element === elements.imageFileInput ||
                    element === elements.imageClearButton
                ));
            }
        });
        if (loading && elements.tableBody) {
            elements.tableBody.innerHTML = '<tr><td colspan="7" class="aluminum-empty-tip">正在加载数据...</td></tr>';
        }
        if (message) {
            setSectionStatus(message, 'info');
        }
    }

    function setRequestLoading(loading, message = '') {
        dbState.requestLoading = loading;
        [
            elements.requestStatusFilter,
            elements.requestRefreshButton,
            elements.requestPrevButton,
            elements.requestNextButton,
        ].forEach((element) => {
            if (element) element.disabled = loading;
        });
        if (loading && elements.requestTableBody) {
            elements.requestTableBody.innerHTML = '<tr><td colspan="8" class="aluminum-empty-tip">正在加载申请...</td></tr>';
        }
        if (message) {
            setRequestSectionStatus(message, 'info');
        }
    }

    function isRenderableImageSource(value) {
        const text = String(value || '').trim();
        return text.startsWith('data:image') || /^https?:\/\//i.test(text) || text.startsWith('/');
    }

    function looksLikeRawBase64Image(value) {
        const text = String(value || '').replace(/\s+/g, '').trim();
        if (text.length < 32) return false;
        return /^[A-Za-z0-9+/=]+$/.test(text);
    }

    function resolveRenderableImageSource(imageValue, imageBase64Value, options = {}) {
        const previewValue = String(imageBase64Value || '').trim();
        const imageText = String(imageValue || '').trim();
        if (isRenderableImageSource(previewValue)) return previewValue;
        if (isRenderableImageSource(imageText)) return imageText;
        if (looksLikeRawBase64Image(previewValue)) return `data:image/png;base64,${previewValue.replace(/\s+/g, '')}`;
        if (looksLikeRawBase64Image(imageText)) return `data:image/png;base64,${imageText.replace(/\s+/g, '')}`;
        if (options.preferPreviewOnly) return '';
        return '';
    }

    function hasRenderableImage(imageValue, imageBase64Value, options = {}) {
        return !!resolveRenderableImageSource(imageValue, imageBase64Value, options);
    }

    function renderImage(imageValue, imageBase64Value, options = {}) {
        const previewSource = resolveRenderableImageSource(imageValue, imageBase64Value, options);
        const textValue = String(imageValue || '').trim();
        const emptyText = options.emptyText || '暂无图片';
        if (previewSource) {
            const safeSrc = escapeHtml(previewSource);
            return `<img src="${safeSrc}" class="image-preview" alt="产品图片">`;
        }
        if (!options.preferPreviewOnly && textValue) {
            return `<span class="image-upload-tip">${escapeHtml(textValue)}</span>`;
        }
        return `<span class="image-upload-tip">${escapeHtml(emptyText)}</span>`;
    }

    function getRecentImportOrderMap() {
        return new Map(
            (dbState.recentImportCodes || []).map((code, index) => [String(code || '').trim(), index])
        );
    }

    function renderRecentImportResults() {
        if (!elements.importResultPanel || !elements.importResultBody) return;
        const previewRows = Array.isArray(dbState.recentImportPreview) ? dbState.recentImportPreview : [];
        const matchedTotal = Array.isArray(dbState.recentImportCodes) ? dbState.recentImportCodes.length : 0;
        if (matchedTotal <= 0 || previewRows.length <= 0) {
            elements.importResultPanel.style.display = 'none';
            elements.importResultBody.innerHTML = '';
            if (elements.importResultCount) elements.importResultCount.textContent = '0';
            if (elements.importResultNote) elements.importResultNote.textContent = '本次上传匹配到的物料会优先显示在这里。';
            return;
        }
        elements.importResultPanel.style.display = '';
        if (elements.importResultCount) elements.importResultCount.textContent = `匹配 ${matchedTotal} 条`;
        if (elements.importResultNote) {
            const previewCount = previewRows.length;
            const suffix = matchedTotal > previewCount ? `，当前预览前 ${previewCount} 条` : '';
            elements.importResultNote.textContent = `以下是本次成功匹配并写回图片的物料${suffix}。`;
        }
        elements.importResultBody.innerHTML = '';
        previewRows.forEach((item) => {
            const row = document.createElement('tr');
            row.className = 'aluminum-highlight-row';
            row.innerHTML = `
                <td>
                  <span class="aluminum-highlight-cell">
                    <span>${escapeHtml(item['工程编码'] || '')}</span>
                    <span class="tag success">本次匹配</span>
                  </span>
                </td>
                <td>${escapeHtml(item['规格说明(mm)/(米)'] || '')}</td>
                <td>${escapeHtml(item['工程品名'] || '')}</td>
                <td>${renderImage(item['图片'], item['图片_base64'], { preferPreviewOnly: false, emptyText: '暂无图片' })}</td>
                <td>${escapeHtml(item['工程品名--韩语'] || '')}</td>
            `;
            elements.importResultBody.appendChild(row);
        });
    }

    async function loadRecentImportPreview(codes) {
        const normalizedCodes = Array.from(new Set(
            (codes || []).map((code) => String(code || '').trim()).filter(Boolean)
        ));
        dbState.recentImportCodes = normalizedCodes;
        if (normalizedCodes.length <= 0) {
            dbState.recentImportPreview = [];
            renderRecentImportResults();
            return;
        }
        const previewCodes = normalizedCodes.slice(0, dbState.recentImportPreviewLimit);
        const previewResults = await Promise.all(
            previewCodes.map(async (code) => {
                try {
                    const response = await API.getById(code);
                    return response?.data || null;
                } catch (error) {
                    console.error(`加载图片匹配预览失败: ${code}`, error);
                    return null;
                }
            })
        );
        dbState.recentImportPreview = previewResults.filter(Boolean);
        renderRecentImportResults();
    }

    function renderTable(data) {
        if (!elements.tableBody) return;
        elements.tableBody.innerHTML = '';
        dbState.currentRowCount = Array.isArray(data) ? data.length : 0;
        updateOverview();
        if (!data || data.length === 0) {
            elements.tableBody.innerHTML = '<tr><td colspan="7" class="aluminum-empty-tip">未找到匹配记录</td></tr>';
            return;
        }
        const recentImportOrderMap = getRecentImportOrderMap();
        const sortedData = [...data].sort((left, right) => {
            const leftCode = String(left['工程编码'] || '').trim();
            const rightCode = String(right['工程编码'] || '').trim();
            const leftOrder = recentImportOrderMap.has(leftCode) ? recentImportOrderMap.get(leftCode) : Number.MAX_SAFE_INTEGER;
            const rightOrder = recentImportOrderMap.has(rightCode) ? recentImportOrderMap.get(rightCode) : Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            if (!isAdmin) {
                const leftHasImage = hasRenderableImage(left['图片'], left['图片_base64'], { preferPreviewOnly: true }) ? 1 : 0;
                const rightHasImage = hasRenderableImage(right['图片'], right['图片_base64'], { preferPreviewOnly: true }) ? 1 : 0;
                if (leftHasImage !== rightHasImage) return rightHasImage - leftHasImage;
            }
            return leftCode.localeCompare(rightCode, 'zh-Hans-CN');
        });
        sortedData.forEach((item) => {
            const code = item['工程编码'] || '';
            const isRecentImported = recentImportOrderMap.has(String(code || '').trim());
            const editLabel = isAdmin ? '编辑' : '提交修改';
            const deleteLabel = isAdmin ? '删除' : '提交删除';
            const actionButtons = canSubmitDatabaseChanges
                ? `
                    <button class="btn small" data-action="edit" data-id="${escapeHtml(code)}">${editLabel}</button>
                    <button class="btn small" data-action="delete" data-id="${escapeHtml(code)}">${deleteLabel}</button>
                `
                : '<span style="color:#94a3b8;">-</span>';
            const imageHtml = renderImage(
                item['图片'],
                item['图片_base64'],
                isAdmin
                    ? { preferPreviewOnly: false, emptyText: '暂无图片' }
                    : { preferPreviewOnly: true, emptyText: '暂无图片' }
            );
            const row = document.createElement('tr');
            if (isRecentImported) {
                row.classList.add('aluminum-highlight-row');
            }
            row.innerHTML = `
                <td>
                  <span class="aluminum-highlight-cell">
                    <span>${escapeHtml(code)}</span>
                    ${isRecentImported ? '<span class="tag success">本次匹配</span>' : ''}
                  </span>
                </td>
                <td title="${escapeHtml(item['工程品名'] || '')}">${escapeHtml((item['工程品名'] || '').length > 10 ? (item['工程品名'] || '').substring(0, 10) + '...' : (item['工程品名'] || ''))}</td>
                <td>${escapeHtml(item['10u小氧化(美元)--组装'] || '')}</td>
                <td>${escapeHtml(item['重量'] || '')}</td>
                <td>${imageHtml}</td>
                <td>${escapeHtml(item['材质'] || '')}</td>
                <td class="table-actions">
                    ${actionButtons}
                </td>
            `;
            elements.tableBody.appendChild(row);
        });
        if (canSubmitDatabaseChanges) {
            elements.tableBody.querySelectorAll('button[data-action]').forEach((button) => {
                button.addEventListener('click', handleTableAction);
            });
        }
    }

    function getActionLabel(action) {
        switch (action) {
            case 'create': return '新增';
            case 'update': return '修改';
            case 'delete': return '删除';
            case 'import_images': return '图片导入';
            case 'batch_update_prices': return '数据批量更新';
            case 'batch_update_data': return '数据批量更新';
            default: return action || '-';
        }
    }

    function getStatusTag(status) {
        if (status === 'approved') return '<span class="tag success">已通过</span>';
        if (status === 'rejected') return '<span class="tag warn">已驳回</span>';
        if (status === 'withdrawn') return '<span class="tag">已撤回</span>';
        return '<span class="tag">待审核</span>';
    }

    function formatRequestSummary(item) {
        const payload = item.payload || {};
        const snapshot = item.snapshot || {};
        if (item.action === 'import_images' || item.action === 'batch_update_prices' || item.action === 'batch_update_data') {
            const filename = payload.original_filename || '-';
            const fileCount = payload.file_count || 1;
            const isImage = item.action === 'import_images';
            const modeLabel = isImage ? '图片导入' : '数据批量更新';
            return `
                <div class="aluminum-request-summary">
                  <div><strong>任务:</strong> ${escapeHtml(modeLabel)}</div>
                  <div><strong>文件:</strong> ${escapeHtml(filename)}</div>
                  <div><strong>文件数:</strong> ${escapeHtml(fileCount)}</div>
                </div>
            `;
        }
        const source = item.action === 'delete' ? snapshot : payload;
        const code = item.target_code || payload['工程编码'] || snapshot['工程编码'] || '-';
        const name = source['工程品名'] || '-';
        const spec = source['规格说明(mm)/(米)'] || '-';
        const price = source['10u小氧化(美元)--组装'] || '-';
        const imageHtml = renderImage(source['图片'], source['图片_base64']);
        return `
            <div class="aluminum-request-summary">
              <div><strong>编码:</strong> ${escapeHtml(code)}</div>
              <div><strong>品名:</strong> ${escapeHtml(name)}</div>
              <div><strong>规格:</strong> ${escapeHtml(spec)}</div>
              <div><strong>价格:</strong> ${escapeHtml(price)}</div>
              <div><strong>图片:</strong> ${imageHtml}</div>
            </div>
        `;
    }

    function renderRequestTable(data) {
        if (!elements.requestTableBody) return;
        elements.requestTableBody.innerHTML = '';
        dbState.requestRowCount = Array.isArray(data) ? data.length : 0;
        updateRequestOverview();
        if (!data || data.length === 0) {
            elements.requestTableBody.innerHTML = '<tr><td colspan="8" class="aluminum-empty-tip">当前没有符合条件的申请</td></tr>';
            return;
        }
        data.forEach((item) => {
            const row = document.createElement('tr');
            let actions = `<span style="color:#94a3b8;">${escapeHtml(item.review_note || (item.status === 'pending' ? '待处理' : '已处理'))}</span>`;
            if (canReviewRequests && item.status === 'pending') {
                actions = `
                    <div class="aluminum-review-actions">
                      <button class="btn small primary" data-request-action="approve" data-id="${item.id}">通过</button>
                      <button class="btn small" data-request-action="reject" data-id="${item.id}">驳回</button>
                    </div>
                `;
            } else if (!canReviewRequests && item.status === 'pending') {
                actions = `
                    <div class="aluminum-review-actions">
                      <button class="btn small" data-request-action="withdraw" data-id="${item.id}">撤回</button>
                    </div>
                `;
            }
            row.innerHTML = `
                <td>${escapeHtml(item.id)}</td>
                <td>${escapeHtml(getActionLabel(item.action))}</td>
                <td>${escapeHtml(item.target_code || '-')}</td>
                <td>
                  <div class="aluminum-request-meta">
                    <span>${escapeHtml(item.requester || '-')}</span>
                    <span class="tag">${escapeHtml(item.requester_role || '-')}</span>
                  </div>
                </td>
                <td>${escapeHtml(item.submitted_at || '-')}</td>
                <td>${formatRequestSummary(item)}</td>
                <td>${getStatusTag(item.status)}</td>
                <td>${actions}</td>
            `;
            elements.requestTableBody.appendChild(row);
        });
        elements.requestTableBody.querySelectorAll('button[data-request-action]').forEach((button) => {
            button.addEventListener('click', handleRequestAction);
        });
    }

    function setImageStatus(message) {
        if (elements.imageStatus) elements.imageStatus.textContent = message;
    }

    function resolveStoredImageBase64(data = {}) {
        const imageBase64 = String(data['图片_base64'] || '').trim();
        if (imageBase64) return imageBase64;
        const imageValue = String(data['图片'] || '').trim();
        return imageValue.startsWith('data:image') ? imageValue : '';
    }

    function getPreviewSource(value) {
        const uploadedBase64 = String(dbState.imageBase64 || '').trim();
        if (uploadedBase64) return uploadedBase64;
        return String(value || '').trim();
    }

    function updateImagePreview(value) {
        if (!elements.imagePreview) return;
        const text = String(value || '').trim();
        const previewSource = getPreviewSource(value);
        if (!previewSource) {
            elements.imagePreview.textContent = '未设置图片';
            setImageStatus('未选择图片，将按当前表单内容提交。');
            return;
        }
        if (previewSource.startsWith('data:image') || /^https?:\/\//i.test(previewSource) || previewSource.startsWith('/')) {
            elements.imagePreview.innerHTML = `<img src="${escapeHtml(previewSource)}" class="image-preview" alt="预览图片">`;
            if (dbState.imageBase64) {
                setImageStatus(`图片已就绪，将以 base64 形式提交${text ? `：${text}` : ''}`);
            } else if (text) {
                setImageStatus(`当前图片标识：${text}`);
            } else {
                setImageStatus('当前图片已加载。');
            }
            return;
        }
        elements.imagePreview.textContent = '当前图片字段是文本标识，无法直接预览。';
        setImageStatus(`当前图片标识：${text}`);
    }

    function collectFormData() {
        const data = {};
        document.querySelectorAll('.aluminum-dynamic-input').forEach((input) => {
            const col = input.getAttribute('data-column');
            if (col) data[col] = input.value.trim();
        });
        data['图片_base64'] = dbState.imageBase64 || '';
        return data;
    }

    function validateForm(data) {
        for (const field of ALUMINUM_REQUIRED_COLUMNS) {
            if (!data[field]) throw new Error(`${field} 不能为空`);
        }
    }

    function updateFlowTip() {
        if (!elements.flowTip) return;
        if (isAdmin) {
            elements.flowTip.style.display = 'none';
            elements.flowTip.textContent = '';
            return;
        }
        elements.flowTip.style.display = 'block';
        elements.flowTip.style.background = '#fff7ed';
        elements.flowTip.style.borderColor = '#fed7aa';
        elements.flowTip.style.color = '#9a3412';
        elements.flowTip.textContent = dbState.editingId
            ? '提交后会进入 admin 审核队列，审核通过后才会更新数据库。'
            : '提交后会进入 admin 审核队列，审核通过后才会新增到数据库。';
    }

    function openModal(mode, data = null) {
        if (!elements.modal || !elements.form) return;
        dbState.imageBase64 = '';
        dbState.imageEncoding = false;
        if (elements.imageFileInput) elements.imageFileInput.value = '';
        renderAluminumDynamicFields(data, mode);
        const imageInput = document.querySelector('.aluminum-dynamic-input[data-column="图片"]');
        if (imageInput) {
            imageInput.addEventListener('input', (event) => { updateImagePreview(event.target.value); });
        }
        if (mode === 'edit' && data) {
            dbState.editingId = data[ALUMINUM_PRIMARY_KEY] || '';
            dbState.imageBase64 = resolveStoredImageBase64(data);
        } else {
            dbState.editingId = null;
        }
        elements.modalTitle.textContent = mode === 'edit'
            ? (isAdmin ? '编辑产品' : '提交修改申请')
            : (isAdmin ? '新增产品' : '提交新增申请');
        elements.submitButton.textContent = mode === 'edit'
            ? (isAdmin ? '保存修改' : '提交修改给 Admin')
            : (isAdmin ? '新增产品' : '提交给 Admin');
        updateFlowTip();
        const imageValue = data ? (data['图片'] || '') : '';
        updateImagePreview(imageValue);
        elements.modal.style.display = 'flex';
    }

    function closeModal() {
        if (!elements.modal || !elements.form) return;
        elements.modal.style.display = 'none';
        dbState.editingId = null;
        dbState.imageBase64 = '';
        dbState.imageEncoding = false;
        const container = document.getElementById('aluminum-dynamic-fields');
        if (container) container.innerHTML = '';
        if (elements.imageFileInput) elements.imageFileInput.value = '';
        setImageStatus('选择本地图片后，前端会转成 base64，一并提交。');
        updateImagePreview('');
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('图片读取失败，请重新选择文件'));
            reader.readAsDataURL(file);
        });
    }

    async function handleImageFileChange(event) {
        const file = event.target?.files?.[0];
        if (!file) return;
        if (file.type && !file.type.startsWith('image/')) {
            event.target.value = '';
            throw new Error('仅支持上传图片文件');
        }
        dbState.imageEncoding = true;
        setImageStatus(`正在处理图片：${file.name}`);
        setLoading(dbState.loading);
        try {
            const dataUrl = await readFileAsDataUrl(file);
            dbState.imageBase64 = dataUrl;
            const imageInput = document.querySelector('.aluminum-dynamic-input[data-column="图片"]');
            if (imageInput) imageInput.value = file.name;
            updateImagePreview(file.name);
        } finally {
            dbState.imageEncoding = false;
            setLoading(dbState.loading);
        }
    }

    function clearImageSelection() {
        dbState.imageBase64 = '';
        if (elements.imageFileInput) elements.imageFileInput.value = '';
        const imageInput = document.querySelector('.aluminum-dynamic-input[data-column="图片"]');
        if (imageInput) imageInput.value = '';
        updateImagePreview('');
    }

    function syncSearchFiltersFromInputs() {
        dbState.searchFilters = {
            code: (elements.searchCodeInput?.value || '').trim(),
            name: (elements.searchNameInput?.value || '').trim(),
            spec: (elements.searchSpecInput?.value || '').trim(),
            name_ko: (elements.searchNameKoInput?.value || '').trim(),
        };
    }

    function resetSearchInputs() {
        if (elements.searchCodeInput) elements.searchCodeInput.value = '';
        if (elements.searchNameInput) elements.searchNameInput.value = '';
        if (elements.searchSpecInput) elements.searchSpecInput.value = '';
        if (elements.searchNameKoInput) elements.searchNameKoInput.value = '';
        dbState.searchFilters = { code: '', name: '', spec: '', name_ko: '' };
    }

    async function loadAluminumColumns() {
        try {
            const result = await API.getColumns();
            if (result.success && Array.isArray(result.columns)) {
                dbState.knownColumns = result.columns;
            }
        } catch (e) {
            console.warn('获取铝材列名失败:', e);
        }
    }

    async function loadFenceColumns() {
        try {
            const result = await FenceAPI.getColumns();
            if (result.success && Array.isArray(result.columns)) {
                fenceState.knownColumns = result.columns;
            }
        } catch (e) {
            console.warn('获取围栏物料列名失败:', e);
        }
    }

    async function loadList() {
        try {
            setLoading(true, '正在加载铝材数据库...');
            const result = await API.getList(dbState.currentPage, dbState.pageSize, dbState.searchFilters);
            dbState.totalRecords = result.total || 0;
            dbState.totalPages = result.total_pages || 0;
            if (dbState.totalPages > 0 && dbState.currentPage > dbState.totalPages) {
                dbState.currentPage = dbState.totalPages;
                const fallbackResult = await API.getList(dbState.currentPage, dbState.pageSize, dbState.searchFilters);
                dbState.totalRecords = fallbackResult.total || 0;
                dbState.totalPages = fallbackResult.total_pages || 0;
                renderTable(fallbackResult.data || []);
            } else {
                renderTable(result.data || []);
            }
            updatePagination();
            setSectionStatus(
                dbState.totalRecords > 0
                    ? `已加载 ${dbState.currentRowCount} 条记录，当前共 ${dbState.totalRecords} 条。`
                    : '当前没有可显示的数据。',
                'success'
            );
        } catch (error) {
            console.error('加载铝材数据失败:', error);
            dbState.currentRowCount = 0;
            dbState.totalRecords = 0;
            dbState.totalPages = 0;
            renderTable([]);
            updatePagination();
            setSectionStatus(error.message || '加载数据失败，请检查网络连接。', 'error');
            showNotification(error.message || '加载数据失败，请检查网络连接。', 'error');
        } finally {
            setLoading(false);
            updateOverview();
            updatePagination();
        }
    }

    async function loadChangeRequests() {
        try {
            setRequestLoading(true, canReviewRequests ? '正在加载审核申请...' : '正在加载我的申请记录...');
            const requester = canReviewRequests ? '' : currentUser;
            const result = await API.getChangeRequests(
                dbState.requestPage,
                dbState.requestPageSize,
                dbState.requestStatus,
                requester
            );
            dbState.requestTotal = result.total || 0;
            dbState.requestTotalPages = result.total_pages || 0;
            if (dbState.requestTotalPages > 0 && dbState.requestPage > dbState.requestTotalPages) {
                dbState.requestPage = dbState.requestTotalPages;
                const fallbackResult = await API.getChangeRequests(
                    dbState.requestPage,
                    dbState.requestPageSize,
                    dbState.requestStatus,
                    requester
                );
                dbState.requestTotal = fallbackResult.total || 0;
                dbState.requestTotalPages = fallbackResult.total_pages || 0;
                renderRequestTable(fallbackResult.data || []);
            } else {
                renderRequestTable(result.data || []);
            }
            updateRequestOverview();
            setRequestSectionStatus(
                dbState.requestTotal > 0
                    ? `已加载 ${dbState.requestRowCount} 条申请，当前共 ${dbState.requestTotal} 条。`
                    : (canReviewRequests ? '当前没有符合条件的申请。' : '当前账号还没有提交过申请。'),
                'success'
            );
        } catch (error) {
            console.error('加载审核申请失败:', error);
            dbState.requestTotal = 0;
            dbState.requestTotalPages = 0;
            dbState.requestRowCount = 0;
            renderRequestTable([]);
            updateRequestOverview();
            setRequestSectionStatus(error.message || '加载审核申请失败。', 'error');
            showNotification(error.message || '加载审核申请失败。', 'error');
        } finally {
            setRequestLoading(false);
            updateRequestOverview();
        }
    }

    async function saveForm() {
        try {
            if (dbState.imageEncoding) throw new Error('图片仍在处理中，请稍后再提交');
            const data = collectFormData();
            validateForm(data);
            if (isAdmin) {
                setLoading(true, dbState.editingId ? '正在保存修改...' : '正在新增记录...');
                if (dbState.editingId) {
                    await API.update(dbState.editingId, data);
                    showNotification('更新成功', 'success');
                    setSectionStatus(`记录 ${dbState.editingId} 已更新。`, 'success');
                } else {
                    await API.create(data);
                    showNotification('新增成功', 'success');
                    setSectionStatus(`记录 ${data['工程编码']} 已新增。`, 'success');
                }
            } else {
                setLoading(true, dbState.editingId ? '正在提交修改申请...' : '正在提交新增申请...');
                const payload = {
                    action: dbState.editingId ? 'update' : 'create',
                    record_id: dbState.editingId || '',
                    requester: currentUser,
                    requester_role: currentRole,
                    data,
                };
                await API.submitChangeRequest(payload);
                showNotification('已提交给 admin 审核', 'success');
                setSectionStatus(
                    dbState.editingId
                        ? '修改申请已提交，等待 admin 审核后生效。'
                        : '新增申请已提交，等待 admin 审核后生效。',
                    'success'
                );
            }
            closeModal();
            await loadList();
            if (canViewChangeRecords || canReviewRequests) {
                await loadChangeRequests();
            }
        } catch (error) {
            console.error('保存或提交流程失败:', error);
            setSectionStatus(error.message || '提交失败，请检查输入。', 'error');
            showNotification(error.message || '提交失败，请检查输入。', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function editItem(id) {
        try {
            setSectionStatus(`正在加载 ${id} 的详情...`, 'info');
            const result = await API.getById(id);
            openModal('edit', result.data);
        } catch (error) {
            console.error('获取数据失败:', error);
            setSectionStatus(error.message || '获取数据失败，请检查网络连接。', 'error');
            showNotification(error.message || '获取数据失败，请检查网络连接。', 'error');
        }
    }

    async function deleteItem(id) {
        const message = isAdmin
            ? `确认删除工程编码为 "${id}" 的记录吗？`
            : `确认提交删除申请给 admin 吗？工程编码：${id}`;
        if (!window.confirm(message)) return;
        try {
            if (isAdmin) {
                setLoading(true, `正在删除 ${id}...`);
                await API.delete(id);
                showNotification('删除成功', 'success');
                setSectionStatus(`记录 ${id} 已删除。`, 'success');
            } else {
                setLoading(true, `正在提交删除申请 ${id}...`);
                await API.submitChangeRequest({
                    action: 'delete',
                    record_id: id,
                    requester: currentUser,
                    requester_role: currentRole,
                });
                showNotification('已提交给 admin 审核', 'success');
                setSectionStatus(`删除申请 ${id} 已提交，等待 admin 审核。`, 'success');
            }
            if (dbState.currentPage > 1 && dbState.currentRowCount <= 1) {
                dbState.currentPage -= 1;
            }
            await loadList();
            if (canViewChangeRecords || canReviewRequests) {
                await loadChangeRequests();
            }
        } catch (error) {
            console.error('删除流程失败:', error);
            setSectionStatus(error.message || '操作失败，请检查网络连接。', 'error');
            showNotification(error.message || '操作失败，请检查网络连接。', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function handleRequestAction(event) {
        const action = event.currentTarget.getAttribute('data-request-action');
        const id = event.currentTarget.getAttribute('data-id');
        if (!action || !id) return;
        try {
            if (action === 'approve') {
                const reviewNote = window.prompt('审核备注（可选）', '') || '';
                setRequestLoading(true, `正在通过申请 #${id}...`);
                await API.approveChangeRequest(id, reviewNote);
                showNotification(`申请 #${id} 已通过`, 'success');
                setRequestSectionStatus(`申请 #${id} 已通过并写入数据库。`, 'success');
                await loadChangeRequests();
                await loadList();
            } else if (action === 'reject') {
                const reviewNote = window.prompt('审核备注（可选）', '') || '';
                setRequestLoading(true, `正在驳回申请 #${id}...`);
                await API.rejectChangeRequest(id, reviewNote);
                showNotification(`申请 #${id} 已驳回`, 'success');
                setRequestSectionStatus(`申请 #${id} 已驳回。`, 'success');
                await loadChangeRequests();
            } else if (action === 'withdraw') {
                if (!window.confirm(`确认撤回申请 #${id} 吗？`)) return;
                setRequestLoading(true, `正在撤回申请 #${id}...`);
                await API.withdrawChangeRequest(id);
                showNotification(`申请 #${id} 已撤回`, 'success');
                setRequestSectionStatus(`申请 #${id} 已撤回。`, 'success');
                await loadChangeRequests();
            }
        } catch (error) {
            console.error('审核申请失败:', error);
            setRequestSectionStatus(error.message || '审核失败，请稍后重试。', 'error');
            showNotification(error.message || '审核失败，请稍后重试。', 'error');
        } finally {
            setRequestLoading(false);
        }
    }

    function handleTableAction(event) {
        const action = event.currentTarget.getAttribute('data-action');
        const id = event.currentTarget.getAttribute('data-id');
        if (action === 'edit') editItem(id);
        else if (action === 'delete') deleteItem(id);
    }

    function handleSearch() {
        syncSearchFiltersFromInputs();
        dbState.currentPage = 1;
        loadList();
    }

    function handleResetSearch() {
        resetSearchInputs();
        dbState.currentPage = 1;
        loadList();
    }

    function formatImportSummary(payload) {
        const summary = [];
        const updatedCount = Number(payload?.updated_count || 0);
        const totalFiles = Number(payload?.total_files || 0);
        if (updatedCount > 0) summary.push(`已更新 ${updatedCount} 条图片`);
        if (totalFiles > 0) summary.push(`共处理 ${totalFiles} 个文件`);
        if (Array.isArray(payload?.missing_codes) && payload.missing_codes.length > 0) {
            const preview = payload.missing_codes.slice(0, 6).join('、');
            const suffix = payload.missing_codes.length > 6 ? ` 等 ${payload.missing_codes.length} 个编码` : '';
            summary.push(`未匹配编码: ${preview}${suffix}`);
        }
        if (Array.isArray(payload?.duplicate_codes) && payload.duplicate_codes.length > 0) {
            summary.push(`重复文件覆盖 ${payload.duplicate_codes.length} 个编码`);
        }
        if (Array.isArray(payload?.skipped_files) && payload.skipped_files.length > 0) {
            summary.push(`跳过 ${payload.skipped_files.length} 个文件`);
        }
        return summary.join('；');
    }

    function triggerDirectDownload(url) {
        let iframe = document.getElementById('ks-download-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'ks-download-iframe';
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
        }
        iframe.src = url;
    }

    function handleExportImages() {
        try {
            setLoading(true, '正在批量打包图片，请耐心等待...');
            const url = buildApiUrl('/aluminum/images/export');
            triggerDirectDownload(url);
            setSectionStatus('批量图片正在打包中，请等待浏览器下载提示...', 'success');
            showNotification('批量图片下载已开始', 'success');
        } catch (error) {
            console.error('导出图片失败:', error);
            setSectionStatus(error.message || '批量下载图片失败，请稍后重试。', 'error');
            showNotification(error.message || '批量下载图片失败，请稍后重试。', 'error');
        } finally {
            setTimeout(() => setLoading(false), 3000);
        }
    }

    function handleDownloadDatabase() {
        try {
            setLoading(true, '正在准备完整数据库下载...');
            const url = buildApiUrl('/aluminum/database/download');
            triggerDirectDownload(url);
            setSectionStatus('完整数据库下载已开始，请等待浏览器下载提示...', 'success');
            showNotification('完整数据库下载已开始', 'success');
        } catch (error) {
            console.error('下载数据库失败:', error);
            setSectionStatus(error.message || '下载完整数据库失败，请稍后重试。', 'error');
            showNotification(error.message || '下载完整数据库失败，请稍后重试。', 'error');
        } finally {
            setTimeout(() => setLoading(false), 3000);
        }
    }

    async function handleImportImagesSelection(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            setLoading(true, isAdmin ? `正在批量上传 ${files.length} 个文件...` : `正在提交 ${files.length} 个文件的审核申请...`);
            const payload = await API.importImages(files);
            const appliedDirectly = Array.isArray(payload?.updated_codes) || Number(payload?.updated_count || 0) > 0;
            if (appliedDirectly) {
                const updatedCodes = Array.isArray(payload?.updated_codes) ? payload.updated_codes : [];
                await loadRecentImportPreview(updatedCodes);
                dbState.currentPage = 1;
                await loadList();
                const summary = formatImportSummary(payload);
                setSectionStatus(summary || payload.message || '批量上传图片成功。', 'success');
            } else {
                if (canViewChangeRecords || canReviewRequests) {
                    await loadChangeRequests();
                }
                setSectionStatus(payload.message || '图片导入申请已提交，等待 admin 审核。', 'success');
            }
            showNotification(payload.message || (appliedDirectly ? '批量上传图片成功。' : '图片导入申请已提交。'), 'success');
        } catch (error) {
            console.error('导入图片失败:', error);
            setSectionStatus(error.message || '批量上传图片失败，请稍后重试。', 'error');
            showNotification(error.message || '批量上传图片失败，请稍后重试。', 'error');
        } finally {
            if (event.target) event.target.value = '';
            setLoading(false);
        }
    }

    async function handleBatchPriceSelection(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            setLoading(true, isAdmin ? '正在批量更新数据...' : '正在提交数据更新审核申请...');
            const payload = await API.batchUpdatePrice(files[0]);
            if (isAdmin) {
                dbState.currentPage = 1;
                await loadList();
                setSectionStatus(payload.message || '批量更新数据成功。', 'success');
            } else {
                if (canViewChangeRecords || canReviewRequests) {
                    await loadChangeRequests();
                }
                setSectionStatus(payload.message || '数据更新申请已提交，等待 admin 审核。', 'success');
            }
            showNotification(payload.message || (isAdmin ? '批量更新数据成功。' : '数据更新申请已提交。'), 'success');
        } catch (error) {
            console.error('批量更新数据失败:', error);
            setSectionStatus(error.message || '批量更新数据失败，请稍后重试。', 'error');
            showNotification(error.message || '批量更新数据失败，请稍后重试。', 'error');
        } finally {
            if (event.target) event.target.value = '';
            setLoading(false);
        }
    }

    async function handleAddColumn() {
        const columnName = prompt('请输入新列名（如：工程品名--法语）：');
        if (!columnName || !columnName.trim()) return;
        try {
            setLoading(true, '正在新增列...');
            const payload = await API.addColumn(columnName.trim());
            if (isAdmin) {
                dbState.currentPage = 1;
                await loadList();
            }
            showNotification(payload.message || '新增列成功。', 'success');
            setSectionStatus(payload.message || '新增列成功。', 'success');
        } catch (error) {
            console.error('新增列失败:', error);
            showNotification(error.message || '新增列失败，请稍后重试。', 'error');
        } finally {
            setLoading(false);
        }
    }

    function buildVisiblePageItems(currentPage, totalPages) {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
        const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
        if (currentPage <= 3) { pages.add(2); pages.add(3); pages.add(4); }
        if (currentPage >= totalPages - 2) { pages.add(totalPages - 1); pages.add(totalPages - 2); pages.add(totalPages - 3); }
        const normalizedPages = Array.from(pages)
            .filter((page) => page >= 1 && page <= totalPages)
            .sort((left, right) => left - right);
        const items = [];
        normalizedPages.forEach((page, index) => {
            if (index > 0 && page - normalizedPages[index - 1] > 1) items.push('ellipsis');
            items.push(page);
        });
        return items;
    }

    function renderPageButtons(container, currentPage, totalPages, onSelectPage, loading) {
        if (!container) return;
        if (!totalPages || totalPages <= 0) { container.innerHTML = ''; return; }
        const items = buildVisiblePageItems(currentPage, totalPages);
        container.innerHTML = items.map((item) => {
            if (item === 'ellipsis') return '<span class="aluminum-page-ellipsis">...</span>';
            const activeClass = item === currentPage ? ' is-active' : '';
            const disabledAttr = loading ? ' disabled' : '';
            return `<button class="btn small aluminum-page-btn${activeClass}" type="button" data-page="${item}"${disabledAttr}>${item}</button>`;
        }).join('');
        container.querySelectorAll('button[data-page]').forEach((button) => {
            button.addEventListener('click', () => {
                const nextPage = Number(button.getAttribute('data-page'));
                if (Number.isInteger(nextPage) && typeof onSelectPage === 'function') onSelectPage(nextPage);
            });
        });
    }

    function normalizeRequestedPage(rawValue, totalPages) {
        const parsed = Number.parseInt(String(rawValue || '').trim(), 10);
        if (!Number.isInteger(parsed)) return null;
        if (parsed < 1) return 1;
        if (totalPages > 0 && parsed > totalPages) return totalPages;
        return parsed;
    }

    function goToListPage(page) {
        if (dbState.loading) return;
        const safeTotalPages = Math.max(dbState.totalPages || 0, 1);
        const nextPage = normalizeRequestedPage(page, safeTotalPages);
        if (!nextPage || nextPage === dbState.currentPage) return;
        dbState.currentPage = nextPage;
        loadList();
    }

    function goToRequestPage(page) {
        if (dbState.requestLoading) return;
        const safeTotalPages = Math.max(dbState.requestTotalPages || 0, 1);
        const nextPage = normalizeRequestedPage(page, safeTotalPages);
        if (!nextPage || nextPage === dbState.requestPage) return;
        dbState.requestPage = nextPage;
        loadChangeRequests();
    }

    function handleListPageJump() {
        const safeTotalPages = Math.max(dbState.totalPages || 0, 0);
        const nextPage = normalizeRequestedPage(elements.pageJumpInput?.value, safeTotalPages);
        if (!nextPage) { showNotification('请输入有效页码。', 'error'); return; }
        goToListPage(nextPage);
    }

    function handleRequestPageJump() {
        const safeTotalPages = Math.max(dbState.requestTotalPages || 0, 0);
        const nextPage = normalizeRequestedPage(elements.requestPageJumpInput?.value, safeTotalPages);
        if (!nextPage) { showNotification('请输入有效页码。', 'error'); return; }
        goToRequestPage(nextPage);
    }

    function formatSearchState() {
        const labels = [];
        const fieldMap = { code: '工程编码', name: '工程品名', spec: '规格说明', name_ko: '韩语品名' };
        Object.entries(dbState.searchFilters).forEach(([key, value]) => {
            if (String(value || '').trim()) labels.push(`${fieldMap[key]}: ${value}`);
        });
        return labels.length > 0 ? labels.join(' / ') : '全部数据';
    }

    function updateOverview() {
        if (elements.currentCount) elements.currentCount.textContent = String(dbState.currentRowCount);
        if (elements.totalCount) elements.totalCount.textContent = String(dbState.totalRecords);
        if (elements.searchState) elements.searchState.textContent = formatSearchState();
    }

    function updatePagination() {
        const safeTotalPages = dbState.totalRecords === 0 ? 0 : Math.max(dbState.totalPages || 0, 1);
        const currentPageLabel = dbState.totalRecords === 0 ? 0 : dbState.currentPage;
        if (elements.paginationInfo) elements.paginationInfo.textContent = `共 ${dbState.totalRecords} 条记录`;
        if (elements.pageInfo) elements.pageInfo.textContent = `第 ${currentPageLabel} / ${safeTotalPages} 页`;
        if (elements.prevButton) elements.prevButton.disabled = dbState.loading || dbState.currentPage <= 1 || dbState.totalRecords === 0;
        if (elements.nextButton) elements.nextButton.disabled = dbState.loading || dbState.currentPage >= safeTotalPages || dbState.totalRecords === 0;
        if (elements.pageJumpInput) {
            elements.pageJumpInput.disabled = dbState.loading || dbState.totalRecords === 0;
            elements.pageJumpInput.value = dbState.totalRecords === 0 ? '' : String(dbState.currentPage);
            elements.pageJumpInput.max = String(Math.max(safeTotalPages, 1));
        }
        if (elements.pageJumpButton) elements.pageJumpButton.disabled = dbState.loading || dbState.totalRecords === 0;
        renderPageButtons(elements.pageButtons, dbState.currentPage, safeTotalPages, goToListPage, dbState.loading);
    }

    function updateRequestOverview() {
        const safeTotalPages = dbState.requestTotal === 0 ? 0 : Math.max(dbState.requestTotalPages || 0, 1);
        const currentPageLabel = dbState.requestTotal === 0 ? 0 : dbState.requestPage;
        if (elements.requestCurrentCount) elements.requestCurrentCount.textContent = String(dbState.requestRowCount);
        if (elements.requestTotalCount) elements.requestTotalCount.textContent = String(dbState.requestTotal);
        if (elements.requestPageLabel) elements.requestPageLabel.textContent = `第 ${currentPageLabel} / ${safeTotalPages} 页`;
        if (elements.requestPrevButton) elements.requestPrevButton.disabled = dbState.requestLoading || dbState.requestPage <= 1 || dbState.requestTotal === 0;
        if (elements.requestNextButton) elements.requestNextButton.disabled = dbState.requestLoading || dbState.requestPage >= safeTotalPages || dbState.requestTotal === 0;
        if (elements.requestPageJumpInput) {
            elements.requestPageJumpInput.disabled = dbState.requestLoading || dbState.requestTotal === 0;
            elements.requestPageJumpInput.value = dbState.requestTotal === 0 ? '' : String(dbState.requestPage);
            elements.requestPageJumpInput.max = String(Math.max(safeTotalPages, 1));
        }
        if (elements.requestPageJumpButton) elements.requestPageJumpButton.disabled = dbState.requestLoading || dbState.requestTotal === 0;
        renderPageButtons(
            elements.requestPageButtons,
            dbState.requestPage,
            safeTotalPages,
            goToRequestPage,
            dbState.requestLoading,
        );
    }

    function addEventListenerSafe(target, type, handler) {
        if (!target) return;
        target.addEventListener(type, handler);
        cleanupFns.push(() => { target.removeEventListener(type, handler); });
    }

    function setFenceSectionStatus(message, type = 'info') {
        setStatusBox(elements.fenceSectionStatus, message, type);
    }

    function setFenceLoading(loading, message = '') {
        fenceState.loading = loading;
        [
            elements.fenceSearchBtn,
            elements.fenceSearchResetBtn,
            elements.fenceRefreshBtn,
            elements.fenceAddBtn,
            elements.fenceExportImagesBtn,
            elements.fenceImportImagesBtn,
            elements.fenceBatchUpdateBtn,
            elements.fenceAddColumnBtn,
            elements.fenceDownloadDbBtn,
            elements.fencePrevButton,
            elements.fenceNextButton,
            elements.fenceSubmitBtn,
            elements.fenceImageFileInput,
            elements.fenceImageClearBtn,
        ].forEach((el) => {
            if (el) el.disabled = loading;
        });
        if (loading && elements.fenceTableBody) {
            elements.fenceTableBody.innerHTML = '<tr><td colspan="9" class="aluminum-empty-tip">正在加载数据...</td></tr>';
        }
        if (message) setFenceSectionStatus(message, 'info');
    }

    function renderFenceTable(data) {
        if (!elements.fenceTableBody) return;
        elements.fenceTableBody.innerHTML = '';
        fenceState.currentRowCount = Array.isArray(data) ? data.length : 0;
        updateFenceOverview();
        if (!data || data.length === 0) {
            elements.fenceTableBody.innerHTML = '<tr><td colspan="9" class="aluminum-empty-tip">未找到匹配记录</td></tr>';
            return;
        }
        data.forEach((item) => {
            const code = item.code || '';
            const actionButtons = canSubmitDatabaseChanges
                ? `
                    <button class="btn small" data-fence-action="edit" data-fence-id="${escapeHtml(code)}">编辑</button>
                    <button class="btn small" data-fence-action="delete" data-fence-id="${escapeHtml(code)}">删除</button>
                `
                : '<span style="color:#94a3b8;">-</span>';
            const imageHtml = renderImage(
                '',
                item.image_base64 || '',
                { preferPreviewOnly: true, emptyText: '暂无图片' }
            );
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(code)}</td>
                <td>${escapeHtml(item.category || '')}</td>
                <td>${escapeHtml(item.name || '')}</td>
                <td>${escapeHtml(item.spec || '')}</td>
                <td>${Number(item.price_usd || 0).toFixed(4)}</td>
                <td>${Number(item.price_rmb || 0).toFixed(3)}</td>
                <td>${escapeHtml(item.remark || '')}</td>
                <td>${imageHtml}</td>
                <td class="table-actions">${actionButtons}</td>
            `;
            elements.fenceTableBody.appendChild(row);
        });
        if (canSubmitDatabaseChanges) {
            elements.fenceTableBody.querySelectorAll('button[data-fence-action]').forEach((btn) => {
                btn.addEventListener('click', handleFenceTableAction);
            });
        }
    }

    function updateFenceOverview() {
        if (elements.fenceCurrentCount) elements.fenceCurrentCount.textContent = String(fenceState.currentRowCount);
        if (elements.fenceTotalCount) elements.fenceTotalCount.textContent = String(fenceState.totalRecords);
    }

    function updateFencePagination() {
        const safeTotalPages = fenceState.totalRecords === 0 ? 0 : Math.max(fenceState.totalPages || 0, 1);
        const currentPageLabel = fenceState.totalRecords === 0 ? 0 : fenceState.currentPage;
        if (elements.fencePaginationInfo) elements.fencePaginationInfo.textContent = `共 ${fenceState.totalRecords} 条记录`;
        if (elements.fencePageInfo) elements.fencePageInfo.textContent = `第 ${currentPageLabel} / ${safeTotalPages} 页`;
        if (elements.fencePrevButton) elements.fencePrevButton.disabled = fenceState.loading || fenceState.currentPage <= 1 || fenceState.totalRecords === 0;
        if (elements.fenceNextButton) elements.fenceNextButton.disabled = fenceState.loading || fenceState.currentPage >= safeTotalPages || fenceState.totalRecords === 0;
        if (elements.fencePageJumpInput) {
            elements.fencePageJumpInput.disabled = fenceState.loading || fenceState.totalRecords === 0;
            elements.fencePageJumpInput.value = fenceState.totalRecords === 0 ? '' : String(fenceState.currentPage);
            elements.fencePageJumpInput.max = String(Math.max(safeTotalPages, 1));
        }
        if (elements.fencePageJumpButton) elements.fencePageJumpButton.disabled = fenceState.loading || fenceState.totalRecords === 0;
        renderPageButtons(elements.fencePageButtons, fenceState.currentPage, safeTotalPages, goToFencePage, fenceState.loading);
    }

    async function loadFenceList() {
        try {
            setFenceLoading(true, '正在加载围栏/门物料...');
            const raw = await FenceAPI.getList(fenceState.currentPage, fenceState.pageSize, fenceState.searchCategory, fenceState.searchKeyword);
            const result = raw.data || raw;
            fenceState.totalRecords = result.total || 0;
            fenceState.totalPages = result.total_pages || 0;
            if (fenceState.totalPages > 0 && fenceState.currentPage > fenceState.totalPages) {
                fenceState.currentPage = fenceState.totalPages;
                const raw2 = await FenceAPI.getList(fenceState.currentPage, fenceState.pageSize, fenceState.searchCategory, fenceState.searchKeyword);
                const fallback = raw2.data || raw2;
                fenceState.totalRecords = fallback.total || 0;
                fenceState.totalPages = fallback.total_pages || 0;
                renderFenceTable(fallback.data || []);
            } else {
                renderFenceTable(result.data || []);
            }
            updateFencePagination();
            setFenceSectionStatus(
                fenceState.totalRecords > 0
                    ? `已加载 ${fenceState.currentRowCount} 条记录，当前共 ${fenceState.totalRecords} 条。`
                    : '当前没有可显示的数据。',
                'success'
            );
        } catch (error) {
            console.error('加载围栏物料失败:', error);
            fenceState.currentRowCount = 0;
            fenceState.totalRecords = 0;
            fenceState.totalPages = 0;
            renderFenceTable([]);
            updateFencePagination();
            setFenceSectionStatus(error.message || '加载数据失败。', 'error');
            showNotification(error.message || '加载数据失败。', 'error');
        } finally {
            setFenceLoading(false);
            updateFenceOverview();
            updateFencePagination();
        }
    }

    function collectFenceFormData() {
        const data = {};
        document.querySelectorAll('.fence-dynamic-input').forEach((input) => {
            const col = input.getAttribute('data-column');
            if (col) data[col] = input.value.trim();
        });
        data.image_base64 = fenceState.imageBase64 || '';
        return data;
    }

    function validateFenceForm(data) {
        for (const field of FENCE_REQUIRED_COLUMNS) {
            if (!data[field]) throw new Error(`${field} 不能为空`);
        }
    }

    function openFenceModal(mode, data = null) {
        if (!elements.fenceModal || !elements.fenceForm) return;
        fenceState.imageBase64 = '';
        fenceState.imageEncoding = false;
        if (elements.fenceImageFileInput) elements.fenceImageFileInput.value = '';
        renderFenceDynamicFields(data, mode);
        if (mode === 'edit' && data) {
            fenceState.editingId = data.code || '';
            fenceState.imageBase64 = data.image_base64 || '';
        } else {
            fenceState.editingId = null;
        }
        elements.fenceModalTitle.textContent = mode === 'edit' ? '编辑物料' : '新增物料';
        updateFenceImagePreview();
        elements.fenceModal.style.display = 'flex';
    }

    function closeFenceModal() {
        if (!elements.fenceModal || !elements.fenceForm) return;
        elements.fenceModal.style.display = 'none';
        fenceState.editingId = null;
        fenceState.imageBase64 = '';
        fenceState.imageEncoding = false;
        const container = document.getElementById('fence-dynamic-fields');
        if (container) container.innerHTML = '';
        if (elements.fenceImageFileInput) elements.fenceImageFileInput.value = '';
        updateFenceImagePreview();
    }

    function updateFenceImagePreview() {
        if (!elements.fenceImagePreview) return;
        const src = fenceState.imageBase64 || '';
        if (src && src.startsWith('data:image')) {
            elements.fenceImagePreview.innerHTML = `<img src="${escapeHtml(src)}" class="image-preview" alt="预览图片">`;
            if (elements.fenceImageStatus) elements.fenceImageStatus.textContent = '图片已就绪。';
        } else {
            elements.fenceImagePreview.textContent = '未设置图片';
            if (elements.fenceImageStatus) elements.fenceImageStatus.textContent = '选择本地图片后，前端会转成 base64，一并提交。';
        }
    }

    async function handleFenceImageFileChange(event) {
        const file = event.target?.files?.[0];
        if (!file) return;
        fenceState.imageEncoding = true;
        if (elements.fenceImageStatus) elements.fenceImageStatus.textContent = `正在处理图片：${file.name}`;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            fenceState.imageBase64 = dataUrl;
            updateFenceImagePreview();
        } finally {
            fenceState.imageEncoding = false;
        }
    }

    async function saveFenceForm() {
        try {
            if (fenceState.imageEncoding) throw new Error('图片仍在处理中，请稍后再提交');
            const data = collectFenceFormData();
            validateFenceForm(data);
            setFenceLoading(true, fenceState.editingId ? '正在保存修改...' : '正在新增物料...');
            if (fenceState.editingId) {
                await FenceAPI.update(fenceState.editingId, data);
                showNotification('更新成功', 'success');
            } else {
                await FenceAPI.create(data);
                showNotification('新增成功', 'success');
            }
            closeFenceModal();
            await loadFenceList();
        } catch (error) {
            console.error('保存围栏物料失败:', error);
            setFenceSectionStatus(error.message || '保存失败。', 'error');
            showNotification(error.message || '保存失败。', 'error');
        } finally {
            setFenceLoading(false);
        }
    }

    async function editFenceItem(code) {
        try {
            setFenceSectionStatus(`正在加载 ${code} 的详情...`, 'info');
            const result = await FenceAPI.getById(code);
            openFenceModal('edit', result.data);
        } catch (error) {
            console.error('获取围栏物料失败:', error);
            setFenceSectionStatus(error.message || '获取数据失败。', 'error');
            showNotification(error.message || '获取数据失败。', 'error');
        }
    }

    async function deleteFenceItem(code) {
        if (!window.confirm(`确认删除物料 "${code}" 吗？`)) return;
        try {
            setFenceLoading(true, `正在删除 ${code}...`);
            await FenceAPI.delete(code);
            showNotification('删除成功', 'success');
            if (fenceState.currentPage > 1 && fenceState.currentRowCount <= 1) {
                fenceState.currentPage -= 1;
            }
            await loadFenceList();
        } catch (error) {
            console.error('删除围栏物料失败:', error);
            setFenceSectionStatus(error.message || '删除失败。', 'error');
            showNotification(error.message || '删除失败。', 'error');
        } finally {
            setFenceLoading(false);
        }
    }

    function handleFenceTableAction(event) {
        const action = event.currentTarget.getAttribute('data-fence-action');
        const id = event.currentTarget.getAttribute('data-fence-id');
        if (action === 'edit') editFenceItem(id);
        else if (action === 'delete') deleteFenceItem(id);
    }

    function goToFencePage(page) {
        if (fenceState.loading) return;
        const safeTotalPages = Math.max(fenceState.totalPages || 0, 1);
        const nextPage = normalizeRequestedPage(page, safeTotalPages);
        if (!nextPage || nextPage === fenceState.currentPage) return;
        fenceState.currentPage = nextPage;
        loadFenceList();
    }

    function handleFencePageJump() {
        const safeTotalPages = Math.max(fenceState.totalPages || 0, 0);
        const nextPage = normalizeRequestedPage(elements.fencePageJumpInput?.value, safeTotalPages);
        if (!nextPage) { showNotification('请输入有效页码。', 'error'); return; }
        goToFencePage(nextPage);
    }

    function handleFenceSearch() {
        fenceState.searchCategory = (elements.fenceSearchCategory?.value || '').trim();
        fenceState.searchKeyword = (elements.fenceSearchKeyword?.value || '').trim();
        fenceState.currentPage = 1;
        loadFenceList();
    }

    function handleFenceResetSearch() {
        if (elements.fenceSearchCategory) elements.fenceSearchCategory.value = '';
        if (elements.fenceSearchKeyword) elements.fenceSearchKeyword.value = '';
        fenceState.searchCategory = '';
        fenceState.searchKeyword = '';
        fenceState.currentPage = 1;
        loadFenceList();
    }

    async function handleFenceImportImages(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            setFenceLoading(true, `正在批量上传 ${files.length} 个文件...`);
            const payload = await FenceAPI.importImages(files);
            const updatedCodes = Array.isArray(payload?.updated_codes) ? payload.updated_codes : [];
            if (updatedCodes.length > 0 || Number(payload?.updated_count || 0) > 0) {
                fenceState.currentPage = 1;
                await loadFenceList();
            }
            setFenceSectionStatus(payload.message || '批量上传图片成功。', 'success');
            showNotification(payload.message || '批量上传图片成功。', 'success');
        } catch (error) {
            console.error('导入围栏图片失败:', error);
            setFenceSectionStatus(error.message || '批量上传图片失败。', 'error');
            showNotification(error.message || '批量上传图片失败。', 'error');
        } finally {
            if (event.target) event.target.value = '';
            setFenceLoading(false);
        }
    }

    async function handleFenceBatchUpdate(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            setFenceLoading(true, '正在批量更新数据...');
            const payload = await FenceAPI.batchUpdate(files[0]);
            fenceState.currentPage = 1;
            await loadFenceList();
            setFenceSectionStatus(payload.message || '批量更新数据成功。', 'success');
            showNotification(payload.message || '批量更新数据成功。', 'success');
        } catch (error) {
            console.error('批量更新围栏数据失败:', error);
            setFenceSectionStatus(error.message || '批量更新数据失败。', 'error');
            showNotification(error.message || '批量更新数据失败。', 'error');
        } finally {
            if (event.target) event.target.value = '';
            setFenceLoading(false);
        }
    }

    async function handleFenceBatchPriceUpdate(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            setFenceLoading(true, '正在批量更新价格...');
            const payload = await FenceAPI.batchUpdate(files[0]);
            fenceState.currentPage = 1;
            await loadFenceList();
            const msg = payload.message || '批量更新价格成功。';
            const detail = payload.failed && payload.failed.length > 0
                ? ` (${payload.failed.length} 条失败)`
                : '';
            setFenceSectionStatus(msg + detail, payload.failed && payload.failed.length > 0 ? 'error' : 'success');
            showNotification(msg, 'success');
        } catch (error) {
            console.error('批量更新价格失败:', error);
            setFenceSectionStatus(error.message || '批量更新价格失败。', 'error');
            showNotification(error.message || '批量更新价格失败。', 'error');
        } finally {
            if (event.target) event.target.value = '';
            setFenceLoading(false);
        }
    }

    function handleFenceExportImages() {
        try {
            setFenceLoading(true, '正在批量打包图片...');
            const url = buildApiUrl('/fence-materials/images/export');
            triggerDirectDownload(url);
            setFenceSectionStatus('批量图片下载已开始...', 'success');
            showNotification('批量图片下载已开始', 'success');
        } catch (error) {
            setFenceSectionStatus(error.message || '批量下载图片失败。', 'error');
            showNotification(error.message || '批量下载图片失败。', 'error');
        } finally {
            setTimeout(() => setFenceLoading(false), 3000);
        }
    }

    function handleFenceDownloadDatabase() {
        try {
            setFenceLoading(true, '正在准备数据库下载...');
            const url = buildApiUrl('/fence-materials/download');
            triggerDirectDownload(url);
            setFenceSectionStatus('数据库下载已开始...', 'success');
            showNotification('数据库下载已开始', 'success');
        } catch (error) {
            setFenceSectionStatus(error.message || '下载数据库失败。', 'error');
            showNotification(error.message || '下载数据库失败。', 'error');
        } finally {
            setTimeout(() => setFenceLoading(false), 3000);
        }
    }

    async function handleFenceAddColumn() {
        const columnName = prompt('请输入新列名：');
        if (!columnName || !columnName.trim()) return;
        try {
            setFenceLoading(true, '正在新增列...');
            const payload = await FenceAPI.addColumn(columnName.trim());
            fenceState.currentPage = 1;
            await loadFenceList();
            showNotification(payload.message || '新增列成功。', 'success');
            setFenceSectionStatus(payload.message || '新增列成功。', 'success');
        } catch (error) {
            showNotification(error.message || '新增列失败。', 'error');
        } finally {
            setFenceLoading(false);
        }
    }

    const FenceAPI = {
        getColumns() {
            return requestJson('/fence-materials/columns');
        },

        getList(page, pageSize, category = '', keyword = '') {
            const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
            if (category) params.set('category', category);
            if (keyword) params.set('keyword', keyword);
            return requestJson(`/fence-materials?${params.toString()}`);
        },
        getById(code) {
            return requestJson(`/fence-materials/${encodeURIComponent(code)}`);
        },
        create(data) {
            return requestJson('/fence-materials', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },
        update(code, data) {
            return requestJson(`/fence-materials/${encodeURIComponent(code)}`, {
                method: 'PUT',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },
        delete(code) {
            return requestJson(`/fence-materials/${encodeURIComponent(code)}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}),
            });
        },
        importImages(files) {
            const formData = new FormData();
            Array.from(files || []).forEach((file) => { formData.append('files', file); });
            return requestJson('/fence-materials/images/import', {
                method: 'POST',
                headers: buildAuthHeaders({}),
                body: formData,
            });
        },
        batchUpdate(file) {
            const formData = new FormData();
            formData.append('file', file);
            return requestJson('/fence-materials/batch-update', {
                method: 'POST',
                headers: buildAuthHeaders({}),
                body: formData,
            });
        },
        addColumn(columnName) {
            return requestJson('/fence-materials/add-column', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ column_name: columnName }),
            });
        },
    };

    const FenceStyleAPI = {
        getList(meshType = '', baseType = '') {
            const params = new URLSearchParams();
            if (meshType) params.set('mesh_type', meshType);
            if (baseType) params.set('base_type', baseType);
            const qs = params.toString();
            return requestJson(`/fence-styles${qs ? '?' + qs : ''}`);
        },
        getById(code) {
            return requestJson(`/fence-styles/${encodeURIComponent(code)}`);
        },
        create(data) {
            return requestJson('/fence-styles', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },
        update(code, data) {
            return requestJson(`/fence-styles/${encodeURIComponent(code)}`, {
                method: 'PUT',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },
        delete(code) {
            return requestJson(`/fence-styles/${encodeURIComponent(code)}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}),
            });
        },
    };

    const GateStyleAPI = {
        getList(gateType = '', baseType = '') {
            const params = new URLSearchParams();
            if (gateType) params.set('gate_type', gateType);
            if (baseType) params.set('base_type', baseType);
            const qs = params.toString();
            return requestJson(`/gate-styles${qs ? '?' + qs : ''}`);
        },
        getById(code) {
            return requestJson(`/gate-styles/${encodeURIComponent(code)}`);
        },
        create(data) {
            return requestJson('/gate-styles', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },
        update(code, data) {
            return requestJson(`/gate-styles/${encodeURIComponent(code)}`, {
                method: 'PUT',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },
        delete(code) {
            return requestJson(`/gate-styles/${encodeURIComponent(code)}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}),
            });
        },
    };

    const PilePriceAPI = {
        getList() {
            return requestJson('/pile-prices/list');
        },
        batchUpdate(file) {
            const formData = new FormData();
            formData.append('file', file);
            return requestJson('/pile-prices/batch-update', {
                method: 'POST',
                headers: buildAuthHeaders({}),
                body: formData,
            });
        },
    };

    const BASE_TYPE_LABELS = { concrete: '混凝土基础', pile: '地桩基础', direct: '一体打入式', integrated: '一体式基础' };
    const GATE_TYPE_LABELS = { single: '单开门', double: '双开门', sliding: '推拉门', folding: '折叠门', telescopic: '伸缩门' };

    function renderFenceStyleTable(data) {
        if (!elements.fenceStyleTableBody) return;
        elements.fenceStyleTableBody.innerHTML = '';
        fenceStyleState.data = data || [];
        if (elements.fenceStyleTotalCount) elements.fenceStyleTotalCount.textContent = String(fenceStyleState.data.length);
        updateFenceStyleBatchButtons();
        if (!data || data.length === 0) {
            const colCount = canSubmitDatabaseChanges ? 13 : 12;
            elements.fenceStyleTableBody.innerHTML = `<tr><td colspan="${colCount}" class="aluminum-empty-tip">未找到匹配记录</td></tr>`;
            return;
        }
        data.forEach((item) => {
            const code = item.code || '';
            const checked = fenceStyleState.selectedCodes.has(code) ? 'checked' : '';
            const checkboxCol = canSubmitDatabaseChanges ? `<td><input type="checkbox" data-fs-code="${escapeHtml(code)}" ${checked}></td>` : '';
            const actionButtons = canSubmitDatabaseChanges
                ? `<button class="btn small" data-fs-action="edit" data-fs-id="${escapeHtml(code)}">编辑</button>
                   <button class="btn small" data-fs-action="delete" data-fs-id="${escapeHtml(code)}">删除</button>`
                : '<span style="color:#94a3b8;">-</span>';
            const imageHtml = renderImage('', item.image_base64 || '', { preferPreviewOnly: true, emptyText: '-' });
            const row = document.createElement('tr');
            row.innerHTML = `
                ${checkboxCol}
                <td>${escapeHtml(code)}</td>
                <td>${escapeHtml(item.mesh_type || '')}</td>
                <td>${escapeHtml(item.pipe_spec || '')}</td>
                <td>${escapeHtml(BASE_TYPE_LABELS[item.base_type] || item.base_type || '')}</td>
                <td>${item.height || ''}</td>
                <td>${escapeHtml(item.mesh_code || '')}</td>
                <td>${escapeHtml(item.mesh_thick_code || '')}</td>
                <td>${escapeHtml(item.post_code || '')}</td>
                <td>${item.pile_code ? escapeHtml(item.pile_code) : '-'}</td>
                <td>${escapeHtml(item.end_cap_code || '')}</td>
                <td>${imageHtml}</td>
                <td class="table-actions">${actionButtons}</td>
            `;
            elements.fenceStyleTableBody.appendChild(row);
        });
        if (canSubmitDatabaseChanges) {
            elements.fenceStyleTableBody.querySelectorAll('button[data-fs-action]').forEach((btn) => {
                btn.addEventListener('click', handleFenceStyleTableAction);
            });
            elements.fenceStyleTableBody.querySelectorAll('input[data-fs-code]').forEach((cb) => {
                cb.addEventListener('change', handleFenceStyleCheckboxChange);
            });
        }
        updateFenceStyleSelectAll();
    }

    function handleFenceStyleCheckboxChange(event) {
        const code = event.target.getAttribute('data-fs-code');
        if (!code) return;
        if (event.target.checked) fenceStyleState.selectedCodes.add(code);
        else fenceStyleState.selectedCodes.delete(code);
        updateFenceStyleBatchButtons();
        updateFenceStyleSelectAll();
    }

    function updateFenceStyleBatchButtons() {
        const btn = document.getElementById('fence-style-batch-delete-btn');
        if (btn) {
            btn.disabled = fenceStyleState.selectedCodes.size === 0;
            btn.textContent = fenceStyleState.selectedCodes.size > 0 ? `批量删除 (${fenceStyleState.selectedCodes.size})` : '批量删除';
        }
    }

    function updateFenceStyleSelectAll() {
        const cb = document.getElementById('fence-style-select-all');
        if (!cb) return;
        const allCodes = fenceStyleState.data.map(d => d.code);
        const allSelected = allCodes.length > 0 && allCodes.every(c => fenceStyleState.selectedCodes.has(c));
        cb.checked = allSelected;
        cb.indeterminate = !allSelected && allCodes.some(c => fenceStyleState.selectedCodes.has(c));
    }

    async function handleFenceStyleBatchDelete() {
        const codes = Array.from(fenceStyleState.selectedCodes);
        if (codes.length === 0) return;
        if (!window.confirm(`确认批量删除 ${codes.length} 条围栏款式吗？`)) return;
        try {
            fenceStyleState.loading = true;
            const resp = await requestJson('/fence-styles/batch-delete', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ codes }),
            });
            fenceStyleState.selectedCodes.clear();
            showNotification(resp.message || '批量删除成功', 'success');
            await loadFenceStyleList();
        } catch (error) {
            showNotification(error.message || '批量删除失败', 'error');
        } finally {
            fenceStyleState.loading = false;
        }
    }

    async function handleFenceStyleBatchUpdate(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            fenceStyleState.loading = true;
            setFenceStyleSectionStatus('正在批量导入...', 'info');
            const formData = new FormData();
            formData.append('file', files[0]);
            const payload = await requestJson('/fence-styles/batch-update', {
                method: 'POST',
                headers: buildAuthHeaders({}),
                body: formData,
            });
            await loadFenceStyleList();
            setFenceStyleSectionStatus(payload.message || '批量导入成功', 'success');
            showNotification(payload.message || '批量导入成功', 'success');
        } catch (error) {
            setFenceStyleSectionStatus(error.message || '批量导入失败', 'error');
            showNotification(error.message || '批量导入失败', 'error');
        } finally {
            if (event.target) event.target.value = '';
            fenceStyleState.loading = false;
        }
    }

    function handleFenceStyleDownload() {
        try {
            const url = buildApiUrl('/fence-styles/download');
            triggerDirectDownload(url);
            showNotification('下载已开始', 'success');
        } catch (error) {
            showNotification(error.message || '下载失败', 'error');
        }
    }

    async function loadFenceStyleList() {
        try {
            fenceStyleState.loading = true;
            setFenceStyleSectionStatus('正在加载围栏款式...', 'info');
            const result = await FenceStyleAPI.getList(fenceStyleState.searchMeshType, fenceStyleState.searchBaseType);
            renderFenceStyleTable((result.data || []));
            setFenceStyleSectionStatus(`已加载 ${fenceStyleState.data.length} 条围栏款式。`, 'success');
        } catch (error) {
            console.error('加载围栏款式失败:', error);
            renderFenceStyleTable([]);
            setFenceStyleSectionStatus(error.message || '加载失败', 'error');
        } finally {
            fenceStyleState.loading = false;
        }
    }

    function openFenceStyleModal(mode, data = null) {
        if (!elements.fenceStyleModal || !elements.fenceStyleForm) return;
        fenceStyleState.imageBase64 = '';
        fenceStyleState.imageEncoding = false;
        const fsImageFile = document.getElementById('fs-image-file');
        if (fsImageFile) fsImageFile.value = '';
        if (mode === 'edit' && data) {
            fenceStyleState.editingId = data.code || '';
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            setVal('fs-code', data.code); document.getElementById('fs-code').readOnly = true;
            setVal('fs-mesh-type', data.mesh_type);
            setVal('fs-pipe-spec', data.pipe_spec);
            setVal('fs-base-type', data.base_type);
            setVal('fs-height', String(data.height));
            setVal('fs-mesh-code', data.mesh_code_30);
            setVal('fs-mesh-thick-code', data.mesh_code_35);
            setVal('fs-post-code', data.post_code);
            setVal('fs-pile-code', data.pile_code || '');
            setVal('fs-end-cap-code', data.end_cap_code);
            setVal('fs-rubber-code', data.rubber_code || '');
            fenceStyleState.imageBase64 = data.image_base64 || '';
        } else {
            fenceStyleState.editingId = null;
            elements.fenceStyleForm.reset();
            document.getElementById('fs-code').readOnly = false;
        }
        elements.fenceStyleModalTitle.textContent = mode === 'edit' ? '编辑围栏款式' : '新增围栏款式';
        updateFenceStyleImagePreview();
        elements.fenceStyleModal.style.display = 'flex';
    }

    function closeFenceStyleModal() {
        if (!elements.fenceStyleModal) return;
        elements.fenceStyleModal.style.display = 'none';
        fenceStyleState.editingId = null;
        fenceStyleState.imageBase64 = '';
    }

    function updateFenceStyleImagePreview() {
        const preview = document.getElementById('fs-image-preview');
        const status = document.getElementById('fs-image-status');
        if (!preview) return;
        const src = fenceStyleState.imageBase64 || '';
        if (src && src.startsWith('data:image')) {
            preview.innerHTML = `<img src="${escapeHtml(src)}" class="image-preview" alt="预览">`;
            if (status) status.textContent = '图片已就绪。';
        } else {
            preview.textContent = '未设置图片';
            if (status) status.textContent = '选择本地图片后，前端会转成 base64。';
        }
    }

    async function saveFenceStyleForm() {
        try {
            if (fenceStyleState.imageEncoding) throw new Error('图片处理中');
            const code = (document.getElementById('fs-code')?.value || '').trim();
            const data = {
                code,
                mesh_type: (document.getElementById('fs-mesh-type')?.value || '').trim(),
                pipe_spec: (document.getElementById('fs-pipe-spec')?.value || '').trim(),
                base_type: (document.getElementById('fs-base-type')?.value || '').trim(),
                height: parseInt(document.getElementById('fs-height')?.value) || 1000,
                mesh_code: (document.getElementById('fs-mesh-code')?.value || '').trim(),
                mesh_thick_code: (document.getElementById('fs-mesh-thick-code')?.value || '').trim(),
                post_code: (document.getElementById('fs-post-code')?.value || '').trim(),
                pile_code: (document.getElementById('fs-pile-code')?.value || '').trim() || null,
                end_cap_code: (document.getElementById('fs-end-cap-code')?.value || '').trim(),
                rubber_code: (document.getElementById('fs-rubber-code')?.value || '').trim() || null,
                image_base64: fenceStyleState.imageBase64 || '',
            };
            if (!data.code) throw new Error('款式编号不能为空');
            if (!data.mesh_code) throw new Error('网片编码不能为空');
            if (!data.post_code) throw new Error('立柱编码不能为空');
            fenceStyleState.loading = true;
            if (fenceStyleState.editingId) {
                await FenceStyleAPI.update(fenceStyleState.editingId, data);
                showNotification('更新成功', 'success');
            } else {
                await FenceStyleAPI.create(data);
                showNotification('新增成功', 'success');
            }
            closeFenceStyleModal();
            await loadFenceStyleList();
        } catch (error) {
            setFenceStyleSectionStatus(error.message || '保存失败', 'error');
            showNotification(error.message || '保存失败', 'error');
        } finally {
            fenceStyleState.loading = false;
        }
    }

    async function editFenceStyleItem(code) {
        try {
            const result = await FenceStyleAPI.getById(code);
            openFenceStyleModal('edit', result.data);
        } catch (error) {
            setFenceStyleSectionStatus(error.message || '获取数据失败', 'error');
        }
    }

    async function deleteFenceStyleItem(code) {
        if (!window.confirm(`确认删除围栏款式 "${code}" 吗？`)) return;
        try {
            await FenceStyleAPI.delete(code);
            showNotification('删除成功', 'success');
            await loadFenceStyleList();
        } catch (error) {
            setFenceStyleSectionStatus(error.message || '删除失败', 'error');
        }
    }

    function handleFenceStyleTableAction(event) {
        const action = event.currentTarget.getAttribute('data-fs-action');
        const id = event.currentTarget.getAttribute('data-fs-id');
        if (action === 'edit') editFenceStyleItem(id);
        else if (action === 'delete') deleteFenceStyleItem(id);
    }

    function setFenceStyleSectionStatus(message, type = 'info') {
        setStatusBox(elements.fenceStyleSectionStatus, message, type);
    }

    function renderGateStyleTable(data) {
        if (!elements.gateStyleTableBody) return;
        elements.gateStyleTableBody.innerHTML = '';
        gateStyleState.data = data || [];
        if (elements.gateStyleTotalCount) elements.gateStyleTotalCount.textContent = String(gateStyleState.data.length);
        updateGateStyleBatchButtons();
        if (!data || data.length === 0) {
            const colCount = canSubmitDatabaseChanges ? 9 : 8;
            elements.gateStyleTableBody.innerHTML = `<tr><td colspan="${colCount}" class="aluminum-empty-tip">未找到匹配记录</td></tr>`;
            return;
        }
        data.forEach((item) => {
            const code = item.code || '';
            const checked = gateStyleState.selectedCodes.has(code) ? 'checked' : '';
            const checkboxCol = canSubmitDatabaseChanges ? `<td><input type="checkbox" data-gs-code="${escapeHtml(code)}" ${checked}></td>` : '';
            const actionButtons = canSubmitDatabaseChanges
                ? `<button class="btn small" data-gs-action="edit" data-gs-id="${escapeHtml(code)}">编辑</button>
                   <button class="btn small" data-gs-action="delete" data-gs-id="${escapeHtml(code)}">删除</button>`
                : '<span style="color:#94a3b8;">-</span>';
            const imageHtml = renderImage('', item.image_base64 || '', { preferPreviewOnly: true, emptyText: '-' });
            const row = document.createElement('tr');
            row.innerHTML = `
                ${checkboxCol}
                <td>${escapeHtml(code)}</td>
                <td>${escapeHtml(GATE_TYPE_LABELS[item.gate_type] || item.gate_type || '')}</td>
                <td>${item.width || ''}</td>
                <td>${item.height || ''}</td>
                <td>${escapeHtml(BASE_TYPE_LABELS[item.base_type] || item.base_type || '')}</td>
                <td style="font-size:11px;">${escapeHtml(item.mesh_base_code || '')}</td>
                <td>${item.buckle_qty || 0}/${item.bolt_qty || 0}/${item.end_cap_qty || 0}</td>
                <td>${imageHtml}</td>
                <td class="table-actions">${actionButtons}</td>
            `;
            elements.gateStyleTableBody.appendChild(row);
        });
        if (canSubmitDatabaseChanges) {
            elements.gateStyleTableBody.querySelectorAll('button[data-gs-action]').forEach((btn) => {
                btn.addEventListener('click', handleGateStyleTableAction);
            });
            elements.gateStyleTableBody.querySelectorAll('input[data-gs-code]').forEach((cb) => {
                cb.addEventListener('change', handleGateStyleCheckboxChange);
            });
        }
        updateGateStyleSelectAll();
    }

    function handleGateStyleCheckboxChange(event) {
        const code = event.target.getAttribute('data-gs-code');
        if (!code) return;
        if (event.target.checked) gateStyleState.selectedCodes.add(code);
        else gateStyleState.selectedCodes.delete(code);
        updateGateStyleBatchButtons();
        updateGateStyleSelectAll();
    }

    function updateGateStyleBatchButtons() {
        const btn = document.getElementById('gate-style-batch-delete-btn');
        if (btn) {
            btn.disabled = gateStyleState.selectedCodes.size === 0;
            btn.textContent = gateStyleState.selectedCodes.size > 0 ? `批量删除 (${gateStyleState.selectedCodes.size})` : '批量删除';
        }
    }

    function updateGateStyleSelectAll() {
        const cb = document.getElementById('gate-style-select-all');
        if (!cb) return;
        const allCodes = gateStyleState.data.map(d => d.code);
        const allSelected = allCodes.length > 0 && allCodes.every(c => gateStyleState.selectedCodes.has(c));
        cb.checked = allSelected;
        cb.indeterminate = !allSelected && allCodes.some(c => gateStyleState.selectedCodes.has(c));
    }

    async function handleGateStyleBatchDelete() {
        const codes = Array.from(gateStyleState.selectedCodes);
        if (codes.length === 0) return;
        if (!window.confirm(`确认批量删除 ${codes.length} 条门款式吗？`)) return;
        try {
            gateStyleState.loading = true;
            const resp = await requestJson('/gate-styles/batch-delete', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ codes }),
            });
            gateStyleState.selectedCodes.clear();
            showNotification(resp.message || '批量删除成功', 'success');
            await loadGateStyleList();
        } catch (error) {
            showNotification(error.message || '批量删除失败', 'error');
        } finally {
            gateStyleState.loading = false;
        }
    }

    async function handleGateStyleBatchUpdate(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            gateStyleState.loading = true;
            setGateStyleSectionStatus('正在批量导入...', 'info');
            const formData = new FormData();
            formData.append('file', files[0]);
            const payload = await requestJson('/gate-styles/batch-update', {
                method: 'POST',
                headers: buildAuthHeaders({}),
                body: formData,
            });
            await loadGateStyleList();
            setGateStyleSectionStatus(payload.message || '批量导入成功', 'success');
            showNotification(payload.message || '批量导入成功', 'success');
        } catch (error) {
            setGateStyleSectionStatus(error.message || '批量导入失败', 'error');
            showNotification(error.message || '批量导入失败', 'error');
        } finally {
            if (event.target) event.target.value = '';
            gateStyleState.loading = false;
        }
    }

    function handleGateStyleDownload() {
        try {
            const url = buildApiUrl('/gate-styles/download');
            triggerDirectDownload(url);
            showNotification('下载已开始', 'success');
        } catch (error) {
            showNotification(error.message || '下载失败', 'error');
        }
    }

    async function loadGateStyleList() {
        try {
            gateStyleState.loading = true;
            setGateStyleSectionStatus('正在加载门款式...', 'info');
            const result = await GateStyleAPI.getList(gateStyleState.searchGateType, gateStyleState.searchBaseType);
            renderGateStyleTable((result.data || []));
            setGateStyleSectionStatus(`已加载 ${gateStyleState.data.length} 条门款式。`, 'success');
        } catch (error) {
            console.error('加载门款式失败:', error);
            renderGateStyleTable([]);
            setGateStyleSectionStatus(error.message || '加载失败', 'error');
        } finally {
            gateStyleState.loading = false;
        }
    }

    function openGateStyleModal(mode, data = null) {
        if (!elements.gateStyleModal || !elements.gateStyleForm) return;
        gateStyleState.imageBase64 = '';
        gateStyleState.imageEncoding = false;
        const gsImageFile = document.getElementById('gs-image-file');
        if (gsImageFile) gsImageFile.value = '';
        if (mode === 'edit' && data) {
            gateStyleState.editingId = data.code || '';
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            setVal('gs-code', data.code); document.getElementById('gs-code').readOnly = true;
            setVal('gs-gate-type', data.gate_type);
            setVal('gs-width', String(data.width));
            setVal('gs-height', String(data.height));            setVal('gs-base-type', data.base_type);
            setVal('gs-mesh-base-code', data.mesh_base_code);
            setVal('gs-buckle-code', data.buckle_code);
            setVal('gs-buckle-qty', String(data.buckle_qty));
            setVal('gs-bolt-code', data.bolt_code);
            setVal('gs-bolt-qty', String(data.bolt_qty));
            setVal('gs-end-cap-code', data.end_cap_code);
            setVal('gs-end-cap-qty', String(data.end_cap_qty));
            setVal('gs-horizontal-pin-code', data.horizontal_pin_code);
            setVal('gs-horizontal-pin-qty', String(data.horizontal_pin_qty));
            setVal('gs-vertical-pin-code', data.vertical_pin_code);
            setVal('gs-vertical-pin-qty', String(data.vertical_pin_qty));
            setVal('gs-pile-code', data.pile_code || '');
            setVal('gs-pile-qty', String(data.pile_qty));
            setVal('gs-pile-bolt-code', data.pile_bolt_code);
            setVal('gs-pile-bolt-qty', String(data.pile_bolt_qty));
            setVal('gs-rubber-code', data.rubber_code || '');
            setVal('gs-rubber-qty', String(data.rubber_qty));
            gateStyleState.imageBase64 = data.image_base64 || '';
        } else {
            gateStyleState.editingId = null;
            elements.gateStyleForm.reset();
            document.getElementById('gs-code').readOnly = false;
            document.getElementById('gs-width').value = '1200';
            document.getElementById('gs-height').value = '1500';
            document.getElementById('gs-buckle-code').value = 'FN-PJ-0002';
            document.getElementById('gs-bolt-code').value = 'FN-PJ-0004';
            document.getElementById('gs-end-cap-code').value = 'XJ-0009';
            document.getElementById('gs-end-cap-qty').value = '2';
        }
        elements.gateStyleModalTitle.textContent = mode === 'edit' ? '编辑门款式' : '新增门款式';
        updateGateStyleImagePreview();
        elements.gateStyleModal.style.display = 'flex';
    }

    function closeGateStyleModal() {
        if (!elements.gateStyleModal) return;
        elements.gateStyleModal.style.display = 'none';
        gateStyleState.editingId = null;
        gateStyleState.imageBase64 = '';
    }

    function updateGateStyleImagePreview() {
        const preview = document.getElementById('gs-image-preview');
        const status = document.getElementById('gs-image-status');
        if (!preview) return;
        const src = gateStyleState.imageBase64 || '';
        if (src && src.startsWith('data:image')) {
            preview.innerHTML = `<img src="${escapeHtml(src)}" class="image-preview" alt="预览">`;
            if (status) status.textContent = '图片已就绪。';
        } else {
            preview.textContent = '未设置图片';
            if (status) status.textContent = '选择本地图片后，前端会转成 base64。';
        }
    }

    async function saveGateStyleForm() {
        try {
            if (gateStyleState.imageEncoding) throw new Error('图片处理中');
            const code = (document.getElementById('gs-code')?.value || '').trim();
            const data = {
                code,
                gate_type: (document.getElementById('gs-gate-type')?.value || '').trim(),
                width: parseInt(document.getElementById('gs-width')?.value) || 1200,
                height: parseInt(document.getElementById('gs-height')?.value) || 1000,
                base_type: (document.getElementById('gs-base-type')?.value || '').trim(),
                mesh_base_code: (document.getElementById('gs-mesh-base-code')?.value || '').trim(),
                buckle_code: (document.getElementById('gs-buckle-code')?.value || '').trim(),
                bolt_code: (document.getElementById('gs-bolt-code')?.value || '').trim(),
                end_cap_code: (document.getElementById('gs-end-cap-code')?.value || '').trim(),
                horizontal_pin_code: (document.getElementById('gs-horizontal-pin-code')?.value || '').trim(),
                vertical_pin_code: (document.getElementById('gs-vertical-pin-code')?.value || '').trim(),
                pile_code: (document.getElementById('gs-pile-code')?.value || '').trim() || null,
                pile_bolt_code: (document.getElementById('gs-pile-bolt-code')?.value || '').trim(),
                rubber_code: (document.getElementById('gs-rubber-code')?.value || '').trim() || null,
                buckle_qty: parseInt(document.getElementById('gs-buckle-qty')?.value) || 0,
                bolt_qty: parseInt(document.getElementById('gs-bolt-qty')?.value) || 0,
                end_cap_qty: parseInt(document.getElementById('gs-end-cap-qty')?.value) || 2,
                horizontal_pin_qty: parseInt(document.getElementById('gs-horizontal-pin-qty')?.value) || 0,
                vertical_pin_qty: parseInt(document.getElementById('gs-vertical-pin-qty')?.value) || 0,
                pile_qty: parseInt(document.getElementById('gs-pile-qty')?.value) || 0,
                pile_bolt_qty: parseInt(document.getElementById('gs-pile-bolt-qty')?.value) || 0,
                rubber_qty: parseInt(document.getElementById('gs-rubber-qty')?.value) || 0,
                image_base64: gateStyleState.imageBase64 || '',
            };
            if (!data.code) throw new Error('款式编号不能为空');
            gateStyleState.loading = true;
            if (gateStyleState.editingId) {
                await GateStyleAPI.update(gateStyleState.editingId, data);
                showNotification('更新成功', 'success');
            } else {
                await GateStyleAPI.create(data);
                showNotification('新增成功', 'success');
            }
            closeGateStyleModal();
            await loadGateStyleList();
        } catch (error) {
            setGateStyleSectionStatus(error.message || '保存失败', 'error');
            showNotification(error.message || '保存失败', 'error');
        } finally {
            gateStyleState.loading = false;
        }
    }

    async function editGateStyleItem(code) {
        try {
            const result = await GateStyleAPI.getById(code);
            openGateStyleModal('edit', result.data);
        } catch (error) {
            setGateStyleSectionStatus(error.message || '获取数据失败', 'error');
        }
    }

    async function deleteGateStyleItem(code) {
        if (!window.confirm(`确认删除门款式 "${code}" 吗？`)) return;
        try {
            await GateStyleAPI.delete(code);
            showNotification('删除成功', 'success');
            await loadGateStyleList();
        } catch (error) {
            setGateStyleSectionStatus(error.message || '删除失败', 'error');
        }
    }

    function handleGateStyleTableAction(event) {
        const action = event.currentTarget.getAttribute('data-gs-action');
        const id = event.currentTarget.getAttribute('data-gs-id');
        if (action === 'edit') editGateStyleItem(id);
        else if (action === 'delete') deleteGateStyleItem(id);
    }

    function setGateStyleSectionStatus(message, type = 'info') {
        setStatusBox(elements.gateStyleSectionStatus, message, type);
    }

    function setPilePriceSectionStatus(message, type = 'info') {
        setStatusBox(elements.pilePriceSectionStatus, message, type);
    }

    function renderPilePriceTable(data) {
        if (!elements.pilePriceTableBody) return;
        elements.pilePriceTableBody.innerHTML = '';
        pilePriceState.data = data || [];
        if (elements.pilePriceTotalCount) elements.pilePriceTotalCount.textContent = String(pilePriceState.data.length);
        if (!data || data.length === 0) {
            elements.pilePriceTableBody.innerHTML = '<tr><td colspan="4" class="aluminum-empty-tip">暂无数据</td></tr>';
            return;
        }
        data.forEach((item) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(item.code || '')}</td>
                <td>${item.price_usd != null ? escapeHtml(String(item.price_usd)) : ''}</td>
                <td>${item.price_eur != null ? escapeHtml(String(item.price_eur)) : ''}</td>
                <td>${item.price_rmb != null ? escapeHtml(String(item.price_rmb)) : ''}</td>
            `;
            elements.pilePriceTableBody.appendChild(tr);
        });
    }

    async function loadPilePriceList() {
        try {
            pilePriceState.loading = true;
            setPilePriceSectionStatus('正在加载地桩价格...', 'info');
            const result = await PilePriceAPI.getList();
            renderPilePriceTable(result.data || []);
            setPilePriceSectionStatus(`已加载 ${pilePriceState.data.length} 条记录。`, 'success');
        } catch (error) {
            console.error('加载地桩价格失败:', error);
            renderPilePriceTable([]);
            setPilePriceSectionStatus(error.message || '加载失败', 'error');
        } finally {
            pilePriceState.loading = false;
        }
    }

    async function handlePilePriceBatchUpdate(event) {
        const files = Array.from(event.target.files || []);
        if (files.length <= 0) return;
        try {
            pilePriceState.loading = true;
            setPilePriceSectionStatus('正在批量更新价格...', 'info');
            const payload = await PilePriceAPI.batchUpdate(files[0]);
            await loadPilePriceList();
            setPilePriceSectionStatus(payload.message || '批量更新成功', 'success');
            showNotification(payload.message || '批量更新成功', 'success');
        } catch (error) {
            setPilePriceSectionStatus(error.message || '批量更新失败', 'error');
            showNotification(error.message || '批量更新失败', 'error');
        } finally {
            if (event.target) event.target.value = '';
            pilePriceState.loading = false;
        }
    }

    function switchDatabase(db) {
        if (db === activeDatabase) return;
        activeDatabase = db;
        if (elements.dbSwitcher) elements.dbSwitcher.value = db;
        const sections = [
            { el: elements.aluminumDbContent, key: 'aluminum' },
            { el: elements.fenceDbContent, key: 'fence' },
            { el: elements.fenceStyleDbContent, key: 'fence_styles' },
            { el: elements.gateStyleDbContent, key: 'gate_styles' },
            { el: elements.pilePriceDbContent, key: 'pile_price' },
        ];
        sections.forEach(({ el, key }) => {
            if (el) el.style.display = key === db ? '' : 'none';
        });
        if (db === 'fence') {
            loadFenceColumns();
            loadFenceList();
        }
        else if (db === 'fence_styles') loadFenceStyleList();
        else if (db === 'gate_styles') loadGateStyleList();
        else if (db === 'pile_price') loadPilePriceList();
        else {
            loadAluminumColumns();
            loadList();
        }
    }

    function initEventListeners() {
        addEventListenerSafe(elements.searchButton, 'click', handleSearch);
        addEventListenerSafe(elements.searchResetButton, 'click', handleResetSearch);

        [elements.searchCodeInput, elements.searchNameInput, elements.searchSpecInput, elements.searchNameKoInput].forEach((input) => {
            if (!input) return;
            const handler = (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearch(); } };
            input.addEventListener('keypress', handler);
            cleanupFns.push(() => { input.removeEventListener('keypress', handler); });
        });

        addEventListenerSafe(elements.addButton, 'click', () => openModal('add'));
        addEventListenerSafe(elements.refreshButton, 'click', () => loadList());
        addEventListenerSafe(elements.exportImagesButton, 'click', handleExportImages);

        if (elements.importImagesButton && elements.importImagesInput) {
            addEventListenerSafe(elements.importImagesButton, 'click', () => { elements.importImagesInput.click(); });
        }

        addEventListenerSafe(elements.downloadDatabaseButton, 'click', handleDownloadDatabase);
        addEventListenerSafe(elements.importImagesInput, 'change', handleImportImagesSelection);

        if (elements.batchPriceButton && elements.batchPriceInput) {
            addEventListenerSafe(elements.batchPriceButton, 'click', () => { elements.batchPriceInput.click(); });
            addEventListenerSafe(elements.batchPriceInput, 'change', handleBatchPriceSelection);
        }
        addEventListenerSafe(elements.addColumnButton, 'click', handleAddColumn);
        addEventListenerSafe(elements.prevButton, 'click', () => goToListPage(dbState.currentPage - 1));
        addEventListenerSafe(elements.nextButton, 'click', () => goToListPage(dbState.currentPage + 1));
        addEventListenerSafe(elements.pageJumpButton, 'click', handleListPageJump);

        if (elements.pageJumpInput) {
            const handler = (event) => { if (event.key === 'Enter') { event.preventDefault(); handleListPageJump(); } };
            elements.pageJumpInput.addEventListener('keydown', handler);
            cleanupFns.push(() => { elements.pageJumpInput.removeEventListener('keydown', handler); });
        }

        addEventListenerSafe(elements.form, 'submit', (event) => { event.preventDefault(); saveForm(); });
        addEventListenerSafe(elements.cancelButton, 'click', closeModal);

        if (elements.modal) {
            const handler = (event) => { if (event.target === elements.modal) closeModal(); };
            elements.modal.addEventListener('click', handler);
            cleanupFns.push(() => { elements.modal.removeEventListener('click', handler); });
        }

        if (elements.imageFileInput) {
            const handler = async (event) => {
                try {
                    await handleImageFileChange(event);
                } catch (error) {
                    dbState.imageEncoding = false;
                    setLoading(dbState.loading);
                    setSectionStatus(error.message || '图片处理失败，请重新选择文件。', 'error');
                    showNotification(error.message || '图片处理失败，请重新选择文件。', 'error');
                }
            };
            elements.imageFileInput.addEventListener('change', handler);
            cleanupFns.push(() => { elements.imageFileInput.removeEventListener('change', handler); });
        }

        addEventListenerSafe(elements.imageClearButton, 'click', clearImageSelection);

        if (elements.requestStatusFilter) {
            elements.requestStatusFilter.value = dbState.requestStatus;
            const handler = () => { dbState.requestStatus = elements.requestStatusFilter.value; dbState.requestPage = 1; loadChangeRequests(); };
            elements.requestStatusFilter.addEventListener('change', handler);
            cleanupFns.push(() => { elements.requestStatusFilter.removeEventListener('change', handler); });
        }

        addEventListenerSafe(elements.requestRefreshButton, 'click', () => loadChangeRequests());
        addEventListenerSafe(elements.requestPrevButton, 'click', () => goToRequestPage(dbState.requestPage - 1));
        addEventListenerSafe(elements.requestNextButton, 'click', () => goToRequestPage(dbState.requestPage + 1));
        addEventListenerSafe(elements.requestPageJumpButton, 'click', handleRequestPageJump);

        if (elements.requestPageJumpInput) {
            const handler = (event) => { if (event.key === 'Enter') { event.preventDefault(); handleRequestPageJump(); } };
            elements.requestPageJumpInput.addEventListener('keydown', handler);
            cleanupFns.push(() => { elements.requestPageJumpInput.removeEventListener('keydown', handler); });
        }

        const escHandler = (event) => { if (event.key === 'Escape') {
            const gsModal = elements.gateStyleModal;
            const fsModal = elements.fenceStyleModal;
            if (gsModal && gsModal.style.display === 'flex') closeGateStyleModal();
            else if (fsModal && fsModal.style.display === 'flex') closeFenceStyleModal();
            else if (elements.fenceModal && elements.fenceModal.style.display === 'flex') closeFenceModal();
            else if (elements.modal && elements.modal.style.display === 'flex') closeModal();
        }};
        document.addEventListener('keydown', escHandler);
        cleanupFns.push(() => { document.removeEventListener('keydown', escHandler); });

        addEventListenerSafe(elements.dbSwitcher, 'change', (e) => switchDatabase(e.target.value));
        addEventListenerSafe(elements.fenceSearchBtn, 'click', handleFenceSearch);
        addEventListenerSafe(elements.fenceSearchResetBtn, 'click', handleFenceResetSearch);
        addEventListenerSafe(elements.fenceRefreshBtn, 'click', () => loadFenceList());
        addEventListenerSafe(elements.fenceAddBtn, 'click', () => openFenceModal('add'));
        addEventListenerSafe(elements.fenceExportImagesBtn, 'click', handleFenceExportImages);
        if (elements.fenceImportImagesBtn && elements.fenceImportImagesInput) {
            addEventListenerSafe(elements.fenceImportImagesBtn, 'click', () => { elements.fenceImportImagesInput.click(); });
        }
        addEventListenerSafe(elements.fenceImportImagesInput, 'change', handleFenceImportImages);
        if (elements.fenceBatchUpdateBtn && elements.fenceBatchUpdateInput) {
            addEventListenerSafe(elements.fenceBatchUpdateBtn, 'click', () => { elements.fenceBatchUpdateInput.click(); });
        }
        addEventListenerSafe(elements.fenceBatchUpdateInput, 'change', handleFenceBatchUpdate);
        const fenceBatchPriceBtn = document.getElementById('fence-batch-price-btn');
        const fenceBatchPriceInput = document.getElementById('fence-batch-price-input');
        if (fenceBatchPriceBtn && fenceBatchPriceInput) {
            addEventListenerSafe(fenceBatchPriceBtn, 'click', () => { fenceBatchPriceInput.click(); });
            addEventListenerSafe(fenceBatchPriceInput, 'change', handleFenceBatchPriceUpdate);
        }
        addEventListenerSafe(elements.fenceAddColumnBtn, 'click', handleFenceAddColumn);
        addEventListenerSafe(elements.fenceDownloadDbBtn, 'click', handleFenceDownloadDatabase);
        addEventListenerSafe(elements.fencePrevButton, 'click', () => goToFencePage(fenceState.currentPage - 1));
        addEventListenerSafe(elements.fenceNextButton, 'click', () => goToFencePage(fenceState.currentPage + 1));
        addEventListenerSafe(elements.fencePageJumpButton, 'click', handleFencePageJump);
        if (elements.fencePageJumpInput) {
            const handler = (event) => { if (event.key === 'Enter') { event.preventDefault(); handleFencePageJump(); } };
            elements.fencePageJumpInput.addEventListener('keydown', handler);
            cleanupFns.push(() => { elements.fencePageJumpInput.removeEventListener('keydown', handler); });
        }
        if (elements.fenceSearchKeyword) {
            const handler = (event) => { if (event.key === 'Enter') { event.preventDefault(); handleFenceSearch(); } };
            elements.fenceSearchKeyword.addEventListener('keypress', handler);
            cleanupFns.push(() => { elements.fenceSearchKeyword.removeEventListener('keypress', handler); });
        }
        addEventListenerSafe(elements.fenceForm, 'submit', (event) => { event.preventDefault(); saveFenceForm(); });
        addEventListenerSafe(elements.fenceCancelBtn, 'click', closeFenceModal);
        if (elements.fenceModal) {
            const handler = (event) => { if (event.target === elements.fenceModal) closeFenceModal(); };
            elements.fenceModal.addEventListener('click', handler);
            cleanupFns.push(() => { elements.fenceModal.removeEventListener('click', handler); });
        }

        addEventListenerSafe(elements.fenceStyleSearchBtn, 'click', () => {
            fenceStyleState.searchMeshType = (elements.fenceStyleSearchMesh?.value || '').trim();
            fenceStyleState.searchBaseType = (elements.fenceStyleSearchBase?.value || '').trim();
            loadFenceStyleList();
        });
        addEventListenerSafe(elements.fenceStyleSearchResetBtn, 'click', () => {
            if (elements.fenceStyleSearchMesh) elements.fenceStyleSearchMesh.value = '';
            if (elements.fenceStyleSearchBase) elements.fenceStyleSearchBase.value = '';
            fenceStyleState.searchMeshType = '';
            fenceStyleState.searchBaseType = '';
            loadFenceStyleList();
        });
        addEventListenerSafe(elements.fenceStyleRefreshBtn, 'click', () => loadFenceStyleList());
        addEventListenerSafe(elements.fenceStyleAddBtn, 'click', () => openFenceStyleModal('add'));
        addEventListenerSafe(document.getElementById('fence-style-batch-delete-btn'), 'click', handleFenceStyleBatchDelete);
        addEventListenerSafe(document.getElementById('fence-style-batch-update-btn'), 'click', () => {
            const inp = document.getElementById('fence-style-batch-update-input');
            if (inp) inp.click();
        });
        addEventListenerSafe(document.getElementById('fence-style-batch-update-input'), 'change', handleFenceStyleBatchUpdate);
        addEventListenerSafe(document.getElementById('fence-style-download-btn'), 'click', handleFenceStyleDownload);
        addEventListenerSafe(document.getElementById('fence-style-select-all'), 'change', (e) => {
            const allCodes = fenceStyleState.data.map(d => d.code);
            if (e.target.checked) allCodes.forEach(c => fenceStyleState.selectedCodes.add(c));
            else fenceStyleState.selectedCodes.clear();
            renderFenceStyleTable(fenceStyleState.data);
        });
        addEventListenerSafe(elements.fenceStyleForm, 'submit', (event) => { event.preventDefault(); saveFenceStyleForm(); });
        addEventListenerSafe(document.getElementById('fs-cancel-btn'), 'click', closeFenceStyleModal);
        if (elements.fenceStyleModal) {
            const handler = (event) => { if (event.target === elements.fenceStyleModal) closeFenceStyleModal(); };
            elements.fenceStyleModal.addEventListener('click', handler);
            cleanupFns.push(() => { elements.fenceStyleModal.removeEventListener('click', handler); });
        }
        const fsImageFile = document.getElementById('fs-image-file');
        if (fsImageFile) {
            const handler = async (event) => {
                const file = event.target?.files?.[0];
                if (!file) return;
                fenceStyleState.imageEncoding = true;
                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    fenceStyleState.imageBase64 = dataUrl;
                    updateFenceStyleImagePreview();
                } finally { fenceStyleState.imageEncoding = false; }
            };
            fsImageFile.addEventListener('change', handler);
            cleanupFns.push(() => { fsImageFile.removeEventListener('change', handler); });
        }
        addEventListenerSafe(document.getElementById('fs-image-clear-btn'), 'click', () => {
            fenceStyleState.imageBase64 = '';
            const f = document.getElementById('fs-image-file');
            if (f) f.value = '';
            updateFenceStyleImagePreview();
        });

        addEventListenerSafe(elements.gateStyleSearchBtn, 'click', () => {
            gateStyleState.searchGateType = (elements.gateStyleSearchType?.value || '').trim();
            gateStyleState.searchBaseType = (elements.gateStyleSearchBase?.value || '').trim();
            loadGateStyleList();
        });
        addEventListenerSafe(elements.gateStyleSearchResetBtn, 'click', () => {
            if (elements.gateStyleSearchType) elements.gateStyleSearchType.value = '';
            if (elements.gateStyleSearchBase) elements.gateStyleSearchBase.value = '';
            gateStyleState.searchGateType = '';
            gateStyleState.searchBaseType = '';
            loadGateStyleList();
        });
        addEventListenerSafe(elements.gateStyleRefreshBtn, 'click', () => loadGateStyleList());
        addEventListenerSafe(elements.gateStyleAddBtn, 'click', () => openGateStyleModal('add'));
        addEventListenerSafe(document.getElementById('gate-style-batch-delete-btn'), 'click', handleGateStyleBatchDelete);
        addEventListenerSafe(document.getElementById('gate-style-batch-update-btn'), 'click', () => {
            const inp = document.getElementById('gate-style-batch-update-input');
            if (inp) inp.click();
        });
        addEventListenerSafe(document.getElementById('gate-style-batch-update-input'), 'change', handleGateStyleBatchUpdate);
        addEventListenerSafe(document.getElementById('gate-style-download-btn'), 'click', handleGateStyleDownload);
        addEventListenerSafe(document.getElementById('gate-style-select-all'), 'change', (e) => {
            const allCodes = gateStyleState.data.map(d => d.code);
            if (e.target.checked) allCodes.forEach(c => gateStyleState.selectedCodes.add(c));
            else gateStyleState.selectedCodes.clear();
            renderGateStyleTable(gateStyleState.data);
        });
        addEventListenerSafe(elements.gateStyleForm, 'submit', (event) => { event.preventDefault(); saveGateStyleForm(); });
        addEventListenerSafe(document.getElementById('gs-cancel-btn'), 'click', closeGateStyleModal);
        if (elements.gateStyleModal) {
            const handler = (event) => { if (event.target === elements.gateStyleModal) closeGateStyleModal(); };
            elements.gateStyleModal.addEventListener('click', handler);
            cleanupFns.push(() => { elements.gateStyleModal.removeEventListener('click', handler); });
        }
        const gsImageFile = document.getElementById('gs-image-file');
        if (gsImageFile) {
            const handler = async (event) => {
                const file = event.target?.files?.[0];
                if (!file) return;
                gateStyleState.imageEncoding = true;
                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    gateStyleState.imageBase64 = dataUrl;
                    updateGateStyleImagePreview();
                } finally { gateStyleState.imageEncoding = false; }
            };
            gsImageFile.addEventListener('change', handler);
            cleanupFns.push(() => { gsImageFile.removeEventListener('change', handler); });
        }
        addEventListenerSafe(document.getElementById('gs-image-clear-btn'), 'click', () => {
            gateStyleState.imageBase64 = '';
            const f = document.getElementById('gs-image-file');
            if (f) f.value = '';
            updateGateStyleImagePreview();
        });
        if (elements.fenceImageFileInput) {
            const handler = async (event) => {
                try {
                    await handleFenceImageFileChange(event);
                } catch (error) {
                    fenceState.imageEncoding = false;
                    setFenceSectionStatus(error.message || '图片处理失败。', 'error');
                }
            };
            elements.fenceImageFileInput.addEventListener('change', handler);
            cleanupFns.push(() => { elements.fenceImageFileInput.removeEventListener('change', handler); });
        }
        addEventListenerSafe(elements.fenceImageClearBtn, 'click', () => {
            fenceState.imageBase64 = '';
            if (elements.fenceImageFileInput) elements.fenceImageFileInput.value = '';
            updateFenceImagePreview();
        });

        addEventListenerSafe(elements.pilePriceRefreshBtn, 'click', () => loadPilePriceList());
        if (elements.pilePriceBatchUpdateBtn && elements.pilePriceBatchUpdateInput) {
            addEventListenerSafe(elements.pilePriceBatchUpdateBtn, 'click', () => { elements.pilePriceBatchUpdateInput.click(); });
        }
        addEventListenerSafe(elements.pilePriceBatchUpdateInput, 'change', handlePilePriceBatchUpdate);
    }

    const API = {
        getColumns() {
            return requestJson('/aluminum/columns');
        },

        getList(page, pageSize, filters) {
            const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
            Object.entries(filters || {}).forEach(([key, value]) => {
                const text = String(value || '').trim();
                if (text) params.set(key, text);
            });
            return requestJson(`/aluminum/list?${params.toString()}`);
        },

        getById(id) {
            return requestJson(`/aluminum/${encodeURIComponent(id)}`);
        },

        create(data) {
            return requestJson('/aluminum/create', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { adminOnly: true }),
                body: JSON.stringify(data),
            });
        },

        update(id, data) {
            return requestJson(`/aluminum/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { adminOnly: true }),
                body: JSON.stringify(data),
            });
        },

        delete(id) {
            return requestJson(`/aluminum/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: buildAuthHeaders({}, { adminOnly: true }),
            });
        },

        submitChangeRequest(data) {
            return requestJson('/aluminum/change-requests', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },

        getChangeRequests(page, pageSize, status, requester = '') {
            const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
            if (status) params.set('status', status);
            if (requester) params.set('requester', requester);
            return requestJson(`/aluminum/change-requests?${params.toString()}`, {
                headers: canReviewRequests
                    ? buildAuthHeaders({}, { adminOnly: true })
                    : buildAuthHeaders({}, { includeUser: true }),
            });
        },

        approveChangeRequest(id, reviewNote) {
            return requestJson(`/aluminum/change-requests/${id}/approve`, {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { adminOnly: true }),
                body: JSON.stringify({ review_note: reviewNote || '' }),
            });
        },

        rejectChangeRequest(id, reviewNote) {
            return requestJson(`/aluminum/change-requests/${id}/reject`, {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { adminOnly: true }),
                body: JSON.stringify({ review_note: reviewNote || '' }),
            });
        },

        withdrawChangeRequest(id) {
            return requestJson(`/aluminum/change-requests/${id}/withdraw`, {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ requester: currentUser }),
            });
        },

        exportImages() {
            return requestFile('/aluminum/images/export', {
                headers: buildAuthHeaders({}, { adminOnly: true }),
            });
        },

        importImages(files) {
            const formData = new FormData();
            Array.from(files || []).forEach((file) => { formData.append('files', file); });
            return requestJson('/aluminum/images/import', {
                method: 'POST',
                headers: buildAuthHeaders({}),
                body: formData,
            });
        },

        batchUpdatePrice(file) {
            const formData = new FormData();
            formData.append('file', file);
            return requestJson('/aluminum/prices/batch-update', {
                method: 'POST',
                headers: buildAuthHeaders({}),
                body: formData,
            });
        },

        addColumn(columnName) {
            return requestJson('/aluminum/add-column', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ column_name: columnName }),
            });
        },

        downloadDatabase() {
            return requestFile('/aluminum/database/download', {
                headers: buildAuthHeaders({}),
            });
        },
    };

    function applyViewMode() {
        const mainSection = document.getElementById('aluminum-db');
        const reviewSection = document.getElementById('aluminum-review-section');
        if (mainSection) mainSection.style.display = activeViewMode === 'db' ? '' : 'none';
        if (reviewSection) reviewSection.style.display = activeViewMode !== 'db' ? '' : 'none';
    }

    function init(container, viewMode) {
        auth = window._ksAuth || null;
        isAdmin = !!(auth && auth.role === 'admin');
        canSubmitDatabaseChanges = hasPermission('database_submit');
        canDownloadDatabase = hasPermission('database_download');
        canViewChangeRecords = hasPermission('records');
        canReviewRequests = hasPermission('records_review');
        currentUser = auth?.username || 'anonymous';
        currentRole = auth?.roleLabel || auth?.role || '';
        activeViewMode = viewMode === 'records' ? 'records' : 'db';

        containerEl = container;
        cleanupFns = [];

        ensureSupportStyles();

        containerEl.innerHTML = '';

        const mainSection = document.createElement('section');
        mainSection.id = 'aluminum-db';
        mainSection.className = 'section';
        mainSection.innerHTML = buildMainSectionMarkup();
        containerEl.appendChild(mainSection);

        const reviewSection = document.createElement('section');
        reviewSection.id = 'aluminum-review-section';
        reviewSection.className = 'section';
        reviewSection.innerHTML = buildReviewSectionMarkup();
        containerEl.appendChild(reviewSection);

        let modal = document.getElementById('aluminum-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'aluminum-modal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = buildModalMarkup();

        let fenceModal = document.getElementById('fence-modal');
        if (!fenceModal) {
            fenceModal = document.createElement('div');
            fenceModal.id = 'fence-modal';
            fenceModal.className = 'modal';
            document.body.appendChild(fenceModal);
        }
        fenceModal.className = 'modal';
        fenceModal.style.display = 'none';
        fenceModal.innerHTML = buildFenceModalMarkup();

        let fenceStyleModal = document.getElementById('fence-style-modal');
        if (!fenceStyleModal) {
            fenceStyleModal = document.createElement('div');
            fenceStyleModal.id = 'fence-style-modal';
            fenceStyleModal.className = 'modal';
            document.body.appendChild(fenceStyleModal);
        }
        fenceStyleModal.className = 'modal';
        fenceStyleModal.style.display = 'none';
        fenceStyleModal.innerHTML = buildFenceStyleModalMarkup();
        elements.fenceStyleModal = fenceStyleModal;
        elements.fenceStyleForm = document.getElementById('fence-style-form');
        elements.fenceStyleModalTitle = document.getElementById('fence-style-modal-title');

        let gateStyleModal = document.getElementById('gate-style-modal');
        if (!gateStyleModal) {
            gateStyleModal = document.createElement('div');
            gateStyleModal.id = 'gate-style-modal';
            gateStyleModal.className = 'modal';
            document.body.appendChild(gateStyleModal);
        }
        gateStyleModal.className = 'modal';
        gateStyleModal.style.display = 'none';
        gateStyleModal.innerHTML = buildGateStyleModalMarkup();
        elements.gateStyleModal = gateStyleModal;
        elements.gateStyleForm = document.getElementById('gate-style-form');
        elements.gateStyleModalTitle = document.getElementById('gate-style-modal-title');

        cacheElements();
        applyViewMode();
        initEventListeners();
        updateOverview();
        updatePagination();
        updateRequestOverview();
        updateFenceOverview();
        updateFencePagination();
        if (elements.dbSwitcher) elements.dbSwitcher.value = activeDatabase;

        if (activeViewMode === 'db') {
            if (activeDatabase === 'aluminum') {
                loadAluminumColumns();
                loadList();
            }
            else if (activeDatabase === 'fence') {
                loadFenceColumns();
                loadFenceList();
            }
            else if (activeDatabase === 'fence_styles') loadFenceStyleList();
            else if (activeDatabase === 'gate_styles') loadGateStyleList();
            else if (activeDatabase === 'pile_price') loadPilePriceList();
            else {
                loadAluminumColumns();
                loadList();
            }
        }
        loadChangeRequests();
    }

    function destroy() {
        cleanupFns.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
        cleanupFns = [];

        const modal = document.getElementById('aluminum-modal');
        if (modal) modal.remove();

        const fenceModal = document.getElementById('fence-modal');
        if (fenceModal) fenceModal.remove();

        const fenceStyleModal = document.getElementById('fence-style-modal');
        if (fenceStyleModal) fenceStyleModal.remove();

        const gateStyleModal = document.getElementById('gate-style-modal');
        if (gateStyleModal) gateStyleModal.remove();

        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;

        Object.keys(elements).forEach((key) => { elements[key] = null; });
    }

    window.AluminumPage = { init, destroy };
})();
