(() => {
    let containerEl = null, settings = {}, materials = [];
    let selectedCurrency = 'usd';
    let matTonTier = '50-999';
    let matLenTier = '3+';

    const api = p => (window.KS_API_BASE_URL || window.location.origin + '/api') + p;
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = n => { const v = parseFloat(n); return Number.isFinite(v) && v ? v.toFixed(6).replace(/\.?0+$/, '') : ''; };

    const CODES = [
        { code: 'FEC004', label: 'FEC004' },
        { code: 'FEC006', label: 'FEC006' },
        { code: 'FEC020', label: 'FEC020' },
        { code: 'FEC027', label: 'FEC027' },
        { code: 'FEPJ-0103', label: 'FEPJ-0103' },
        { code: 'FEPJ-0173', label: 'FEPJ-0173' },
        { code: 'FEPJ-0178', label: 'FEPJ-0178' },
        { code: 'FEPJ-2201', label: 'FEPJ-2201' },
        { code: 'FEPJ-2804', label: 'FEPJ-2804' },
        { code: 'FEPJ-2808', label: 'FEPJ-2808' },
    ];

    const CURRENCIES = [
        { key: 'usd', label: '美元' },
        { key: 'eur', label: '欧元' },
        { key: 'rmb_fx', label: '人民币外汇' },
        { key: 'rmb_int', label: '人民币（无汇率）' },
    ];

    const RATE_CURRENCIES = ['usd', 'eur', 'rmb_fx'];
    const TIERS = ['01', '13', '3'];
    const TON_TIERS = ['05', '550', '50999'];
    const CUR_LABELS = { usd: '美元', eur: '欧元', rmb_fx: '人民币外汇', rmb_int: '人民币（无汇率）' };
    const SIDE_LABELS = { ext: '外部', int: '内部' };
    const LEN_LABELS = { '01': '0-1', '13': '1-3', '3': '3+' };
    const TON_TIER_LABELS = { '05': '0-5吨', '550': '5-50吨', '50999': '50-999吨' };
    const TON_TIER_COL_MAP = { '05': '0-5', '550': '5-50', '50999': '50-999' };
    const LEN_TIER_COL_MAP = { '01': '0-1', '13': '1-3', '3': '3+' };

    const MAT_TON_OPTIONS = [
        { label: '0-5吨', value: '0-5' },
        { label: '5-50吨', value: '5-50' },
        { label: '50-999吨', value: '50-999' },
    ];
    const MAT_LEN_OPTIONS = [
        { label: '0-1米', value: '0-1' },
        { label: '1-3米', value: '1-3' },
        { label: '3米+', value: '3+' },
    ];

    let queryRows = [{ code: '', length: '', qty: '', base: '' }];

    function isPJ(code) { return code && code.startsWith('FEPJ'); }

    function tonTypeFromCode(code) {
        if (!code) return '';
        if (isPJ(code)) return code.replace(/-/g, '_');
        var idx = code.indexOf('-');
        return idx > 0 ? code.substring(0, idx) : code;
    }

    function getDBWeight(code) {
        var m = materials.find(function(x) { return x['工程编码'] === code; });
        return m ? parseFloat(m['单重']) || 0 : 0;
    }

    function getDBUnit(code) {
        var m = materials.find(function(x) { return x['工程编码'] === code; });
        return m ? (m['计价单位'] || '米') : '米';
    }

    function calcUnitWeight(code, lengthMM) {
        var dbw = getDBWeight(code);
        if (!dbw) return 0;
        if (isPJ(code)) return dbw;
        var len = parseFloat(lengthMM) || 0;
        return dbw * len / 1000;
    }

    function calcTotalWeight(code, lengthMM, qty, base) {
        return calcUnitWeight(code, lengthMM) * (parseFloat(qty) || 0) * (parseFloat(base) || 0);
    }

    function lengthTier(mm) {
        var v = parseFloat(mm) || 0;
        if (v <= 1000) return '01';
        if (v <= 3000) return '13';
        return '3';
    }

    function tonTier(kg) {
        if (kg <= 5000) return '05';
        if (kg <= 50000) return '550';
        return '50999';
    }

    function matColKey(side, curKey) {
        return side + '_' + matTonTier + '_' + matLenTier + '_' + curKey;
    }

    function calcPrice(code, side, curKey, actualTonTier, actualLenTier) {
        var dbw = getDBWeight(code);
        if (!dbw) return null;
        var tonCol = TON_TIER_COL_MAP[actualTonTier] || actualTonTier;
        var lenCol = LEN_TIER_COL_MAP[actualLenTier] || actualLenTier;
        var colKey = side + '_' + tonCol + '_' + lenCol + '_' + curKey;
        var m = materials.find(function(x) { return x['工程编码'] === code; });
        if (!m) return null;
        var val = parseFloat(m[colKey]);
        if (!Number.isFinite(val) || val === 0) return 0;
        return val;
    }

    function buildWarning() {
        return '<div style="color:#dc2626;font-weight:700;font-size:14px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:12px">' +
            '仅提供部分常见碳钢查询窗口（FEC004、FEC006、FEC020、FEC027、FEPJ-0103、FEPJ-0173、FEPJ-0178、FEPJ-2201、FEPJ-2804、FEPJ-2808）' +
            '</div>';
    }

    function buildCurrencySelector() {
        var opts = CURRENCIES.map(function(c) {
            return '<option value="' + c.key + '"' + (c.key === selectedCurrency ? ' selected' : '') + '>' + c.label + '</option>';
        }).join('');
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
            '<strong>选择货币：</strong>' +
            '<select id="tpq-cur" class="input" style="width:140px">' + opts + '</select></div>';
    }

    function buildFilterButtons() {
        var tonBtns = '';
        MAT_TON_OPTIONS.forEach(function(o) {
            tonBtns += '<button class="btn small tpq-ton-btn' + (matTonTier === o.value ? ' primary' : '') + '" data-ton="' + o.value + '">' + o.label + '</button> ';
        });
        var lenBtns = '';
        MAT_LEN_OPTIONS.forEach(function(o) {
            lenBtns += '<button class="btn small tpq-len-btn' + (matLenTier === o.value ? ' primary' : '') + '" data-len="' + o.value + '">' + o.label + '</button> ';
        });
        return '<div class="tpq-filter">' +
            '<span>吨重范围:</span> ' + tonBtns +
            '<span style="margin-left:16px">长度:</span> ' + lenBtns +
            '</div>';
    }

    function buildQueryTable() {
        var codeOpts = '<option value="">--</option>' + CODES.map(function(c) { return '<option value="' + c.code + '">' + c.label + '</option>'; }).join('');
        var rows = '';
        queryRows.forEach(function(r, i) {
            var uw = calcUnitWeight(r.code, r.length);
            var tw = calcTotalWeight(r.code, r.length, r.qty, r.base);
            var delBtn = queryRows.length > 1 ? '<button class="btn small tpq-del" data-idx="' + i + '" style="color:#dc2626;font-size:12px">删除</button>' : '';
            rows += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td><select class="input tpq-code" data-idx="' + i + '" style="width:100%">' + codeOpts.replace('value="' + r.code + '"', 'value="' + r.code + '" selected') + '</select></td>' +
                '<td><input class="input tpq-len" data-idx="' + i + '" type="number" step="any" value="' + esc(r.length) + '" style="width:70px"></td>' +
                '<td><input class="input tpq-qty" data-idx="' + i + '" type="number" step="any" value="' + esc(r.qty) + '" style="width:60px"></td>' +
                '<td><input class="input tpq-base" data-idx="' + i + '" type="number" step="any" value="' + esc(r.base) + '" style="width:60px"></td>' +
                '<td class="tpq-uw">' + (uw ? fmt(uw) : '') + '</td>' +
                '<td class="tpq-tw">' + (tw ? fmt(tw) : '') + '</td>' +
                '<td><button class="btn small tpq-add" data-idx="' + i + '" style="color:#059669;font-size:12px">新增</button> ' + delBtn + '</td>' +
                '</tr>';
        });
        return '<h3 class="tpq-h3">报价查询</h3>' +
            '<table class="tpq-tbl"><thead><tr>' +
            '<th>序号</th><th>物料编码</th><th>规格长度(mm)</th><th>单基数量</th><th>基数</th>' +
            '<th>单重(自动)</th><th>总重量(kg)</th><th>操作</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function buildStatistics() {
        var codeTotals = {};
        queryRows.forEach(function(r) {
            if (!r.code) return;
            var tw = calcTotalWeight(r.code, r.length, r.qty, r.base);
            if (!codeTotals[r.code]) codeTotals[r.code] = 0;
            codeTotals[r.code] += tw;
        });

        var groups = [];
        var seen = {};
        queryRows.forEach(function(r) {
            if (!r.code) return;
            var key = r.code + '|' + r.length;
            if (seen[key]) return;
            seen[key] = true;
            groups.push({ code: r.code, length: r.length });
        });

        var curLabel = CUR_LABELS[selectedCurrency] || selectedCurrency;
        var rows = '';
        groups.forEach(function(g, i) {
            var totalKG = codeTotals[g.code] || 0;
            var totalTons = totalKG / 1000;
            var tt = tonTier(totalKG);
            var lt = lengthTier(g.length);

            var intPrice = calcPrice(g.code, 'internal', selectedCurrency, tt, lt);
            var extPrice = tt === '50999' ? calcPrice(g.code, 'external', selectedCurrency, tt, lt) : 0;

            var intStr = typeof intPrice === 'string' ? intPrice : (Number.isFinite(intPrice) && intPrice ? fmt(intPrice) : '');
            var extStr = typeof extPrice === 'string' ? extPrice : (Number.isFinite(extPrice) && extPrice ? fmt(extPrice) : '');

            var tonLabel = TON_TIER_LABELS[tt] || tt;
            var lenLabel = LEN_LABELS[lt] || lt;
            var note = lenLabel + '米|' + tonLabel;

            rows += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + esc(g.code) + '</td>' +
                '<td>' + esc(g.length) + '</td>' +
                '<td>' + fmt(totalTons) + '</td>' +
                '<td>' + intStr + '</td>' +
                '<td>' + extStr + '</td>' +
                '<td>' + note + '</td></tr>';
        });

        return '<h3 class="tpq-h3">统计情况</h3>' +
            '<table class="tpq-tbl"><thead><tr>' +
            '<th>序号</th><th>编码</th><th>规格长度</th><th>总重量(吨)</th>' +
            '<th>单价使用价格(' + esc(curLabel) + ')——内部</th>' +
            '<th>单价使用价格(' + esc(curLabel) + ')——外部</th>' +
            '<th>单价使用说明</th>' +
            '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" style="color:#94a3b8">无数据</td></tr>') + '</tbody></table>';
    }

    function buildRefTable() {
        var cur = CURRENCIES.find(function(c) { return c.key === selectedCurrency; });
        var curLabel = cur ? cur.label : selectedCurrency;

        var ths = '<th>' + esc(curLabel) + '-内部</th><th>' + esc(curLabel) + '-外部</th>';

        var rows = '';
        materials.forEach(function(m) {
            var code = m['工程编码'] || '';
            var tp = tonTypeFromCode(code);
            var tpLabel = tp;
            var tpMatch = CODES.find(function(c) { return code === c.code; });
            if (tpMatch) tpLabel = tpMatch.label;
            var intCol = matColKey('internal', selectedCurrency);
            var extCol = matColKey('external', selectedCurrency);
            var cells = '<td>' + fmt(m[intCol]) + '</td><td>' + fmt(m[extCol]) + '</td>';
            rows += '<tr>' +
                '<td>' + esc(code) + '</td>' +
                '<td>' + esc(tpLabel) + '</td>' +
                cells +
                '<td title="' + esc(m['规格说明']) + '">' + esc(String(m['规格说明'] || '').substring(0, 12)) + '</td>' +
                '<td title="' + esc(m['工程品名']) + '">' + esc(String(m['工程品名'] || '').substring(0, 12)) + '</td>' +
                '<td>' + esc(m['计价单位']) + '</td>' +
                '<td>' + esc(m['单重']) + '</td>' +
                '<td>' + esc(m['定价属性']) + '</td></tr>';
        });

        return '<h3 class="tpq-h3">临时数据查看窗口</h3>' +
            '<div class="tpq-ref-wrap"><table class="tpq-tbl tpq-ref"><thead><tr>' +
            '<th>工程编码</th><th>吨价类型</th>' + ths +
            '<th>规格说明</th><th>工程品名</th><th>单位</th><th>单重</th><th>属性</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function buildHtml() {
        return '<section class="section">' +
            '<h2 style="margin:0 0 12px;font-size:16px;font-weight:700">固定物料价格查询</h2>' +
            buildWarning() +
            buildCurrencySelector() +
            '<div class="tpq-section">' + buildQueryTable() + '</div>' +
            '<div class="tpq-section">' + buildStatistics() + '</div>' +
            '</section>';
    }

    function ensureStyles() {
        if (document.getElementById('tpq-css')) return;
        var s = document.createElement('style'); s.id = 'tpq-css';
        s.textContent =
            '.tpq-h3{margin:12px 0 6px;font-size:14px;font-weight:700}' +
            '.tpq-section{margin-bottom:16px}' +
            '.tpq-filter{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;flex-wrap:wrap}' +
            '.tpq-tbl{border-collapse:collapse;width:100%;min-width:600px;margin-bottom:8px}.tpq-tbl th,.tpq-tbl td{padding:4px 6px;border:1px solid #e2e8f0;text-align:center;font-size:12px;white-space:nowrap}.tpq-tbl th{background:#f1f5f9;font-weight:600}.tpq-tbl .input{width:100%;text-align:center;font-size:12px}' +
            '.tpq-ref-wrap{overflow-x:auto}.tpq-ref{min-width:700px}.tpq-ref td{font-size:11px}';
        document.head.appendChild(s);
    }

    function syncInputs() {
        queryRows.forEach(function(r, i) {
            var codeEl = containerEl.querySelector('.tpq-code[data-idx="' + i + '"]');
            var lenEl = containerEl.querySelector('.tpq-len[data-idx="' + i + '"]');
            var qtyEl = containerEl.querySelector('.tpq-qty[data-idx="' + i + '"]');
            var baseEl = containerEl.querySelector('.tpq-base[data-idx="' + i + '"]');
            if (codeEl) r.code = codeEl.value;
            if (lenEl) r.length = lenEl.value;
            if (qtyEl) r.qty = qtyEl.value;
            if (baseEl) r.base = baseEl.value;
        });
    }

    function render() {
        if (!containerEl) return;
        containerEl.innerHTML = buildHtml();
        bindEvents();
    }

    function bindEvents() {
        var curEl = document.getElementById('tpq-cur');
        if (curEl) curEl.addEventListener('change', function() {
            selectedCurrency = curEl.value;
            render();
        });

        containerEl.querySelectorAll('.tpq-ton-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                matTonTier = btn.dataset.ton;
                render();
            });
        });

        containerEl.querySelectorAll('.tpq-len-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                matLenTier = btn.dataset.len;
                render();
            });
        });

        containerEl.querySelectorAll('.tpq-code,.tpq-len,.tpq-qty,.tpq-base').forEach(function(el) {
            el.addEventListener('input', function() {
                var idx = parseInt(el.dataset.idx, 10);
                if (el.classList.contains('tpq-code')) queryRows[idx].code = el.value;
                if (el.classList.contains('tpq-len')) queryRows[idx].length = el.value;
                if (el.classList.contains('tpq-qty')) queryRows[idx].qty = el.value;
                if (el.classList.contains('tpq-base')) queryRows[idx].base = el.value;
                refreshAutoCells();
                refreshStats();
            });
        });

        containerEl.querySelectorAll('.tpq-add').forEach(function(btn) {
            btn.addEventListener('click', function() {
                syncInputs();
                var idx = parseInt(btn.dataset.idx, 10);
                queryRows.splice(idx + 1, 0, { code: '', length: '', qty: '', base: '' });
                render();
            });
        });

        containerEl.querySelectorAll('.tpq-del').forEach(function(btn) {
            btn.addEventListener('click', function() {
                syncInputs();
                var idx = parseInt(btn.dataset.idx, 10);
                queryRows.splice(idx, 1);
                render();
            });
        });
    }

    function refreshAutoCells() {
        queryRows.forEach(function(r, i) {
            var uw = calcUnitWeight(r.code, r.length);
            var tw = calcTotalWeight(r.code, r.length, r.qty, r.base);
            var row = containerEl.querySelectorAll('.tpq-tbl tbody tr')[i];
            if (!row) return;
            var uwTd = row.querySelectorAll('td')[5];
            var twTd = row.querySelectorAll('td')[6];
            if (uwTd) uwTd.textContent = uw ? fmt(uw) : '';
            if (twTd) twTd.textContent = tw ? fmt(tw) : '';
        });
    }

    function refreshStats() {
        syncInputs();
        var statsSection = containerEl.querySelectorAll('.tpq-section')[1];
        if (statsSection) statsSection.innerHTML = buildStatistics();
    }

    async function init(el) {
        containerEl = el;
        ensureStyles();
        try {
            var sr = await fetch(api('/temp-price/settings'), { credentials: 'same-origin' });
            var sd = await sr.json();
            if (sd.success && sd.settings) settings = sd.settings;
        } catch (e) { console.error(e); }
        try {
            var mr = await fetch(api('/temp-price/materials?pageSize=200'), { credentials: 'same-origin' });
            var md = await mr.json();
            if (md.success) materials = md.materials || [];
        } catch (e) { console.error(e); }
        render();
    }

    function destroy() { containerEl = null; settings = {}; materials = []; queryRows = [{ code: '', length: '', qty: '', base: '' }]; document.getElementById('tpq-css')?.remove(); }

    window.TempPriceQueryPage = { init: init, destroy: destroy };
})();
