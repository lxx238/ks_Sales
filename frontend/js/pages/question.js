(() => {
    let auth = null;
    let isAdmin = false;
    let currentUser = '';
    let currentRole = '';

    const state = {
        currentPage: 1,
        pageSize: 10,
        status: 'pending',
        total: 0,
        totalPages: 1,
        rowCount: 0,
        loading: false,
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

    function ensureStyles() {
        if (document.getElementById('question-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'question-inline-styles';
        style.textContent = `
            .q-notification {
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
            .q-notification.info { border-left: 4px solid #2563eb; }
            .q-notification.success { border-left: 4px solid #16a34a; }
            .q-notification.error { border-left: 4px solid #dc2626; }
            .q-modal {
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
            .q-modal-content {
                background: #fff;
                border-radius: 18px;
                padding: 24px;
                width: min(720px, calc(100vw - 32px));
                max-width: 720px;
                max-height: calc(100vh - 64px);
                overflow-y: auto;
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
            }
            .q-actions-row {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 14px;
                align-items: center;
            }
            .q-empty-tip {
                text-align: center;
                color: #94a3b8;
                padding: 40px 16px;
            }
            .q-pagination-bar {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: center;
                justify-content: space-between;
                margin-top: 16px;
            }
            .q-pagination-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
                justify-content: flex-end;
            }
            .q-page-buttons {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
            }
            .q-page-btn {
                min-width: 38px;
                padding: 6px 10px;
            }
            .q-page-btn.is-active {
                background: #0f766e;
                border-color: #0f766e;
                color: #fff;
            }
            .q-page-ellipsis {
                min-width: 24px;
                text-align: center;
                color: #64748b;
            }
            .q-page-jump {
                display: inline-flex;
                gap: 6px;
                align-items: center;
                color: #475569;
                font-size: 13px;
            }
            .q-page-jump input {
                width: 72px;
                min-width: 72px;
            }
            .q-reply-box {
                margin-top: 12px;
                padding: 14px;
                border-radius: 12px;
                background: #f0fdf4;
                border: 1px solid #bbf7d0;
            }
            .q-reply-meta {
                font-size: 12px;
                color: #64748b;
                margin-bottom: 6px;
            }
            .q-content-box {
                margin-top: 8px;
                padding: 12px;
                border-radius: 10px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                white-space: pre-wrap;
                word-break: break-word;
                font-size: 14px;
                line-height: 1.6;
            }
        `;
        document.head.appendChild(style);
    }

    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.q-notification');
        if (existing) existing.remove();
        const notification = document.createElement('div');
        notification.className = `q-notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        window.setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'all 0.3s ease';
            window.setTimeout(() => notification.remove(), 300);
        }, 2600);
    }

    function setStatus(element, message, type = 'info') {
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

    function getStatusTag(status) {
        if (status === 'answered') return '<span class="tag success">已回复</span>';
        if (status === 'closed') return '<span class="tag">已关闭</span>';
        return '<span class="tag warn">待回复</span>';
    }

    function getCategoryLabel(category) {
        return escapeHtml(category || '通用');
    }

    function buildMainMarkup() {
        const title = isAdmin ? '问答管理' : '我的提问';
        const intro = isAdmin
            ? '查看并回复各组员提出的关于数据库的问题。'
            : '在这里提出关于数据库的问题，管理员审核后会回复。';
        const addLabel = '提交问题';

        return `
            <h2>${title}</h2>
            <p>${intro}</p>
            <div class="toolbar" style="margin-bottom: 8px;">
              <span class="tag">当前页 <span id="q-current-count">0</span></span>
              <span class="tag">总问题 <span id="q-total-count">0</span></span>
            </div>
            <div id="q-section-status" class="notice" style="display: none; margin-bottom: 14px;"></div>
            <div class="q-actions-row">
              <label class="form-field" style="min-width: 200px;">
                <span>状态筛选</span>
                <select class="input" id="q-status-filter">
                  <option value="pending">待回复</option>
                  <option value="">全部</option>
                  <option value="answered">已回复</option>
                  <option value="closed">已关闭</option>
                </select>
              </label>
              <button class="btn primary" id="q-refresh-btn">刷新列表</button>
              <button class="btn primary" id="q-add-btn">${addLabel}</button>
            </div>
            <div style="overflow-x: auto; margin-top: 16px;">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>标题</th>
                    <th>分类</th>
                    <th>提交人</th>
                    <th>提交时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="q-table-body"></tbody>
              </table>
            </div>
            <div class="q-pagination-bar">
              <span id="q-pagination-info">共 0 条记录</span>
              <div class="q-pagination-controls">
                <button class="btn small" id="q-prev-page">上一页</button>
                <div class="q-page-buttons" id="q-page-buttons"></div>
                <span id="q-page-info">第 0 / 1 页</span>
                <button class="btn small" id="q-next-page">下一页</button>
                <label class="q-page-jump">
                  <span>跳到</span>
                  <input class="input" id="q-page-jump-input" type="number" min="1" step="1" placeholder="页码">
                  <button class="btn small" id="q-page-jump-btn" type="button">跳转</button>
                </label>
              </div>
            </div>
        `;
    }

    function buildSubmitModalMarkup() {
        return `
            <div class="q-modal-content">
              <h3 id="q-modal-title">提交问题</h3>
              <form id="q-submit-form">
                <div class="form-field">
                  <label for="q-input-title">标题 *</label>
                  <input class="input" id="q-input-title" name="title" placeholder="请输入问题标题" required />
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label for="q-input-category">分类</label>
                  <select class="input" id="q-input-category" name="category">
                    <option value="通用">通用</option>
                    <option value="铝材数据库">铝材数据库</option>
                    <option value="报价系统">报价系统</option>
                    <option value="CAD助手">CAD助手</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div class="form-field" style="margin-top: 12px;">
                  <label for="q-input-content">问题内容 *</label>
                  <textarea class="input" id="q-input-content" name="content" rows="6" placeholder="请详细描述您的问题" required style="resize: vertical; min-height: 120px;"></textarea>
                </div>
                <div class="form-actions" style="margin-top: 16px;">
                  <button class="btn primary" type="submit">提交</button>
                  <button class="btn" type="button" id="q-cancel-btn">取消</button>
                </div>
              </form>
            </div>
        `;
    }

    function buildDetailModalMarkup() {
        return `
            <div class="q-modal-content">
              <h3 id="q-detail-title">问题详情</h3>
              <div style="margin-top: 8px;">
                <div class="toolbar" style="margin-bottom: 8px;">
                  <span class="tag">分类: <span id="q-detail-category">-</span></span>
                  <span class="tag">提交人: <span id="q-detail-submitter">-</span></span>
                  <span id="q-detail-status-tag"></span>
                </div>
                <div style="font-size: 13px; color: #64748b; margin-bottom: 6px;">
                  提交时间: <span id="q-detail-submitted-at">-</span>
                </div>
                <div class="q-content-box" id="q-detail-content"></div>
              </div>
              <div id="q-detail-reply-section"></div>
              <div id="q-detail-admin-reply" style="margin-top: 16px; display: none;">
                <label for="q-reply-input" style="font-weight: 600; display: block; margin-bottom: 6px;">回复内容</label>
                <textarea class="input" id="q-reply-input" rows="4" placeholder="输入回复内容" style="resize: vertical; min-height: 100px;"></textarea>
                <div class="form-actions" style="margin-top: 12px;">
                  <button class="btn primary" id="q-reply-btn">提交回复</button>
                  <button class="btn warn" id="q-close-btn">关闭问题</button>
                  <button class="btn" id="q-detail-close-btn">关闭窗口</button>
                </div>
              </div>
              <div id="q-detail-employee-actions" style="margin-top: 16px; display: none;">
                <button class="btn" id="q-detail-employee-close-btn">关闭窗口</button>
              </div>
            </div>
        `;
    }

    function cacheElements() {
        elements.statusFilter = document.getElementById('q-status-filter');
        elements.refreshBtn = document.getElementById('q-add-btn') ? undefined : undefined;
        elements.refreshBtn = document.getElementById('q-refresh-btn');
        elements.addBtn = document.getElementById('q-add-btn');
        elements.tableBody = document.getElementById('q-table-body');
        elements.sectionStatus = document.getElementById('q-section-status');
        elements.currentCount = document.getElementById('q-current-count');
        elements.totalCount = document.getElementById('q-total-count');
        elements.paginationInfo = document.getElementById('q-pagination-info');
        elements.pageInfo = document.getElementById('q-page-info');
        elements.prevBtn = document.getElementById('q-prev-page');
        elements.nextBtn = document.getElementById('q-next-page');
        elements.pageButtons = document.getElementById('q-page-buttons');
        elements.pageJumpInput = document.getElementById('q-page-jump-input');
        elements.pageJumpBtn = document.getElementById('q-page-jump-btn');
    }

    function setLoading(loading) {
        state.loading = loading;
        [
            elements.statusFilter,
            elements.refreshBtn,
            elements.addBtn,
            elements.prevBtn,
            elements.nextBtn,
        ].forEach((el) => {
            if (el) el.disabled = loading;
        });
        if (loading && elements.tableBody) {
            elements.tableBody.innerHTML = '<tr><td colspan="7" class="q-empty-tip">正在加载...</td></tr>';
        }
    }

    function updateOverview() {
        if (elements.currentCount) elements.currentCount.textContent = String(state.rowCount);
        if (elements.totalCount) elements.totalCount.textContent = String(state.total);
    }

    function buildVisiblePageItems(currentPage, totalPages) {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
        if (currentPage <= 3) { pages.add(2); pages.add(3); pages.add(4); }
        if (currentPage >= totalPages - 2) { pages.add(totalPages - 1); pages.add(totalPages - 2); pages.add(totalPages - 3); }
        const normalized = Array.from(pages).filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
        const items = [];
        normalized.forEach((page, index) => {
            if (index > 0 && page - normalized[index - 1] > 1) items.push('ellipsis');
            items.push(page);
        });
        return items;
    }

    function renderPageButtons(container, currentPage, totalPages, onSelectPage) {
        if (!container) return;
        if (!totalPages || totalPages <= 0) { container.innerHTML = ''; return; }
        const items = buildVisiblePageItems(currentPage, totalPages);
        container.innerHTML = items.map((item) => {
            if (item === 'ellipsis') return '<span class="q-page-ellipsis">...</span>';
            const activeClass = item === currentPage ? ' is-active' : '';
            const disabledAttr = state.loading ? ' disabled' : '';
            return `<button class="btn small q-page-btn${activeClass}" type="button" data-page="${item}"${disabledAttr}>${item}</button>`;
        }).join('');
        container.querySelectorAll('button[data-page]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const nextPage = Number(btn.getAttribute('data-page'));
                if (Number.isInteger(nextPage)) onSelectPage(nextPage);
            });
        });
    }

    function updatePagination() {
        const safeTotalPages = state.total === 0 ? 0 : Math.max(state.totalPages || 0, 1);
        const currentPageLabel = state.total === 0 ? 0 : state.currentPage;
        if (elements.paginationInfo) elements.paginationInfo.textContent = `共 ${state.total} 条记录`;
        if (elements.pageInfo) elements.pageInfo.textContent = `第 ${currentPageLabel} / ${safeTotalPages} 页`;
        if (elements.prevBtn) elements.prevBtn.disabled = state.loading || state.currentPage <= 1 || state.total === 0;
        if (elements.nextBtn) elements.nextBtn.disabled = state.loading || state.currentPage >= safeTotalPages || state.total === 0;
        if (elements.pageJumpInput) {
            elements.pageJumpInput.disabled = state.loading || state.total === 0;
            elements.pageJumpInput.value = state.total === 0 ? '' : String(state.currentPage);
            elements.pageJumpInput.max = String(Math.max(safeTotalPages, 1));
        }
        if (elements.pageJumpBtn) elements.pageJumpBtn.disabled = state.loading || state.total === 0;
        renderPageButtons(elements.pageButtons, state.currentPage, safeTotalPages, goToPage);
    }

    function renderTable(data) {
        if (!elements.tableBody) return;
        elements.tableBody.innerHTML = '';
        state.rowCount = Array.isArray(data) ? data.length : 0;
        updateOverview();
        if (!data || data.length === 0) {
            elements.tableBody.innerHTML = '<tr><td colspan="7" class="q-empty-tip">当前没有符合条件的问题</td></tr>';
            return;
        }
        data.forEach((item) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(item.id)}</td>
                <td>${escapeHtml(item.title)}</td>
                <td>${getCategoryLabel(item.category)}</td>
                <td>
                  <div style="display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                    <span>${escapeHtml(item.submitter || '-')}</span>
                    <span class="tag">${escapeHtml(item.submitter_role || '-')}</span>
                  </div>
                </td>
                <td>${escapeHtml(item.submitted_at || '-')}</td>
                <td>${getStatusTag(item.status)}</td>
                <td>
                  <button class="btn small primary" data-action="view" data-id="${item.id}">查看</button>
                  ${isAdmin && item.status === 'pending' ? `<button class="btn small" data-action="reply" data-id="${item.id}">回复</button>` : ''}
                  ${isAdmin && item.status !== 'closed' ? `<button class="btn small" data-action="close" data-id="${item.id}">关闭</button>` : ''}
                </td>
            `;
            elements.tableBody.appendChild(row);
        });
        elements.tableBody.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.addEventListener('click', handleTableAction);
        });
    }

    async function loadQuestions() {
        try {
            setLoading(true);
            const requester = isAdmin ? '' : currentUser;
            const params = new URLSearchParams({
                page: String(state.currentPage),
                page_size: String(state.pageSize),
            });
            if (state.status) params.set('status', state.status);
            if (requester) params.set('submitter', requester);

            const result = await API.getQuestions(params);
            state.total = result.total || 0;
            state.totalPages = result.total_pages || 0;
            if (state.totalPages > 0 && state.currentPage > state.totalPages) {
                state.currentPage = state.totalPages;
                const fallbackParams = new URLSearchParams({
                    page: String(state.currentPage),
                    page_size: String(state.pageSize),
                });
                if (state.status) fallbackParams.set('status', state.status);
                if (requester) fallbackParams.set('submitter', requester);
                const fallback = await API.getQuestions(fallbackParams);
                state.total = fallback.total || 0;
                state.totalPages = fallback.total_pages || 0;
                renderTable(fallback.data || []);
            } else {
                renderTable(result.data || []);
            }
            updatePagination();
            setStatus(elements.sectionStatus,
                state.total > 0 ? `已加载 ${state.rowCount} 条问题，共 ${state.total} 条。` : '当前没有符合条件的问题。',
                'success'
            );
        } catch (error) {
            state.rowCount = 0;
            state.total = 0;
            state.totalPages = 0;
            renderTable([]);
            updatePagination();
            setStatus(elements.sectionStatus, error.message || '加载失败', 'error');
            showNotification(error.message || '加载失败', 'error');
        } finally {
            setLoading(false);
            updateOverview();
            updatePagination();
        }
    }

    let currentDetailId = null;

    async function showDetail(questionId) {
        currentDetailId = questionId;
        let modal = document.getElementById('q-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'q-detail-modal';
            modal.className = 'q-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = buildDetailModalMarkup();
        modal.style.display = 'flex';

        try {
            const result = await API.getQuestion(questionId);
            const q = result.data;
            document.getElementById('q-detail-title').textContent = q.title;
            document.getElementById('q-detail-category').textContent = getCategoryLabel(q.category);
            document.getElementById('q-detail-submitter').textContent = `${q.submitter} (${q.submitter_role || '-'})`;
            document.getElementById('q-detail-submitted-at').textContent = q.submitted_at || '-';
            document.getElementById('q-detail-content').textContent = q.content;
            document.getElementById('q-detail-status-tag').innerHTML = getStatusTag(q.status);

            const replySection = document.getElementById('q-detail-reply-section');
            if (q.reply) {
                replySection.innerHTML = `
                    <div class="q-reply-box">
                        <div class="q-reply-meta">
                            回复人: ${escapeHtml(q.reviewed_by || 'admin')} | 回复时间: ${escapeHtml(q.reviewed_at || '-')}
                        </div>
                        <div class="q-content-box" style="background: #fff; border-color: #bbf7d0;">${escapeHtml(q.reply)}</div>
                    </div>
                `;
            } else {
                replySection.innerHTML = '';
            }

            const adminReply = document.getElementById('q-detail-admin-reply');
            const employeeActions = document.getElementById('q-detail-employee-actions');

            if (isAdmin) {
                adminReply.style.display = '';
                employeeActions.style.display = 'none';
                if (q.status === 'closed') {
                    document.getElementById('q-reply-input').disabled = true;
                    document.getElementById('q-reply-btn').disabled = true;
                    document.getElementById('q-close-btn').disabled = true;
                }
            } else {
                adminReply.style.display = 'none';
                employeeActions.style.display = '';
            }

            document.getElementById('q-reply-btn')?.addEventListener('click', async () => {
                const reply = (document.getElementById('q-reply-input')?.value || '').trim();
                if (!reply) {
                    showNotification('回复内容不能为空', 'error');
                    return;
                }
                try {
                    await API.replyQuestion(questionId, reply);
                    showNotification('回复成功', 'success');
                    modal.style.display = 'none';
                    await loadQuestions();
                } catch (error) {
                    showNotification(error.message || '回复失败', 'error');
                }
            });

            document.getElementById('q-close-btn')?.addEventListener('click', async () => {
                if (!window.confirm('确认关闭此问题吗？')) return;
                try {
                    await API.closeQuestion(questionId);
                    showNotification('问题已关闭', 'success');
                    modal.style.display = 'none';
                    await loadQuestions();
                } catch (error) {
                    showNotification(error.message || '关闭失败', 'error');
                }
            });

            const closeWindowBtn = document.getElementById('q-detail-close-btn') || document.getElementById('q-detail-employee-close-btn');
            closeWindowBtn?.addEventListener('click', () => { modal.style.display = 'none'; });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        } catch (error) {
            showNotification(error.message || '获取详情失败', 'error');
            modal.style.display = 'none';
        }
    }

    function showSubmitModal() {
        let modal = document.getElementById('q-submit-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'q-submit-modal';
            modal.className = 'q-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = buildSubmitModalMarkup();
        modal.style.display = 'flex';

        const form = document.getElementById('q-submit-form');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = (document.getElementById('q-input-title')?.value || '').trim();
            const content = (document.getElementById('q-input-content')?.value || '').trim();
            const category = (document.getElementById('q-input-category')?.value || '').trim();

            if (!title || !content) {
                showNotification('标题和内容不能为空', 'error');
                return;
            }

            try {
                await API.submitQuestion({ title, content, category, submitter: currentUser, submitter_role: currentRole });
                showNotification('问题已提交，等待管理员回复', 'success');
                modal.style.display = 'none';
                await loadQuestions();
            } catch (error) {
                showNotification(error.message || '提交失败', 'error');
            }
        });

        document.getElementById('q-cancel-btn')?.addEventListener('click', () => { modal.style.display = 'none'; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    function handleTableAction(event) {
        const action = event.currentTarget.getAttribute('data-action');
        const id = Number(event.currentTarget.getAttribute('data-id'));
        if (action === 'view' || action === 'reply') showDetail(id);
        else if (action === 'close') {
            if (!window.confirm('确认关闭此问题吗？')) return;
            API.closeQuestion(id).then(() => {
                showNotification('问题已关闭', 'success');
                loadQuestions();
            }).catch((error) => {
                showNotification(error.message || '关闭失败', 'error');
            });
        }
    }

    function goToPage(page) {
        if (state.loading) return;
        const safeTotalPages = Math.max(state.totalPages || 0, 1);
        if (page < 1 || page > safeTotalPages) return;
        if (page === state.currentPage) return;
        state.currentPage = page;
        loadQuestions();
    }

    function addEventListenerSafe(target, type, handler) {
        if (!target) return;
        target.addEventListener(type, handler);
        cleanupFns.push(() => { target.removeEventListener(type, handler); });
    }

    function initEventListeners() {
        addEventListenerSafe(elements.statusFilter, 'change', () => {
            state.status = elements.statusFilter.value;
            state.currentPage = 1;
            loadQuestions();
        });
        addEventListenerSafe(elements.refreshBtn, 'click', () => loadQuestions());
        addEventListenerSafe(elements.addBtn, 'click', () => showSubmitModal());
        addEventListenerSafe(elements.prevBtn, 'click', () => goToPage(state.currentPage - 1));
        addEventListenerSafe(elements.nextBtn, 'click', () => goToPage(state.currentPage + 1));
        addEventListenerSafe(elements.pageJumpBtn, 'click', () => {
            const val = Number.parseInt(String(elements.pageJumpInput?.value || '').trim(), 10);
            if (Number.isInteger(val)) goToPage(val);
        });
        if (elements.pageJumpInput) {
            const handler = (e) => { if (e.key === 'Enter') { e.preventDefault(); elements.pageJumpBtn?.click(); } };
            elements.pageJumpInput.addEventListener('keydown', handler);
            cleanupFns.push(() => { elements.pageJumpInput.removeEventListener('keydown', handler); });
        }
    }

    const API = {
        getQuestions(params) {
            return requestJson(`/questions?${params.toString()}`, {
                headers: isAdmin
                    ? buildAuthHeaders({}, { adminOnly: true })
                    : buildAuthHeaders({}, { includeUser: true }),
            });
        },

        getQuestion(id) {
            return requestJson(`/questions/${id}`, {
                headers: buildAuthHeaders({}, { includeUser: true }),
            });
        },

        submitQuestion(data) {
            return requestJson('/questions', {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(data),
            });
        },

        replyQuestion(id, reply) {
            return requestJson(`/questions/${id}/reply`, {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }, { adminOnly: true }),
                body: JSON.stringify({ reply }),
            });
        },

        closeQuestion(id) {
            return requestJson(`/questions/${id}/close`, {
                method: 'POST',
                headers: buildAuthHeaders({}, { adminOnly: true }),
            });
        },
    };

    function init(container) {
        auth = window._ksAuth || null;
        isAdmin = !!(auth && auth.role === 'admin');
        currentUser = auth?.username || 'anonymous';
        currentRole = auth?.roleLabel || auth?.role || '';

        containerEl = container;
        cleanupFns = [];

        ensureStyles();
        containerEl.innerHTML = '';

        const section = document.createElement('section');
        section.className = 'section';
        section.innerHTML = buildMainMarkup();
        containerEl.appendChild(section);

        cacheElements();
        initEventListeners();
        updateOverview();
        updatePagination();
        loadQuestions();
    }

    function destroy() {
        cleanupFns.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
        cleanupFns = [];

        const submitModal = document.getElementById('q-submit-modal');
        if (submitModal) submitModal.remove();
        const detailModal = document.getElementById('q-detail-modal');
        if (detailModal) detailModal.remove();

        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
        Object.keys(elements).forEach((key) => { elements[key] = null; });
    }

    window.QuestionPage = { init, destroy };
})();
