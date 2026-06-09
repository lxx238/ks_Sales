(() => {
    let containerEl = null, materials = [], settings = {};
    let currentPage = 1, pageSize = 50, totalPages = 0, totalCount = 0;
    let selectedCodes = new Set();
    let tonWeight = 999;
    let matTonTier = '50-999';
    let matLenTier = '3+';

    const api = p => (window.KS_API_BASE_URL || window.location.origin + '/api') + p;
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tr = (v, n) => { n = n || 10; const s = String(v ?? ''); return s.length > n ? s.slice(0, n) + '\u2026' : s; };
    const fmt = n => { const v = parseFloat(n); return Number.isFinite(v) && v ? v.toFixed(6).replace(/\.?0+$/, '') : ''; };

    const STANDARD_TON_TYPES = [
        { key: 'FEC004', label: 'FEC004' },
        { key: 'FEC006', label: 'FEC006' },
        { key: 'FEC020', label: 'FEC020' },
        { key: 'FEC027', label: 'FEC027' },
        { key: 'FEPJ_0103', label: 'FEPJ-0103' },
        { key: 'FEPJ_0173', label: 'FEPJ-0173' },
        { key: 'FEPJ_0178', label: 'FEPJ-0178' },
        { key: 'FEPJ_2201', label: 'FEPJ-2201' },
        { key: 'FEPJ_2804', label: 'FEPJ-2804' },
        { key: 'FEPJ_2808', label: 'FEPJ-2808' },
    ];

    let tonPriceTypes = STANDARD_TON_TYPES.slice();

    const LEN_TIERS = [
        { key: '01', label: '0-1' },
        { key: '13', label: '1-3' },
        { key: '3', label: '3+' },
    ];

    const TON_TIERS = [
        { key: '05', label: '0-5\u5428' },
        { key: '550', label: '5-50\u5428' },
        { key: '50999', label: '50-999\u5428' },
    ];

    const TON_WEIGHT_OPTIONS = [
        { label: '0-5\u5428', value: 5 },
        { label: '6-50\u5428', value: 50 },
        { label: '51-999\u5428', value: 999 },
    ];

    const MAT_TON_OPTIONS = [
        { label: '0-5\u5428', value: '0-5' },
        { label: '5-50\u5428', value: '5-50' },
        { label: '50-999\u5428', value: '50-999' },
    ];

    const MAT_LEN_OPTIONS = [
        { label: '0-1\u7c73', value: '0-1' },
        { label: '1-3\u7c73', value: '1-3' },
        { label: '3\u7c73+', value: '3+' },
    ];

    const CURRENCIES = [
        { key: 'usd', label: '美元', hasRate: true },
        { key: 'eur', label: '欧元', hasRate: true },
        { key: 'rmb_fx', label: '人民币外汇', hasRate: true },
        { key: 'rmb_int', label: '人民币（无汇率）', hasRate: false },
    ];

    const RATE_CURRENCIES = CURRENCIES.filter(function(c) { return c.hasRate; });

    const CUR_LABELS = { rmb_fx: '\u4eba\u6c11\u5e01\u5916', usd: '\u7f8e\u5143', eur: '\u6b27\u5143', rmb_int: '\u4eba\u6c11\u5e01\uff08\u65e0\u6c47\u7387\uff09' };
    const SIDE_LABELS = { ext: '\u5916\u90e8', int: '\u5185\u90e8' };
    const LEN_LABELS = { '01': '0-1', '13': '1-3', '3': '3+' };

    function matColKey(side, curKey) {
        return side + '_' + matTonTier + '_' + matLenTier + '_' + curKey;
    }

    function tonTierFromWeight(w) {
        var v = parseFloat(w);
        if (!Number.isFinite(v) || v <= 0) return '50999';
        if (v <= 5) return '05';
        if (v <= 50) return '550';
        return '50999';
    }

    function tonTierLabel(key) {
        var t = TON_TIERS.find(function(x) { return x.key === key; });
        return t ? t.label : key;
    }

    function getVal(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function tonTypeFromCode(code) {
        if (!code) return '';
        if (code.startsWith('FEPJ')) return code.replace(/-/g, '_');
        var idx = code.indexOf('-');
        return idx > 0 ? code.substring(0, idx) : code;
    }

    function recalcAll() {
        var tt = tonTierFromWeight(tonWeight);
        var isExtBlocked = (tt !== '50999');
        materials.forEach(function(m, i) {
            var w = m['\u5355\u91cd'];
            var tp = tonTypeFromCode(m['\u5de5\u7a0b\u7f16\u7801']);
            var isPJ = tp.startsWith('FEPJ_');

            RATE_CURRENCIES.forEach(function(cur) {
                var ex = parseFloat(getVal('tp-ex-' + cur.key)) || 0;
                var pt = parseFloat(getVal('tp-pt-' + cur.key)) || 0;
                LEN_TIERS.forEach(function(lt) {
                    var tonVal;
                    if (isPJ) {
                        tonVal = parseFloat(getVal('tp-ton-' + tp + '-int-' + tt)) || 0;
                    } else {
                        tonVal = parseFloat(getVal('tp-ton-' + tp + '-int-' + lt.key + '-' + tt)) || 0;
                    }
                    var iEl = document.getElementById('tp-i-' + i + '-' + cur.key + '-' + lt.key);
                    if (iEl) iEl.textContent = (Number.isFinite(+w) && tonVal > 0) ? fmt(+w * tonVal) : '';

                    if (isPJ) {
                        tonVal = parseFloat(getVal('tp-ton-' + tp + '-ext-50999')) || 0;
                    } else {
                        tonVal = parseFloat(getVal('tp-ton-' + tp + '-ext-' + lt.key + '-50999')) || 0;
                    }
                    var eEl = document.getElementById('tp-e-' + i + '-' + cur.key + '-' + lt.key);
                    if (eEl) {
                        if (isExtBlocked) {
                            eEl.textContent = '\u5428\u91cd\u4f4e\u65e0\u6cd5\u62a5\u4ef7';
                        } else if (Number.isFinite(+w) && tonVal > 0 && ex > 0 && pt > 0) {
                            eEl.textContent = fmt(+w * tonVal / ex / pt);
                        } else {
                            eEl.textContent = '';
                        }
                    }
                });
            });

            var rmbInt = CURRENCIES.find(function(c) { return c.key === 'rmb_int'; });
            LEN_TIERS.forEach(function(lt) {
                var tonVal;
                if (isPJ) {
                    tonVal = parseFloat(getVal('tp-ton-' + tp + '-int-' + tt)) || 0;
                } else {
                    tonVal = parseFloat(getVal('tp-ton-' + tp + '-int-' + lt.key + '-' + tt)) || 0;
                }
                var iEl = document.getElementById('tp-i-' + i + '-' + rmbInt.key + '-' + lt.key);
                if (iEl) iEl.textContent = (Number.isFinite(+w) && tonVal > 0) ? fmt(+w * tonVal) : '';

                if (isPJ) {
                    tonVal = parseFloat(getVal('tp-ton-' + tp + '-ext-50999')) || 0;
                } else {
                    tonVal = parseFloat(getVal('tp-ton-' + tp + '-ext-' + lt.key + '-50999')) || 0;
                }
                var eEl = document.getElementById('tp-e-' + i + '-' + rmbInt.key + '-' + lt.key);
                if (eEl) {
                    if (isExtBlocked) {
                        eEl.textContent = '\u5428\u91cd\u4f4e\u65e0\u6cd5\u62a5\u4ef7';
                    } else if (Number.isFinite(+w) && tonVal > 0) {
                        eEl.textContent = fmt(+w * tonVal);
                    } else {
                        eEl.textContent = '';
                    }
                }
            });
        });
    }

    function updateDisplayTable() {
        var tt = tonTierFromWeight(tonWeight);
        var isExtBlocked = (tt !== '50999');
        var tierLabel = tonTierLabel(tt);
        var labelEl = document.getElementById('tp-tier-label');
        if (labelEl) labelEl.textContent = '\u5f53\u524d: ' + tierLabel;

        tonPriceTypes.forEach(function(tp) {
            var k = tp.key;
            var isPJ = k.startsWith('FEPJ_');
            LEN_TIERS.forEach(function(lt) {
                var intVal = '', extVal = '';
                if (isPJ) {
                    intVal = getVal('tp-ton-' + k + '-int-' + tt);
                    extVal = getVal('tp-ton-' + k + '-ext-50999');
                } else {
                    intVal = getVal('tp-ton-' + k + '-int-' + lt.key + '-' + tt);
                    extVal = getVal('tp-ton-' + k + '-ext-' + lt.key + '-50999');
                }
                var dIntEl = document.getElementById('tp-d-' + k + '-int-' + lt.key);
                var dExtEl = document.getElementById('tp-d-' + k + '-ext-' + lt.key);
                if (dIntEl) dIntEl.textContent = intVal || '';
                if (dExtEl) {
                    if (isExtBlocked) {
                        dExtEl.textContent = '\u5428\u91cd\u4f4e\u65e0\u6cd5\u62a5\u4ef7';
                    } else {
                        dExtEl.textContent = extVal || '';
                    }
                }
            });
        });
    }

    function buildExchangeSection() {
        var h = '<div class="tp-sg"><h3 class="tp-h3">\u6c47\u7387/\u70b9\u6570</h3>' +
            '<table class="tp-st"><thead><tr><th>\u5e01\u79cd</th><th>\u6c47\u7387</th><th>\u70b9\u6570</th></tr></thead><tbody>';
        RATE_CURRENCIES.forEach(function(cur) {
            var k = cur.key;
            h += '<tr><td><strong>' + cur.label + '</strong></td>' +
                '<td><input class="input tp-param tp-ex" id="tp-ex-' + k + '" type="number" step="any" value="' + esc(settings['exchange_rate_' + k] || '') + '"></td>' +
                '<td><input class="input tp-param tp-pt" id="tp-pt-' + k + '" type="number" step="any" value="' + esc(settings['points_' + k] || '') + '"></td></tr>';
        });
        h += '</tbody></table></div>';
        return h;
    }

    function buildDisplaySection() {
        var tt = tonTierFromWeight(tonWeight);
        var isExtBlocked = (tt !== '50999');
        var tierLabel = tonTierLabel(tt);
        var btns = '';
        TON_WEIGHT_OPTIONS.forEach(function(o) {
            btns += '<button class="btn small tp-tw-btn' + (tonWeight === o.value ? ' primary' : '') + '" data-tw="' + o.value + '">' + o.label + '</button> ';
        });
        var h = '<div class="tp-sg"><h3 class="tp-h3">\u5428\u4ef7\u663e\u793a\uff08\u81ea\u52a8\u5339\u914d\uff09</h3>' +
            '<div class="tp-tw-row">' +
            '<span>\u5428\u91cd\u9009\u62e9:</span> ' + btns +
            '<span id="tp-tier-label" style="color:#2563eb;font-weight:600">\u5f53\u524d: ' + tierLabel + '</span>' +
            '</div>' +
            '<table class="tp-st"><thead><tr>' +
            '<th>\u7f16\u7801</th>' +
            '<th>\u5185\u90e8\u5428\u4ef7(0-1)</th><th>\u5185\u90e8\u5428\u4ef7(1-3)</th><th>\u5185\u90e8\u5428\u4ef7(3+)</th>' +
            '<th>\u5916\u90e8\u5428\u4ef7(0-1)</th><th>\u5916\u90e8\u5428\u4ef7(1-3)</th><th>\u5916\u90e8\u5428\u4ef7(3+)</th>' +
            '</tr></thead><tbody>';

        tonPriceTypes.forEach(function(tp) {
            var k = tp.key;
            var isPJ = k.startsWith('FEPJ_');
            h += '<tr><td><strong>' + esc(tp.label) + '</strong></td>';
            LEN_TIERS.forEach(function(lt) {
                var intVal;
                if (isPJ) {
                    intVal = settings['ton_' + k + '_int_' + tt] || '';
                } else {
                    intVal = settings['ton_' + k + '_int_' + lt.key + '_' + tt] || '';
                }
                h += '<td id="tp-d-' + k + '-int-' + lt.key + '">' + esc(intVal) + '</td>';
            });
            LEN_TIERS.forEach(function(lt) {
                if (isExtBlocked) {
                    h += '<td id="tp-d-' + k + '-ext-' + lt.key + '" class="tp-na">\u5428\u91cd\u4f4e\u65e0\u6cd5\u62a5\u4ef7</td>';
                } else {
                    var ev;
                    if (isPJ) {
                        ev = settings['ton_' + k + '_ext_50999'] || '';
                    } else {
                        ev = settings['ton_' + k + '_ext_' + lt.key + '_50999'] || '';
                    }
                    h += '<td id="tp-d-' + k + '-ext-' + lt.key + '">' + esc(ev) + '</td>';
                }
            });
            h += '</tr>';
        });
        h += '</tbody></table></div>';
        return h;
    }

    function buildMaterialSection() {
        var tonBtns = '';
        MAT_TON_OPTIONS.forEach(function(o) {
            tonBtns += '<button class="btn small tp-mt-ton-btn' + (matTonTier === o.value ? ' primary' : '') + '" data-ton="' + o.value + '">' + o.label + '</button> ';
        });
        var lenBtns = '';
        MAT_LEN_OPTIONS.forEach(function(o) {
            lenBtns += '<button class="btn small tp-mt-len-btn' + (matLenTier === o.value ? ' primary' : '') + '" data-len="' + o.value + '">' + o.label + '</button> ';
        });

        var showExt = (matTonTier === '50-999');

        var rows = '';
        materials.forEach(function(m) {
            var ck = selectedCodes.has(m['\u5de5\u7a0b\u7f16\u7801']) ? 'checked' : '';
            var tpType = tonTypeFromCode(m['\u5de5\u7a0b\u7f16\u7801']);
            var tpLabel = tpType;
            tonPriceTypes.forEach(function(t) { if (t.key === tpType) tpLabel = t.label; });
            var cells = '';
            CURRENCIES.forEach(function(cur) {
                cells += '<td>' + fmt(m[matColKey('internal', cur.key)]) + '</td>';
                if (showExt) {
                    cells += '<td>' + fmt(m[matColKey('external', cur.key)]) + '</td>';
                }
            });
            rows += '<tr>' +
                '<td><input type="checkbox" class="tp-ck" data-code="' + esc(m['\u5de5\u7a0b\u7f16\u7801']) + '" ' + ck + '></td>' +
                '<td class="tp-ed" data-code="' + esc(m['\u5de5\u7a0b\u7f16\u7801']) + '" title="' + esc(m['\u5de5\u7a0b\u7f16\u7801']) + '">' + esc(tr(m['\u5de5\u7a0b\u7f16\u7801'])) + '</td>' +
                '<td>' + esc(tpLabel) + '</td>' +
                '<td>' + esc(m['\u5355\u91cd']) + '</td>' +
                cells +
                '<td title="' + esc(m['\u89c4\u683c\u8bf4\u660e']) + '">' + esc(tr(m['\u89c4\u683c\u8bf4\u660e'])) + '</td>' +
                '<td title="' + esc(m['\u5de5\u7a0b\u54c1\u540d']) + '">' + esc(tr(m['\u5de5\u7a0b\u54c1\u540d'])) + '</td>' +
                '<td>' + esc(m['\u8ba1\u4ef7\u5355\u4f4d']) + '</td>' +
                '<td>' + esc(m['\u5b9a\u4ef7\u5c5e\u6027']) + '</td></tr>';
        });

        var ps = (currentPage - 1) * pageSize + 1;
        var pe = Math.min(currentPage * pageSize, totalCount);
        var allCk = materials.length > 0 && materials.every(function(m) { return selectedCodes.has(m['\u5de5\u7a0b\u7f16\u7801']); });

        var priceThs = '';
        CURRENCIES.forEach(function(cur) {
            priceThs += '<th>\u5185-' + cur.label + '</th>';
            if (showExt) {
                priceThs += '<th>\u5916-' + cur.label + '</th>';
            }
        });

        var h = '<div class="tp-pager">' +
            '<button class="btn small" id="tp-prev">\u4e0a\u4e00\u9875</button>' +
            '<span class="tp-pg">\u5171 ' + totalCount + ' \u6761\uff0c\u7b2c' + ps + '-' + pe + '\uff08\u7b2c' + currentPage + '/' + totalPages + '\u9875\uff09</span>' +
            '<button class="btn small" id="tp-next">\u4e0b\u4e00\u9875</button>' +
            '<button class="btn" id="tp-add">\u6dfb\u52a0\u7269\u6599</button> ' +
            '<button class="btn" id="tp-del" style="color:#dc2626">\u5220\u9664\u9009\u4e2d(' + selectedCodes.size + ')</button> ' +
            '<button class="btn" id="tp-export" style="background:#059669;color:#fff">\u5bfc\u51faExcel</button></div>' +
            '<div class="tp-mt-filter">' +
            '<span>\u5428\u91cd\u8303\u56f4:</span> ' + tonBtns +
            '<span style="margin-left:16px">\u957f\u5ea6:</span> ' + lenBtns +
            '</div>' +
            '<div class="tp-sg"><table class="tp-mt"><thead><tr>' +
            '<th><input type="checkbox" id="tp-ck-all" ' + (allCk ? 'checked' : '') + '></th>' +
            '<th>\u5de5\u7a0b\u7f16\u7801</th><th>\u5428\u4ef7\u7c7b\u578b</th><th>\u5355\u91cd</th>' +
            priceThs +
            '<th>\u89c4\u683c\u8bf4\u660e</th><th>\u5de5\u7a0b\u54c1\u540d</th><th>\u5355\u4f4d</th><th>\u5c5e\u6027</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';
        return h;
    }

    function buildEditSection() {
        var h = '<div class="tp-sg"><h3 class="tp-h3">\u5b8c\u6574\u5428\u4ef7\u5e95\u8868\uff08\u53ef\u7f16\u8f91\uff09</h3>' +
            '<div style="display:flex;gap:8px;margin-bottom:8px">' +
            '<button class="btn small" id="tp-dl-ton" style="background:#059669;color:#fff">\u4e0b\u8f7d\u5428\u4ef7\u5e95\u8868</button>' +
            '<label class="btn small" style="background:#2563eb;color:#fff;cursor:pointer">\u6279\u91cf\u5bfc\u5165\u5428\u4ef7<input type="file" id="tp-imp-ton" accept=".xlsx,.xls" style="display:none"></label>' +
            '<span id="tp-ton-imp-st" style="font-size:12px;color:#475569"></span>' +
            '</div>' +
            '<table class="tp-st tp-edit"><thead>';

        h += '<tr><th rowspan="2">\u7f16\u7801</th>';
        TON_TIERS.forEach(function(tt) {
            h += '<th colspan="3">\u5185\u90e8 ' + tt.label + '</th>';
        });
        h += '<th colspan="3">\u5916\u90e8 50-999\u5428</th></tr><tr>';
        TON_TIERS.forEach(function() {
            LEN_TIERS.forEach(function(lt) { h += '<th>' + lt.label + '</th>'; });
        });
        LEN_TIERS.forEach(function(lt) { h += '<th>' + lt.label + '</th>'; });
        h += '</tr></thead><tbody>';

        tonPriceTypes.forEach(function(tp) {
            var k = tp.key;
            var isPJ = k.startsWith('FEPJ_');
            h += '<tr><td><strong>' + esc(tp.label) + '</strong></td>';
            if (isPJ) {
                TON_TIERS.forEach(function(tt) {
                    var sk = 'ton_' + k + '_int_' + tt.key;
                    h += '<td colspan="3"><input class="input tp-param tp-ton" id="tp-ton-' + k + '-int-' + tt.key + '" type="number" step="any" value="' + esc(settings[sk] || '') + '" style="width:80px"></td>';
                });
                var sk = 'ton_' + k + '_ext_50999';
                h += '<td colspan="3"><input class="input tp-param tp-ton" id="tp-ton-' + k + '-ext-50999' + '" type="number" step="any" value="' + esc(settings[sk] || '') + '" style="width:80px"></td>';
            } else {
                TON_TIERS.forEach(function(tt) {
                    LEN_TIERS.forEach(function(lt) {
                        var sk = 'ton_' + k + '_int_' + lt.key + '_' + tt.key;
                        h += '<td><input class="input tp-param tp-ton" id="tp-ton-' + k + '-int-' + lt.key + '-' + tt.key + '" type="number" step="any" value="' + esc(settings[sk] || '') + '"></td>';
                    });
                });
                LEN_TIERS.forEach(function(lt) {
                    var sk = 'ton_' + k + '_ext_' + lt.key + '_50999';
                    h += '<td><input class="input tp-param tp-ton" id="tp-ton-' + k + '-ext-' + lt.key + '-50999' + '" type="number" step="any" value="' + esc(settings[sk] || '') + '"></td>';
                });
            }
            h += '</tr>';
        });
        h += '</tbody></table></div>';
        return h;
    }

    function buildHtml() {
        return '<section class="section">' +
            '<h2 style="margin:0">\u4e34\u65f6\u4ef7\u683c\u8bbe\u7f6e</h2>' +
            '<p style="font-size:12px;color:#94a3b8">内汇公式: 单重×吨价 &nbsp;|&nbsp; 外汇公式: 单重×吨价÷汇率÷点数 &nbsp;|&nbsp; 人民币（无汇率）无汇率点数为内汇 &nbsp;|&nbsp; 内=内部公司吨价，外=外部公司吨价</p>' +
            buildExchangeSection() +
            buildEditSection() +
            '<div class="tp-toolbar">' +
            '<button class="btn primary" id="tp-update">\u4fdd\u5b58\u5e76\u66f4\u65b0\u4ef7\u683c</button> ' +
            '<span id="tp-status" class="tp-ss"></span></div>' +
            buildDisplaySection() +
            buildMaterialSection() +
            '<div id="tp-modal-root"></div></section>';
    }

    function ensureStyles() {
        if (document.getElementById('tp-css')) return;
        var s = document.createElement('style'); s.id = 'tp-css';
        s.textContent =
            '.tp-sg{overflow-x:auto;margin-top:12px}.tp-st{border-collapse:collapse;width:100%;min-width:600px}.tp-st th,.tp-st td{padding:5px 6px;border:1px solid #e2e8f0;text-align:center;font-size:12px}.tp-st th{background:#f1f5f9;font-weight:600;white-space:nowrap}.tp-st .input{width:65px;text-align:center;font-size:12px}.tp-st .tp-na{color:#94a3b8;font-size:11px}.tp-st .tp-pj-cell{text-align:left;padding-left:12px}' +
            '.tp-edit{min-width:1100px}' +
            '.tp-mt{border-collapse:collapse;width:100%;min-width:800px}.tp-mt th,.tp-mt td{padding:2px 4px;border:1px solid #e2e8f0;font-size:11px;white-space:nowrap;line-height:1.3}.tp-mt th{background:#f1f5f9;font-weight:600;position:sticky;top:0;z-index:1}.tp-mt tbody tr:nth-child(even){background:#f8fafc}.tp-mt .tp-ed{cursor:pointer;color:#2563eb;text-decoration:underline}' +
            '.tp-mt-filter{display:flex;align-items:center;gap:8px;margin-top:8px;margin-bottom:8px;font-size:13px;flex-wrap:wrap}' +
            '.tp-h3{margin:8px 0 4px;font-size:14px}.tp-tw-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px}.tp-toolbar{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}.tp-pager{display:flex;align-items:center;gap:8px;margin-top:8px}.tp-pg{font-size:13px;color:#475569}' +
            '.tp-ss{font-size:13px;margin-left:8px}.tp-ss.ok{color:#16a34a}.tp-ss.err{color:#dc2626}.tp-ss.ld{color:#2563eb}' +
            '.tp-modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:2000}.tp-modal-box{background:#fff;border-radius:14px;padding:20px;width:min(520px,calc(100vw - 32px));box-shadow:0 20px 40px rgba(0,0,0,.2)}.tp-modal-box h3{margin:0 0 14px;font-size:16px}.tp-modal-box label{display:block;margin-bottom:10px;font-size:13px;color:#475569}.tp-modal-box .input{width:100%;margin-top:3px}.tp-modal-box .tp-btns{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}';
        document.head.appendChild(s);
    }

    function bindEvents() {
        containerEl.querySelectorAll('.tp-param').forEach(function(i) { i.addEventListener('input', recalcAll); });
        containerEl.querySelectorAll('.tp-ton').forEach(function(i) { i.addEventListener('input', updateDisplayTable); });

        document.getElementById('tp-update').addEventListener('click', handleUpdate);
        document.getElementById('tp-add').addEventListener('click', function() { showMaterialModal(); });
        document.getElementById('tp-del').addEventListener('click', handleDelete);
        document.getElementById('tp-export').addEventListener('click', handleExport);
        document.getElementById('tp-dl-ton').addEventListener('click', function() { window.open(api('/temp-price/export-ton'), '_blank'); });
        document.getElementById('tp-imp-ton').addEventListener('change', handleImportTon);
        document.getElementById('tp-prev').addEventListener('click', function() { if (currentPage > 1) { currentPage--; loadPage(); } });
        document.getElementById('tp-next').addEventListener('click', function() { if (currentPage < totalPages) { currentPage++; loadPage(); } });

        containerEl.querySelectorAll('.tp-tw-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                tonWeight = parseInt(btn.dataset.tw, 10);
                readInputs();
                renderPage();
            });
        });

        containerEl.querySelectorAll('.tp-mt-ton-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                matTonTier = btn.dataset.ton;
                renderPage();
            });
        });

        containerEl.querySelectorAll('.tp-mt-len-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                matLenTier = btn.dataset.len;
                renderPage();
            });
        });

        document.getElementById('tp-ck-all').addEventListener('change', function(e) {
            var ck = e.target.checked;
            containerEl.querySelectorAll('.tp-ck').forEach(function(cb) {
                cb.checked = ck;
                if (ck) selectedCodes.add(cb.dataset.code); else selectedCodes.delete(cb.dataset.code);
            });
            updateDelBtn();
        });

        containerEl.querySelectorAll('.tp-ck').forEach(function(cb) {
            cb.addEventListener('change', function() {
                if (cb.checked) selectedCodes.add(cb.dataset.code); else selectedCodes.delete(cb.dataset.code);
                updateDelBtn();
            });
        });

        containerEl.querySelectorAll('.tp-ed').forEach(function(td) {
            td.addEventListener('click', function() { showMaterialModal(td.dataset.code); });
        });
    }

    function updateDelBtn() {
        var btn = document.getElementById('tp-del');
        if (btn) btn.textContent = '\u5220\u9664\u9009\u4e2d(' + selectedCodes.size + ')';
    }

    function readInputs() {
        tonPriceTypes.forEach(function(tp) {
            var k = tp.key;
            var isPJ = k.startsWith('FEPJ_');
            if (isPJ) {
                TON_TIERS.forEach(function(tt) {
                    settings['ton_' + k + '_int_' + tt.key] = (document.getElementById('tp-ton-' + k + '-int-' + tt.key) || {}).value || '';
                });
                settings['ton_' + k + '_ext_50999'] = (document.getElementById('tp-ton-' + k + '-ext-50999') || {}).value || '';
            } else {
                TON_TIERS.forEach(function(tt) {
                    LEN_TIERS.forEach(function(lt) {
                        settings['ton_' + k + '_int_' + lt.key + '_' + tt.key] = (document.getElementById('tp-ton-' + k + '-int-' + lt.key + '-' + tt.key) || {}).value || '';
                    });
                });
                LEN_TIERS.forEach(function(lt) {
                    settings['ton_' + k + '_ext_' + lt.key + '_50999'] = (document.getElementById('tp-ton-' + k + '-ext-' + lt.key + '-50999') || {}).value || '';
                });
            }
        });
        RATE_CURRENCIES.forEach(function(cur) {
            var k = cur.key;
            settings['exchange_rate_' + k] = (document.getElementById('tp-ex-' + k) || {}).value || '';
            settings['points_' + k] = (document.getElementById('tp-pt-' + k) || {}).value || '';
        });
    }

    function renderPage() {
        containerEl.innerHTML = buildHtml();
        bindEvents();
        recalcAll();
        updateDisplayTable();
    }

    async function loadPage() {
        readInputs();
        try {
            var sr = await fetch(api('/temp-price/settings'), { credentials: 'same-origin' });
            var sd = await sr.json();
            if (sd.success && sd.settings) {
                var newKeys = Object.keys(sd.settings);
                newKeys.forEach(function(k) { if (!(k in settings)) settings[k] = sd.settings[k]; });
                Object.keys(settings).forEach(function(k) { if (newKeys.indexOf(k) >= 0) settings[k] = sd.settings[k]; });
            }
            if (sd.success && sd.tonPriceTypes) tonPriceTypes = sd.tonPriceTypes;
        } catch (e) { console.error(e); }
        try {
            var r = await fetch(api('/temp-price/materials?page=' + currentPage + '&pageSize=' + pageSize), { credentials: 'same-origin' });
            var d = await r.json();
            if (d.success) { materials = d.materials || []; totalCount = d.total; currentPage = d.page; totalPages = d.totalPages; }
        } catch (e) { console.error(e); }
        renderPage();
    }

    async function handleUpdate() {
        var st = document.getElementById('tp-status');
        if (st) { st.textContent = '\u6b63\u5728\u66f4\u65b0...'; st.className = 'tp-ss ld'; }
        readInputs();
        try {
            var r = await fetch(api('/temp-price/update'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: settings }) });
            var d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.message || '\u5931\u8d25');
            if (st) { st.textContent = '\u6210\u529f\uff0c\u66f4\u65b0 ' + d.updated + ' \u6761'; st.className = 'tp-ss ok'; }
            await loadPage();
        } catch (e) {
            if (st) { st.textContent = '\u5931\u8d25: ' + e.message; st.className = 'tp-ss err'; }
        }
    }

    function handleExport() {
        var url = api('/temp-price/export?tonTier=' + encodeURIComponent(matTonTier) + '&lengthTier=' + encodeURIComponent(matLenTier));
        window.open(url, '_blank');
    }

    async function handleImportTon(e) {
        var file = e.target.files[0];
        if (!file) return;
        var st = document.getElementById('tp-ton-imp-st');
        if (st) { st.textContent = '\u5bfc\u5165\u4e2d...'; st.style.color = '#2563eb'; }
        try {
            var fd = new FormData();
            fd.append('file', file);
            var r = await fetch(api('/temp-price/import-ton'), { method: 'POST', credentials: 'same-origin', body: fd });
            var d = await r.json();
            if (!d.success) throw new Error(d.message);
            if (st) { st.textContent = '\u5bfc\u5165\u6210\u529f\uff0c\u66f4\u65b0 ' + d.updated + ' \u4e2a\u5428\u4ef7'; st.style.color = '#16a34a'; }
            await loadPage();
        } catch (err) {
            if (st) { st.textContent = '\u5bfc\u5165\u5931\u8d25: ' + err.message; st.style.color = '#dc2626'; }
        }
        e.target.value = '';
    }

    async function handleDelete() {
        if (selectedCodes.size === 0) return;
        if (!confirm('\u786e\u5b9a\u5220\u9664 ' + selectedCodes.size + ' \u6761\u7269\u6599\uff1f')) return;
        try {
            var r = await fetch(api('/temp-price/materials/delete'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes: Array.from(selectedCodes) }) });
            var d = await r.json();
            if (!d.success) throw new Error(d.message);
            selectedCodes.clear();
            await loadPage();
        } catch (e) { alert('\u5220\u9664\u5931\u8d25: ' + e.message); }
    }

    function showMaterialModal(editCode) {
        var root = document.getElementById('tp-modal-root');
        var m = editCode ? materials.find(function(x) { return x['\u5de5\u7a0b\u7f16\u7801'] === editCode; }) : null;
        var title = m ? '\u7f16\u8f91\u7269\u6599' : '\u6dfb\u52a0\u7269\u6599';
        var codeVal = m ? esc(m['\u5de5\u7a0b\u7f16\u7801']) : '';
        var codeDisabled = m ? 'disabled' : '';
        var lookupHint = m ? '' : '<span id="tp-m-hint" style="font-size:11px;color:#94a3b8">\u8f93\u5165\u5de5\u7a0b\u7f16\u7801\u540e\u6309\u56de\u8f66\u81ea\u52a8\u67e5\u8be2</span>';

        var unitVal = m ? esc(m['\u8ba1\u4ef7\u5355\u4f4d']) : '\u7c73';
        var tpVal = m ? tonTypeFromCode(m['\u5de5\u7a0b\u7f16\u7801']) : '';

        root.innerHTML = '<div class="tp-modal"><div class="tp-modal-box"><h3>' + title + '</h3>' +
            '<label>\u5de5\u7a0b\u7f16\u7801<input class="input" id="tp-m-code" value="' + codeVal + '" ' + codeDisabled + '></label>' +
            lookupHint +
            '<label>\u89c4\u683c\u8bf4\u660e<input class="input" id="tp-m-spec" value="' + (m ? esc(m['\u89c4\u683c\u8bf4\u660e']) : '') + '" ' + (m ? '' : 'readonly') + '></label>' +
            '<label>\u5de5\u7a0b\u54c1\u540d<input class="input" id="tp-m-name" value="' + (m ? esc(m['\u5de5\u7a0b\u54c1\u540d']) : '') + '" ' + (m ? '' : 'readonly') + '></label>' +
            '<label>\u5b9a\u4ef7\u5c5e\u6027<input class="input" id="tp-m-attr" value="' + (m ? esc(m['\u5b9a\u4ef7\u5c5e\u6027']) : '') + '" readonly></label>' +
            '<label>\u5428\u4ef7\u7c7b\u578b<input class="input" id="tp-m-ton-type" value="' + esc(tpVal) + '" readonly></label>' +
            '<label>\u8ba1\u4ef7\u5355\u4f4d<input class="input" id="tp-m-unit" list="tp-unit-list" value="' + unitVal + '"><datalist id="tp-unit-list"><option value="\u7c73"><option value="\u652f"><option value="\u5957"><option value="\u4e2a"></datalist></label>' +
            '<label>\u5355\u91cd<input class="input" id="tp-m-weight" value="' + (m ? esc(m['\u5355\u91cd']) : '') + '"></label>' +
            '<div class="tp-btns"><button class="btn" id="tp-m-cancel">\u53d6\u6d88</button><button class="btn primary" id="tp-m-save">\u4fdd\u5b58</button></div>' +
            '</div></div>';

        document.getElementById('tp-m-cancel').addEventListener('click', function() { root.innerHTML = ''; });
        root.querySelector('.tp-modal').addEventListener('click', function(e) { if (e.target === e.currentTarget) root.innerHTML = ''; });

        if (!m) {
            var codeInput = document.getElementById('tp-m-code');
            codeInput.addEventListener('blur', function() { doLookup(codeInput.value.trim()); });
            codeInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doLookup(codeInput.value.trim()); } });
        }

        document.getElementById('tp-m-save').addEventListener('click', async function() {
            var payload = {
                '\u5de5\u7a0b\u7f16\u7801': document.getElementById('tp-m-code').value.trim(),
                '\u89c4\u683c\u8bf4\u660e': document.getElementById('tp-m-spec').value.trim(),
                '\u5de5\u7a0b\u54c1\u540d': document.getElementById('tp-m-name').value.trim(),
                '\u8ba1\u4ef7\u5355\u4f4d': document.getElementById('tp-m-unit').value.trim(),
                '\u5355\u91cd': document.getElementById('tp-m-weight').value.trim(),
                '\u5b9a\u4ef7\u5c5e\u6027': document.getElementById('tp-m-attr').value.trim(),
                '\u5428\u4ef7\u7c7b\u578b': tonTypeFromCode(document.getElementById('tp-m-code').value.trim()),
            };
            try {
                var url, method;
                if (editCode) {
                    url = api('/temp-price/material/' + encodeURIComponent(editCode));
                    method = 'PUT';
                } else {
                    url = api('/temp-price/material');
                    method = 'POST';
                }
                var r = await fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                var d = await r.json();
                if (!d.success) throw new Error(d.message);
                root.innerHTML = '';
                await loadPage();
            } catch (e) { alert('\u4fdd\u5b58\u5931\u8d25: ' + e.message); }
        });
    }

    async function doLookup(code) {
        var hint = document.getElementById('tp-m-hint');
        if (!code) return;
        if (hint) { hint.textContent = '\u67e5\u8be2\u4e2d...'; hint.style.color = '#2563eb'; }
        try {
            var r = await fetch(api('/temp-price/lookup?code=' + encodeURIComponent(code)), { credentials: 'same-origin' });
            var d = await r.json();
            if (!d.success) {
                if (hint) { hint.textContent = d.message || '\u7f16\u7801\u4e0d\u5b58\u5728'; hint.style.color = '#dc2626'; }
                document.getElementById('tp-m-spec').value = '';
                document.getElementById('tp-m-name').value = '';
                document.getElementById('tp-m-attr').value = '';
                return;
            }
            var data = d.data;
            document.getElementById('tp-m-spec').value = data['\u89c4\u683c\u8bf4\u660e'] || '';
            document.getElementById('tp-m-name').value = data['\u5de5\u7a0b\u54c1\u540d'] || '';
            document.getElementById('tp-m-attr').value = data['\u5b9a\u4ef7\u5c5e\u6027'] || '';
            document.getElementById('tp-m-unit').value = data['\u8ba1\u4ef7\u5355\u4f4d'] || '\u7c73';
            document.getElementById('tp-m-weight').value = data['\u5355\u91cd'] || '';
            var tonTypeEl = document.getElementById('tp-m-ton-type');
            if (tonTypeEl) tonTypeEl.value = tonTypeFromCode(code);
            if (hint) { hint.textContent = '\u67e5\u8be2\u6210\u529f'; hint.style.color = '#16a34a'; }
        } catch (e) {
            if (hint) { hint.textContent = '\u67e5\u8be2\u5931\u8d25'; hint.style.color = '#dc2626'; }
        }
    }

    async function init(el) {
        containerEl = el; ensureStyles();
        try {
            var sr = await fetch(api('/temp-price/settings'), { credentials: 'same-origin' });
            var sd = await sr.json();
            if (sd.success && sd.settings) settings = sd.settings;
            if (sd.success && sd.tonPriceTypes) tonPriceTypes = sd.tonPriceTypes;

            var mr = await fetch(api('/temp-price/materials?page=1&pageSize=' + pageSize), { credentials: 'same-origin' });
            var md = await mr.json();
            if (md.success) { materials = md.materials || []; totalCount = md.total; currentPage = md.page; totalPages = md.totalPages; }
        } catch (e) { console.error(e); }
        renderPage();
    }

    function destroy() { containerEl = null; materials = []; settings = {}; selectedCodes.clear(); document.getElementById('tp-css')?.remove(); }

    window.TempPricePage = { init: init, destroy: destroy };
})();
