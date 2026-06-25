(() => {
    let auth = null;
    let currentUser = '';
    let currentRole = '';
    let containerEl = null;
    let cleanupFns = [];

    const state = {
        tab: 'calendar',
        year: 0,
        month: 0,
        selectedDate: '',
        monthData: {},
        dayItems: [],
    };

    const RULES = [
        { key: 'point', label: '准点提醒' },
        { key: 'before_5', label: '提前5分钟' },
        { key: 'before_10', label: '提前10分钟' },
        { key: 'before_15', label: '提前15分钟' },
        { key: 'before_30', label: '提前30分钟' },
        { key: 'before_1h', label: '提前1小时' },
        { key: 'before_1day', label: '提前1天' },
    ];

    const CATEGORIES = ['会议', '出差', '接待', '电话', '其他'];
    const PERIODS = [
        { key: 'morning', label: '早晨（08:30）' },
        { key: 'noon', label: '中午（13:30）' },
        { key: 'evening', label: '晚上（17:30）' },
        { key: 'allday', label: '全天' },
    ];
    const PRIORITIES = [
        { key: 'high', label: '高', emoji: '🔴' },
        { key: 'medium', label: '中', emoji: '🟡' },
        { key: 'low', label: '低', emoji: '⚪' },
    ];
    const STATUS_LIST = [
        { key: 'pending', label: '待办', cls: 'sc-status-pending' },
        { key: 'doing', label: '进行中', cls: 'sc-status-doing' },
        { key: 'done', label: '已完成', cls: 'sc-status-done' },
        { key: 'cancelled', label: '已取消', cls: 'sc-status-cancelled' },
    ];

    function apiBase() {
        return (typeof KS_API_BASE_URL !== 'undefined' && KS_API_BASE_URL)
            ? KS_API_BASE_URL : '/api';
    }

    function apiUrl(path) {
        const p = String(path || '').startsWith('/') ? path : `/${path}`;
        return `${apiBase()}/schedule${p}`;
    }

    function authHeaders(extra = {}) {
        const headers = { ...extra };
        const u = String(currentUser || '').trim();
        if (u && Array.from(u).every((c) => c.codePointAt(0) <= 0xFF)) {
            headers['X-KS-User'] = u;
        }
        return headers;
    }

    async function req(path, options = {}) {
        const url = apiUrl(path);
        const fetchOpts = { credentials: 'same-origin', ...options };
        let response;
        try {
            response = await fetch(url, fetchOpts);
        } catch (e) {
            throw new Error(`无法连接接口: ${e.message}`);
        }
        let payload = {};
        const text = await response.text();
        if (text) {
            try { payload = JSON.parse(text); }
            catch (e) {
                throw new Error(`接口返回非 JSON (HTTP ${response.status})`);
            }
        }
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || `请求失败 (HTTP ${response.status})`);
        }
        return payload;
    }

    function postJson(path, body) {
        return req(path, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body || {}),
        });
    }

    function putJson(path, body) {
        return req(path, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body || {}),
        });
    }

    function del(path) {
        return req(path, { method: 'DELETE', headers: authHeaders() });
    }

    function fmtDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function todayStr() {
        return fmtDate(new Date());
    }

    function priorityMeta(key) {
        return PRIORITIES.find((p) => p.key === key) || PRIORITIES[1];
    }

    function statusMeta(key) {
        return STATUS_LIST.find((s) => s.key === key) || STATUS_LIST[0];
    }

    function notify(msg, type = 'info') {
        const old = document.querySelector('.sc-toast');
        if (old) old.remove();
        const el = document.createElement('div');
        el.className = `sc-toast q-notification ${type}`;
        el.textContent = msg;
        el.style.cssText = 'position:fixed;top:20px;right:20px;padding:14px 20px;border-radius:12px;background:#fff;box-shadow:0 12px 24px rgba(0,0,0,.15);z-index:3000;max-width:420px;border-left:4px solid #2563eb;';
        document.body.appendChild(el);
        setTimeout(() => { el.style.transition = 'all .3s'; el.style.opacity = '0'; el.style.transform = 'translateX(100%)'; setTimeout(() => el.remove(), 300); }, 2600);
    }

    function setStatusLine(el, msg, type = 'info') {
        if (!el) return;
        if (!msg) { el.className = 'sc-status-line'; el.textContent = ''; return; }
        el.className = `sc-status-line is-${type}`;
        el.textContent = msg;
    }

    function buildMainMarkup() {
        return `
            <h2>总助日程提醒</h2>
            <p class="muted">维护老板日程，每天 08:00 自动发送今日行程晨报，并在日程对应时间通过钉钉工作通知提醒老板。</p>
            <div class="sc-tabs">
              <button class="sc-tab is-active" data-tab="calendar">📅 月历预览</button>
              <button class="sc-tab" data-tab="today">📋 今日行程</button>
              <button class="sc-tab" data-tab="settings">⚙️ 提醒 / 钉钉设置</button>
              <button class="sc-tab" data-tab="logs">📜 发送日志</button>
            </div>

            <div class="sc-panel is-active" id="sc-panel-calendar">
              <div class="sc-cal-head">
                <h3 class="sc-cal-title" id="sc-cal-title">-</h3>
                <div class="toolbar" style="margin:0;">
                  <button class="btn small" id="sc-prev-month">‹ 上月</button>
                  <button class="btn small" id="sc-today-btn">今天</button>
                  <button class="btn small" id="sc-next-month">下月 ›</button>
                  <button class="btn primary small" id="sc-add-btn">+ 新增日程</button>
                </div>
              </div>
              <div class="sc-cal-grid" id="sc-cal-dow">
                ${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<div class="sc-cal-dow">${d}</div>`).join('')}
              </div>
              <div class="sc-cal-grid" id="sc-cal-grid" style="margin-top:6px;"></div>
              <div class="sc-layout">
                <div></div>
                <div class="sc-day-panel" id="sc-day-panel"></div>
              </div>
            </div>

            <div class="sc-panel" id="sc-panel-today">
              <div class="sc-day-panel">
                <div class="sc-day-head">
                  <h3 id="sc-today-title">今日行程</h3>
                  <button class="btn primary small" id="sc-add-today">+ 新增日程</button>
                </div>
                <div id="sc-today-list" class="sc-timeline"></div>
              </div>
            </div>

            <div class="sc-panel" id="sc-panel-settings">
              <div class="sc-status-line" id="sc-settings-status"></div>
              <div class="sc-config-card">
                <h4>每日日报</h4>
                <div class="sc-config-row">
                  <label class="sc-check" id="sc-briefing-enabled-wrap">
                    <input type="checkbox" id="sc-briefing-enabled"> 启用每日日报
                  </label>
                  <label class="form-field" style="min-width:140px;">
                    <span>发送时间</span>
                    <input class="input" type="time" id="sc-briefing-time" value="08:00">
                  </label>
                  <label class="form-field" style="min-width:200px;">
                    <span>发送形式</span>
                    <select class="input" id="sc-briefing-format">
                      <option value="card">卡片（机器人对话窗口）</option>
                      <option value="announcement">公告（公告模块，需管理员权限）</option>
                    </select>
                  </label>
                  <button class="btn primary small" id="sc-briefing-save">保存</button>
                  <button class="btn small" id="sc-briefing-test">立即发送日报</button>
                </div>
                <div class="sc-note">启用后，每天到点自动把当日全部待办/进行中行程（按时段分组）发给老板。</div>
              </div>

              <div class="sc-config-card">
                <h4>周报</h4>
                <div class="sc-config-row">
                  <label class="sc-check" id="sc-weekly-enabled-wrap">
                    <input type="checkbox" id="sc-weekly-enabled"> 启用周报
                  </label>
                  <label class="form-field" style="min-width:140px;">
                    <span>每周一发「本周」（时间）</span>
                    <input class="input" type="time" id="sc-weekly-mon-time" value="08:30">
                  </label>
                  <label class="form-field" style="min-width:140px;">
                    <span>每周五发「下周」（时间）</span>
                    <input class="input" type="time" id="sc-weekly-fri-time" value="17:30">
                  </label>
                  <button class="btn small" id="sc-weekly-test-this">试发本周</button>
                  <button class="btn small" id="sc-weekly-test-next">试发下周</button>
                  <button class="btn small" id="sc-briefing-weekly" title="打开本周行程表静态页">预览本周行程表</button>
                </div>
                <div class="sc-note">每周一发出本周行程表、每周五发出下周行程表（按天列出，标注时段）。</div>
              </div>

              <div class="sc-config-card">
                <h4>钉钉机器人（发提醒）</h4>
                <div class="sc-config-row" id="sc-dt-status"></div>
                <div class="toolbar" style="margin-top:6px;">
                  <button class="btn primary small" id="sc-dt-test">测试发送</button>
                </div>
                <div class="sc-note">两种方式二选一，在服务器 <code>.env.local</code> 配置后点「测试发送」即时生效：<br>
                  • <b>群机器人（推荐，最简单）</b>：钉钉群 → 群设置 → 智能群助手 → 添加「自定义」机器人 → 安全设置选「加签」→ 复制 <code>Webhook</code> 和 <code>加签 secret</code>，填到 <code>KS_DINGTALK_WEBHOOK</code> / <code>KS_DINGTALK_WEBHOOK_SECRET</code>。<br>
                  • <b>工作通知（定向给老板）</b>：在 open-dev 创建企业内部应用，填 <code>KS_DINGTALK_APP_KEY/APP_SECRET/AGENT_ID</code> + 老板 <code>BOSS_USERID</code> 或 <code>BOSS_MOBILE</code>。<br>
                  配置了 Webhook 即优先用 Webhook（消息发到该群，老板需在群内）。</div>
              </div>
            </div>

            <div class="sc-panel" id="sc-panel-logs">
              <div class="toolbar">
                <button class="btn small" id="sc-logs-refresh">刷新</button>
              </div>
              <div style="overflow-x:auto;margin-top:12px;">
                <table class="sc-log-table">
                  <thead><tr><th>时间</th><th>类型</th><th>结果</th><th>接收人</th><th>task_id</th><th>说明</th></tr></thead>
                  <tbody id="sc-logs-body"></tbody>
                </table>
              </div>
            </div>
        `;
    }

    function switchTab(tab) {
        state.tab = tab;
        containerEl.querySelectorAll('.sc-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
        containerEl.querySelectorAll('.sc-panel').forEach((p) => p.classList.toggle('is-active', p.id === `sc-panel-${tab}`));
        if (tab === 'today') loadDay(todayStr(), true);
        if (tab === 'settings') loadSettings();
        if (tab === 'logs') loadLogs();
    }

    // ---------------- 日历 ----------------

    function buildCalendarCells(year, month) {
        const first = new Date(year, month - 1, 1);
        const firstWeekday = (first.getDay() + 6) % 7; // 0=Monday
        const start = new Date(year, month - 1, 1 - firstWeekday);
        const cells = [];
        const tStr = todayStr();
        for (let i = 0; i < 42; i++) {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const ds = fmtDate(d);
            cells.push({
                dateStr: ds,
                day: d.getDate(),
                inMonth: d.getMonth() === month - 1,
                isToday: ds === tStr,
            });
        }
        return cells;
    }

    function renderCalendar() {
        const titleEl = containerEl.querySelector('#sc-cal-title');
        if (titleEl) titleEl.textContent = `${state.year}年 ${state.month}月`;
        const grid = containerEl.querySelector('#sc-cal-grid');
        if (!grid) return;
        const cells = buildCalendarCells(state.year, state.month);
        grid.innerHTML = cells.map((c) => {
            const cell = state.monthData[c.dateStr];
            const count = cell ? cell.active : 0;
            const allCount = cell ? cell.count : 0;
            let dot = '';
            if (cell && cell.items.length) {
                const active = cell.items.filter((it) => it.status === 'pending' || it.status === 'doing');
                if (active.length) {
                    const top = active.reduce((a, b) => rankPrio(a.priority) <= rankPrio(b.priority) ? a : b);
                    dot = `<span class="sc-cal-dot ${top.priority}">●</span>`;
                }
            }
            const countBadge = allCount ? `<span class="sc-cal-count">${allCount}</span>` : '';
            const cls = ['sc-cal-cell'];
            if (!c.inMonth) cls.push('is-other');
            if (c.isToday) cls.push('is-today');
            if (state.selectedDate === c.dateStr) cls.push('is-selected');
            return `<div class="${cls.join(' ')}" data-date="${c.dateStr}">
                <span class="sc-cal-day">${c.day}</span>
                <div class="sc-cal-badges">${dot}</div>
                ${countBadge}
            </div>`;
        }).join('');
        grid.querySelectorAll('.sc-cal-cell[data-date]').forEach((el) => {
            el.addEventListener('click', () => selectDate(el.dataset.date));
        });
    }

    function rankPrio(p) {
        return p === 'high' ? 0 : (p === 'medium' ? 1 : 2);
    }

    async function loadMonth() {
        try {
            const res = await req(`/month?year=${state.year}&month=${state.month}`);
            state.monthData = res.data || {};
            renderCalendar();
        } catch (e) {
            notify(e.message || '加载月历失败', 'error');
        }
    }

    async function selectDate(dateStr) {
        state.selectedDate = dateStr;
        renderCalendar();
        await loadDay(dateStr, false);
    }

    // ---------------- 日程时间轴 ----------------

    function periodLabel(it) {
        const m = { morning: '早晨', noon: '中午', evening: '晚上', allday: '全天' };
        return m[it.time_period] || (it.is_all_day ? '全天' : '早晨');
    }

    function itemMarkup(it) {
        const pm = priorityMeta(it.priority);
        const sm = statusMeta(it.status);
        const parts = [];
        if (it.location) parts.push(`📍 ${escapeHtml(it.location)}`);
        if (it.category) parts.push(escapeHtml(it.category));
        if (it.participants && it.participants.length) parts.push(`👥 ${escapeHtml(it.participants.join('、'))}`);
        if (it.remark) parts.push(`📝 ${escapeHtml(it.remark)}`);
        const cls = ['sc-item', `priority-${it.priority}`];
        if (it.status === 'done') cls.push('is-done');
        if (it.status === 'cancelled') cls.push('is-cancelled');
        const statusBtns = STATUS_LIST.map((s) =>
            `<button class="btn small ${it.status === s.key ? 'primary' : ''}" data-status="${s.key}" data-id="${it.id}">${s.label}</button>`
        ).join('');
        return `<div class="${cls.join(' ')}">
            <div class="sc-item-row">
                <span class="sc-item-time">${escapeHtml(periodLabel(it))}</span>
                <span class="sc-item-title">${escapeHtml(it.title)}</span>
                <span class="sc-status-tag ${sm.cls}">${sm.label}</span>
                <span class="sc-mini-muted">${pm.emoji} ${pm.label}</span>
            </div>
            ${parts.length ? `<div class="sc-item-meta">${parts.join(' · ')}</div>` : ''}
            <div class="sc-item-actions">
                ${statusBtns}
                <button class="btn small" data-act="edit" data-id="${it.id}">编辑</button>
                <button class="btn small warn" data-act="del" data-id="${it.id}">删除</button>
            </div>
        </div>`;
    }

    function renderTimeline(containerId, items) {
        const el = containerEl.querySelector(`#${containerId}`);
        if (!el) return;
        if (!items || items.length === 0) {
            el.innerHTML = '<div class="sc-empty">暂无行程安排</div>';
            return;
        }
        const pOrder = { morning: 0, noon: 1, evening: 2, allday: 3 };
        const sorted = items.slice().sort((a, b) =>
            (pOrder[a.time_period] ?? 9) - (pOrder[b.time_period] ?? 9)
        );
        el.innerHTML = sorted.map(itemMarkup).join('');
        el.querySelectorAll('button[data-status]').forEach((b) => {
            b.addEventListener('click', () => changeStatus(Number(b.dataset.id), b.dataset.status));
        });
        el.querySelectorAll('button[data-act="edit"]').forEach((b) => {
            b.addEventListener('click', () => openEditModal(Number(b.dataset.id)));
        });
        el.querySelectorAll('button[data-act="del"]').forEach((b) => {
            b.addEventListener('click', () => deleteSchedule(Number(b.dataset.id)));
        });
    }

    async function loadDay(dateStr, isToday) {
        try {
            const res = await req(`/day?date=${encodeURIComponent(dateStr)}`);
            const items = res.data || [];
            if (isToday) {
                renderTimeline('sc-today-list', items);
            } else {
                state.dayItems = items;
                renderDayPanel(dateStr, items);
            }
        } catch (e) {
            notify(e.message || '加载行程失败', 'error');
        }
    }

    function renderDayPanel(dateStr, items) {
        const panel = containerEl.querySelector('#sc-day-panel');
        if (!panel) return;
        const active = items.filter((it) => it.status === 'pending' || it.status === 'doing').length;
        panel.innerHTML = `
            <div class="sc-day-head">
                <h3>${escapeHtml(dateStr)} 行程</h3>
                <button class="btn primary small" data-add-on="${dateStr}">+ 新增</button>
            </div>
            <div class="sc-mini-muted" style="margin-bottom:10px;">共 ${items.length} 项，待办/进行中 ${active} 项</div>
            <div class="sc-timeline" id="sc-day-list"></div>
        `;
        renderTimeline('sc-day-list', items);
        const addBtn = panel.querySelector('button[data-add-on]');
        if (addBtn) addBtn.addEventListener('click', () => openCreateModal(dateStr));
    }

    // ---------------- 状态/删除 ----------------

    async function changeStatus(id, status) {
        try {
            await postJson(`/${id}/status`, { status });
            notify('状态已更新', 'success');
            await refreshAll();
        } catch (e) {
            notify(e.message || '更新失败', 'error');
        }
    }

    async function deleteSchedule(id) {
        if (!window.confirm('确认删除该日程？关联的提醒将被取消。')) return;
        try {
            await del(`/${id}`);
            notify('日程已删除', 'success');
            await refreshAll();
        } catch (e) {
            notify(e.message || '删除失败', 'error');
        }
    }

    async function refreshAll() {
        await loadMonth();
        if (state.tab === 'today') {
            await loadDay(todayStr(), true);
        } else if (state.selectedDate) {
            await loadDay(state.selectedDate, false);
        } else {
            await loadDay(todayStr(), false);
        }
    }

    // ---------------- 新增/编辑弹窗 ----------------

    function buildModalMarkup() {
        const periodOpts = PERIODS.map((p) => `<option value="${p.key}">${p.label}</option>`).join('');
        const catOpts = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
        const priOpts = PRIORITIES.map((p) => `<option value="${p.key}">${p.emoji} ${p.label}</option>`).join('');
        return `
            <div class="sc-modal-content">
              <h3 id="sc-modal-title">新增日程</h3>
              <form id="sc-schedule-form">
                <div class="form-field">
                  <label>标题 *</label>
                  <input class="input" id="sc-f-title" required placeholder="如：高管周会">
                </div>
                <div class="form-row" style="margin-top:12px;">
                  <div class="form-field">
                    <label>日期 *</label>
                    <input class="input" type="date" id="sc-f-date" required>
                  </div>
                  <div class="form-field">
                    <label>优先级</label>
                    <select class="input" id="sc-f-priority">${priOpts}</select>
                  </div>
                </div>
                <div class="form-row" style="margin-top:12px;">
                  <div class="form-field">
                    <label>时段 *</label>
                    <select class="input" id="sc-f-period">${periodOpts}</select>
                  </div>
                  <div class="form-field">
                    <label>分类</label>
                    <select class="input" id="sc-f-category"><option value="">- 请选择 -</option>${catOpts}</select>
                  </div>
                </div>
                <div class="form-field" style="margin-top:12px;">
                  <label>地点</label>
                  <input class="input" id="sc-f-location" placeholder="如：3F一号会议室">
                </div>
                <div class="form-field" style="margin-top:12px;">
                  <label>参与人 / 客户（逗号分隔）</label>
                  <input class="input" id="sc-f-participants" placeholder="如：王副总, 张总">
                </div>
                <div class="form-field" style="margin-top:12px;">
                  <label>备注</label>
                  <textarea class="input" id="sc-f-remark" rows="2" style="resize:vertical;min-height:60px;"></textarea>
                </div>
                <div class="sc-tip" style="margin-top:10px;color:#888;font-size:12px;">
                  提示：保存后系统按该时段默认时间自动发送一条钉钉提醒。
                </div>
                <div class="sc-status-line" id="sc-modal-status"></div>
                <div class="form-actions">
                  <button class="btn primary" type="submit">保存</button>
                  <button class="btn" type="button" id="sc-modal-cancel">取消</button>
                </div>
              </form>
            </div>
        `;
    }

    function ensureModal() {
        let modal = document.getElementById('sc-schedule-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sc-schedule-modal';
            modal.className = 'sc-modal';
            document.body.appendChild(modal);
        }
        return modal;
    }

    function openCreateModal(defaultDate) {
        const modal = ensureModal();
        modal.innerHTML = buildModalMarkup();
        modal.classList.add('is-open');
        const titleEl = modal.querySelector('#sc-modal-title');
        if (titleEl) titleEl.textContent = '新增日程';
        const dateEl = modal.querySelector('#sc-f-date');
        if (dateEl) dateEl.value = defaultDate || state.selectedDate || todayStr();
        bindModalEvents(modal, null);
    }

    async function openEditModal(id) {
        try {
            const res = await req(`/${id}`);
            const data = res.data || {};
            const it = data.schedule || {};
            const reminders = data.reminders || [];
            const modal = ensureModal();
            modal.innerHTML = buildModalMarkup();
            modal.classList.add('is-open');
            modal.querySelector('#sc-modal-title').textContent = '编辑日程';
            modal.querySelector('#sc-f-title').value = it.title || '';
            modal.querySelector('#sc-f-date').value = it.event_date || '';
            modal.querySelector('#sc-f-period').value = it.time_period || 'morning';
            modal.querySelector('#sc-f-location').value = it.location || '';
            modal.querySelector('#sc-f-category').value = it.category || '';
            modal.querySelector('#sc-f-priority').value = it.priority || 'medium';
            modal.querySelector('#sc-f-participants').value = (it.participants || []).join(', ');
            modal.querySelector('#sc-f-remark').value = it.remark || '';
            bindModalEvents(modal, id);
        } catch (e) {
            notify(e.message || '加载详情失败', 'error');
        }
    }

    function bindModalEvents(modal, editId) {
        modal.querySelector('#sc-modal-cancel').addEventListener('click', () => modal.classList.remove('is-open'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-open'); });
        modal.querySelector('#sc-schedule-form').addEventListener('submit', (e) => submitSchedule(e, modal, editId));
    }

    async function submitSchedule(e, modal, editId) {
        e.preventDefault();
        const statusEl = modal.querySelector('#sc-modal-status');
        const period = modal.querySelector('#sc-f-period').value;
        const payload = {
            title: modal.querySelector('#sc-f-title').value.trim(),
            event_date: modal.querySelector('#sc-f-date').value,
            time_period: period,
            is_all_day: period === 'allday',
            location: modal.querySelector('#sc-f-location').value.trim(),
            category: modal.querySelector('#sc-f-category').value,
            priority: modal.querySelector('#sc-f-priority').value,
            participants: modal.querySelector('#sc-f-participants').value,
            remark: modal.querySelector('#sc-f-remark').value.trim(),
            created_by: currentUser,
        };
        if (!payload.title || !payload.event_date) {
            setStatusLine(statusEl, '标题和日期不能为空', 'error');
            return;
        }
        setStatusLine(statusEl, '保存中…', 'info');
        try {
            if (editId) {
                await putJson(`/${editId}`, payload);
                notify('日程已更新', 'success');
            } else {
                await postJson('', payload);
                notify('日程已创建', 'success');
            }
            modal.classList.remove('is-open');
            await refreshAll();
        } catch (err) {
            setStatusLine(statusEl, err.message || '保存失败', 'error');
        }
    }

    // ---------------- 设置 ----------------

    async function loadSettings() {
        try {
            const [cfg, dt] = await Promise.all([req('/briefing/config'), req('/dingtalk/status')]);
            const briefing = cfg.data || {};
            const enabledCb = containerEl.querySelector('#sc-briefing-enabled');
            const timeInput = containerEl.querySelector('#sc-briefing-time');
            if (enabledCb) {
                enabledCb.checked = !!briefing.enabled;
                enabledCb.closest('.sc-check').classList.toggle('is-on', !!briefing.enabled);
            }
            if (timeInput) timeInput.value = (briefing.send_time || '08:00').slice(0, 5);
            const fmtSel = containerEl.querySelector('#sc-briefing-format');
            if (fmtSel) fmtSel.value = briefing.briefing_format || 'card';
            const weeklyCb = containerEl.querySelector('#sc-weekly-enabled');
            if (weeklyCb) {
                weeklyCb.checked = briefing.weekly_enabled !== false;
                weeklyCb.closest('.sc-check').classList.toggle('is-on', briefing.weekly_enabled !== false);
            }
            const monInput = containerEl.querySelector('#sc-weekly-mon-time');
            if (monInput) monInput.value = (briefing.weekly_mon_time || '08:30').slice(0, 5);
            const friInput = containerEl.querySelector('#sc-weekly-fri-time');
            if (friInput) friInput.value = (briefing.weekly_fri_time || '17:30').slice(0, 5);
            renderDingStatus(dt.data || {});
        } catch (e) {
            setStatusLine(containerEl.querySelector('#sc-settings-status'), e.message || '加载设置失败', 'error');
        }
    }

    function renderDingStatus(dt) {
        const el = containerEl.querySelector('#sc-dt-status');
        if (!el) return;
        const pills = [];
        if (dt.mode === 'webhook') {
            pills.push('<span class="tag" style="background:#e0f2fe;border-color:#bae6fd;">群机器人 Webhook</span>');
            pills.push(dt.has_webhook
                ? '<span class="tag success sc-pill-yes">Webhook 已配置</span>'
                : '<span class="tag sc-pill-no">Webhook 未配置</span>');
            if (dt.has_webhook) {
                pills.push(dt.has_secret
                    ? '<span class="tag success sc-pill-yes">加签密钥已配置</span>'
                    : '<span class="tag warn">未配置加签（需与机器人安全设置一致）</span>');
            }
        } else if (dt.mode === 'robot') {
            pills.push('<span class="tag" style="background:#dcfce7;border-color:#bbf7d0;">机器人单聊对话</span>');
            pills.push(dt.configured
                ? '<span class="tag success sc-pill-yes">应用凭据已配置</span>'
                : '<span class="tag sc-pill-no">应用凭据未配置</span>');
            pills.push(dt.has_boss_userid
                ? '<span class="tag success sc-pill-yes">收件人 UserId 已配置</span>'
                : (dt.has_boss_mobile
                    ? '<span class="tag warn">将用手机号反查 UserId</span>'
                    : '<span class="tag sc-pill-no">收件人 UserId/手机号未配置</span>'));
        } else {
            pills.push('<span class="tag" style="background:#e0f2fe;border-color:#bae6fd;">工作通知（定向）</span>');
            pills.push(dt.configured
                ? '<span class="tag success sc-pill-yes">应用凭据已配置</span>'
                : '<span class="tag sc-pill-no">应用凭据未配置</span>');
            pills.push(dt.has_boss_userid
                ? '<span class="tag success sc-pill-yes">老板 UserId 已配置</span>'
                : (dt.has_boss_mobile
                    ? '<span class="tag warn">将用手机号反查 UserId</span>'
                    : '<span class="tag sc-pill-no">老板 UserId/手机号未配置</span>'));
        }
        el.innerHTML = pills.join(' ');
    }

    async function saveBriefing() {
        const enabled = containerEl.querySelector('#sc-briefing-enabled').checked;
        const sendTime = containerEl.querySelector('#sc-briefing-time').value;
        const fmtSel = containerEl.querySelector('#sc-briefing-format');
        const briefingFormat = fmtSel ? fmtSel.value : 'card';
        const weeklyEnabled = containerEl.querySelector('#sc-weekly-enabled').checked;
        const monTime = containerEl.querySelector('#sc-weekly-mon-time').value;
        const friTime = containerEl.querySelector('#sc-weekly-fri-time').value;
        try {
            await putJson('/briefing/config', {
                enabled, send_time: sendTime, briefing_format: briefingFormat,
                weekly_enabled: weeklyEnabled, weekly_mon_time: monTime, weekly_fri_time: friTime,
            });
            notify('日程配置已保存', 'success');
        } catch (e) {
            notify(e.message || '保存失败', 'error');
        }
    }

    async function testBriefing() {
        notify('正在发送…', 'info');
        try {
            const res = await postJson('/briefing/test', {});
            notify(res.message || '日报已发送，请查看钉钉', 'success');
            await loadLogs();
        } catch (e) {
            notify(e.message || '发送失败', 'error');
            await loadLogs();
        }
    }

    async function testWeekly(weekOffset) {
        notify('正在发送…', 'info');
        try {
            const res = await postJson('/weekly/test', { week_offset: weekOffset });
            notify(res.message || '周报已发送，请查看钉钉', 'success');
            await loadLogs();
        } catch (e) {
            notify(e.message || '发送失败', 'error');
            await loadLogs();
        }
    }

    async function testDingtalk() {
        notify('正在测试…', 'info');
        try {
            const res = await postJson('/dingtalk/test', {});
            notify(`测试消息已发送 (task_id=${res.data.task_id})`, 'success');
            await loadLogs();
        } catch (e) {
            notify(e.message || '测试失败', 'error');
        }
    }

    // ---------------- 日志 ----------------

    async function loadLogs() {
        const body = containerEl.querySelector('#sc-logs-body');
        if (!body) return;
        body.innerHTML = '<tr><td colspan="6" class="sc-empty">加载中…</td></tr>';
        try {
            const res = await req('/logs?limit=50');
            const logs = res.data || [];
            if (!logs.length) {
                body.innerHTML = '<tr><td colspan="6" class="sc-empty">暂无发送记录</td></tr>';
                return;
            }
            body.innerHTML = logs.map((l) => {
                const ok = l.success
                    ? '<span class="tag success">成功</span>'
                    : '<span class="tag sc-pill-no">失败</span>';
                const typeMap = { briefing: '晨报', reminder: '提醒', test: '测试' };
                return `<tr>
                    <td>${escapeHtml(l.created_at || '-')}</td>
                    <td>${escapeHtml(typeMap[l.ref_type] || l.ref_type || '-')}</td>
                    <td>${ok}</td>
                    <td>${escapeHtml(l.target_userid || '-')}</td>
                    <td class="sc-mini-muted">${escapeHtml(l.task_id || '-')}</td>
                    <td class="sc-mini-muted">${escapeHtml(l.error_msg || '')}</td>
                </tr>`;
            }).join('');
        } catch (e) {
            body.innerHTML = `<tr><td colspan="6" class="sc-empty">${escapeHtml(e.message || '加载失败')}</td></tr>`;
        }
    }

    // ---------------- 初始化 ----------------

    function bindNav() {
        containerEl.querySelectorAll('.sc-tab').forEach((b) => {
            b.addEventListener('click', () => switchTab(b.dataset.tab));
        });
        const prev = containerEl.querySelector('#sc-prev-month');
        const next = containerEl.querySelector('#sc-next-month');
        const todayBtn = containerEl.querySelector('#sc-today-btn');
        const addBtn = containerEl.querySelector('#sc-add-btn');
        const addToday = containerEl.querySelector('#sc-add-today');
        const briefingSave = containerEl.querySelector('#sc-briefing-save');
        const briefingTest = containerEl.querySelector('#sc-briefing-test');
        const briefingEnabled = containerEl.querySelector('#sc-briefing-enabled');
        const weeklyEnabled = containerEl.querySelector('#sc-weekly-enabled');
        const weeklyTestThis = containerEl.querySelector('#sc-weekly-test-this');
        const weeklyTestNext = containerEl.querySelector('#sc-weekly-test-next');
        const dtTest = containerEl.querySelector('#sc-dt-test');
        const logsRefresh = containerEl.querySelector('#sc-logs-refresh');

        const step = (delta) => {
            let y = state.year, m = state.month + delta;
            if (m < 1) { m = 12; y -= 1; }
            if (m > 12) { m = 1; y += 1; }
            state.year = y; state.month = m;
            loadMonth();
        };
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        todayBtn.addEventListener('click', () => {
            const now = new Date();
            state.year = now.getFullYear();
            state.month = now.getMonth() + 1;
            state.selectedDate = todayStr();
            loadMonth().then(() => loadDay(state.selectedDate, false));
        });
        addBtn.addEventListener('click', () => openCreateModal(state.selectedDate || todayStr()));
        if (addToday) addToday.addEventListener('click', () => openCreateModal(todayStr()));
        briefingSave.addEventListener('click', saveBriefing);
        briefingTest.addEventListener('click', testBriefing);
        const weeklyBtn = containerEl.querySelector('#sc-briefing-weekly');
        if (weeklyBtn) weeklyBtn.addEventListener('click', () => {
            window.open('/api/schedule/weekly.html', '_blank');
        });
        if (briefingEnabled) briefingEnabled.addEventListener('change', () => {
            briefingEnabled.closest('.sc-check').classList.toggle('is-on', briefingEnabled.checked);
        });
        if (weeklyEnabled) weeklyEnabled.addEventListener('change', () => {
            weeklyEnabled.closest('.sc-check').classList.toggle('is-on', weeklyEnabled.checked);
        });
        if (weeklyTestThis) weeklyTestThis.addEventListener('click', () => testWeekly(0));
        if (weeklyTestNext) weeklyTestNext.addEventListener('click', () => testWeekly(1));
        dtTest.addEventListener('click', testDingtalk);
        logsRefresh.addEventListener('click', loadLogs);
    }

    function init(container) {
        auth = window._ksAuth || null;
        currentUser = auth?.username || 'anonymous';
        currentRole = auth?.roleLabel || auth?.role || '';

        containerEl = container;
        cleanupFns = [];
        containerEl.innerHTML = '';
        const section = document.createElement('section');
        section.className = 'section';
        section.innerHTML = buildMainMarkup();
        containerEl.appendChild(section);

        const now = new Date();
        state.year = now.getFullYear();
        state.month = now.getMonth() + 1;
        state.selectedDate = todayStr();

        bindNav();
        loadMonth().then(() => loadDay(state.selectedDate, false));
    }

    function destroy() {
        cleanupFns.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
        cleanupFns = [];
        const modal = document.getElementById('sc-schedule-modal');
        if (modal) modal.remove();
        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
    }

    window.SchedulePage = { init, destroy };
})();
