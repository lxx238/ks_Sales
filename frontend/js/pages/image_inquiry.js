(() => {
    let auth = null;
    let currentUser = '';

    const GROUP_CONFIG = [
        { key: '韩语组', designer: '陈荣钦', email: 'crq@xmkseng.com' },
        { key: '日语组', designer: '洪礼安', email: 'hlan@xmkseng.com' },
        { key: '英语组', designer: 'RoyQuan', email: 'RoyQuan@xmkseng.com' },
    ];

    const state = {
        records: [],
        page: 1,
        pageSize: 20,
        total: 0,
        statusFilter: '',
        stats: { sent: 0, received: 0, parsed: 0, db_updated: 0, parse_failed: 0, total: 0 },
        loading: false,
        groupPending: {},
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

    function getStatusLabel(status) {
        if (status === 'sent') return '已发送';
        if (status === 'received' || status === 'image_received') return '已接收';
        if (status === 'parsed') return '已回复';
        if (status === 'db_updated') return '已入库';
        if (status === 'parse_failed') return '解析失败';
        return status || '—';
    }

    function getStatusClass(status) {
        if (status === 'parsed' || status === 'db_updated') return 'parsed';
        if (status === 'parse_failed') return 'failed';
        if (status === 'image_received') return 'received';
        return 'sent';
    }

    function buildStepLights(item) {
        const s = item.status || '';
        const hasReceived = !!item.received_at || s === 'received' || s === 'image_received' || s === 'parsed' || s === 'db_updated';
        const hasParsed = s === 'parsed' || s === 'db_updated';
        const hasDbUpdated = s === 'db_updated';
        const parseFailed = s === 'parse_failed';
        const steps = [
            { label: '转发', done: true },
            { label: '回复', done: hasReceived },
            { label: '解析', done: hasParsed, fail: parseFailed },
            { label: '数据库', done: hasDbUpdated },
        ];
        return '<div class="step-lights">' + steps.map((st, i) => {
            const cls = st.fail ? 'step-fail' : (st.done ? 'step-done' : 'step-pending');
            const sep = i < steps.length - 1
                ? '<span class="step-line ' + (st.done && steps[i + 1].done ? 'step-line-done' : '') + '"></span>' : '';
            return '<span class="step-dot ' + cls + '" title="' + st.label + '"></span>' + sep;
        }).join('') + '</div>';
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
    }

    function ensureStyles() {
        if (document.getElementById('image-inquiry-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'image-inquiry-inline-styles';
        style.textContent = `
            .image-inquiry-mgmt {
                display: grid;
                gap: 18px;
                margin-top: 20px;
                min-width: 0;
                overflow: hidden;
            }
            .image-inquiry-mgmt .section-card {
                background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
                border: 1px solid #dbe7f5;
                border-radius: 18px;
                padding: 18px;
                box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
                min-width: 0;
                overflow: hidden;
            }
            .image-inquiry-mgmt .section-card h2 {
                margin: 0 0 6px;
                font-size: 18px;
                color: #0f172a;
            }
            .image-inquiry-mgmt .section-note {
                margin: 0 0 16px;
                color: #64748b;
                font-size: 13px;
            }
            .image-inquiry-mgmt .cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                gap: 12px;
            }
            .image-inquiry-mgmt .metric-card {
                border-radius: 16px;
                padding: 14px 16px;
                border: 1px solid #d8e5f5;
                background: linear-gradient(160deg, #ffffff 0%, #eef6ff 100%);
            }
            .image-inquiry-mgmt .metric-label {
                font-size: 12px;
                color: #64748b;
                margin-bottom: 8px;
            }
            .image-inquiry-mgmt .metric-value {
                font-size: 28px;
                line-height: 1.1;
                color: #0f172a;
                font-weight: 700;
            }
            .image-inquiry-mgmt .toolbar-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
                margin-top: 14px;
            }
            .image-inquiry-mgmt .toolbar-actions .btn {
                min-width: 96px;
            }
            .image-inquiry-mgmt .count-bar {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin: 12px 0;
            }
            .image-inquiry-mgmt .count-chip {
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
            .image-inquiry-mgmt .filters {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: end;
                margin-top: 14px;
            }
            .image-inquiry-mgmt .table-wrap {
                overflow: auto;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                background: #fff;
                max-width: 100%;
                margin-top: 12px;
            }
            .image-inquiry-mgmt table {
                min-width: 700px;
                width: 100%;
                background: #fff;
            }
            .image-inquiry-mgmt th,
            .image-inquiry-mgmt td {
                white-space: nowrap;
                vertical-align: top;
                padding: 8px 12px;
            }
            .image-inquiry-mgmt .muted-cell {
                color: #94a3b8;
            }
            .image-inquiry-mgmt .status-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 600;
                border: 1px solid transparent;
            }
            .image-inquiry-mgmt .status-pill.sent {
                background: #fff7ed;
                color: #9a3412;
                border-color: #fed7aa;
            }
            .image-inquiry-mgmt .status-pill.parsed {
                background: #ecfdf5;
                color: #166534;
                border-color: #bbf7d0;
            }
            .image-inquiry-mgmt .status-pill.failed {
                background: #fef2f2;
                color: #b91c1c;
                border-color: #fecaca;
            }
            .image-inquiry-mgmt .empty-tip {
                padding: 32px 16px;
                text-align: center;
                color: #94a3b8;
            }
            .image-inquiry-mgmt .pagination {
                display: flex;
                justify-content: center;
                gap: 12px;
                margin-top: 14px;
            }
            .image-inquiry-mgmt .pagination .btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            .image-inquiry-mgmt .row-actions {
                display: flex;
                gap: 8px;
            }
            .image-inquiry-mgmt .step-lights {
                display: inline-flex;
                align-items: center;
                gap: 0;
            }
            .image-inquiry-mgmt .step-dot {
                display: inline-block;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                border: 2px solid #cbd5e1;
                background: #f1f5f9;
                position: relative;
            }
            .image-inquiry-mgmt .step-dot.step-done {
                background: #22c55e;
                border-color: #22c55e;
            }
            .image-inquiry-mgmt .step-dot.step-fail {
                background: #ef4444;
                border-color: #ef4444;
            }
            .image-inquiry-mgmt .step-dot.step-pending {
                background: #f1f5f9;
                border-color: #cbd5e1;
            }
            .image-inquiry-mgmt .step-line {
                display: inline-block;
                width: 16px;
                height: 2px;
                background: #e2e8f0;
                vertical-align: middle;
            }
            .image-inquiry-mgmt .step-line.step-line-done {
                background: #22c55e;
            }
            .image-inquiry-mgmt .manual-add-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
                padding: 10px 12px;
                background: #f8fafc;
                border: 1px dashed #cbd5e1;
                border-radius: 10px;
                flex-wrap: wrap;
            }
            .image-inquiry-mgmt .manual-add-row .input {
                font-size: 13px;
                padding: 6px 10px;
                border-radius: 6px;
                border: 1px solid #d1d5db;
            }
            .image-inquiry-mgmt .manual-add-row input[type="text"] {
                flex: 1;
                min-width: 120px;
            }
            .image-inquiry-mgmt .manual-add-row .name-display {
                font-size: 13px;
                color: #475569;
                min-width: 80px;
                max-width: 260px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .image-inquiry-mgmt .manual-add-row .name-display.found {
                color: #166534;
                font-weight: 600;
            }
            .image-inquiry-mgmt .manual-add-row .name-display.not-found {
                color: #b91c1c;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }

    function buildMainMarkup() {
        return `
            <section class="image-inquiry-mgmt">
              <div class="section-card">
                <h2>询图管理</h2>
                <p class="section-note">报价时存入缺图编码，周一统一发送询图邮件。查看发送状态、设计师回复情况及图片更新结果。</p>

                <div id="img-inq-records-panel">
                  <h3 style="margin:0 0 10px;">发送记录</h3>
                  <div class="cards">
                    <div class="metric-card">
                      <div class="metric-label">已发送</div>
                      <div class="metric-value" id="img-inq-stat-sent">0</div>
                    </div>
                    <div class="metric-card">
                      <div class="metric-label">已接收</div>
                      <div class="metric-value" id="img-inq-stat-received">0</div>
                    </div>
                    <div class="metric-card">
                      <div class="metric-label">已回复</div>
                      <div class="metric-value" id="img-inq-stat-parsed">0</div>
                    </div>
                    <div class="metric-card">
                      <div class="metric-label">已入库</div>
                      <div class="metric-value" id="img-inq-stat-db-updated">0</div>
                    </div>
                    <div class="metric-card">
                      <div class="metric-label">解析失败</div>
                      <div class="metric-value" id="img-inq-stat-failed">0</div>
                    </div>
                    <div class="metric-card">
                      <div class="metric-label">总记录</div>
                      <div class="metric-value" id="img-inq-stat-total">0</div>
                    </div>
                  </div>
                  <div class="toolbar-actions">
                    <button class="btn primary" id="img-inq-refresh-btn" type="button">刷新</button>
                    <button class="btn" id="img-inq-cleanup-btn" type="button">清理过期记录</button>
                    <button class="btn" id="img-inq-scan-btn" type="button">立即扫描邮件</button>
                  </div>
                  <div class="filters">
                    <label class="form-field">
                      <span>状态筛选</span>
                      <select class="input" id="img-inq-status-filter">
                        <option value="">全部</option>
                        <option value="sent">已发送</option>
                        <option value="received">已接收</option>
                        <option value="parsed">已回复</option>
                        <option value="db_updated">已入库</option>
                        <option value="parse_failed">解析失败</option>
                      </select>
                    </label>
                  </div>
                  <div class="count-bar">
                    <span class="count-chip">当前页: <strong id="img-inq-visible-count">0</strong></span>
                    <span class="count-chip">总记录: <strong id="img-inq-total-count">0</strong></span>
                    <span class="count-chip">第 <strong id="img-inq-page-num">1</strong> / <strong id="img-inq-page-total">1</strong> 页</span>
                  </div>
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>项目名</th>
                          <th>询价人</th>
                          <th>物料数</th>
                          <th>进度</th>
                          <th>最后更新</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody id="img-inq-records-body"></tbody>
                    </table>
                  </div>
                  <div class="pagination">
                    <button class="btn small" id="img-inq-prev-btn" type="button">上一页</button>
                    <button class="btn small" id="img-inq-next-btn" type="button">下一页</button>
                  </div>
                </div>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

                <div id="img-inq-pending-panel">
                  <h3 style="margin:0 0 10px;">待发送列表（按组）</h3>
                  <div class="toolbar-actions" style="margin-bottom:12px;">
                    <button class="btn" id="img-inq-refresh-pending-btn" type="button">刷新待发送</button>
                  </div>
                  <div id="img-inq-group-sections"></div>
                </div>

              </div>
            </section>
        `;
    }

    function cacheElements() {
        elements.statSent = document.getElementById('img-inq-stat-sent');
        elements.statReceived = document.getElementById('img-inq-stat-received');
        elements.statParsed = document.getElementById('img-inq-stat-parsed');
        elements.statDbUpdated = document.getElementById('img-inq-stat-db-updated');
        elements.statFailed = document.getElementById('img-inq-stat-failed');
        elements.statTotal = document.getElementById('img-inq-stat-total');
        elements.refreshBtn = document.getElementById('img-inq-refresh-btn');
        elements.cleanupBtn = document.getElementById('img-inq-cleanup-btn');
        elements.scanBtn = document.getElementById('img-inq-scan-btn');
        elements.statusFilter = document.getElementById('img-inq-status-filter');
        elements.visibleCount = document.getElementById('img-inq-visible-count');
        elements.totalCount = document.getElementById('img-inq-total-count');
        elements.pageNum = document.getElementById('img-inq-page-num');
        elements.pageTotal = document.getElementById('img-inq-page-total');
        elements.recordsBody = document.getElementById('img-inq-records-body');
        elements.prevBtn = document.getElementById('img-inq-prev-btn');
        elements.nextBtn = document.getElementById('img-inq-next-btn');
        elements.pendingPanel = document.getElementById('img-inq-pending-panel');
        elements.recordsPanel = document.getElementById('img-inq-records-panel');
        elements.refreshPendingBtn = document.getElementById('img-inq-refresh-pending-btn');
        elements.groupSections = document.getElementById('img-inq-group-sections');
    }

    function renderStats() {
        if (elements.statSent) elements.statSent.textContent = state.stats.sent || 0;
        if (elements.statReceived) elements.statReceived.textContent = state.stats.received || 0;
        if (elements.statParsed) elements.statParsed.textContent = state.stats.parsed || 0;
        if (elements.statDbUpdated) elements.statDbUpdated.textContent = state.stats.db_updated || 0;
        if (elements.statFailed) elements.statFailed.textContent = state.stats.parse_failed || 0;
        if (elements.statTotal) elements.statTotal.textContent = state.stats.total || 0;
    }

    function renderRecords() {
        if (!elements.recordsBody) return;

        const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
        if (elements.visibleCount) elements.visibleCount.textContent = state.records.length;
        if (elements.totalCount) elements.totalCount.textContent = state.total;
        if (elements.pageNum) elements.pageNum.textContent = state.page;
        if (elements.pageTotal) elements.pageTotal.textContent = totalPages;

        if (state.records.length === 0) {
            elements.recordsBody.innerHTML = '<tr><td colspan="7" class="empty-tip">暂无询图记录</td></tr>';
            return;
        }

        let html = '';
        state.records.forEach((record) => {
            const lastUpdate = record.db_updated_at || record.parsed_at || record.received_at || record.created_at || '';
            html += `<tr>
                <td>${record.id}</td>
                <td title="${escapeHtml(record.project_name)}">${escapeHtml((record.project_name || '').substring(0, 30))}</td>
                <td>${escapeHtml(record.sender_name)}</td>
                <td>${record.code_count}</td>
                <td>${buildStepLights(record)}</td>
                <td class="muted-cell">${escapeHtml((lastUpdate || '').substring(0, 16))}</td>
                <td class="row-actions">
                    <button class="btn small primary" data-detail-id="${record.id}" type="button">详情</button>
                </td>
            </tr>`;
        });
        elements.recordsBody.innerHTML = html;
    }

    async function loadStats() {
        try {
            const data = await requestJson('/image-inquiry-stats');
            if (data) {
                state.stats = {
                    sent: data.sent || 0,
                    received: data.received || 0,
                    parsed: data.parsed || 0,
                    db_updated: data.db_updated || 0,
                    parse_failed: data.parse_failed || 0,
                    total: data.total || 0,
                };
                renderStats();
            }
        } catch (error) {
            console.error('[ImageInquiry] loadStats failed:', error);
        }
    }

    async function loadRecords() {
        if (state.loading) return;
        state.loading = true;
        try {
            const params = new URLSearchParams();
            params.set('page', state.page);
            params.set('page_size', state.pageSize);
            if (state.statusFilter) params.set('status', state.statusFilter);
            const data = await requestJson(`/image-inquiry-records?${params.toString()}`);
            if (data) {
                state.records = data.records || [];
                state.total = data.total || 0;
                renderRecords();
            }
        } catch (error) {
            console.error('[ImageInquiry] loadRecords failed:', error);
            if (elements.recordsBody) {
                elements.recordsBody.innerHTML = `<tr><td colspan="7" class="empty-tip">加载失败: ${escapeHtml(error.message)}</td></tr>`;
            }
        } finally {
            state.loading = false;
        }
    }

    function renderGroupSections() {
        if (!elements.groupSections) return;
        let html = '';
        GROUP_CONFIG.forEach((group) => {
            const gState = state.groupPending[group.key] || { items: [], stats: {} };
            const stats = gState.stats;
            const items = gState.items || [];
            const pendingCount = stats.pending || 0;

            html += `
              <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:16px;background:#fff;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                  <div>
                    <h4 style="margin:0;display:inline;">${escapeHtml(group.key)}</h4>
                    <span style="font-size:12px;color:#64748b;margin-left:8px;">发送给: ${escapeHtml(group.designer)} (${escapeHtml(group.email)})</span>
                  </div>
                  <button class="btn primary" data-send-group="${escapeHtml(group.key)}" type="button" ${pendingCount === 0 ? 'disabled' : ''}>
                    发送${escapeHtml(group.key)}询图邮件 (${pendingCount} 个)
                  </button>
                </div>
                <div class="count-bar">
                  <span class="count-chip">待发送: <strong>${stats.pending || 0}</strong></span>
                  <span class="count-chip">已发送: <strong>${stats.sent || 0}</strong></span>
                  <span class="count-chip">已入库: <strong>${stats.db_updated || 0}</strong></span>
                  <span class="count-chip">失败: <strong>${stats.failed || 0}</strong></span>
                  <span class="count-chip">总计: <strong>${stats.total || 0}</strong></span>
                </div>
                <div class="manual-add-row" data-manual-add-group="${escapeHtml(group.key)}">
                  <span style="font-size:12px;font-weight:600;color:#475569;white-space:nowrap;">手动添加：</span>
                  <input type="text" class="input" placeholder="输入物料编码" data-code-input="${escapeHtml(group.key)}" style="max-width:180px;">
                  <span class="name-display" data-name-display="${escapeHtml(group.key)}">—</span>
                  <button class="btn small primary" data-manual-add-btn="${escapeHtml(group.key)}" type="button" disabled>添加</button>
                </div>
                <div class="table-wrap" style="margin-top:10px;">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>物料编码</th>
                        <th>工程品名</th>
                        <th>项目</th>
                        <th>次数</th>
                        <th>状态</th>
                        <th>创建时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody data-group-body="${escapeHtml(group.key)}">
                      ${items.length === 0 ? '<tr><td colspan="8" class="empty-tip">暂无待发送编码</td></tr>' : items.map((item, idx) => {
                        const statusLabel = item.status === 'pending' ? '待发送'
                            : item.status === 'sent' ? '已发送'
                            : item.status === 'db_updated' ? '已有图片'
                            : item.status === 'failed' ? '失败'
                            : item.status;
                        const statusCls = item.status === 'pending' ? 'sent' : item.status === 'db_updated' ? 'parsed' : item.status === 'failed' ? 'failed' : '';
                        return `<tr>
                          <td>${idx + 1}</td>
                          <td>${escapeHtml(item.material_code)}</td>
                          <td>${escapeHtml(item.material_name)}</td>
                          <td title="${escapeHtml(item.project_names)}">${escapeHtml((item.project_names || '').substring(0, 30))}</td>
                          <td>${item.pending_count || 1}</td>
                          <td><span class="status-pill ${statusCls}">${statusLabel}</span></td>
                          <td class="muted-cell">${escapeHtml((item.created_at || '').substring(0, 16))}</td>
                          <td class="row-actions">
                            ${item.status === 'pending' ? `<button class="btn small" data-delete-code="${escapeHtml(item.material_code)}" data-delete-group="${escapeHtml(group.key)}" type="button">删除</button>` : ''}
                          </td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>`;
        });
        elements.groupSections.innerHTML = html;
    }

    async function loadGroupPending() {
        const promises = GROUP_CONFIG.map(async (group) => {
            try {
                const [statsData, itemsData] = await Promise.all([
                    requestJson(`/image-inquiry-items-stats?source_group=${encodeURIComponent(group.key)}`),
                    requestJson(`/pending-image-items?source_group=${encodeURIComponent(group.key)}`),
                ]);
                state.groupPending[group.key] = {
                    stats: statsData || {},
                    items: (itemsData && itemsData.items) || [],
                };
            } catch (error) {
                console.error(`[ImageInquiry] loadGroupPending(${group.key}) failed:`, error);
                state.groupPending[group.key] = state.groupPending[group.key] || { items: [], stats: {} };
            }
        });
        await Promise.all(promises);
        renderGroupSections();
    }

    async function loadAll() {
        await Promise.all([loadStats(), loadRecords(), loadGroupPending()]);
    }

    function showDetailModal(record) {
        const existing = document.getElementById('img-inq-detail-modal');
        if (existing) existing.remove();

        const codes = record.codes || [];
        const reply = record.reply || [];

        let codesHtml = '';
        if (codes.length > 0) {
            codesHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">'
                + '<thead><tr style="background:#f3f4f6;">'
                + '<th style="border:1px solid #d1d5db;padding:4px 8px;text-align:left;">序号</th>'
                + '<th style="border:1px solid #d1d5db;padding:4px 8px;text-align:left;">工程编码</th>'
                + '</tr></thead><tbody>';
            codes.forEach((code, i) => {
                const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
                codesHtml += `<tr style="background:${bg};"><td style="border:1px solid #d1d5db;padding:4px 8px;">${i + 1}</td><td style="border:1px solid #d1d5db;padding:4px 8px;">${escapeHtml(code)}</td></tr>`;
            });
            codesHtml += '</tbody></table>';
        } else {
            codesHtml = '<p style="color:#94a3b8;">无编码数据</p>';
        }

        let replyHtml = '';
        if (reply.length > 0) {
            replyHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">'
                + '<thead><tr style="background:#f3f4f6;">'
                + '<th style="border:1px solid #d1d5db;padding:4px 8px;text-align:left;">编码</th>'
                + '<th style="border:1px solid #d1d5db;padding:4px 8px;text-align:left;">状态</th>'
                + '</tr></thead><tbody>';
            reply.forEach((item, i) => {
                const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
                replyHtml += `<tr style="background:${bg};"><td style="border:1px solid #d1d5db;padding:4px 8px;">${escapeHtml(item.code || item)}</td><td style="border:1px solid #d1d5db;padding:4px 8px;">${escapeHtml(item.status || '—')}</td></tr>`;
            });
            replyHtml += '</tbody></table>';
        } else {
            replyHtml = '<p style="color:#94a3b8;">暂无回复数据</p>';
        }

        const modal = document.createElement('div');
        modal.id = 'img-inq-detail-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;';
        modal.innerHTML = `
            <div style="width:min(900px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:20px;padding:20px;box-shadow:0 30px 80px rgba(15,23,42,0.25);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                    <h3 style="margin:0;">询图记录 #${record.id}</h3>
                    <button class="btn small" id="img-inq-close-detail" type="button">关闭</button>
                </div>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
                     <span class="count-chip">项目: <strong>${escapeHtml(record.project_name || '—')}</strong></span>
                     <span class="count-chip">发送人: <strong>${escapeHtml(record.sender_name || '—')}</strong></span>
                     <span class="count-chip">设计者: <strong>${escapeHtml(record.designer_email || '—')}</strong></span>
                     <span class="count-chip">状态: ${getStatusLabel(record.status)}</span>
                     <span class="count-chip">图片更新: <strong>${record.images_updated || 0} 张</strong></span>
                     <span class="count-chip">编码数: <strong>${record.code_count || 0}</strong></span>
                     <button class="btn small" id="img-inq-reparse-btn" type="button" style="${!record.images_json || record.status === 'db_updated' ? 'display:none;' : ''}">重新解析</button>
                 </div>
                ${record.remark ? `<div style="background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:13px;color:#92400e;margin-bottom:12px;">备注: ${escapeHtml(record.remark)}</div>` : ''}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                    <div>
                        <h4 style="margin:0 0 4px;">缺失图片编码</h4>
                        <div style="max-height:300px;overflow:auto;">${codesHtml}</div>
                    </div>
                    <div>
                        <h4 style="margin:0 0 4px;">回复解析结果</h4>
                        <div style="max-height:300px;overflow:auto;">${replyHtml}</div>
                    </div>
                </div>
                <div style="margin-top:12px;color:#64748b;font-size:12px;">
                    发送时间: ${escapeHtml(record.created_at || '—')}
                    ${record.reply_received_at ? ` | 回复时间: ${escapeHtml(record.reply_received_at)}` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = document.getElementById('img-inq-close-detail');
        const reparseBtn = document.getElementById('img-inq-reparse-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.remove());
        }
        if (reparseBtn) {
            reparseBtn.addEventListener('click', async () => {
                const targetBtn = reparseBtn;
                targetBtn.disabled = true;
                targetBtn.textContent = '解析中...';
                try {
                    const data = await requestJson(`/image-inquiry-records/${record.id}/reparse`, { method: 'POST' });
                    alert(data.message || '解析完成');
                    loadAll();
                } catch (error) {
                    alert('解析失败: ' + error.message);
                } finally {
                    targetBtn.disabled = false;
                    targetBtn.textContent = '重新解析';
                    modal.remove();
                }
            });
        }
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    function bindEvents() {
        if (elements.groupSections) {
            elements.groupSections.addEventListener('click', async (e) => {
                const sendBtn = e.target.closest('[data-send-group]');
                if (sendBtn) {
                    const group = sendBtn.getAttribute('data-send-group');
                    if (!confirm(`确认发送${group}的所有待询图编码？`)) return;
                    sendBtn.disabled = true;
                    try {
                        const cfg = GROUP_CONFIG.find(g => g.key === group);
                        const data = await requestJson('/send-weekly-image-inquiry', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ source_group: group }),
                        });
                        alert(data.message || '发送完成');
                        loadAll();
                    } catch (error) {
                        alert('发送失败: ' + error.message);
                    } finally {
                        sendBtn.disabled = false;
                    }
                    return;
                }

                const delBtn = e.target.closest('[data-delete-code]');
                if (delBtn) {
                    const code = delBtn.getAttribute('data-delete-code');
                    const group = delBtn.getAttribute('data-delete-group') || '';
                    if (!confirm(`确认删除编码 ${code}？`)) return;
                    try {
                        await requestJson(`/pending-image-items/${encodeURIComponent(code)}?source_group=${encodeURIComponent(group)}`, { method: 'DELETE' });
                        loadGroupPending();
                    } catch (error) {
                        alert('删除失败: ' + error.message);
                    }
                }

                const manualAddBtn = e.target.closest('[data-manual-add-btn]');
                if (manualAddBtn) {
                    const group = manualAddBtn.getAttribute('data-manual-add-btn');
                    const codeInput = elements.groupSections.querySelector(`[data-code-input="${group}"]`);
                    const nameDisplay = elements.groupSections.querySelector(`[data-name-display="${group}"]`);
                    if (!codeInput) return;
                    const code = codeInput.value.trim();
                    if (!code) return;
                    manualAddBtn.disabled = true;
                    manualAddBtn.textContent = '添加中...';
                    try {
                        const nameEl = nameDisplay || {};
                        const resolvedName = (nameEl._resolvedName || '');
                        const data = await requestJson('/save-image-inquiry-items', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                items: [{ code: code, name: resolvedName }],
                                project_name: '手动添加',
                                source_group: group,
                            }),
                        });
                        alert(data.message || '添加成功');
                        codeInput.value = '';
                        if (nameDisplay) {
                            nameDisplay.textContent = '—';
                            nameDisplay.className = 'name-display';
                            nameDisplay._resolvedName = '';
                        }
                        loadGroupPending();
                    } catch (error) {
                        alert('添加失败: ' + error.message);
                    } finally {
                        manualAddBtn.disabled = false;
                        manualAddBtn.textContent = '添加';
                        manualAddBtn.disabled = !(codeInput.value.trim());
                    }
                }
            });

            let _lookupTimers = {};
            elements.groupSections.addEventListener('input', (e) => {
                const codeInput = e.target.closest('[data-code-input]');
                if (!codeInput) return;
                const group = codeInput.getAttribute('data-code-input');
                const nameDisplay = elements.groupSections.querySelector(`[data-name-display="${group}"]`);
                const addBtn = elements.groupSections.querySelector(`[data-manual-add-btn="${group}"]`);
                const code = codeInput.value.trim();

                if (addBtn) addBtn.disabled = !code;
                if (!code) {
                    if (nameDisplay) {
                        nameDisplay.textContent = '—';
                        nameDisplay.className = 'name-display';
                        nameDisplay._resolvedName = '';
                    }
                    return;
                }
                if (nameDisplay) {
                    nameDisplay.textContent = '查询中...';
                    nameDisplay.className = 'name-display';
                    nameDisplay._resolvedName = '';
                }
                if (_lookupTimers[group]) clearTimeout(_lookupTimers[group]);
                _lookupTimers[group] = setTimeout(async () => {
                    try {
                        const data = await requestJson(`/lookup-material-name?code=${encodeURIComponent(code)}`);
                        if (nameDisplay) {
                            if (data.success) {
                                const displayName = data.name || data.name_ko || data.name_en || '';
                                nameDisplay.textContent = displayName || '（无品名）';
                                nameDisplay.className = 'name-display found';
                                nameDisplay._resolvedName = displayName;
                            } else {
                                nameDisplay.textContent = '未找到';
                                nameDisplay.className = 'name-display not-found';
                                nameDisplay._resolvedName = '';
                            }
                        }
                    } catch (error) {
                        if (nameDisplay) {
                            nameDisplay.textContent = '查询失败';
                            nameDisplay.className = 'name-display not-found';
                            nameDisplay._resolvedName = '';
                        }
                    }
                }, 400);
            });
        }

        if (elements.refreshPendingBtn) {
            elements.refreshPendingBtn.addEventListener('click', () => {
                loadGroupPending();
            });
        }

        if (elements.refreshBtn) {
            elements.refreshBtn.addEventListener('click', () => {
                loadStats();
                loadRecords();
            });
        }

        if (elements.cleanupBtn) {
            elements.cleanupBtn.addEventListener('click', async () => {
                try {
                    const data = await requestJson('/image-inquiry-cleanup', { method: 'POST' });
                    alert(data.message || '清理完成');
                    loadAll();
                } catch (error) {
                    alert('清理失败: ' + error.message);
                }
            });
        }

        if (elements.scanBtn) {
            elements.scanBtn.addEventListener('click', async () => {
                elements.scanBtn.disabled = true;
                elements.scanBtn.textContent = '扫描中...';
                try {
                    let data = await requestJson('/inquiry-scan-now', { method: 'POST', body: JSON.stringify({ include_seen: true }), headers: { 'Content-Type': 'application/json' } });
                    if (data.skipped) {
                        await new Promise(r => setTimeout(r, 3000));
                        data = await requestJson('/inquiry-scan-now', { method: 'POST', body: JSON.stringify({ include_seen: true }), headers: { 'Content-Type': 'application/json' } });
                    }
                    alert(data.skipped ? '扫描繁忙，请稍后再试' : (data.message || '扫描完成'));
                    loadAll();
                } catch (error) {
                    alert('扫描失败: ' + error.message);
                } finally {
                    elements.scanBtn.disabled = false;
                    elements.scanBtn.textContent = '立即扫描邮件';
                }
            });
        }

        if (elements.statusFilter) {
            elements.statusFilter.addEventListener('change', () => {
                state.statusFilter = elements.statusFilter.value;
                state.page = 1;
                loadRecords();
            });
        }

        if (elements.prevBtn) {
            elements.prevBtn.addEventListener('click', () => {
                if (state.page > 1) {
                    state.page--;
                    loadRecords();
                }
            });
        }

        if (elements.nextBtn) {
            elements.nextBtn.addEventListener('click', () => {
                const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
                if (state.page < totalPages) {
                    state.page++;
                    loadRecords();
                }
            });
        }

        if (elements.recordsBody) {
            elements.recordsBody.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-detail-id]');
                if (!btn) return;
                const recordId = parseInt(btn.getAttribute('data-detail-id'), 10);
                try {
                    const data = await requestJson(`/image-inquiry-records/${recordId}`);
                    if (data && data.record) {
                        showDetailModal(data.record);
                    }
                } catch (error) {
                    alert('加载详情失败: ' + error.message);
                }
            });
        }
    }

    function init(container, options = {}) {
        auth = options.auth || window.__ksAuth || null;
        currentUser = options.currentUser || auth?.user || '';

        state.records = [];
        state.page = 1;
        state.total = 0;
        state.statusFilter = '';
        state.stats = { sent: 0, received: 0, parsed: 0, db_updated: 0, parse_failed: 0, total: 0 };
        state.groupPending = {};

        containerEl = container;
        cleanupFns = [];

        ensureStyles();
        containerEl.innerHTML = buildMainMarkup();
        cacheElements();
        bindEvents();
        loadAll();
    }

    function destroy() {
        cleanupFns.forEach((fn) => { try { fn(); } catch (error) { /* ignore */ } });
        cleanupFns = [];
        const modal = document.getElementById('img-inq-detail-modal');
        if (modal) modal.remove();
        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
        Object.keys(elements).forEach((key) => { elements[key] = null; });
    }

    window.ImageInquiryPage = { init, destroy };
})();
