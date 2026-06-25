// 个人设置 · 打印习惯页面
// 所有登录用户可见，集中管理 9 个案件报价表的打印/页面设置（个人习惯）。
// 数据存储复用 accounts.preferences.print[案件]，与报价生成页共用。
(function () {
    'use strict';

    var CASE_KEYS = ['ko_normal', 'ko_simple', 'ko_ksd', 'ja_EST', 'ja_normal', 'ja_nv', 'en_simple', 'en_common', 'ap_common'];
    var DEFAULTS = window.KS_PRINT_DEFAULTS;
    var LABELS = window.KS_PRINT_LABELS;

    function _getStoredPrint() {
        var prefs = window._ksAuth && window._ksAuth.preferences ? window._ksAuth.preferences : null;
        return (prefs && prefs.print) ? prefs.print : {};
    }
    function _effective(caseKey) {
        var stored = _getStoredPrint()[caseKey];
        var def = DEFAULTS[caseKey];
        if (stored && typeof stored === 'object') {
            return Object.assign({}, def, stored);
        }
        return Object.assign({}, def);
    }
    function _eq(a, b) {
        return a.orientation === b.orientation && a.fit_mode === b.fit_mode &&
            !!a.horizontal_centered === !!b.horizontal_centered &&
            Math.abs((a.margin_top || 0) - b.margin_top) < 1e-6 &&
            Math.abs((a.margin_bottom || 0) - b.margin_bottom) < 1e-6 &&
            Math.abs((a.margin_left || 0) - b.margin_left) < 1e-6 &&
            Math.abs((a.margin_right || 0) - b.margin_right) < 1e-6;
    }

    function _rowHtml(caseKey) {
        var s = _effective(caseKey);
        var numInput = function (id, val) {
            return '<input type="number" class="ps-num" id="' + id + '" step="0.05" min="0" value="' + val + '">';
        };
        return '' +
            '<tr data-case="' + caseKey + '">' +
            '<td class="ps-case"><span class="ps-case-name">' + (LABELS[caseKey] || caseKey) + '</span><br><span class="ps-case-key">' + caseKey + '</span></td>' +
            '<td><select class="ps-orient">' +
            '<option value="portrait"' + (s.orientation === 'portrait' ? ' selected' : '') + '>纵向</option>' +
            '<option value="landscape"' + (s.orientation === 'landscape' ? ' selected' : '') + '>横向</option></select></td>' +
            '<td><select class="ps-fit">' +
            '<option value="fit_width"' + (s.fit_mode === 'fit_width' ? ' selected' : '') + '>所有列一页</option>' +
            '<option value="fit_one"' + (s.fit_mode === 'fit_one' ? ' selected' : '') + '>全部一页</option></select></td>' +
            '<td style="text-align:center;"><input type="checkbox" class="ps-center"' + (s.horizontal_centered ? ' checked' : '') + '></td>' +
            '<td>' + numInput('mt-' + caseKey, s.margin_top) + '</td>' +
            '<td>' + numInput('mb-' + caseKey, s.margin_bottom) + '</td>' +
            '<td>' + numInput('ml-' + caseKey, s.margin_left) + '</td>' +
            '<td>' + numInput('mr-' + caseKey, s.margin_right) + '</td>' +
            '<td>' + _customBadge(caseKey) + '</td>' +
            '<td><button type="button" class="btn small ps-restore">恢复默认</button></td>' +
            '</tr>';
    }
    function _customBadge(caseKey) {
        var stored = _getStoredPrint()[caseKey];
        return (stored && typeof stored === 'object')
            ? '<span class="ps-badge ps-badge-on">已自定义</span>'
            : '<span class="ps-badge ps-badge-off">默认</span>';
    }

    function _readRow(tr) {
        var nums = tr.querySelectorAll('.ps-num');
        var val = function (el) { var f = el ? parseFloat(el.value) : NaN; return isNaN(f) ? 0 : f; };
        return {
            orientation: (tr.querySelector('.ps-orient') || {}).value || 'portrait',
            fit_mode: (tr.querySelector('.ps-fit') || {}).value || 'fit_width',
            horizontal_centered: !!(tr.querySelector('.ps-center') || {}).checked,
            margin_top: val(nums[0]),
            margin_bottom: val(nums[1]),
            margin_left: val(nums[2]),
            margin_right: val(nums[3]),
        };
    }

    function _status(msg, isError) {
        var st = document.getElementById('ps-status');
        if (!st) return;
        st.textContent = msg;
        st.style.color = isError ? '#991b1b' : 'var(--muted)';
        clearTimeout(st._t);
        st._t = setTimeout(function () { st.textContent = ''; }, 4000);
    }

    function _postPrefs(payload, done) {
        var baseUrl = typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : '';
        fetch(baseUrl + '/auth/me/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ preferences: payload }),
        }).then(function (r) { return r.json(); }).then(function (data) {
            if (data && data.success) {
                if (data.data && data.data.preferences && window._ksAuth) {
                    window._ksAuth.preferences = data.data.preferences;
                    if (typeof setAuth === 'function') setAuth(window._ksAuth);
                }
                done(true);
            } else {
                _status(data && data.message ? data.message : '操作失败', true);
                done(false);
            }
        }).catch(function () { _status('网络错误', true); done(false); });
    }

    function _saveAll() {
        var payload = { print: {} };
        var rows = document.querySelectorAll('#ps-table tbody tr');
        rows.forEach(function (tr) {
            var caseKey = tr.getAttribute('data-case');
            var cur = _readRow(tr);
            var def = DEFAULTS[caseKey];
            payload.print[caseKey] = _eq(cur, def) ? null : cur;
        });
        var btn = document.getElementById('ps-save-btn');
        if (btn) btn.disabled = true;
        _status('正在保存...', false);
        _postPrefs(payload, function (ok) {
            if (btn) btn.disabled = false;
            if (ok) { _status('全部已保存', false); _refreshBadges(); }
        });
    }
    function _restoreOne(caseKey) {
        var def = DEFAULTS[caseKey];
        var tr = document.querySelector('#ps-table tbody tr[data-case="' + caseKey + '"]');
        if (tr) _fillRow(tr, def);
        var payload = { print: {} };
        payload.print[caseKey] = null;
        _status('正在恢复默认...', false);
        _postPrefs(payload, function (ok) {
            if (ok) { _status((LABELS[caseKey] || caseKey) + ' 已恢复默认', false); _refreshBadges(); }
        });
    }
    function _restoreAll() {
        var payload = { print: {} };
        CASE_KEYS.forEach(function (k) { payload.print[k] = null; });
        _status('正在恢复全部默认...', false);
        _postPrefs(payload, function (ok) {
            if (ok) { _status('全部已恢复默认', false); _reloadTable(); }
        });
    }

    function _fillRow(tr, s) {
        var setSel = function (cls, v) { var el = tr.querySelector(cls); if (el) el.value = v; };
        var nums = tr.querySelectorAll('.ps-num');
        setSel('.ps-orient', s.orientation);
        setSel('.ps-fit', s.fit_mode);
        var c = tr.querySelector('.ps-center'); if (c) c.checked = !!s.horizontal_centered;
        if (nums[0]) nums[0].value = s.margin_top;
        if (nums[1]) nums[1].value = s.margin_bottom;
        if (nums[2]) nums[2].value = s.margin_left;
        if (nums[3]) nums[3].value = s.margin_right;
    }
    function _refreshBadges() {
        document.querySelectorAll('#ps-table tbody tr').forEach(function (tr) {
            var td = tr.querySelector('.ps-badge') ? tr.querySelector('.ps-badge').parentElement : null;
            if (td) td.innerHTML = _customBadge(tr.getAttribute('data-case'));
        });
    }
    function _reloadTable() {
        var body = document.querySelector('#ps-table tbody');
        if (!body) return;
        body.innerHTML = CASE_KEYS.map(_rowHtml).join('');
    }

    var PrintSettingsPage = {
        init: function (container) {
            container.innerHTML = '' +
                '<style>' +
                '.ps-wrap{max-width:1100px;margin:0 auto;}' +
                '.ps-toolbar{display:flex;align-items:center;gap:10px;margin:14px 0;flex-wrap:wrap;}' +
                '#ps-table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;}' +
                '#ps-table th,#ps-table td{border:1px solid #e2e8f0;padding:6px 8px;text-align:center;}' +
                '#ps-table th{background:#f8fafc;color:#475569;font-weight:600;}' +
                '.ps-case{text-align:left;}.ps-case-name{font-weight:600;color:#0f172a;}.ps-case-key{font-size:11px;color:#94a3b8;}' +
                '.ps-num{width:56px;padding:3px 4px;text-align:center;}' +
                'select.ps-orient,select.ps-fit{padding:3px 6px;}' +
                '.ps-badge{font-size:11px;padding:2px 8px;border-radius:10px;}' +
                '.ps-badge-on{background:#dbeafe;color:#1d4ed8;}.ps-badge-off{background:#f1f5f9;color:#94a3b8;}' +
                '.ps-note{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.7;}' +
                '</style>' +
                '<div class="ps-wrap">' +
                '<h2 style="font-size:20px;margin:8px 0 2px;">🖨️ 个人设置 · 打印习惯</h2>' +
                '<p style="font-size:13px;color:var(--muted);margin:0 0 4px;">集中管理各案件报价表的打印/页面设置（仅影响你自己生成的报表）。</p>' +
                '<div class="ps-toolbar">' +
                '<button class="btn primary" id="ps-save-btn">💾 保存全部</button>' +
                '<button class="btn" id="ps-restore-all-btn">全部恢复默认</button>' +
                '<span id="ps-status" style="font-size:13px;color:var(--muted);"></span>' +
                '</div>' +
                '<table id="ps-table"><thead><tr>' +
                '<th style="text-align:left;">案件</th><th>方向</th><th>缩放</th><th>水平居中</th>' +
                '<th>上(英寸)</th><th>下(英寸)</th><th>左(英寸)</th><th>右(英寸)</th><th>状态</th><th>操作</th>' +
                '</tr></thead><tbody>' + CASE_KEYS.map(_rowHtml).join('') + '</tbody></table>' +
                '<div class="ps-note">' +
                '说明：边距单位统一为<b>英寸</b>（1 英寸 ≈ 2.54 cm）。<br>' +
                '<b>缩放</b>：「所有列一页」= 宽度缩到 1 页、高度自动分页；「全部一页」= 宽高都缩到 1 页（内容多时字会变小）。<br>' +
                '修改后点「保存全部」生效；与默认一致的案件不会写入，保持偏好干净。「恢复默认」可单独清除某案件自定义。<br>' +
                '设置在<b>生成报价表</b>时按当前登录账号 + 案件自动应用。' +
                '</div>' +
                '</div>';

            var saveBtn = document.getElementById('ps-save-btn');
            if (saveBtn) saveBtn.addEventListener('click', _saveAll);
            var raBtn = document.getElementById('ps-restore-all-btn');
            if (raBtn) raBtn.addEventListener('click', _restoreAll);
            var body = document.querySelector('#ps-table tbody');
            if (body) {
                body.addEventListener('click', function (e) {
                    var btn = e.target.closest('.ps-restore');
                    if (!btn) return;
                    var tr = btn.closest('tr');
                    if (tr) _restoreOne(tr.getAttribute('data-case'));
                });
            }
        },
        destroy: function () {}
    };

    window.PrintSettingsPage = PrintSettingsPage;
})();
