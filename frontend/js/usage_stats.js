const USAGE_API = window.KS_API_BASE_URL || '/api';

async function fetchUsageApi(path) {
    const url = `${USAGE_API}${path}`;
    const response = await fetch(url, { credentials: 'same-origin' });
    const payload = await response.json();
    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || '请求失败');
    }
    return payload;
}

function formatDuration(ms) {
    if (!ms && ms !== 0) return '-';
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
}

function formatTime(isoStr) {
    if (!isoStr) return '-';
    try {
        const d = new Date(isoStr);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) {
        return isoStr;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const authPromise = window.ksAuthSyncPromise;
    let auth = null;
    try { auth = authPromise ? await authPromise : null; } catch (e) { auth = null; }
    if (!auth || auth.role !== 'admin') return;

    const overviewPanel = document.getElementById('usage-overview-panel');
    const userPanel = document.getElementById('usage-user-panel');
    const userBackBtn = document.getElementById('usage-user-back');

    const todayEl = document.getElementById('usage-today');
    const weekEl = document.getElementById('usage-week');
    const monthEl = document.getElementById('usage-month');
    const totalEl = document.getElementById('usage-total');
    const todayUsersEl = document.getElementById('usage-today-users');
    const weekUsersEl = document.getElementById('usage-week-users');
    const monthUsersEl = document.getElementById('usage-month-users');
    const groupChartEl = document.getElementById('usage-group-chart');
    const userTableBody = document.getElementById('usage-user-table');
    const detailTableBody = document.getElementById('usage-detail-table');
    const detailInfoEl = document.getElementById('usage-detail-info');
    const filterGroup = document.getElementById('usage-filter-group');
    const filterStatus = document.getElementById('usage-filter-status');
    const filterStart = document.getElementById('usage-filter-start');
    const filterEnd = document.getElementById('usage-filter-end');
    const searchBtn = document.getElementById('usage-search-btn');
    const prevBtn = document.getElementById('usage-prev-btn');
    const nextBtn = document.getElementById('usage-next-btn');
    const exportBtn = document.getElementById('usage-export-btn');
    const downloadBtn = document.getElementById('usage-download-btn');
    const userGroupFilter = document.getElementById('usage-user-group-filter');
    const userPeriodSel = document.getElementById('usage-user-period');

    function getUserPeriodRange() {
        const period = userPeriodSel ? userPeriodSel.value : 'today';
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        if (period === '30d') {
            const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
            start.setHours(0, 0, 0, 0);
            return {
                start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T00:00:00`,
                end: '',
            };
        }
        if (period === '7d') {
            const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
            start.setHours(0, 0, 0, 0);
            return {
                start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T00:00:00`,
                end: '',
            };
        }
        // today
        return {
            start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00`,
            end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T23:59:59`,
        };
    }

    let _userStatsCache = [];

    let detailOffset = 0;
    const detailLimit = 50;
    let detailTotal = 0;

    function showOverview() {
        if (overviewPanel) overviewPanel.style.display = '';
        if (userPanel) userPanel.style.display = 'none';
    }

    function showUserPanel() {
        if (overviewPanel) overviewPanel.style.display = 'none';
        if (userPanel) userPanel.style.display = '';
    }

    if (userBackBtn) {
        userBackBtn.addEventListener('click', showOverview);
    }

    async function loadUserDetail(username) {
        showUserPanel();
        const titleEl = document.getElementById('usage-user-title');
        if (titleEl) titleEl.textContent = `${username} 使用情况`;

        try {
            const payload = await fetchUsageApi(`/admin/usage/user/${encodeURIComponent(username)}`);
            const d = payload.data || {};
            const displayName = d.china_name || username;
            if (titleEl) titleEl.textContent = `${displayName} 使用情况`;

            const setIfExists = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setIfExists('uq-total', d.total_count || 0);
            setIfExists('uq-success', d.success_count || 0);
            setIfExists('uq-failed', d.failed_count || 0);
            setIfExists('uq-today', d.today_count || 0);
            setIfExists('uq-month', d.month_count || 0);
            setIfExists('uq-avg-time', formatDuration(d.avg_duration_ms));
            setIfExists('uq-avg-sheets', d.avg_sheet_count || 0);

            const dailyChartEl = document.getElementById('uq-daily-chart');
            if (dailyChartEl) {
                const daily = (d.daily_trend || []).reverse();
                if (daily.length === 0) {
                    dailyChartEl.innerHTML = '<div class="muted">暂无数据</div>';
                } else {
                    const maxC = Math.max(...daily.map(x => x.count), 1);
                    dailyChartEl.innerHTML = daily.map(x => {
                        const pct = Math.round((x.count / maxC) * 100);
                        const label = (x.day || '').slice(5);
                        return `<div style="margin-bottom:6px;">
                            <div style="display:flex;justify-content:space-between;font-size:12px;">
                                <span>${escapeHtml(label)}</span>
                                <span style="font-weight:600;">${x.count}</span>
                            </div>
                            <div style="background:#e2e8f0;border-radius:4px;height:6px;margin-top:3px;">
                                <div style="background:#3b82f6;border-radius:4px;height:6px;width:${pct}%;"></div>
                            </div>
                        </div>`;
                    }).join('');
                }
            }

            const recentBody = document.getElementById('uq-recent-table');
            if (recentBody) {
                const logs = d.recent_logs || [];
                recentBody.innerHTML = '';
                logs.forEach(r => {
                    let matchStr = '-';
                    try {
                        const ms = typeof r.match_stats === 'string' ? JSON.parse(r.match_stats) : r.match_stats;
                        if (ms) matchStr = `${ms.matched_count || 0}/${ms.total_products || 0}`;
                    } catch (e) { /* ignore */ }
                    const statusTag = r.status === 'success'
                        ? '<span class="tag success">成功</span>'
                        : '<span class="tag warn">失败</span>';
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="font-size:12px;">${formatTime(r.created_at)}</td>
                        <td style="font-size:12px;">${escapeHtml(r.project_name || '-')}</td>
                        <td style="font-size:12px;">${escapeHtml(r.case_type || '-')}</td>
                        <td>${matchStr}</td>
                        <td>${r.sheet_count || 0}</td>
                        <td>${formatDuration(r.duration_ms)}</td>
                        <td>${statusTag}</td>
                    `;
                    recentBody.appendChild(row);
                });
                if (logs.length === 0) {
                    recentBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">暂无记录</td></tr>';
                }
            }
        } catch (e) {
            console.error('user detail failed:', e);
        }
    }

    async function loadOverview() {
        try {
            const payload = await fetchUsageApi('/admin/usage/overview');
            const d = payload.data || {};
            if (todayEl) todayEl.textContent = d.today_count || 0;
            if (weekEl) weekEl.textContent = d.week_count || 0;
            if (monthEl) monthEl.textContent = d.month_count || 0;
            if (totalEl) totalEl.textContent = d.total_count || 0;
            if (todayUsersEl) todayUsersEl.textContent = d.active_users_today || 0;
            if (weekUsersEl) weekUsersEl.textContent = d.active_users_week || 0;
            if (monthUsersEl) monthUsersEl.textContent = d.active_users_month || 0;

            if (groupChartEl) {
                const groups = d.group_stats || [];
                if (groups.length === 0) {
                    groupChartEl.innerHTML = '<div class="muted">暂无数据</div>';
                } else {
                    const maxCount = Math.max(...groups.map(g => g.count), 1);
                    groupChartEl.innerHTML = groups.map(g => {
                        const pct = Math.round((g.count / maxCount) * 100);
                        const label = g.group_name || '未知';
                        return `<div style="margin-bottom:8px;">
                            <div style="display:flex;justify-content:space-between;font-size:13px;">
                                <span>${escapeHtml(label)}</span>
                                <span style="font-weight:600;">${g.count}</span>
                            </div>
                            <div style="background:#e2e8f0;border-radius:4px;height:8px;margin-top:4px;">
                                <div style="background:#3b82f6;border-radius:4px;height:8px;width:${pct}%;"></div>
                            </div>
                        </div>`;
                    }).join('');
                }
            }
        } catch (e) {
            console.error('usage overview failed:', e);
        }
    }

    async function loadUserStats() {
        if (!userTableBody) return;
        try {
            const range = getUserPeriodRange();
            const qs = new URLSearchParams();
            if (range.start) qs.set('start', range.start);
            if (range.end) qs.set('end', range.end);
            const query = qs.toString();
            const payload = await fetchUsageApi(`/admin/usage/by-user${query ? '?' + query : ''}`);
            _userStatsCache = payload.data || [];
            renderUserStats();
        } catch (e) {
            console.error('usage by-user failed:', e);
        }
    }

    function renderUserStats() {
        if (!userTableBody) return;
        const filterGroup = userGroupFilter ? userGroupFilter.value : '';
        const rows = filterGroup
            ? _userStatsCache.filter(r => (r.group_name || '') === filterGroup)
            : _userStatsCache;
        userTableBody.innerHTML = '';
        rows.forEach(r => {
            const successCount = r.success_count || 0;
            const totalCount = r.total_count || 0;
            const rate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.innerHTML = `
                <td><a href="javascript:void(0)" class="usage-user-link" data-username="${escapeHtml(r.username || '')}" style="color:#2563eb;text-decoration:none;font-weight:500;">${escapeHtml(r.china_name || r.username || '-')}</a></td>
                <td><span class="tag">${escapeHtml(r.group_name || '-')}</span></td>
                <td style="font-weight:600;">${totalCount}</td>
                <td>${rate}%</td>
                <td>${formatDuration(r.avg_duration_ms)}</td>
                <td style="font-size:12px;">${formatTime(r.last_active)}</td>
            `;
            row.addEventListener('click', (e) => {
                if (e.target.closest('.usage-user-link') || e.target === row || e.target.closest('td')) {
                    loadUserDetail(r.username);
                }
            });
            userTableBody.appendChild(row);
        });
        if (rows.length === 0) {
            userTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">暂无数据</td></tr>';
        }
    }

    function buildDetailQuery() {
        const params = new URLSearchParams();
        params.set('limit', detailLimit);
        params.set('offset', detailOffset);
        const g = filterGroup ? filterGroup.value : '';
        const s = filterStatus ? filterStatus.value : '';
        const start = filterStart ? filterStart.value : '';
        const end = filterEnd ? filterEnd.value : '';
        if (g) params.set('group', g);
        if (s) params.set('status', s);
        if (start) params.set('start', start + 'T00:00:00');
        if (end) params.set('end', end + 'T23:59:59');
        return `/admin/usage/details?${params.toString()}`;
    }

    async function loadDetails() {
        if (!detailTableBody) return;
        try {
            const payload = await fetchUsageApi(buildDetailQuery());
            const rows = payload.data || [];
            detailTotal = payload.total || 0;
            detailTableBody.innerHTML = '';

            rows.forEach(r => {
                let matchStr = '-';
                try {
                    const ms = typeof r.match_stats === 'string' ? JSON.parse(r.match_stats) : r.match_stats;
                    if (ms) matchStr = `${ms.matched_count || 0}/${ms.total_products || 0}`;
                } catch (e) { /* ignore */ }
                const statusTag = r.status === 'success'
                    ? '<span class="tag success">成功</span>'
                    : '<span class="tag warn">失败</span>';
                const displayName = r.china_name || r.username || '-';
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="font-size:12px;">${formatTime(r.created_at)}</td>
                    <td><a href="javascript:void(0)" class="detail-user-link" data-username="${escapeHtml(r.username || '')}" style="color:#2563eb;text-decoration:none;">${escapeHtml(displayName)}</a></td>
                    <td><span class="tag">${escapeHtml(r.group_name || '-')}</span></td>
                    <td style="font-size:12px;">${escapeHtml(r.project_name || '-')}</td>
                    <td style="font-size:12px;">${escapeHtml(r.bom_filename || '-')}</td>
                    <td style="font-size:12px;">${escapeHtml(r.case_type || '-')}</td>
                    <td>${matchStr}</td>
                    <td>${r.sheet_count || 0}</td>
                    <td>${formatDuration(r.duration_ms)}</td>
                    <td>${statusTag}</td>
                `;
                detailTableBody.appendChild(row);
            });

            detailTableBody.querySelectorAll('.detail-user-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadUserDetail(link.getAttribute('data-username'));
                });
            });

            if (rows.length === 0) {
                detailTableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#94a3b8;">暂无数据</td></tr>';
            }

            if (detailInfoEl) {
                const pageStart = detailTotal > 0 ? detailOffset + 1 : 0;
                const pageEnd = Math.min(detailOffset + detailLimit, detailTotal);
                detailInfoEl.textContent = `${pageStart}-${pageEnd} / 共 ${detailTotal} 条`;
            }
        } catch (e) {
            console.error('usage details failed:', e);
        }
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            detailOffset = 0;
            loadDetails();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            detailOffset = Math.max(0, detailOffset - detailLimit);
            loadDetails();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (detailOffset + detailLimit < detailTotal) {
                detailOffset += detailLimit;
                loadDetails();
            }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const start = filterStart ? filterStart.value : '';
            const end = filterEnd ? filterEnd.value : '';
            const params = new URLSearchParams();
            if (start) params.set('start', start + 'T00:00:00');
            if (end) params.set('end', end + 'T23:59:59');
            const url = `${USAGE_API}/admin/usage/export?${params.toString()}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = '报价使用统计.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const params = new URLSearchParams();
            const g = filterGroup ? filterGroup.value : '';
            const s = filterStatus ? filterStatus.value : '';
            const start = filterStart ? filterStart.value : '';
            const end = filterEnd ? filterEnd.value : '';
            if (g) params.set('group', g);
            if (s) params.set('status', s);
            if (start) params.set('start', start + 'T00:00:00');
            if (end) params.set('end', end + 'T23:59:59');
            const url = `${USAGE_API}/admin/usage/export-details?${params.toString()}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = '报价详细日志.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    if (userGroupFilter) {
        userGroupFilter.addEventListener('change', renderUserStats);
    }

    if (userPeriodSel) {
        userPeriodSel.addEventListener('change', loadUserStats);
    }

    let usageLoaded = false;

    async function loadAll() {
        if (usageLoaded) return;
        usageLoaded = true;
        showOverview();
        await Promise.all([loadOverview(), loadUserStats(), loadDetails()]);
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'usage') {
        await loadAll();
    }

    window.addEventListener('admin-tab-changed', function(e) {
        if (e.detail && e.detail.tab === 'usage') loadAll();
    });
});
