(() => {
    let containerEl = null, cacheItems = [];
    let searchKw = '';
    let expiryFilter = 'all'; // all | valid | expired | none
    let selectedIds = new Set();
    let _canModify = false;

    const api = p => (window.KS_API_BASE_URL || window.location.origin + '/api') + p;
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = n => { const v = parseFloat(n); return Number.isFinite(v) && v ? v.toFixed(6).replace(/\.?0+$/, '') : ''; };
    const price = v => (v === null || v === undefined || v === '') ? '—' : esc(v);

    const DAY_MS = 24 * 60 * 60 * 1000;
    const HIDE_EXPIRED_DAYS = 7;

    function canModify() {
        const a = window._ksAuth || {};
        if (a.role === 'admin') return true;
        if (a.group === '设计组') return true;
        const perms = a.permissions || [];
        return Array.isArray(perms) && perms.indexOf('temp-price') >= 0;
    }

    // 有效期优先级：0=有效，1=已过期(≤7天)，2=无有效期，-1=过期超7天(隐藏)
    function expiryPriority(item) {
        if (!item.valid_until) return 2;
        const vu = new Date(String(item.valid_until).slice(0, 10) + 'T00:00:00');
        if (isNaN(vu.getTime())) return 2;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - vu) / DAY_MS);
        if (diffDays <= 0) return 0;
        if (diffDays <= HIDE_EXPIRED_DAYS) return 1;
        return -1;
    }

    function getFiltered() {
        const kw = searchKw.trim().toLowerCase();
        const scored = cacheItems.map((item, idx) => ({ item, idx, pri: expiryPriority(item) }));
        let hiddenCount = 0;
        const kept = scored.filter(({ item, pri }) => {
            if (pri === -1) { hiddenCount += 1; return false; }
            if (expiryFilter === 'valid' && pri !== 0) return false;
            if (expiryFilter === 'expired' && pri !== 1) return false;
            if (expiryFilter === 'none' && item.valid_until) return false;
            if (!kw) return true;
            const hay = [item.material_code, item.name, item.spec, item.preinstall].map((x) => String(x || '').toLowerCase()).join(' ');
            return hay.indexOf(kw) >= 0;
        });
        kept.sort((a, b) => (a.pri - b.pri) || (a.idx - b.idx));
        return { items: kept.map((s) => s.item), hiddenCount };
    }

    function buildFilterBar() {
        const expOpts = [
            { v: 'all', l: '全部' },
            { v: 'valid', l: '有效' },
            { v: 'expired', l: '已过期(≤7天)' },
            { v: 'none', l: '无有效期' },
        ].map((o) => '<option value="' + o.v + '"' + (expiryFilter === o.v ? ' selected' : '') + '>' + o.l + '</option>').join('');
        return '<div class="tpdb-filter">' +
            '<span>有效期：</span>' +
            '<select id="tpdb-expiry" class="input" style="width:120px">' + expOpts + '</select>' +
            '</div>' +
            '<div style="margin:10px 0;display:flex;align-items:center;gap:8px">' +
            '<strong>搜索：</strong>' +
            '<input id="tpdb-kw" class="input" style="width:300px" placeholder="按编码 / 品名 / 规格 / 预装情况搜索" value="' + esc(searchKw) + '">' +
            '</div>';
    }

    function preinstallTag(v) {
        const val = v || '预装';
        if (val === '非预装') {
            return '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#fef2f2;color:#dc2626;">非预装</span>';
        }
        return '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#f0fdf4;color:#15803d;">预装</span>';
    }

    function statusPill(item) {
        if (!item || !item.valid_until) return '<span class="tpdb-pill none">无有效期</span>';
        return item.is_expired ? '<span class="tpdb-pill expired">已过期</span>' : '<span class="tpdb-pill valid">有效</span>';
    }

    function buildToolbar() {
        if (!_canModify) return '';
        const { items: filtered, hiddenCount } = getFiltered();
        const allVisibleIds = filtered.map((m) => m.id).filter((x) => x != null);
        const visibleSelected = allVisibleIds.filter((id) => selectedIds.has(id)).length;
        const allChecked = allVisibleIds.length > 0 && visibleSelected === allVisibleIds.length;
        return '<div class="tpdb-toolbar">' +
            '<label class="tpdb-selall"><input type="checkbox" id="tpdb-selall"' + (allChecked ? ' checked' : '') + '> 全选当前结果</label>' +
            '<span class="tpdb-selinfo">已选 <b id="tpdb-selcnt">' + selectedIds.size + '</b> 项</span>' +
            '<button type="button" class="btn small danger" id="tpdb-del-sel" data-cnt="' + selectedIds.size + '"' + (selectedIds.size === 0 ? ' disabled' : '') + '>删除选中</button>' +
            (hiddenCount > 0
                ? '<button type="button" class="btn small warn" id="tpdb-cleanup">清理过期超7天（' + hiddenCount + ' 项）</button>'
                : '') +
            '</div>';
    }

    function buildTable() {
        const { items: filtered, hiddenCount } = getFiltered();
        const cbCol = _canModify ? '<th style="width:34px">选</th>' : '';
        let rows = '';
        filtered.forEach((m, i) => {
            const qty = m.is_carbon_steel ? (m.quantity ?? 0) : '—';
            const cb = _canModify
                ? '<td><input type="checkbox" class="tpdb-row-cb" data-id="' + esc(m.id) + '"' + (selectedIds.has(m.id) ? ' checked' : '') + '></td>'
                : '';
            rows += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                cb +
                '<td class="tpdb-code">' + esc(m.material_code || '—') + '</td>' +
                '<td title="' + esc(m.name || '') + '">' + esc((m.name || '—')) + '</td>' +
                '<td title="' + esc(m.spec || '') + '">' + esc(m.spec || '—') + '</td>' +
                '<td>' + esc(qty) + '</td>' +
                '<td>' + price(m.unit_price_usd) + '</td>' +
                '<td>' + price(m.unit_price_cny) + '</td>' +
                '<td>' + price(m.unit_price_eur) + '</td>' +
                '<td>' + esc(m.unit || '—') + '</td>' +
                '<td>' + esc(m.valid_until || '—') + '</td>' +
                '<td>' + statusPill(m) + '</td>' +
                '<td>' + esc(m.discount || '—') + '</td>' +
                '<td>' + esc(m.mold_fee || '—') + '</td>' +
                '<td>' + esc(m.moq || '—') + '</td>' +
                '<td title="' + esc(m.remark || '') + '">' + esc(m.remark || '—') + '</td>' +
                '<td title="' + esc(m.source_email || '') + '">' + esc((m.source_email || '—').slice(0, 14)) + '</td>' +
                '</tr>';
        });
        if (!rows) {
            const span = _canModify ? 17 : 16;
            rows = '<tr><td colspan="' + span + '" class="tpdb-empty">无数据</td></tr>';
        }

        return '<h3 class="tpdb-h3">临时数据库价格（共 ' + filtered.length + ' 项，来源：ks_inquiry_price_cache）'
            + (hiddenCount > 0 ? '<span class="tpdb-hidden">已隐藏过期超7天 ' + hiddenCount + ' 项</span>' : '') + '</h3>' +
            buildToolbar() +
            '<div class="tpdb-ref-wrap"><table class="tpdb-tbl"><thead><tr>' +
            '<th>序号</th>' + cbCol +
            '<th>物料编码</th><th>品名</th><th>规格</th><th>数量</th>' +
            '<th>单价(美元)</th><th>单价(人民币)</th><th>单价(欧元)</th>' +
            '<th>单位</th><th>有效期</th><th>状态</th>' +
            '<th>折扣</th><th>模具费</th><th>起订量</th><th>备注</th>' +
            '<th>来源</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function buildHtml() {
        return '<section class="section">' +
            '<h2 style="margin:0 0 12px;font-size:16px;font-weight:700">临时数据查询（查看临时数据库价格）</h2>' +
            '<p style="font-size:12px;color:#94a3b8;margin:0 0 12px">数据来源：ks_inquiry_price_cache（询价价格缓存）。报价时未匹配到常规铝价的物料，会先到此缓存自动匹配历史询价价格。</p>' +
            buildFilterBar() +
            '<div class="tpdb-section">' + buildTable() + '</div>' +
            '</section>';
    }

    function ensureStyles() {
        if (document.getElementById('tpdb-css')) return;
        const s = document.createElement('style'); s.id = 'tpdb-css';
        s.textContent =
            '.tpdb-h3{margin:12px 0 6px;font-size:14px;font-weight:700}' +
            '.tpdb-hidden{margin-left:8px;font-size:12px;font-weight:400;color:#dc2626}' +
            '.tpdb-section{margin-bottom:16px}' +
            '.tpdb-filter{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;flex-wrap:wrap}' +
            '.tpdb-tbl{border-collapse:collapse;width:100%;min-width:1200px;margin-bottom:8px}.tpdb-tbl th,.tpdb-tbl td{padding:5px 7px;border:1px solid #e2e8f0;text-align:center;font-size:12px;white-space:nowrap}.tpdb-tbl th{background:#f1f5f9;font-weight:600}' +
            '.tpdb-tbl td:nth-child(4),.tpdb-tbl td:nth-child(3){max-width:160px;overflow:hidden;text-overflow:ellipsis}' +
            '.tpdb-code{font-weight:600;color:#1e40af}' +
            '.tpdb-ref-wrap{overflow-x:auto}' +
            '.tpdb-empty{color:#94a3b8;text-align:center}' +
            '.tpdb-pill{display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600}' +
            '.tpdb-pill.valid{background:#dcfce7;color:#166534}' +
            '.tpdb-pill.expired{background:#fef3c7;color:#92400e}' +
            '.tpdb-pill.none{background:#f1f5f9;color:#64748b}' +
            '.tpdb-toolbar{display:flex;align-items:center;gap:10px;margin:6px 0 8px;font-size:13px;flex-wrap:wrap}' +
            '.tpdb-selall{display:flex;align-items:center;gap:4px;cursor:pointer;user-select:none}' +
            '.tpdb-selinfo{color:#475569}' +
            '.btn.small.danger{background:#dc2626;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer}' +
            '.btn.small.danger:disabled{background:#cbd5e1;cursor:not-allowed}' +
            '.btn.small.warn{background:#f59e0b;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer}' +
            '.tpdb-row-cb{cursor:pointer}';
        document.head.appendChild(s);
    }

    function render() {
        if (!containerEl) return;
        _canModify = canModify();
        containerEl.innerHTML = buildHtml();
        bindEvents();
    }

    function rerenderTable() {
        const sec = containerEl.querySelector('.tpdb-section');
        if (sec) sec.innerHTML = buildTable();
        bindEvents();
    }

    function bindEvents() {
        const kwEl = document.getElementById('tpdb-kw');
        if (kwEl) kwEl.addEventListener('input', () => {
            searchKw = kwEl.value;
            rerenderTable();
        });
        const exEl = document.getElementById('tpdb-expiry');
        if (exEl) exEl.addEventListener('change', () => {
            expiryFilter = exEl.value;
            render();
        });
        if (_canModify) {
            const selAll = document.getElementById('tpdb-selall');
            if (selAll) selAll.addEventListener('change', () => toggleAll(selAll.checked));
            containerEl.querySelectorAll('.tpdb-row-cb').forEach((cb) => {
                cb.addEventListener('change', () => toggleRow(cb.getAttribute('data-id'), cb.checked));
            });
            const delSel = document.getElementById('tpdb-del-sel');
            if (delSel) delSel.addEventListener('click', deleteSelected);
            const cleanup = document.getElementById('tpdb-cleanup');
            if (cleanup) cleanup.addEventListener('click', cleanupExpired);
        }
    }

    function toggleRow(rawId, checked) {
        const id = Number(rawId);
        if (!Number.isFinite(id)) return;
        if (checked) selectedIds.add(id); else selectedIds.delete(id);
        syncSelectAllCheckbox();
        syncSelectionCount();
    }

    function toggleAll(checked) {
        const { items: filtered } = getFiltered();
        filtered.forEach((m) => {
            const id = Number(m.id);
            if (!Number.isFinite(id)) return;
            if (checked) selectedIds.add(id); else selectedIds.delete(id);
        });
        containerEl.querySelectorAll('.tpdb-row-cb').forEach((cb) => {
            cb.checked = checked;
        });
        syncSelectionCount();
    }

    function syncSelectAllCheckbox() {
        const selAll = document.getElementById('tpdb-selall');
        if (!selAll) return;
        const { items: filtered } = getFiltered();
        const ids = filtered.map((m) => Number(m.id)).filter((x) => Number.isFinite(x));
        const sel = ids.filter((id) => selectedIds.has(id)).length;
        selAll.checked = ids.length > 0 && sel === ids.length;
    }

    function syncSelectionCount() {
        const cntEl = document.getElementById('tpdb-selcnt');
        if (cntEl) cntEl.textContent = String(selectedIds.size);
        const btn = document.getElementById('tpdb-del-sel');
        if (btn) {
            btn.setAttribute('data-cnt', String(selectedIds.size));
            btn.disabled = selectedIds.size === 0;
        }
    }

    async function deleteSelected() {
        const ids = Array.from(selectedIds).filter((x) => Number.isFinite(x));
        if (ids.length === 0) return;
        if (!window.confirm('确定要删除选中的 ' + ids.length + ' 项价格缓存吗？此操作不可恢复。')) return;
        const btn = document.getElementById('tpdb-del-sel');
        if (btn) { btn.disabled = true; btn.textContent = '删除中…'; }
        try {
            const r = await fetch(api('/temp-price/price-cache/batch-delete'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: ids }),
            });
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.message || ('删除失败：HTTP ' + r.status));
            const deleted = d.deleted || 0;
            selectedIds.clear();
            await reloadData();
            window.alert('已删除 ' + deleted + ' 项。');
        } catch (e) {
            console.error(e);
            window.alert('删除失败：' + (e && e.message ? e.message : e));
            if (btn) { btn.disabled = selectedIds.size === 0; btn.textContent = '删除选中'; }
        }
    }

    async function cleanupExpired() {
        const { hiddenCount } = getFiltered();
        if (hiddenCount === 0) return;
        if (!window.confirm('确定要清理 ' + hiddenCount + ' 项“过期超7天”的隐藏价格缓存吗？此操作不可恢复。')) return;
        const btn = document.getElementById('tpdb-cleanup');
        if (btn) { btn.disabled = true; btn.textContent = '清理中…'; }
        try {
            const r = await fetch(api('/temp-price/price-cache/cleanup-expired'), {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: HIDE_EXPIRED_DAYS }),
            });
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.message || ('清理失败：HTTP ' + r.status));
            const deleted = d.deleted || 0;
            selectedIds.clear();
            await reloadData();
            window.alert('已清理 ' + deleted + ' 项过期缓存。');
        } catch (e) {
            console.error(e);
            window.alert('清理失败：' + (e && e.message ? e.message : e));
            if (btn) { btn.disabled = false; btn.textContent = '清理过期超7天（' + hiddenCount + ' 项）'; }
        }
    }

    async function reloadData() {
        try {
            const r = await fetch(api('/temp-price/price-cache?limit=2000'), { credentials: 'same-origin' });
            const d = await r.json();
            cacheItems = (d && d.success && Array.isArray(d.items)) ? d.items : [];
        } catch (e) {
            console.error(e);
            cacheItems = [];
        }
        render();
    }

    async function init(el) {
        containerEl = el;
        _canModify = canModify();
        ensureStyles();
        containerEl.innerHTML = '<div style="padding:20px;color:#94a3b8">加载中…</div>';
        await reloadData();
    }

    function destroy() { containerEl = null; cacheItems = []; searchKw = ''; expiryFilter = 'all'; selectedIds = new Set(); _canModify = false; document.getElementById('tpdb-css')?.remove(); }

    window.TempPriceDbPage = { init: init, destroy: destroy };
})();
