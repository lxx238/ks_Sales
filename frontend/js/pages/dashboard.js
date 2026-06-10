(() => {
    const API_BASE = '/api/public/dashboard';

    let GROUPS = {};
    let DATE_LABELS = [];
    let currentDays = 10;
    let currentGroup = null;
    let currentMember = null;
    let detailDate = null;
    let chart = null;
    let todayChart = null;
    let todayData = {};
    let autoRefreshTimer = null;
    let containerEl = null;
    let cleanupFns = [];

    function computeStats(dataArray) {
        const total = dataArray.reduce((a, b) => a + b, 0);
        const avg = (total / dataArray.length).toFixed(1);
        const zeroCount = dataArray.filter(v => v === 0).length;
        return { total, avg, zeroCount };
    }

    function getGroupTotal(groupName) {
        const members = GROUPS[groupName];
        if (!members) return 0;
        let total = 0;
        Object.values(members).forEach(m => {
            total += m.daily.reduce((a, b) => a + b, 0);
        });
        return total;
    }

    function getGroupDailyData(groupName) {
        const members = GROUPS[groupName];
        if (!members) return [];
        return DATE_LABELS.map((_, idx) => {
            return Object.values(members).reduce((sum, m) => sum + m.daily[idx], 0);
        });
    }

    function getCurrentData() {
        if (!currentGroup) return null;
        if (currentMember) {
            return GROUPS[currentGroup][currentMember].daily;
        }
        return getGroupDailyData(currentGroup);
    }

    function getCurrentTitle() {
        if (!currentGroup) return '\u672A\u9009\u62E9\u5C0F\u7EC4';
        if (currentMember) {
            const m = GROUPS[currentGroup][currentMember];
            return currentGroup + ' \u00B7 ' + m.name + ' (\u4E2A\u4EBA)';
        }
        return currentGroup + ' \u00B7 \u5C0F\u7EC4\u6C47\u603B';
    }

    function ensureStyles() {
        if (document.getElementById('dashboard-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'dashboard-inline-styles';
        style.textContent = `
            .db-layout {
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
            }
            .db-side {
                flex: 0 0 240px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                background: #fff;
                border: 1px solid var(--line);
                border-radius: var(--radius, 18px);
                padding: 18px 14px;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.04);
            }
            .db-main {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .db-panel {
                background: #fff;
                border: 1px solid var(--line);
                border-radius: var(--radius, 18px);
                padding: 20px 18px;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.04);
            }
            .db-panel-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--text);
                margin-bottom: 12px;
                padding-left: 10px;
                border-left: 3px solid var(--brand);
            }
            .db-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 12px;
                margin-bottom: 16px;
            }
            .db-toolbar-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .db-view-label {
                font-size: 16px;
                font-weight: 600;
                color: var(--text);
                border-left: 4px solid var(--brand);
                padding-left: 12px;
            }
            .db-select {
                border: 1px solid var(--line);
                border-radius: 10px;
                padding: 6px 12px;
                font-size: 13px;
                background: #fff;
                color: var(--text);
                outline: none;
            }
            .db-group-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .db-group-item {
                background: #fff;
                border: 1px solid var(--line);
                border-radius: 14px;
                padding: 12px 14px;
                cursor: pointer;
                transition: all 0.15s;
            }
            .db-group-item:hover {
                background: #f8fafc;
                transform: translateX(3px);
            }
            .db-group-item.active {
                background: #e6fffb;
                border-color: var(--brand);
                box-shadow: 0 2px 8px rgba(15, 118, 110, 0.12);
            }
            .db-group-name {
                font-size: 15px;
                font-weight: 600;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .db-group-badge {
                font-size: 11px;
                color: var(--brand);
                background: #f0fdfa;
                padding: 2px 8px;
                border-radius: 20px;
            }
            .db-group-sub {
                font-size: 11px;
                color: var(--muted);
                margin-top: 4px;
            }
            .db-member-section {
                margin-top: 4px;
            }
            .db-member-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .db-member-title {
                font-size: 12px;
                font-weight: 700;
                color: var(--muted);
                letter-spacing: 0.06em;
            }
            .db-back-btn {
                border: none;
                background: #f1f5f9;
                border-radius: 20px;
                padding: 4px 12px;
                font-size: 11px;
                color: var(--text);
                cursor: pointer;
                transition: background 0.15s;
            }
            .db-back-btn:hover { background: #e2e8f0; }
            .db-member-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                max-height: 420px;
                overflow-y: auto;
            }
            .db-member-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 12px;
                border-radius: 30px;
                border: 1px solid transparent;
                cursor: pointer;
                transition: all 0.15s;
            }
            .db-member-item:hover {
                background: #f8fafc;
                transform: translateX(3px);
            }
            .db-member-item.active {
                background: #e6fffb;
                border-color: var(--brand);
            }
            .db-avatar {
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background: linear-gradient(135deg, #e6fffb, #ccfbf1);
                color: var(--brand);
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 13px;
                flex-shrink: 0;
            }
            .db-member-info { flex: 1; min-width: 0; }
            .db-member-name {
                font-size: 13px;
                font-weight: 600;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .db-member-stats {
                font-size: 10px;
                color: var(--muted);
            }
            .db-chart-box {
                width: 100%;
                height: 340px;
            }
            .db-today-chart-box {
                width: 100%;
                height: 360px;
            }
            .db-kpi-row {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                padding-top: 14px;
                border-top: 1px solid var(--line);
            }
            .db-kpi {
                background: #f8fafc;
                border: 1px solid var(--line);
                padding: 6px 14px;
                border-radius: 24px;
                font-size: 13px;
            }
            .db-kpi-label { color: var(--muted); }
            .db-kpi-value {
                font-weight: 700;
                font-size: 18px;
                margin-left: 6px;
                color: var(--text);
            }
            .db-empty {
                text-align: center;
                color: var(--muted);
                padding: 28px 0;
                font-size: 13px;
            }
            .db-hint {
                font-size: 11px;
                color: var(--muted);
                background: #f8fafc;
                padding: 3px 10px;
                border-radius: 16px;
            }
            .db-detail-kpi-row {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
                margin-bottom: 14px;
            }
            .db-detail-kpi {
                background: #f0fdfa;
                border: 1px solid #ccfbf1;
                padding: 4px 12px;
                border-radius: 16px;
                font-size: 12px;
            }
            .db-detail-kpi b { color: var(--brand); }
            .db-detail-table-wrap {
                overflow-x: auto;
                max-height: 340px;
                overflow-y: auto;
            }
            .db-detail-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            .db-detail-table th {
                text-align: left;
                padding: 6px 10px;
                background: #f8fafc;
                color: var(--muted);
                font-weight: 600;
                border-bottom: 1px solid var(--line);
                position: sticky;
                top: 0;
                z-index: 1;
            }
            .db-detail-table td {
                padding: 5px 10px;
                border-bottom: 1px solid #f1f5f9;
                color: var(--text);
                max-width: 160px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .db-detail-table tr:hover td { background: #f8fafc; }
            @media (max-width: 800px) {
                .db-layout { flex-direction: column; }
                .db-side { flex: 0 0 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    function updateStatsPanel() {
        const data = getCurrentData();
        if (!data) {
            document.getElementById('db-totalUsage').textContent = '--';
            document.getElementById('db-avgUsage').textContent = '--';
            document.getElementById('db-zeroDays').textContent = '--';
            return;
        }
        const stats = computeStats(data);
        document.getElementById('db-totalUsage').textContent = stats.total;
        document.getElementById('db-avgUsage').textContent = stats.avg;
        document.getElementById('db-zeroDays').textContent = stats.zeroCount;
        const zeroLabel = document.getElementById('db-zeroLabel');
        if (zeroLabel) zeroLabel.textContent = currentMember ? '\u4E2A\u4EBA\u96F6\u4F7F\u7528\u5929\u6570' : '\u5C0F\u7EC4\u96F6\u65E5\u603B\u6570';
        document.getElementById('db-dateRange').textContent = '\u8FD1' + DATE_LABELS.length + '\u5929';
    }

    function renderChart() {
        if (!chart) return;
        const data = getCurrentData();
        if (!data) { chart.clear(); return; }

        const title = getCurrentTitle();
        chart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#fff',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                textStyle: { color: '#0f172a', fontSize: 13 },
                formatter: function(params) {
                    if (!params || !params[0]) return '';
                    const val = params[0].value;
                    const date = params[0].axisValue;
                    const status = val === 0 ? '\u5F53\u65E5\u65E0\u4F7F\u7528\u8BB0\u5F55' : '\u529F\u80FD\u6D3B\u8DC3';
                    return '<b>' + title + '</b><br/>\u65E5\u671F: ' + date + '<br/>\u4F7F\u7528\u6B21\u6570: <b>' + val + '</b> \u6B21<br/>' + status;
                }
            },
            grid: { left: '8%', right: '4%', top: 16, bottom: 28, containLabel: true },
            xAxis: {
                type: 'category',
                data: DATE_LABELS,
                axisLine: { lineStyle: { color: '#cbd5e1' } },
                axisLabel: { color: '#64748b', fontSize: 11 },
            },
            yAxis: {
                type: 'value',
                name: '\u4F7F\u7528\u6B21\u6570',
                nameTextStyle: { color: '#94a3b8', fontSize: 11 },
                splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                axisLabel: { color: '#64748b' },
                min: 0,
                minInterval: 1
            },
            series: [{
                type: 'line',
                data: data,
                smooth: false,
                symbol: 'circle',
                symbolSize: 7,
                lineStyle: {
                    width: 2.5,
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                        { offset: 0, color: '#0f766e' },
                        { offset: 1, color: '#0891b2' }
                    ])
                },
                itemStyle: {
                    color: function(p) { return p.value === 0 ? '#f59e0b' : '#0f766e'; },
                    borderColor: function(p) { return p.value === 0 ? '#f59e0b' : '#fff'; },
                    borderWidth: 2,
                },
                areaStyle: {
                    opacity: 0.12,
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#0f766e' },
                        { offset: 1, color: '#e6fffb' }
                    ])
                }
            }]
        }, true);
    }

    function renderTodayChart() {
        if (!todayChart) return;
        if (!currentGroup) { todayChart.clear(); return; }

        var groupMembers = GROUPS[currentGroup] || {};
        var groupToday = todayData[currentGroup] || {};

        var targetUsernames = currentMember ? [currentMember] : Object.keys(groupMembers);

        var typeSet = {};
        targetUsernames.forEach(function(u) {
            var td = groupToday[u];
            if (td && td.by_type) {
                Object.keys(td.by_type).forEach(function(t) { typeSet[t] = true; });
            }
        });
        var types = Object.keys(typeSet);

        var allMembers = targetUsernames.map(function(username) {
            var m = groupMembers[username];
            var td = groupToday[username];
            return {
                name: m ? m.name : username,
                total: td ? td.total : 0,
                by_type: td ? td.by_type : {},
            };
        }).sort(function(a, b) { return b.total - a.total; });

        var names = allMembers.map(function(m) { return m.name; });
        var barCount = allMembers.length;

        var palette = ['#0f766e', '#0891b2', '#2563eb', '#7c3aed', '#b45309', '#dc2626'];
        var series = types.map(function(t, idx) {
            return {
                name: t,
                type: 'bar',
                stack: 'total',
                data: allMembers.map(function(m) { return m.by_type[t] || 0; }),
                barWidth: barCount > 12 ? 20 : barCount > 8 ? 28 : 36,
                itemStyle: {
                    color: palette[idx % palette.length],
                    borderRadius: idx === types.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0],
                },
            };
        });

        var totals = allMembers.map(function(m) { return m.total; });

        todayChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: '#fff',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                textStyle: { color: '#0f172a', fontSize: 13 },
                formatter: function(params) {
                    if (!params || !params.length) return '';
                    var html = '<b>' + params[0].axisValue + '</b><br/>';
                    var total = 0;
                    params.forEach(function(p) {
                        if (p.value > 0) {
                            html += p.marker + ' ' + p.seriesName + ': <b>' + p.value + '</b> \u6B21<br/>';
                            total += p.value;
                        }
                    });
                    if (total === 0) html += '\u4ECA\u65E5\u6682\u65E0\u4F7F\u7528';
                    else html += '\u5408\u8BA1: <b>' + total + '</b> \u6B21';
                    return html;
                }
            },
            legend: types.length > 1 ? {
                top: 0,
                right: 0,
                textStyle: { color: '#64748b', fontSize: 11 },
            } : undefined,
            grid: { left: '10%', right: '4%', top: types.length > 1 ? 36 : 12, bottom: 24, containLabel: true },
            xAxis: {
                type: 'category',
                data: names,
                axisLine: { lineStyle: { color: '#cbd5e1' } },
                axisLabel: { color: '#64748b', fontSize: barCount > 10 ? 10 : 11, rotate: barCount > 8 ? 30 : 0, interval: 0 },
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                axisLabel: { color: '#64748b' },
                min: 0,
                minInterval: 1,
            },
            series: series.concat([{
                type: 'bar',
                stack: 'total',
                data: totals.map(function() { return 0; }),
                label: {
                    show: true,
                    position: 'top',
                    color: '#334155',
                    fontSize: 11,
                    fontWeight: 600,
                    formatter: function(p) { return totals[p.dataIndex]; },
                },
                itemStyle: { color: 'transparent' },
                barWidth: barCount > 12 ? 20 : barCount > 8 ? 28 : 36,
            }]),
        }, true);
    }

    function renderGroupList() {
        const el = document.getElementById('db-groupList');
        if (!el) return;
        el.innerHTML = '';
        const names = Object.keys(GROUPS);
        if (names.length === 0) {
            el.innerHTML = '<div class="db-empty">\u6682\u65E0\u5C0F\u7EC4\u6570\u636E</div>';
            return;
        }
        const order = ['\u97E9\u8BED\u7EC4', '\u65E5\u8BED\u7EC4', '\u82F1\u8BED\u7EC4'];
        const ordered = order.filter(function(g) { return names.includes(g); });
        names.forEach(function(g) { if (!ordered.includes(g)) ordered.push(g); });

        ordered.forEach(function(gn) {
            const total = getGroupTotal(gn);
            const cnt = Object.keys(GROUPS[gn]).length;
            const active = (currentGroup === gn && !currentMember);
            const div = document.createElement('div');
            div.className = 'db-group-item' + (active ? ' active' : '');
            div.innerHTML =
                '<div class="db-group-name">' + gn + '<span class="db-group-badge">' + total + '\u6B21 / ' + cnt + '\u4EBA</span></div>' +
                '<div class="db-group-sub">\u70B9\u51FB\u67E5\u770B\u5C0F\u7EC4\u6C47\u603B</div>';
            div.addEventListener('click', function() {
                currentGroup = gn;
                currentMember = null;
                refreshUI();
            });
            el.appendChild(div);
        });
    }

    function renderMemberList() {
        const el = document.getElementById('db-memberList');
        const backBtn = document.getElementById('db-backBtn');
        if (!el) return;

        if (!currentGroup || !GROUPS[currentGroup]) {
            el.innerHTML = '<div class="db-empty">\u8BF7\u5148\u9009\u62E9\u5C0F\u7EC4</div>';
            if (backBtn) backBtn.style.display = 'none';
            return;
        }
        const members = GROUPS[currentGroup];
        const keys = Object.keys(members);
        if (keys.length === 0) {
            el.innerHTML = '<div class="db-empty">\u6682\u65E0\u6210\u5458</div>';
            if (backBtn) backBtn.style.display = 'inline-block';
            return;
        }
        if (backBtn) backBtn.style.display = 'inline-block';
        el.innerHTML = '';

        keys.forEach(function(username) {
            const m = members[username];
            const stats = computeStats(m.daily);
            const active = (currentMember === username);
            const div = document.createElement('div');
            div.className = 'db-member-item' + (active ? ' active' : '');
            div.innerHTML =
                '<div class="db-avatar">' + m.name.charAt(0) + '</div>' +
                '<div class="db-member-info">' +
                    '<div class="db-member-name">' + m.name + '</div>' +
                    '<div class="db-member-stats">\u603B' + stats.total + ' \u00B7 \u96F6\u65E5' + stats.zeroCount + '\u5929</div>' +
                '</div>';
            div.addEventListener('click', function() {
                currentMember = username;
                refreshUI();
            });
            el.appendChild(div);
        });
    }

    function updateViewLabel() {
        const el = document.getElementById('db-viewLabel');
        if (!el) return;
        if (currentMember && currentGroup && GROUPS[currentGroup] && GROUPS[currentGroup][currentMember]) {
            el.textContent = currentGroup + ' \u00B7 ' + GROUPS[currentGroup][currentMember].name + ' (\u4E2A\u4EBA\u8BE6\u60C5)';
        } else if (currentGroup) {
            el.textContent = currentGroup + ' \u00B7 \u5C0F\u7EC4\u6C47\u603B\u66F2\u7EBF';
        } else {
            el.textContent = '\u8BF7\u9009\u62E9\u5C0F\u7EC4';
        }
        const todayTitle = document.getElementById('db-todayTitle');
        updateTodayTitle();
    }

    async function fetchMemberDetail() {
        const panel = document.getElementById('db-memberDetailPanel');
        if (!currentMember || !currentGroup) {
            if (panel) panel.style.display = 'none';
            return;
        }
        if (panel) panel.style.display = '';
        const title = document.getElementById('db-memberDetailTitle');
        const m = GROUPS[currentGroup][currentMember];
        if (title && m) title.textContent = m.name + ' \u00B7 \u6700\u8FD1\u64CD\u4F5C\u8BB0\u5F55';

        try {
            const resp = await fetch(API_BASE + '/member-detail?username=' + encodeURIComponent(currentMember), { credentials: 'same-origin' });
            const json = await resp.json();
            if (json.success && json.data) {
                renderMemberDetail(json.data);
            } else {
                renderMemberDetail(null);
            }
        } catch (err) {
            console.error('Member detail fetch error:', err);
            renderMemberDetail(null);
        }
    }

    function renderMemberDetail(data) {
        const kpiRow = document.getElementById('db-memberKpiRow');
        const tbody = document.getElementById('db-memberDetailBody');
        if (!kpiRow || !tbody) return;

        if (!data) {
            kpiRow.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);">\u6682\u65E0\u6570\u636E</td></tr>';
            return;
        }

        kpiRow.innerHTML =
            '<div class="db-detail-kpi">\u4ECA\u65E5 <b>' + (data.today_count || 0) + '</b> \u6B21</div>' +
            '<div class="db-detail-kpi">\u672C\u6708 <b>' + (data.month_count || 0) + '</b> \u6B21</div>' +
            '<div class="db-detail-kpi">\u7D2F\u8BA1 <b>' + (data.total_count || 0) + '</b> \u6B21</div>' +
            '<div class="db-detail-kpi">\u6210\u529F\u7387 <b>' + (data.total_count > 0 ? Math.round((data.success_count / data.total_count) * 100) : 0) + '%</b></div>' +
            '<div class="db-detail-kpi">\u5E73\u5747\u8017\u65F6 <b>' + (data.avg_duration_ms ? Math.round(data.avg_duration_ms / 1000) + 's' : '--') + '</b></div>';

        const logs = data.recent_logs || [];
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);">\u6682\u65E0\u8BB0\u5F55</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(function(log) {
            const time = (log.created_at || '').slice(5, 16);
            const project = log.project_name || '-';
            const file = log.bom_filename || '-';
            const caseType = log.case_type || '-';
            let matchInfo = '-';
            try {
                const ms = typeof log.match_stats === 'string' ? JSON.parse(log.match_stats) : log.match_stats;
                if (ms && ms.total !== undefined) {
                    matchInfo = ms.matched + '/' + ms.total;
                }
            } catch (e) {}
            const dur = log.duration_ms ? (log.duration_ms / 1000).toFixed(1) + 's' : '-';
            const statusClass = log.status === 'success' ? '' : ' style="color:#dc2626"';
            return '<tr' + statusClass + '>' +
                '<td title="' + (log.created_at || '') + '">' + time + '</td>' +
                '<td title="' + project + '">' + project + '</td>' +
                '<td title="' + file + '">' + file + '</td>' +
                '<td>' + caseType + '</td>' +
                '<td>' + matchInfo + '</td>' +
                '<td>' + dur + '</td>' +
                '</tr>';
        }).join('');
    }

    function refreshUI() {
        renderGroupList();
        renderMemberList();
        renderChart();
        renderTodayChart();
        updateStatsPanel();
        updateViewLabel();
        fetchMemberDetail();
    }

    function buildMarkup() {
        return `
        <h2>\u4EBA\u5458\u4F7F\u7528\u60C5\u51B5\u5927\u5C4F</h2>
        <p>\u70B9\u51FB\u5C0F\u7EC4\u67E5\u770B\u6C47\u603B\u66F2\u7EBF \u2192 \u70B9\u51FB\u6210\u5458\u4E0B\u94BB\u4E2A\u4EBA\u8BE6\u60C5\uFF08\u542B0\u6B21\u70B9\u4F4D\uFF09</p>

        <div class="db-toolbar">
            <div class="db-toolbar-left">
                <div class="db-view-label" id="db-viewLabel">\u52A0\u8F7D\u4E2D...</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <select class="db-select" id="db-daySelector">
                    <option value="7">\u8FD1 7 \u5929</option>
                    <option value="10" selected>\u8FD1 10 \u5929</option>
                    <option value="14">\u8FD1 14 \u5929</option>
                    <option value="30">\u8FD1 30 \u5929</option>
                </select>
                <button class="btn small" id="db-refreshBtn">\u5237\u65B0</button>
                <span class="db-hint" id="db-autoLabel"></span>
            </div>
        </div>

        <div class="db-layout">
            <div class="db-side">
                <div>
                    <div class="db-member-title" style="margin-bottom:8px;">\u8BED\u79CD\u5C0F\u7EC4</div>
                    <div class="db-group-list" id="db-groupList"></div>
                </div>
                <div class="db-member-section">
                    <div class="db-member-header">
                        <div class="db-member-title">\u5C0F\u7EC4\u6210\u5458</div>
                        <button class="db-back-btn" id="db-backBtn" style="display:none;">\u2190 \u8FD4\u56DE</button>
                    </div>
                    <div class="db-member-list" id="db-memberList">
                        <div class="db-empty">\u8BF7\u5148\u9009\u62E9\u5C0F\u7EC4</div>
                    </div>
                </div>
            </div>
            <div class="db-main">
                <div class="db-panel">
                    <div class="db-chart-box" id="db-chart"></div>
                    <div class="db-kpi-row">
                        <div class="db-kpi"><span class="db-kpi-label">\u7EDF\u8BA1\u5468\u671F</span><span class="db-kpi-value" id="db-dateRange">--</span></div>
                        <div class="db-kpi"><span class="db-kpi-label">\u603B\u4F7F\u7528\u6B21\u6570</span><span class="db-kpi-value" id="db-totalUsage">--</span></div>
                        <div class="db-kpi"><span class="db-kpi-label">\u65E5\u5747\u6B21\u6570</span><span class="db-kpi-value" id="db-avgUsage">--</span></div>
                        <div class="db-kpi"><span class="db-kpi-label" id="db-zeroLabel">\u96F6\u4F7F\u7528\u5929\u6570</span><span class="db-kpi-value" id="db-zeroDays">--</span></div>
                    </div>
                </div>
                <div class="db-panel">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <div class="db-panel-title" id="db-todayTitle" style="margin-bottom:0;">\u4ECA\u65E5\u4E1A\u52A1\u660E\u7EC6</div>
                        <input type="date" class="db-select" id="db-detailDate" />
                    </div>
                    <div class="db-today-chart-box" id="db-todayChart"></div>
                </div>
                <div class="db-panel" id="db-memberDetailPanel" style="display:none;">
                    <div class="db-panel-title" id="db-memberDetailTitle">\u6700\u8FD1\u64CD\u4F5C\u8BB0\u5F55</div>
                    <div class="db-detail-kpi-row" id="db-memberKpiRow"></div>
                    <div class="db-detail-table-wrap">
                        <table class="db-detail-table" id="db-memberDetailTable">
                            <thead>
                                <tr>
                                    <th>\u65F6\u95F4</th>
                                    <th>\u9879\u76EE</th>
                                    <th>\u6587\u4EF6</th>
                                    <th>\u7C7B\u578B</th>
                                    <th>\u5339\u914D</th>
                                    <th>\u8017\u65F6</th>
                                </tr>
                            </thead>
                            <tbody id="db-memberDetailBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    async function fetchTodayDetail() {
        try {
            let url = API_BASE + '/today-detail';
            if (detailDate) url += '?date=' + encodeURIComponent(detailDate);
            const resp = await fetch(url, { credentials: 'same-origin' });
            const json = await resp.json();
            if (json.success && json.data) {
                todayData = json.data;
            } else {
                todayData = {};
            }
            renderTodayChart();
            updateTodayTitle();
        } catch (err) {
            console.error('Today detail fetch error:', err);
        }
    }

    function updateTodayTitle() {
        const todayTitle = document.getElementById('db-todayTitle');
        if (!todayTitle) return;
        const dateLabel = detailDate || new Date().toISOString().slice(0, 10);
        if (currentMember && currentGroup && GROUPS[currentGroup] && GROUPS[currentGroup][currentMember]) {
            todayTitle.textContent = dateLabel + ' \u4E1A\u52A1\u660E\u7EC6 \u00B7 ' + GROUPS[currentGroup][currentMember].name;
        } else if (currentGroup) {
            todayTitle.textContent = dateLabel + ' \u4E1A\u52A1\u660E\u7EC6 \u00B7 ' + currentGroup;
        } else {
            todayTitle.textContent = dateLabel + ' \u4E1A\u52A1\u660E\u7EC6';
        }
    }

    async function fetchData() {
        try {
            const [trendResp, todayResp] = await Promise.all([
                fetch(API_BASE + '/data?days=' + currentDays, { credentials: 'same-origin' }),
                (function() {
                    let url = API_BASE + '/today-detail';
                    if (detailDate) url += '?date=' + encodeURIComponent(detailDate);
                    return fetch(url, { credentials: 'same-origin' });
                })(),
            ]);
            const trendJson = await trendResp.json();
            const todayJson = await todayResp.json();

            if (trendJson.success && trendJson.data) {
                DATE_LABELS = trendJson.data.date_labels;
                GROUPS = trendJson.data.groups;
                const names = Object.keys(GROUPS);
                if (!currentGroup || !GROUPS[currentGroup]) {
                    currentGroup = names.length > 0 ? names[0] : null;
                }
                if (currentMember && currentGroup && (!GROUPS[currentGroup] || !GROUPS[currentGroup][currentMember])) {
                    currentMember = null;
                }
            }

            if (todayJson.success && todayJson.data) {
                todayData = todayJson.data;
            }

            refreshUI();
        } catch (err) {
            console.error('Dashboard fetch error:', err);
        }
    }

    function initChart(domId, fallbackHeight) {
        const dom = document.getElementById(domId);
        if (!dom) return null;
        if (typeof echarts === 'undefined') return null;
        return echarts.init(dom);
    }

    function loadEchartsAndInit() {
        if (typeof echarts !== 'undefined') {
            chart = initChart('db-chart');
            todayChart = initChart('db-todayChart');
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
        script.onload = function() {
            chart = initChart('db-chart');
            todayChart = initChart('db-todayChart');
            renderChart();
            renderTodayChart();
        };
        document.head.appendChild(script);
    }

    function bindEvents() {
        const backBtn = document.getElementById('db-backBtn');
        if (backBtn) {
            const fn = function() { currentMember = null; refreshUI(); };
            backBtn.addEventListener('click', fn);
            cleanupFns.push(function() { backBtn.removeEventListener('click', fn); });
        }
        const refreshBtn = document.getElementById('db-refreshBtn');
        if (refreshBtn) {
            const fn = function() { fetchData(); };
            refreshBtn.addEventListener('click', fn);
            cleanupFns.push(function() { refreshBtn.removeEventListener('click', fn); });
        }
        const sel = document.getElementById('db-daySelector');
        if (sel) {
            const fn = function() { currentDays = parseInt(sel.value, 10); fetchData(); };
            sel.addEventListener('change', fn);
            cleanupFns.push(function() { sel.removeEventListener('change', fn); });
        }
        const dateInput = document.getElementById('db-detailDate');
        if (dateInput) {
            const fn = function() {
                detailDate = dateInput.value || null;
                fetchTodayDetail();
            };
            dateInput.addEventListener('change', fn);
            cleanupFns.push(function() { dateInput.removeEventListener('change', fn); });
        }
    }

    function startAutoRefresh() {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(fetchData, 5 * 60 * 1000);
        const label = document.getElementById('db-autoLabel');
        if (label) label.textContent = '\u6BCF5\u5206\u949F\u81EA\u52A8\u5237\u65B0';
    }

    function handleResize() {
        if (chart) chart.resize();
        if (todayChart) todayChart.resize();
    }

    function init(container) {
        containerEl = container;
        cleanupFns = [];
        ensureStyles();
        containerEl.innerHTML = buildMarkup();

        loadEchartsAndInit();
        bindEvents();
        fetchData();
        startAutoRefresh();
        window.addEventListener('resize', handleResize);
        cleanupFns.push(function() { window.removeEventListener('resize', handleResize); });
    }

    function destroy() {
        cleanupFns.forEach(function(fn) { try { fn(); } catch (e) {} });
        cleanupFns = [];
        if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
        if (chart) { chart.dispose(); chart = null; }
        if (todayChart) { todayChart.dispose(); todayChart = null; }
        if (containerEl) containerEl.innerHTML = '';
        containerEl = null;
        const style = document.getElementById('dashboard-inline-styles');
        if (style) style.remove();
    }

    window.DashboardPage = { init, destroy };
})();
