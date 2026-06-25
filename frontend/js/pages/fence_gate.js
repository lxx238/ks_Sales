(() => {
    // 围栏/门物料价格从后端 fence_gate_materials 数据库动态抓取（不再写死）。
    let priceMap = {};
    let priceMapPromise = null;

    function ensureFencePrices() {
        if (priceMapPromise) return priceMapPromise;
        priceMapPromise = fetch('/api/fence-materials/prices', { credentials: 'same-origin' })
            .then(function (resp) { return resp.ok ? resp.json() : { success: false }; })
            .then(function (payload) {
                priceMap = (payload && payload.success && payload.data) ? payload.data : {};
                return priceMap;
            })
            .catch(function () { priceMap = {}; return priceMap; });
        return priceMapPromise;
    }

    function getMaterialRecord(code) {
        return priceMap[code] || null;
    }

    function getMaterialName(code, fallback) {
        const rec = getMaterialRecord(code);
        return (rec && rec.name) ? rec.name : (fallback || '');
    }

    function getMaterialSpec(code, fallback) {
        const rec = getMaterialRecord(code);
        return (rec && rec.spec) ? rec.spec : (fallback || '');
    }

    const FENCE_STYLE_META_74 = {
        "38CC-100": { type: "fence", height: 1000, meshCode: "FN01-W0101-1000", meshCodeThick: "FN01-W0102-1000", postCode: "FN01-L0203-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1160", postSpec: "38*1.5*1160" },
        "38CC-120": { type: "fence", height: 1200, meshCode: "FN01-W0101-1200", meshCodeThick: "FN01-W0102-1200", postCode: "FN01-L0204-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1410", postSpec: "38*1.5*1410" },
        "38CC-150": { type: "fence", height: 1500, meshCode: "FN01-W0101-1500", meshCodeThick: "FN01-W0102-1500", postCode: "FN01-L0205-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1710", postSpec: "38*1.5*1710" },
        "38CC-180": { type: "fence", height: 1800, meshCode: "FN01-W0101-1800", meshCodeThick: "FN01-W0102-1800", postCode: "FN01-L0206-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2060", postSpec: "38*1.5*2060" },
        "38CC-200": { type: "fence", height: 2000, meshCode: "FN01-W0101-2000", meshCodeThick: "FN01-W0102-2000", postCode: "FN01-L0207-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2260", postSpec: "38*1.5*2260" },
        "48CC-100": { type: "fence", height: 1000, meshCode: "FN01-W0101-1000", meshCodeThick: "FN01-W0102-1000", postCode: "FN01-L0103-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1160", postSpec: "48*2.0*1160" },
        "48CC-120": { type: "fence", height: 1200, meshCode: "FN01-W0101-1200", meshCodeThick: "FN01-W0102-1200", postCode: "FN01-L0104-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1410", postSpec: "48*2.0*1410" },
        "48CC-150": { type: "fence", height: 1500, meshCode: "FN01-W0101-1500", meshCodeThick: "FN01-W0102-1500", postCode: "FN01-L0105-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1710", postSpec: "48*2.0*1710" },
        "48CC-180": { type: "fence", height: 1800, meshCode: "FN01-W0101-1800", meshCodeThick: "FN01-W0102-1800", postCode: "FN01-L0106-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2060", postSpec: "48*2.0*2060" },
        "48CC-200": { type: "fence", height: 2000, meshCode: "FN01-W0101-2000", meshCodeThick: "FN01-W0102-2000", postCode: "FN01-L0107-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2260", postSpec: "48*2.0*2260" },
        "CP-100": { type: "direct", height: 1000, meshCode: "FN01-W0101-1000", meshCodeThick: "FN01-W0102-1000", postCode: "FN01-L1103-1460", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "1460", postSpec: "48*2.0*1460削尖" },
        "CP-120": { type: "direct", height: 1200, meshCode: "FN01-W0101-1200", meshCodeThick: "FN01-W0102-1200", postCode: "FN01-L1104-1760", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "1760", postSpec: "48*2.0*1760削尖" },
        "CP-150": { type: "direct", height: 1500, meshCode: "FN01-W0101-1500", meshCodeThick: "FN01-W0102-1500", postCode: "FN01-L1105-2210", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "2210", postSpec: "48*2.0*2210削尖" },
        "CP-180": { type: "direct", height: 1800, meshCode: "FN01-W0101-1800", meshCodeThick: "FN01-W0102-1800", postCode: "FN01-L1106-2660", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "2660", postSpec: "48*2.0*2660削尖" },
        "CP-200": { type: "direct", height: 2000, meshCode: "FN01-W0101-2000", meshCodeThick: "FN01-W0102-2000", postCode: "FN01-L1107-2960", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "2960", postSpec: "48*2.0*2960削尖" },
        "38CG-100": { type: "fence", height: 1000, meshCode: "FN01-W0101-1000", meshCodeThick: "FN01-W0102-1000", postCode: "FN01-L0203-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1160", postSpec: "38*1.5*1160" },
        "38CG-120": { type: "fence", height: 1200, meshCode: "FN01-W0101-1200", meshCodeThick: "FN01-W0102-1200", postCode: "FN01-L0204-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1410", postSpec: "38*1.5*1410" },
        "38CG-150": { type: "fence", height: 1500, meshCode: "FN01-W0101-1500", meshCodeThick: "FN01-W0102-1500", postCode: "FN01-L0205-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1710", postSpec: "38*1.5*1710" },
        "38CG-180": { type: "fence", height: 1800, meshCode: "FN01-W0101-1800", meshCodeThick: "FN01-W0102-1800", postCode: "FN01-L0206-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2060", postSpec: "38*1.5*2060" },
        "38CG-200": { type: "fence", height: 2000, meshCode: "FN01-W0101-2000", meshCodeThick: "FN01-W0102-2000", postCode: "FN01-L0207-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2260", postSpec: "38*1.5*2260" },
        "48CG-100": { type: "fence", height: 1000, meshCode: "FN01-W0101-1000", meshCodeThick: "FN01-W0102-1000", postCode: "FN01-L0103-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1160", postSpec: "48*2.0*1160" },
        "48CG-120": { type: "fence", height: 1200, meshCode: "FN01-W0101-1200", meshCodeThick: "FN01-W0102-1200", postCode: "FN01-L0104-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1410", postSpec: "48*2.0*1410" },
        "48CG-150": { type: "fence", height: 1500, meshCode: "FN01-W0101-1500", meshCodeThick: "FN01-W0102-1500", postCode: "FN01-L0105-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1710", postSpec: "48*2.0*1710" },
        "48CG-180": { type: "fence", height: 1800, meshCode: "FN01-W0101-1800", meshCodeThick: "FN01-W0102-1800", postCode: "FN01-L0106-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2060", postSpec: "48*2.0*2060" },
        "48CG-200": { type: "fence", height: 2000, meshCode: "FN01-W0101-2000", meshCodeThick: "FN01-W0102-2000", postCode: "FN01-L0107-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2260", postSpec: "48*2.0*2260" }
    };

    const FENCE_STYLE_META_100 = {
        "38C2C-100": { type: "fence", height: 1000, meshCode: "FN01-W0104-1000", meshCodeThick: "FN01-W0104-1000", postCode: "FN01-L0203-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1160", postSpec: "38*1.5*1160" },
        "38C2C-120": { type: "fence", height: 1200, meshCode: "FN01-W0104-1200", meshCodeThick: "FN01-W0104-1200", postCode: "FN01-L0204-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1410", postSpec: "38*1.5*1410" },
        "38C2C-150": { type: "fence", height: 1500, meshCode: "FN01-W0104-1500", meshCodeThick: "FN01-W0104-1500", postCode: "FN01-L0205-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1710", postSpec: "38*1.5*1710" },
        "38C2C-180": { type: "fence", height: 1800, meshCode: "FN01-W0104-1800", meshCodeThick: "FN01-W0104-1800", postCode: "FN01-L0206-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2060", postSpec: "38*1.5*2060" },
        "38C2C-200": { type: "fence", height: 2000, meshCode: "FN01-W0104-2000", meshCodeThick: "FN01-W0104-2000", postCode: "FN01-L0207-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2260", postSpec: "38*1.5*2260" },
        "48C2C-100": { type: "fence", height: 1000, meshCode: "FN01-W0104-1000", meshCodeThick: "FN01-W0104-1000", postCode: "FN01-L0103-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1160", postSpec: "48*2.0*1160" },
        "48C2C-120": { type: "fence", height: 1200, meshCode: "FN01-W0104-1200", meshCodeThick: "FN01-W0104-1200", postCode: "FN01-L0104-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1410", postSpec: "48*2.0*1410" },
        "48C2C-150": { type: "fence", height: 1500, meshCode: "FN01-W0104-1500", meshCodeThick: "FN01-W0104-1500", postCode: "FN01-L0105-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1710", postSpec: "48*2.0*1710" },
        "48C2C-180": { type: "fence", height: 1800, meshCode: "FN01-W0104-1800", meshCodeThick: "FN01-W0104-1800", postCode: "FN01-L0106-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2060", postSpec: "48*2.0*2060" },
        "48C2C-200": { type: "fence", height: 2000, meshCode: "FN01-W0104-2000", meshCodeThick: "FN01-W0104-2000", postCode: "FN01-L0107-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2260", postSpec: "48*2.0*2260" },
        "C2P-100": { type: "direct", height: 1000, meshCode: "FN01-W0104-1000", meshCodeThick: "FN01-W0104-1000", postCode: "FN01-L1103-1460", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "1460", postSpec: "48*2.0*1460削尖" },
        "C2P-120": { type: "direct", height: 1200, meshCode: "FN01-W0104-1200", meshCodeThick: "FN01-W0104-1200", postCode: "FN01-L1104-1760", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "1760", postSpec: "48*2.0*1760削尖" },
        "C2P-150": { type: "direct", height: 1500, meshCode: "FN01-W0104-1500", meshCodeThick: "FN01-W0104-1500", postCode: "FN01-L1105-2210", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "2210", postSpec: "48*2.0*2210削尖" },
        "C2P-180": { type: "direct", height: 1800, meshCode: "FN01-W0104-1800", meshCodeThick: "FN01-W0104-1800", postCode: "FN01-L1106-2660", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "2660", postSpec: "48*2.0*2660削尖" },
        "C2P-200": { type: "direct", height: 2000, meshCode: "FN01-W0104-2000", meshCodeThick: "FN01-W0104-2000", postCode: "FN01-L1107-2960", pileCode: null, endCap: "XJ-0008", rubber: null, postLen: "2960", postSpec: "48*2.0*2960削尖" },
        "38C2G-100": { type: "fence", height: 1000, meshCode: "FN01-W0104-1000", meshCodeThick: "FN01-W0104-1000", postCode: "FN01-L0203-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1160", postSpec: "38*1.5*1160" },
        "38C2G-120": { type: "fence", height: 1200, meshCode: "FN01-W0104-1200", meshCodeThick: "FN01-W0104-1200", postCode: "FN01-L0204-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1410", postSpec: "38*1.5*1410" },
        "38C2G-150": { type: "fence", height: 1500, meshCode: "FN01-W0104-1500", meshCodeThick: "FN01-W0104-1500", postCode: "FN01-L0205-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "1710", postSpec: "38*1.5*1710" },
        "38C2G-180": { type: "fence", height: 1800, meshCode: "FN01-W0104-1800", meshCodeThick: "FN01-W0104-1800", postCode: "FN01-L0206-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2060", postSpec: "38*1.5*2060" },
        "38C2G-200": { type: "fence", height: 2000, meshCode: "FN01-W0104-2000", meshCodeThick: "FN01-W0104-2000", postCode: "FN01-L0207-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0017", rubber: "XJ-0018", postLen: "2260", postSpec: "38*1.5*2260" },
        "48C2G-100": { type: "fence", height: 1000, meshCode: "FN01-W0104-1000", meshCodeThick: "FN01-W0104-1000", postCode: "FN01-L0103-1160", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1160", postSpec: "48*2.0*1160" },
        "48C2G-120": { type: "fence", height: 1200, meshCode: "FN01-W0104-1200", meshCodeThick: "FN01-W0104-1200", postCode: "FN01-L0104-1410", pileCode: "FN-D48T3-600", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1410", postSpec: "48*2.0*1410" },
        "48C2G-150": { type: "fence", height: 1500, meshCode: "FN01-W0104-1500", meshCodeThick: "FN01-W0104-1500", postCode: "FN01-L0105-1710", pileCode: "FN-D48T3-750", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "1710", postSpec: "48*2.0*1710" },
        "48C2G-180": { type: "fence", height: 1800, meshCode: "FN01-W0104-1800", meshCodeThick: "FN01-W0104-1800", postCode: "FN01-L0106-2060", pileCode: "FN-D48T3-900", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2060", postSpec: "48*2.0*2060" },
        "48C2G-200": { type: "fence", height: 2000, meshCode: "FN01-W0104-2000", meshCodeThick: "FN01-W0104-2000", postCode: "FN01-L0107-2260", pileCode: "FN-D48T3-1000", endCap: "XJ-0008", rubber: "XJ-0018", postLen: "2260", postSpec: "48*2.0*2260" }
    };

    const COLOR_PREFIX_MAP = {
        '白色浸塑': 'FN01', '咖啡色浸塑': 'FN02', '绿色浸塑': 'FN03',
        '灰褐色浸塑': 'FN04', '深茶色浸塑': 'FN05', '银灰色浸塑': 'FN06',
        '黑色浸塑': 'FN07', '深咖色浸塑': 'FN08', '热镀锌': 'FN11',
        '咖啡浸塑': 'FN02', '绿浸塑': 'FN03',
        '灰褐浸塑': 'FN04', '深茶浸塑': 'FN05', '银灰浸塑': 'FN06',
        '黑浸塑': 'FN07', '深咖浸塑': 'FN08',
    };

    function getGateSeriesByType(gateType) {
        if (gateType === "single_1200") return "M0001";
        if (gateType === "double_2400") return "M0002";
        if (gateType === "double_4200") return "M0003";
        if (gateType === "sliding_custom") return "M0004";
        if (gateType === "folding_custom") return "M0005";
        return "M0003";
    }

    function getGateMeshBaseCode(gateType, height) {
        const series = getGateSeriesByType(gateType);
        const hCode = getGateHeightCode(height);
        const hMap = { "100": 1000, "120": 1200, "150": 1500, "180": 1800, "200": 2000 };
        return `${series}-${hMap[hCode] || 1000}`;
    }

    const DEFAULT_STATE = {
        activeTab: "fence",
        fence: {
            meshType: "74x150",
            style: "38CC-100",
            totalLength: 2,
            cornerQty: 0,
            wireDiameter: "3.0",
            surface: "白色浸塑"
        },
        gate: {
            gateType: "single_1200",
            gateHeight: "1000",
            baseType: "concrete",
            gateSurface: "白色浸塑",
            gateQty: 1,
            customWidth: ""
        }
    };

    const elements = {};
    let containerEl = null;
    let state = null;
    let cleanupFns = [];

    function ensureStyles() {
        if (document.getElementById("fence-gate-inline-styles")) return;
        const style = document.createElement("style");
        style.id = "fence-gate-inline-styles";
        style.textContent = `
            .fg-shell {
                background: var(--panel);
                border: 1px solid var(--line);
                border-radius: 14px;
                box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
                overflow: hidden;
                font-family: "Malgun Gothic", "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
            }
            .fg-hero {
                background: transparent;
                padding: 28px 32px 24px;
                color: #000;
                border-bottom: none;
            }
            .fg-hero h2 {
                margin: 0 0 4px;
                font-size: 22px;
                font-weight: 700;
                color: #000;
            }
            .fg-hero > p,
            .fg-hero .fg-hero-desc {
                margin: 0 0 16px;
                color: #333;
                line-height: 1.7;
                font-size: 14px;
            }
            .fg-hero .badge {
                background: #f1f5f9;
                color: #000;
                border-color: #e2e8f0;
            }
            .fg-hero .notice {
                background: transparent;
                color: #333;
                border: none;
                padding: 10px 0;
            }
            .fg-section-head {
                display: flex;
                justify-content: space-between;
                gap: 16px;
                align-items: flex-start;
                flex-wrap: wrap;
            }
            .fg-badge-row {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-top: 12px;
            }
            .fg-tabs {
                display: flex;
                gap: 0;
                flex-wrap: wrap;
                padding: 0 32px;
                border-bottom: 1px solid var(--line);
                background: var(--panel);
            }
            .fg-tab-btn {
                padding: 12px 24px;
                border: none;
                background: transparent;
                font-size: 14px;
                font-weight: 600;
                color: #333;
                cursor: pointer;
                border-bottom: 3px solid transparent;
                border-radius: 0;
                transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
                min-width: 0;
                box-shadow: none;
                transform: none;
            }
            .fg-tab-btn:hover {
                color: #000;
                background: #f8fafc;
                box-shadow: none;
                transform: none;
            }
            .fg-tab-btn.is-active {
                color: #000;
                border-bottom-color: #cbd5e1;
                background: #f8fafc;
                font-weight: 700;
            }
            .fg-block {
                padding: 0;
                background: transparent;
                border: none;
                box-shadow: none;
                position: static;
            }
            .fg-block::before {
                display: none;
            }
            .fg-block h3 {
                margin: 0 0 16px;
                font-size: 13px;
                font-weight: 700;
                color: #000;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                padding-left: 14px;
                border-left: 3px solid #cbd5e1;
                border-bottom: none;
            }
            .fg-summary-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 14px;
                margin-top: 20px;
            }
            .fg-summary-card {
                background: #f8fafc;
                border-left: 3px solid #cbd5e1;
                border-radius: 0 12px 12px 0;
                padding: 18px 20px;
                border-top: none;
                border-right: none;
                border-bottom: none;
                box-shadow: none;
            }
            .fg-summary-label {
                font-size: 11px;
                font-weight: 700;
                color: #333;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }
            .fg-summary-value {
                margin-top: 8px;
                font-size: 28px;
                font-weight: 700;
                color: #000;
                font-variant-numeric: tabular-nums;
                font-family: "Malgun Gothic", "Consolas", "Source Code Pro", monospace;
            }
            .fg-summary-meta {
                margin-top: 8px;
                color: #333;
                font-size: 13px;
                line-height: 1.6;
            }
            .fg-table-wrap {
                overflow-x: auto;
                margin-top: 20px;
            }
            .fg-table-wrap table {
                background: transparent;
                border-radius: 0;
            }
            .fg-table-wrap thead th {
                background: #f8fafc;
                color: #000;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                border-bottom: 1px solid #e2e8f0;
                padding: 12px 14px;
            }
            .fg-table-wrap tbody tr {
                transition: background 0.15s ease;
            }
            .fg-table-wrap tbody tr:hover {
                background: #f8fafc;
            }
            .fg-table-wrap td:nth-child(8),
            .fg-table-wrap td:nth-child(9),
            .fg-table-wrap th:nth-child(8),
            .fg-table-wrap th:nth-child(9) {
                font-variant-numeric: tabular-nums;
                font-family: "Malgun Gothic", "Consolas", monospace;
                text-align: right;
            }
            .fg-pane {
                display: none;
                padding: 24px 32px 32px;
            }
            .fg-pane.is-active {
                display: block;
            }
            .fg-note-list {
                display: grid;
                gap: 8px;
                margin-top: 12px;
            }
            .fg-note-list .notice {
                background: #f8fafc;
                border-left: 3px solid #cbd5e1;
            }
            .fg-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                padding: 40px 16px;
                color: #333;
                font-size: 14px;
            }
            .fg-empty svg {
                opacity: 0.6;
            }
            .fg-highlight {
                color: #000;
                font-weight: 700;
            }
            .fg-pane .input {
                border-radius: 8px;
            }
            .fg-pane .input:focus {
                border-color: var(--brand);
                box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
            }
            @media (max-width: 720px) {
                .fg-section-head {
                    flex-direction: column;
                }
                .fg-summary-value {
                    font-size: 24px;
                }
                .fg-hero {
                    padding: 20px 20px 18px;
                }
                .fg-pane {
                    padding: 20px 20px 24px;
                }
                .fg-tabs {
                    padding: 0 20px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function cloneDefaultState() {
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatMoney(value) {
        const number = Number(value || 0);
        return number.toFixed(3);
    }

    function formatQuantity(value) {
        const number = Number(value || 0);
        if (Number.isInteger(number)) return String(number);
        return number.toFixed(1);
    }

    function getFenceDb() {
        return priceMap;
    }

    function getFenceStyleMeta(meshType) {
        return meshType === "74x150" ? FENCE_STYLE_META_74 : FENCE_STYLE_META_100;
    }

    function getFenceStyleGroups(meshType) {
        if (meshType === "74x150") {
            return [
                { label: "38CC 混凝土基础", items: ["38CC-100", "38CC-120", "38CC-150", "38CC-180", "38CC-200"] },
                { label: "48CC 混凝土基础", items: ["48CC-100", "48CC-120", "48CC-150", "48CC-180", "48CC-200"] },
                { label: "CP 一体打入式", items: ["CP-100", "CP-120", "CP-150", "CP-180", "CP-200"] }
            ];
        }
        return [
            { label: "38C2C 混凝土基础", items: ["38C2C-100", "38C2C-120", "38C2C-150", "38C2C-180", "38C2C-200"] },
            { label: "48C2C 混凝土基础", items: ["48C2C-100", "48C2C-120", "48C2C-150", "48C2C-180", "48C2C-200"] },
            { label: "C2P 一体打入式", items: ["C2P-100", "C2P-120", "C2P-150", "C2P-180", "C2P-200"] }
        ];
    }

    function getWireTier(wireValue) {
        return parseFloat(wireValue) <= 3.2 ? "3.0" : "3.5";
    }

    function getFenceMeshPrice(meta, wireValue, meshType) {
        const tier = getWireTier(wireValue);
        const meshCode = tier === "3.5" ? meta.meshCodeThick : meta.meshCode;
        const item = getMaterialRecord(meshCode);
        if (!item) return 0;
        if (tier === "3.5" && item.price_3_5_usd != null) return item.price_3_5_usd;
        return item.price_usd || 0;
    }

    function getFencePartPrice(code) {
        const item = getMaterialRecord(code);
        return (item && item.price_usd) ? item.price_usd : 0;
    }

    function getGateMeshPrice(fullCode) {
        const item = getMaterialRecord(fullCode);
        return (item && item.price_usd) ? item.price_usd : 0;
    }

    function gatePart(code) {
        const rec = getMaterialRecord(code) || {};
        return { name: rec.name || '', spec: rec.spec || '', price: rec.price_usd || 0 };
    }

    function getFenceCoefficient(height) {
        if (height <= 1000) return 2;
        if (height >= 2000) return 4;
        return 3;
    }

    function buildFenceQuote(input) {
        const meshType = input.meshType;
        const styleMeta = getFenceStyleMeta(meshType);
        const meta = styleMeta[input.style];
        if (!meta) {
            return { rows: [], summaryCards: [], tableCaption: "当前围栏样式不存在。" };
        }

        const db = getFenceDb(meshType);
        const totalLength = Math.max(0, Number(input.totalLength) || 0);
        const cornerQty = Math.max(0, parseInt(input.cornerQty, 10) || 0);
        const meshQty = Math.round((totalLength / 2 + cornerQty) * 2) / 2;
        const postQty = meshQty;
        const coefficient = getFenceCoefficient(meta.height);
        const netBuckleQty = postQty * coefficient;
        const hookQty = postQty * coefficient;
        const endCapQty = postQty;

        const meshPrice = getFenceMeshPrice(meta, input.wireDiameter, meshType);
        const postPrice = getFencePartPrice(meta.postCode, meshType);
        const netBucklePrice = getFencePartPrice("FN-PJ-0001", meshType);
        const hookPrice = getFencePartPrice("FN-PJ-0003", meshType);
        const endCapPrice = getFencePartPrice(meta.endCap, meshType);

        const usedMeshCode = getWireTier(input.wireDiameter) === "3.5" ? meta.meshCodeThick : meta.meshCode;
        const fenceSubtotal =
            meshPrice * meshQty +
            postPrice * postQty +
            netBucklePrice * netBuckleQty +
            hookPrice * hookQty +
            endCapPrice * endCapQty;

        const rows = [
            {
                seq: 1,
                code: usedMeshCode,
                name: db[usedMeshCode]?.name || "网片",
                spec: getMaterialSpec(usedMeshCode, ""),
                length: "",
                qty: meshQty,
                remark: input.surface,
                unitPrice: meshPrice,
                lineTotal: meshPrice * meshQty
            },
            {
                seq: 2,
                code: meta.postCode,
                name: db[meta.postCode]?.name || "立柱",
                spec: meta.postSpec,
                length: meta.postLen,
                qty: postQty,
                remark: "",
                unitPrice: postPrice,
                lineTotal: postPrice * postQty
            },
            {
                seq: 3,
                code: "FN-PJ-0001",
                name: "网扣组件",
                spec: "35",
                length: "",
                qty: netBuckleQty,
                remark: "",
                unitPrice: netBucklePrice,
                lineTotal: netBucklePrice * netBuckleQty
            },
            {
                seq: 4,
                code: "FN-PJ-0003",
                name: "M6x70弯钩螺栓组件",
                spec: "M6x70",
                length: "",
                qty: hookQty,
                remark: "",
                unitPrice: hookPrice,
                lineTotal: hookPrice * hookQty
            },
            {
                seq: 5,
                code: meta.endCap,
                name: db[meta.endCap]?.name || "端盖",
                spec: db[meta.endCap]?.spec || "",
                length: "",
                qty: endCapQty,
                remark: "套立柱顶部",
                unitPrice: endCapPrice,
                lineTotal: endCapPrice * endCapQty
            }
        ];

        let pileSubtotal = 0;
        let groundTotal = fenceSubtotal;
        if (meta.type !== "direct" && meta.pileCode) {
            const pileQty = postQty;
            const boltQty = pileQty * 3;
            const rubberQty = pileQty;
            const pilePrice = getFencePartPrice(meta.pileCode, meshType);
            const boltPrice = getFencePartPrice("FA-0020", meshType);
            const rubberPrice = getFencePartPrice(meta.rubber, meshType);
            pileSubtotal = pilePrice * pileQty + boltPrice * boltQty + rubberPrice * rubberQty;
            groundTotal = fenceSubtotal + pileSubtotal;
            const seqBase = rows.length;

            rows.push(
                {
                    seq: seqBase + 1,
                    code: meta.pileCode,
                    name: db[meta.pileCode]?.name || "圆管地桩",
                    spec: db[meta.pileCode]?.spec || "",
                    length: meta.postLen,
                    qty: pileQty,
                    remark: "",
                    unitPrice: pilePrice,
                    lineTotal: pilePrice * pileQty
                },
                {
                    seq: seqBase + 2,
                    code: "FA-0020",
                    name: "SUS304外六角螺栓",
                    spec: "M10x20",
                    length: "",
                    qty: boltQty,
                    remark: "",
                    unitPrice: boltPrice,
                    lineTotal: boltPrice * boltQty
                },
                {
                    seq: seqBase + 3,
                    code: meta.rubber,
                    name: db[meta.rubber]?.name || "橡胶环",
                    spec: db[meta.rubber]?.spec || "",
                    length: "",
                    qty: rubberQty,
                    remark: "套地桩与立柱",
                    unitPrice: rubberPrice,
                    lineTotal: rubberPrice * rubberQty
                }
            );
        }

        const summaryCards = [
            {
                label: "围栏主体",
                value: formatMoney(fenceSubtotal),
                meta: `样式 ${escapeHtml(input.style)} | 网孔 ${escapeHtml(meshType)} | 丝径 ${escapeHtml(input.wireDiameter)} mm`
            }
        ];

        if (meta.type !== "direct") {
            const groundStyle = meshType === "74x150" ? input.style.replace("CC", "CG") : input.style.replace("C2C", "C2G");
            summaryCards.push(
                {
                    label: "地桩附加",
                    value: formatMoney(pileSubtotal),
                    meta: `地桩基础增量成本，包含地桩、螺栓和橡胶环`
                },
                {
                    label: "混凝土基础每套",
                    value: formatMoney(fenceSubtotal),
                    meta: `方案编码 ${escapeHtml(input.style)}`
                },
                {
                    label: "地桩基础每套",
                    value: formatMoney(groundTotal),
                    meta: `方案编码 ${escapeHtml(groundStyle)}`
                }
            );
        } else {
            summaryCards.push({
                label: "一体式基础每套",
                value: formatMoney(fenceSubtotal),
                meta: `方案编码 ${escapeHtml(input.style)}`
            });
        }

        return {
            rows,
            summaryCards,
            tableCaption: `总长 ${formatQuantity(totalLength)} m，拐角 ${cornerQty} 个，系统按半片取整计算围栏套数。`
        };
    }

    function getGateDisplayStyle(gateType, height, baseType, customWidth) {
        let prefix = "";
        let widthCode = "";
        const basePrefix = baseType === "concrete" ? "c" : (baseType === "integrated" ? "p" : "g");
        if (gateType === "single_1200") {
            prefix = "ts" + basePrefix;
            widthCode = "120";
        } else if (gateType === "double_2400") {
            prefix = "td" + basePrefix;
            widthCode = "240";
        } else if (gateType === "double_4200") {
            prefix = "td" + basePrefix;
            widthCode = "420";
        } else if (gateType === "sliding_custom") {
            prefix = "tl" + basePrefix;
            const w = parseInt(customWidth, 10) || 2400;
            widthCode = String(Math.round(w / 10));
        } else if (gateType === "folding_custom") {
            prefix = "tf" + basePrefix;
            const w = parseInt(customWidth, 10) || 2400;
            widthCode = String(Math.round(w / 10));
        } else {
            prefix = "tx" + basePrefix;
            const w = parseInt(customWidth, 10) || 2400;
            widthCode = String(Math.round(w / 10));
        }
        return `${prefix}${widthCode}-${getGateHeightCode(height)}`;
    }

    function getGateHeightCode(height) {
        const val = parseInt(height, 10);
        if (!val) return "150";
        return String(Math.round(val / 10));
    }

    function getGateWidth(gateType, customWidth) {
        if (gateType === "single_1200") return 1200;
        if (gateType === "double_2400") return 2400;
        if (gateType === "double_4200") return 4200;
        return parseInt(customWidth, 10) || 2400;
    }

    function getGatePileLength(height) {
        const value = parseInt(height, 10);
        if (value <= 1200) return 600;
        if (value <= 1500) return 750;
        if (value <= 1800) return 900;
        return 1000;
    }

    function buildGateQuote(input) {
        const style = getGateDisplayStyle(input.gateType, input.gateHeight, input.baseType, input.customWidth);
        const meshBaseCode = getGateMeshBaseCode(input.gateType, input.gateHeight);
        const height = parseInt(input.gateHeight, 10);
        const qty = Math.max(1, parseInt(input.gateQty, 10) || 1);
        const width = getGateWidth(input.gateType, input.customWidth);
        const isSingle = input.gateType === "single_1200";
        const meshQty = 1 * qty;
        const postQty = 2 * qty;

        let buckleQty = 0;
        if (height < 1200) buckleQty = postQty * 2;
        else if (height > 1800) buckleQty = postQty * 4;
        else buckleQty = postQty * 3;

        const boltBase = height < 1500 ? 2 : 3;
        let widthFactor = 2;
        if (width <= 1200) widthFactor = 2;
        else if (width <= 2000) widthFactor = 3;
        else if (width <= 2400) widthFactor = 4;
        else widthFactor = 6;

        const boltQty = boltBase * widthFactor * qty;
        const capQty = postQty;
        const horizontalPinQty = isSingle ? 0 : qty;
        const verticalPinQty = isSingle ? 0 : qty * 2;
        const colorPrefix = COLOR_PREFIX_MAP[input.gateSurface] || 'FN01';
        const fullMeshCode = colorPrefix + '-' + meshBaseCode;
        const meshPrice = getGateMeshPrice(fullMeshCode);

        const fenceSubtotal =
            meshPrice * meshQty +
            gatePart("FN-PJ-0002").price * buckleQty +
            gatePart("FN-PJ-0004").price * boltQty +
            gatePart("XJ-0009").price * capQty +
            gatePart("FN-PJ-0005").price * horizontalPinQty +
            gatePart("FN-PJ-0006").price * verticalPinQty;

        const rows = [
            {
                seq: 1,
                code: fullMeshCode,
                name: "门网片(含门柱门框)",
                spec: getMaterialSpec(fullMeshCode, "74*150*Φ4.2"),
                length: "",
                qty: meshQty,
                remark: input.gateSurface,
                unitPrice: meshPrice,
                lineTotal: meshPrice * meshQty
            },
            {
                seq: 2,
                code: "FN-PJ-0002",
                name: "门扣组件",
                spec: "35",
                length: "",
                qty: buckleQty,
                remark: "",
                unitPrice: gatePart("FN-PJ-0002").price,
                lineTotal: gatePart("FN-PJ-0002").price * buckleQty
            },
            {
                seq: 3,
                code: "FN-PJ-0004",
                name: "M6x50弯钩螺栓组件",
                spec: "M6x50",
                length: "",
                qty: boltQty,
                remark: "",
                unitPrice: gatePart("FN-PJ-0004").price,
                lineTotal: gatePart("FN-PJ-0004").price * boltQty
            },
            {
                seq: 4,
                code: "XJ-0009",
                name: "D60圆管端盖塑料",
                spec: "Φ60",
                length: "",
                qty: capQty,
                remark: "套立柱顶部",
                unitPrice: gatePart("XJ-0009").price,
                lineTotal: gatePart("XJ-0009").price * capQty
            }
        ];

        if (!isSingle) {
            rows.push(
                {
                    seq: 5,
                    code: "FN-PJ-0005",
                    name: "SUS304横插销",
                    spec: "Φ11-150-58",
                    length: "",
                    qty: horizontalPinQty,
                    remark: "",
                    unitPrice: gatePart("FN-PJ-0005").price,
                    lineTotal: gatePart("FN-PJ-0005").price * horizontalPinQty
                },
                {
                    seq: 6,
                    code: "FN-PJ-0006",
                    name: "SUS304竖插销",
                    spec: "Φ16-460-120",
                    length: "",
                    qty: verticalPinQty,
                    remark: "",
                    unitPrice: gatePart("FN-PJ-0006").price,
                    lineTotal: gatePart("FN-PJ-0006").price * verticalPinQty
                }
            );
        }

        let pileSubtotal = 0;
        if (input.baseType === "pile") {
            const pileLength = getGatePileLength(input.gateHeight);
            let pileCode = "FN-D76T3-1000";
            if (pileLength === 600) pileCode = "FN-D76T3-600";
            else if (pileLength === 750) pileCode = "FN-D76T3-750";
            else if (pileLength === 900) pileCode = "FN-D76T3-900";

            const pileQty = postQty;
            const pileBoltQty = pileQty * 3;
            const pileRubberQty = postQty;
            pileSubtotal =
                gatePart(pileCode).price * pileQty +
                gatePart("FA-0137").price * pileBoltQty +
                gatePart("XJ-0011").price * pileRubberQty;
            const seqBase = rows.length;

            rows.push(
                {
                    seq: seqBase + 1,
                    code: pileCode,
                    name: gatePart(pileCode).name,
                    spec: gatePart(pileCode).spec,
                    length: String(pileLength),
                    qty: pileQty,
                    remark: "",
                    unitPrice: gatePart(pileCode).price,
                    lineTotal: gatePart(pileCode).price * pileQty
                },
                {
                    seq: seqBase + 2,
                    code: "FA-0137",
                    name: "SUS304外六角螺栓",
                    spec: "M12x35",
                    length: "",
                    qty: pileBoltQty,
                    remark: "",
                    unitPrice: gatePart("FA-0137").price,
                    lineTotal: gatePart("FA-0137").price * pileBoltQty
                },
                {
                    seq: seqBase + 3,
                    code: "XJ-0011",
                    name: "D76-60橡胶环EPDM",
                    spec: "Φ76-60",
                    length: "",
                    qty: pileRubberQty,
                    remark: "套地桩与立柱",
                    unitPrice: gatePart("XJ-0011").price,
                    lineTotal: gatePart("XJ-0011").price * pileRubberQty
                }
            );
        }

        const selectedTotal = input.baseType === "pile" ? fenceSubtotal + pileSubtotal : fenceSubtotal;
        const summaryCards = [
            {
                label: "门体主体",
                value: formatMoney(fenceSubtotal),
                meta: `门型 ${escapeHtml(style)} | 数量 ${qty} 套 | 规格宽度 ${width} mm`
            }
        ];

        if (input.baseType === "pile") {
            summaryCards.push(
                {
                    label: "地桩附加",
                    value: formatMoney(pileSubtotal),
                    meta: "仅在地桩基础方案下生效"
                },
                {
                    label: "地桩基础总价",
                    value: formatMoney(selectedTotal),
                    meta: `方案编码 ${escapeHtml(style)}`
                }
            );
        } else if (input.baseType === "integrated") {
            summaryCards.push({
                label: "一体式基础总价",
                value: formatMoney(selectedTotal),
                meta: `方案编码 ${escapeHtml(style)}`
            });
        } else {
            summaryCards.push({
                label: "混凝土基础总价",
                value: formatMoney(selectedTotal),
                meta: `方案编码 ${escapeHtml(style)}`
            });
        }

        return {
            rows,
            summaryCards,
            tableCaption: "门扇单价沿用门体规格报价，基础类型只影响附加基础件成本。"
        };
    }

    function buildGateQuoteByStyle(gateStyle, qty) {
        qty = Math.max(0, parseInt(qty, 10) || 0);

        const widthCode = gateStyle.substring(3, 6);
        const heightCode = gateStyle.substring(7);
        const isSingle = widthCode === "120";
        const gateLabel = isSingle ? "单开门" : (widthCode === "240" ? "双开门2.4m" : "双开门4.2m");
        const width = isSingle ? 1200 : (widthCode === "240" ? 2400 : 4200);
        const height = parseInt(heightCode, 10) * 10 || 1500;

        const prefix = gateStyle.substring(0, 3);
        let baseLabel = "混凝土基础";
        if (prefix.endsWith("p")) baseLabel = "一体式基础";
        else if (prefix.endsWith("g")) baseLabel = "地桩基础";

        let series;
        if (prefix.startsWith("t3")) {
            series = isSingle ? "M0301" : (widthCode === "240" ? "M0302" : "M0303");
        } else if (prefix.startsWith("te")) {
            series = isSingle ? "M1001" : (widthCode === "240" ? "M1002" : "M1003");
        } else {
            series = isSingle ? "M0001" : (widthCode === "240" ? "M0002" : "M0003");
        }
        const meshBaseCode = `${series}-${height}`;
        const meshCode = 'FN01-' + meshBaseCode;
        const price = getGateMeshPrice(meshCode);
        if (!price || qty === 0) return { summaryCards: [], rows: [] };

        const meshQty = 1 * qty;
        const postQty = 2 * qty;
        const buckleQty = postQty * (height < 1200 ? 2 : (height > 1800 ? 4 : 3));
        const boltBase = height < 1500 ? 2 : 3;
        let widthFactor = 2;
        if (width <= 1200) widthFactor = 2;
        else if (width <= 2000) widthFactor = 3;
        else if (width <= 2400) widthFactor = 4;
        else widthFactor = 6;
        const boltQty = boltBase * widthFactor * qty;
        const capQty = postQty;
        const horizontalPinQty = isSingle ? 0 : qty;
        const verticalPinQty = isSingle ? 0 : qty * 2;

        const rows = [
            {
                seq: 1,
                code: meshCode,
                name: "门网片(含门柱门框)",
                spec: getMaterialSpec(meshCode, "H" + height + "*W" + width),
                length: "",
                qty: meshQty,
                remark: "",
                unitPrice: price,
                lineTotal: price * meshQty
            },
            {
                seq: 2,
                code: "FN-PJ-0002",
                name: "门扣组件",
                spec: "35",
                length: "",
                qty: buckleQty,
                remark: "",
                unitPrice: gatePart("FN-PJ-0002").price,
                lineTotal: gatePart("FN-PJ-0002").price * buckleQty
            },
            {
                seq: 3,
                code: "FN-PJ-0004",
                name: "M6x50弯钩螺栓组件",
                spec: "M6x50",
                length: "",
                qty: boltQty,
                remark: "",
                unitPrice: gatePart("FN-PJ-0004").price,
                lineTotal: gatePart("FN-PJ-0004").price * boltQty
            },
            {
                seq: 4,
                code: "XJ-0009",
                name: "D60圆管端盖塑料",
                spec: "\u03A660",
                length: "",
                qty: capQty,
                remark: "套立柱顶部",
                unitPrice: gatePart("XJ-0009").price,
                lineTotal: gatePart("XJ-0009").price * capQty
            }
        ];

        if (!isSingle) {
            rows.push(
                {
                    seq: 5,
                    code: "FN-PJ-0005",
                    name: "SUS304横插销",
                    spec: "\u03A611-150-58",
                    length: "",
                    qty: horizontalPinQty,
                    remark: "",
                    unitPrice: gatePart("FN-PJ-0005").price,
                    lineTotal: gatePart("FN-PJ-0005").price * horizontalPinQty
                },
                {
                    seq: 6,
                    code: "FN-PJ-0006",
                    name: "SUS304竖插销",
                    spec: "\u03A616-460-120",
                    length: "",
                    qty: verticalPinQty,
                    remark: "",
                    unitPrice: gatePart("FN-PJ-0006").price,
                    lineTotal: gatePart("FN-PJ-0006").price * verticalPinQty
                }
            );
        }

        if (prefix.endsWith("g")) {
            const pileLength = height <= 1200 ? 600 : (height <= 1500 ? 750 : (height <= 1800 ? 900 : 1000));
            let pileCode = "FN-D76T3-1000";
            if (pileLength === 600) pileCode = "FN-D76T3-600";
            else if (pileLength === 750) pileCode = "FN-D76T3-750";
            else if (pileLength === 900) pileCode = "FN-D76T3-900";
            const pileQty = postQty;
            const pileBoltQty = pileQty * 3;
            const pileRubberQty = postQty;
            const seqBase = rows.length;
            rows.push(
                {
                    seq: seqBase + 1,
                    code: pileCode,
                    name: gatePart(pileCode).name,
                    spec: gatePart(pileCode).spec,
                    length: String(pileLength),
                    qty: pileQty,
                    remark: "",
                    unitPrice: gatePart(pileCode).price,
                    lineTotal: gatePart(pileCode).price * pileQty
                },
                {
                    seq: seqBase + 2,
                    code: "FA-0137",
                    name: "SUS304外六角螺栓",
                    spec: "M12x35",
                    length: "",
                    qty: pileBoltQty,
                    remark: "",
                    unitPrice: gatePart("FA-0137").price,
                    lineTotal: gatePart("FA-0137").price * pileBoltQty
                },
                {
                    seq: seqBase + 3,
                    code: "XJ-0011",
                    name: "D76-60橡胶环EPDM",
                    spec: "\u03A676-60",
                    length: "",
                    qty: pileRubberQty,
                    remark: "套地桩与立柱",
                    unitPrice: gatePart("XJ-0011").price,
                    lineTotal: gatePart("XJ-0011").price * pileRubberQty
                }
            );
        }

        const totalFromRows = rows.reduce((sum, r) => sum + (r.lineTotal || 0), 0);
        const summaryCards = [{
            label: baseLabel + "每套",
            value: formatMoney(totalFromRows),
            meta: gateStyle + " | " + gateLabel + " | 数量 " + qty + " 套 | 单价 " + (totalFromRows / Math.max(1, qty)).toFixed(3)
        }];

        return { summaryCards, rows };
    }

    function buildFenceQuoteByStyle(styleCode, totalLength, cornerQty, wireDiameter, surface) {
        const prefix = styleCode.split("-")[0];
        let meshType, styleMeta;
        if (prefix.includes("C2")) {
            meshType = "100x150";
            styleMeta = FENCE_STYLE_META_100[styleCode];
        } else {
            meshType = "74x150";
            styleMeta = FENCE_STYLE_META_74[styleCode];
        }
        if (!styleMeta) return { summaryCards: [], rows: [] };

        const db = getFenceDb(meshType);
        const totalLen = Math.max(0, Number(totalLength) || 0);
        const corners = Math.max(0, parseInt(cornerQty, 10) || 0);
        const meshQty = Math.round((totalLen / 2 + corners) * 2) / 2;
        const postQty = meshQty;
        const coefficient = getFenceCoefficient(styleMeta.height);
        const netBuckleQty = postQty * coefficient;
        const hookQty = postQty * coefficient;
        const endCapQty = postQty;

        const meshPrice = getFenceMeshPrice(styleMeta, wireDiameter, meshType);
        const postPrice = getFencePartPrice(styleMeta.postCode, meshType);
        const netBucklePrice = getFencePartPrice("FN-PJ-0001", meshType);
        const hookPrice = getFencePartPrice("FN-PJ-0003", meshType);
        const endCapPrice = getFencePartPrice(styleMeta.endCap, meshType);

        const usedMeshCode = getWireTier(wireDiameter) === "3.5" ? styleMeta.meshCodeThick : styleMeta.meshCode;

        const fenceSubtotal =
            meshPrice * meshQty +
            postPrice * postQty +
            netBucklePrice * netBuckleQty +
            hookPrice * hookQty +
            endCapPrice * endCapQty;

        const rows = [
            {
                seq: 1,
                code: usedMeshCode,
                name: db[usedMeshCode]?.name || "网片",
                spec: getMaterialSpec(usedMeshCode, ""),
                length: "",
                qty: meshQty,
                remark: surface || "",
                unitPrice: meshPrice,
                lineTotal: meshPrice * meshQty
            },
            {
                seq: 2,
                code: styleMeta.postCode,
                name: db[styleMeta.postCode]?.name || "立柱",
                spec: styleMeta.postSpec,
                length: styleMeta.postLen,
                qty: postQty,
                remark: "",
                unitPrice: postPrice,
                lineTotal: postPrice * postQty
            },
            {
                seq: 3,
                code: "FN-PJ-0001",
                name: "网扣组件",
                spec: "35",
                length: "",
                qty: netBuckleQty,
                remark: "",
                unitPrice: netBucklePrice,
                lineTotal: netBucklePrice * netBuckleQty
            },
            {
                seq: 4,
                code: "FN-PJ-0003",
                name: "M6x70弯钩螺栓组件",
                spec: "M6x70",
                length: "",
                qty: hookQty,
                remark: "",
                unitPrice: hookPrice,
                lineTotal: hookPrice * hookQty
            },
            {
                seq: 5,
                code: styleMeta.endCap,
                name: db[styleMeta.endCap]?.name || "端盖",
                spec: db[styleMeta.endCap]?.spec || "",
                length: "",
                qty: endCapQty,
                remark: "套立柱顶部",
                unitPrice: endCapPrice,
                lineTotal: endCapPrice * endCapQty
            }
        ];

        let total = fenceSubtotal;
        const isPileStyle = prefix.endsWith("G");

        if (isPileStyle && styleMeta.pileCode) {
            const pileQty = postQty;
            const boltQty = pileQty * 3;
            const rubberQty = pileQty;
            const pilePrice = getFencePartPrice(styleMeta.pileCode, meshType);
            const boltPrice = getFencePartPrice("FA-0020", meshType);
            const rubberPrice = getFencePartPrice(styleMeta.rubber, meshType);
            total += pilePrice * pileQty + boltPrice * boltQty + rubberPrice * rubberQty;
            const seqBase = rows.length;
            rows.push(
                {
                    seq: seqBase + 1,
                    code: styleMeta.pileCode,
                    name: db[styleMeta.pileCode]?.name || "圆管地桩",
                    spec: db[styleMeta.pileCode]?.spec || "",
                    length: styleMeta.postLen,
                    qty: pileQty,
                    remark: "",
                    unitPrice: pilePrice,
                    lineTotal: pilePrice * pileQty
                },
                {
                    seq: seqBase + 2,
                    code: "FA-0020",
                    name: "SUS304外六角螺栓",
                    spec: "M10x20",
                    length: "",
                    qty: boltQty,
                    remark: "",
                    unitPrice: boltPrice,
                    lineTotal: boltPrice * boltQty
                },
                {
                    seq: seqBase + 3,
                    code: styleMeta.rubber,
                    name: db[styleMeta.rubber]?.name || "橡胶环",
                    spec: db[styleMeta.rubber]?.spec || "",
                    length: "",
                    qty: rubberQty,
                    remark: "套地桩与立柱",
                    unitPrice: rubberPrice,
                    lineTotal: rubberPrice * rubberQty
                }
            );
        }

        const baseLabel = isPileStyle ? "地桩基础" : (styleMeta.type === "direct" ? "一体打入式" : "混凝土基础");

        return {
            rows,
            summaryCards: [{
                label: baseLabel + "总价",
                value: formatMoney(total),
                meta: styleCode + " | 高度 " + styleMeta.height + "mm | 总长 " + totalLen + "m | 拐角 " + corners
            }]
        };
    }

    function buildTemplate() {
        return `
<div class="fg-shell">
  <div class="fg-hero">
    <div class="fg-section-head">
      <div>
        <h2>围栏 / 门报价</h2>
        <p class="fg-hero-desc">保留现有计算规则，使用系统导航、表单和表格样式统一呈现。</p>
        <div class="fg-badge-row">
          <span class="badge">系统页面模块</span>
          <span class="badge">报价参数即时计算</span>
          <span class="badge">围栏 + 门双 Tab</span>
        </div>
      </div>
      <div class="notice">
        当前版本保留"表面处理"参数，但仍按原 demo 逻辑，不参与价格公式。
      </div>
    </div>
  </div>
  <div class="fg-tabs">
    <button class="fg-tab-btn is-active" type="button" data-fg-tab="fence">围栏报价</button>
    <button class="fg-tab-btn" type="button" data-fg-tab="gate">门报价</button>
    <button class="fg-tab-btn" type="button" data-fg-tab="est">EST 平フェンス</button>
  </div>

  <div class="fg-pane is-active" id="fg-pane-fence">
    <div class="grid-2">
      <div class="fg-block">
        <h3>参数设置</h3>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-fence-mesh-type">网孔类型</label>
            <select class="input" id="fg-fence-mesh-type">
              <option value="74x150">74x150</option>
              <option value="100x150">100x150</option>
            </select>
          </div>
          <div class="form-field">
            <label for="fg-fence-style">款式</label>
            <select class="input" id="fg-fence-style"></select>
          </div>
        </div>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-fence-length">总长 (m)</label>
            <input class="input" id="fg-fence-length" type="number" min="0" step="0.5" />
          </div>
          <div class="form-field">
            <label for="fg-fence-corner">拐角数</label>
            <input class="input" id="fg-fence-corner" type="number" min="0" step="1" />
          </div>
        </div>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-fence-wire">丝径 (mm)</label>
            <select class="input" id="fg-fence-wire">
              <option value="3.0">3.0 mm</option>
              <option value="3.2">3.2 mm</option>
              <option value="3.5">3.5 mm</option>
              <option value="4.0">4.0 mm</option>
              <option value="4.5">4.5 mm</option>
            </select>
          </div>
          <div class="form-field">
            <label for="fg-fence-surface">表面处理</label>
            <select class="input" id="fg-fence-surface">
              <option value="白色浸塑">白色浸塑</option>
              <option value="咖啡色浸塑">咖啡色浸塑</option>
            </select>
          </div>
        </div>
      </div>
      <div class="fg-block">
        <h3>规则说明</h3>
        <div class="fg-note-list">
          <div class="notice">围栏数量按 <span class="fg-highlight">总长 / 2 + 拐角数</span> 计算，并以 <span class="fg-highlight">0.5 套</span> 为单位取整。</div>
          <div class="notice">丝径当前按两档价格处理：<span class="fg-highlight">3.2 mm 及以下</span> 走 3.0 档，以上走 3.5 档。</div>
          <div class="notice">混凝土基础和地桩基础会同时给出参考价；一体打入式只输出单一方案总价。</div>
        </div>
      </div>
    </div>
    <div id="fg-fence-summary" class="fg-summary-grid"></div>
    <div class="fg-table-wrap">
      <table>
        <caption id="fg-fence-caption" style="caption-side: bottom; padding: 12px 0 0; color: var(--muted); text-align: left;"></caption>
        <thead>
          <tr>
            <th>序号</th>
            <th>编号</th>
            <th>名称</th>
            <th>规格</th>
            <th>长度(mm)</th>
            <th>数量</th>
            <th>备注</th>
            <th>单价(USD)</th>
            <th>小计(USD)</th>
          </tr>
        </thead>
        <tbody id="fg-fence-body"></tbody>
      </table>
    </div>
  </div>

  <div class="fg-pane" id="fg-pane-gate">
    <div class="grid-2">
      <div class="fg-block">
        <h3>参数设置</h3>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-gate-type">门类型</label>
            <select class="input" id="fg-gate-type">
              <option value="single_1200">单开门 (宽 1200 mm)</option>
              <option value="double_2400">双开门 (宽 2400 mm)</option>
              <option value="double_4200">双开门 (宽 4200 mm)</option>
              <option value="sliding_custom">推拉门 (自定义宽度)</option>
              <option value="folding_custom">折叠门 (自定义宽度)</option>
              <option value="custom">自定义类型</option>
            </select>
          </div>
          <div class="form-field">
            <label for="fg-gate-height">门高度(mm)</label>
            <input class="input" id="fg-gate-height" type="number" min="500" step="100" value="1500" placeholder="输入高度" />
          </div>
        </div>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-gate-base">基础类型</label>
            <select class="input" id="fg-gate-base">
              <option value="concrete">混凝土基础</option>
              <option value="integrated">一体式基础</option>
              <option value="pile">地桩基础</option>
            </select>
          </div>
          <div class="form-field">
            <label for="fg-gate-surface">表面处理</label>
            <select class="input" id="fg-gate-surface">
              <option value="白色浸塑">白色浸塑</option>
              <option value="咖啡色浸塑">咖啡色浸塑</option>
            </select>
          </div>
        </div>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-gate-custom-width">自定义宽度(mm)</label>
            <input class="input" id="fg-gate-custom-width" type="number" min="600" step="100" placeholder="推拉门/折叠门/自定义时填写" disabled />
          </div>
          <div class="form-field">
            <label for="fg-gate-qty">数量</label>
            <input class="input" id="fg-gate-qty" type="number" min="1" step="1" />
          </div>
        </div>
      </div>
      <div class="fg-block">
        <h3>规则说明</h3>
        <div class="fg-note-list">
          <div class="notice">门网片报价默认包含门柱和门框。</div>
          <div class="notice">单开门只配门扣组件；双开门额外计算横插销和竖插销。</div>
          <div class="notice">推拉门/折叠门/自定义类型需填写自定义宽度，从门款式数据库读取配置。</div>
          <div class="notice">此处对原 demo 做了修正：基础类型切换只影响基础件，不会把门体单价回退到兜底价。</div>
        </div>
      </div>
    </div>
    <div id="fg-gate-summary" class="fg-summary-grid"></div>
    <div class="fg-table-wrap">
      <table>
        <caption id="fg-gate-caption" style="caption-side: bottom; padding: 12px 0 0; color: var(--muted); text-align: left;"></caption>
        <thead>
          <tr>
            <th>序号</th>
            <th>编号</th>
            <th>名称</th>
            <th>规格</th>
            <th>长度(mm)</th>
            <th>数量</th>
            <th>备注</th>
            <th>单价(USD)</th>
            <th>小计(USD)</th>
          </tr>
        </thead>
        <tbody id="fg-gate-body"></tbody>
      </table>
    </div>
  </div>

  <div class="fg-pane" id="fg-pane-est">
    <div class="grid-2">
      <div class="fg-block">
        <h3>パラメータ設定</h3>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-est-height">高さ</label>
            <select class="input" id="fg-est-height">
              <option value="1200">H1200 (高1200mm)</option>
              <option value="1500" selected>H1500 (高1500mm)</option>
              <option value="1800">H1800 (高1800mm)</option>
            </select>
          </div>
          <div class="form-field">
            <label for="fg-est-length">総長 (m)</label>
            <input class="input" id="fg-est-length" type="number" min="1" step="10" value="100" />
          </div>
        </div>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-est-corner">コーナー数</label>
            <input class="input" id="fg-est-corner" type="number" min="0" step="1" value="3" />
          </div>
          <div class="form-field">
            <label for="fg-est-single-gate">片開き門 数量</label>
            <input class="input" id="fg-est-single-gate" type="number" min="0" step="1" value="1" />
          </div>
        </div>
        <div class="form-row" style="margin-top: 12px;">
          <div class="form-field">
            <label for="fg-est-double-gate-2000">両開き門W2000 数量</label>
            <input class="input" id="fg-est-double-gate-2000" type="number" min="0" step="1" value="1" />
          </div>
          <div class="form-field">
            <label for="fg-est-double-gate-4000">両開き門W4000 数量</label>
            <input class="input" id="fg-est-double-gate-4000" type="number" min="0" step="1" value="1" />
          </div>
        </div>
      </div>
      <div class="fg-block">
        <h3>計算ルール</h3>
        <div class="fg-note-list">
          <div class="notice">網片数量 = <span class="fg-highlight">ROUNDUP(総長/2 + コーナー/2, 0)</span></div>
          <div class="notice">支柱数量 = <span class="fg-highlight">ROUNDUP(総長/2 + 1 + コーナー + 片開き×2, 0)</span></div>
          <div class="notice">フックボルト = ROUNDUP(支柱×3/10, 0) / 連結ジョイント = ROUNDUP(網片×3/10, 0)</div>
          <div class="notice">FOB = (陸運費 + 通関費 - 海運費) / 為替レート</div>
        </div>
      </div>
    </div>
    <div id="fg-est-summary" class="fg-summary-grid"></div>
    <div class="fg-table-wrap">
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>製品名</th>
            <th>数量</th>
            <th>単位</th>
            <th>単重量/kg</th>
            <th>総重量/kg</th>
            <th>単価</th>
            <th>金額</th>
          </tr>
        </thead>
        <tbody id="fg-est-body"></tbody>
      </table>
    </div>
  </div>
</div>`;
    }

    function renderStyleOptions() {
        const groups = getFenceStyleGroups(state.fence.meshType);
        const styleSelect = elements.fenceStyle;
        if (!styleSelect) return;

        const html = groups.map((group) => {
            const options = group.items.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
            return `<optgroup label="${escapeHtml(group.label)}">${options}</optgroup>`;
        }).join("");
        styleSelect.innerHTML = html;

        const styleMeta = getFenceStyleMeta(state.fence.meshType);
        if (!styleMeta[state.fence.style]) {
            state.fence.style = groups[0]?.items?.[0] || "";
        }
        styleSelect.value = state.fence.style;
    }

    function renderSummaryCards(target, cards) {
        if (!target) return;
        if (!cards || !cards.length) {
            target.innerHTML = `<div class="fg-empty"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="#f1f5f9"/><path d="M16 24h16M24 16v16" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/></svg><span>输入参数后自动计算</span></div>`;
            return;
        }
        target.innerHTML = cards.map((card) => `
            <article class="fg-summary-card">
              <div class="fg-summary-label">${escapeHtml(card.label)}</div>
              <div class="fg-summary-value">${escapeHtml(card.value)}</div>
              <div class="fg-summary-meta">${card.meta}</div>
            </article>
        `).join("");
    }

    function renderRows(target, rows) {
        if (!target) return;
        if (!rows || !rows.length) {
            target.innerHTML = `<tr><td colspan="9" class="fg-empty"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="#f1f5f9"/><rect x="12" y="16" width="24" height="16" rx="3" stroke="#94a3b8" stroke-width="2" fill="none"/><path d="M12 22h24" stroke="#94a3b8" stroke-width="1.5"/></svg><span>输入参数后自动生成明细</span></td></tr>`;
            return;
        }

        target.innerHTML = rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.seq)}</td>
              <td>${escapeHtml(row.code)}</td>
              <td>${escapeHtml(row.name)}</td>
              <td>${escapeHtml(row.spec)}</td>
              <td>${escapeHtml(row.length)}</td>
              <td>${escapeHtml(formatQuantity(row.qty))}</td>
              <td>${escapeHtml(row.remark)}</td>
              <td>${escapeHtml(formatMoney(row.unitPrice))}</td>
              <td>${escapeHtml(formatMoney(row.lineTotal))}</td>
            </tr>
        `).join("");
    }

    function renderFence() {
        const result = buildFenceQuote(state.fence);
        renderSummaryCards(elements.fenceSummary, result.summaryCards);
        renderRows(elements.fenceBody, result.rows);
        if (elements.fenceCaption) elements.fenceCaption.textContent = result.tableCaption || "";
    }

    function renderGate() {
        const result = buildGateQuote(state.gate);
        renderSummaryCards(elements.gateSummary, result.summaryCards);
        renderRows(elements.gateBody, result.rows);
        if (elements.gateCaption) elements.gateCaption.textContent = result.tableCaption || "";
    }

    function renderTabs() {
        const tabs = Array.from(containerEl.querySelectorAll("[data-fg-tab]"));
        const panes = Array.from(containerEl.querySelectorAll(".fg-pane"));
        tabs.forEach((button) => {
            const isActive = button.getAttribute("data-fg-tab") === state.activeTab;
            button.classList.toggle("is-active", isActive);
        });
        panes.forEach((pane) => {
            pane.classList.toggle("is-active", pane.id === `fg-pane-${state.activeTab}`);
        });
    }

    function render() {
        renderTabs();
        renderStyleOptions();
        renderFence();
        renderGate();
    }

    function bind(target, eventName, handler) {
        if (!target) return;
        target.addEventListener(eventName, handler);
        cleanupFns.push(() => target.removeEventListener(eventName, handler));
    }

    function initializeElements() {
        elements.fenceStyle = document.getElementById("fg-fence-style");
        elements.fenceMeshType = document.getElementById("fg-fence-mesh-type");
        elements.fenceLength = document.getElementById("fg-fence-length");
        elements.fenceCorner = document.getElementById("fg-fence-corner");
        elements.fenceWire = document.getElementById("fg-fence-wire");
        elements.fenceSurface = document.getElementById("fg-fence-surface");
        elements.fenceSummary = document.getElementById("fg-fence-summary");
        elements.fenceBody = document.getElementById("fg-fence-body");
        elements.fenceCaption = document.getElementById("fg-fence-caption");

        elements.gateType = document.getElementById("fg-gate-type");
        elements.gateHeight = document.getElementById("fg-gate-height");
        elements.gateBase = document.getElementById("fg-gate-base");
        elements.gateSurface = document.getElementById("fg-gate-surface");
        elements.gateQty = document.getElementById("fg-gate-qty");
        elements.gateCustomWidth = document.getElementById("fg-gate-custom-width");
        elements.gateSummary = document.getElementById("fg-gate-summary");
        elements.gateBody = document.getElementById("fg-gate-body");
        elements.gateCaption = document.getElementById("fg-gate-caption");

        if (elements.fenceMeshType) elements.fenceMeshType.value = state.fence.meshType;
        if (elements.fenceLength) elements.fenceLength.value = state.fence.totalLength;
        if (elements.fenceCorner) elements.fenceCorner.value = state.fence.cornerQty;
        if (elements.fenceWire) elements.fenceWire.value = state.fence.wireDiameter;
        if (elements.fenceSurface) elements.fenceSurface.value = state.fence.surface;

        if (elements.gateType) elements.gateType.value = state.gate.gateType;
        if (elements.gateHeight) elements.gateHeight.value = state.gate.gateHeight;
        if (elements.gateBase) elements.gateBase.value = state.gate.baseType;
        if (elements.gateSurface) elements.gateSurface.value = state.gate.gateSurface;
        if (elements.gateQty) elements.gateQty.value = state.gate.gateQty;
    }

    function bindEvents() {
        Array.from(containerEl.querySelectorAll("[data-fg-tab]")).forEach((button) => {
            bind(button, "click", () => {
                state.activeTab = button.getAttribute("data-fg-tab") || "fence";
                renderTabs();
                if (state.activeTab === "est") renderEst();
            });
        });

        bind(elements.fenceMeshType, "change", (event) => {
            state.fence.meshType = event.target.value;
            renderStyleOptions();
            renderFence();
        });
        bind(elements.fenceStyle, "change", (event) => {
            state.fence.style = event.target.value;
            renderFence();
        });
        bind(elements.fenceLength, "input", (event) => {
            state.fence.totalLength = event.target.value;
            renderFence();
        });
        bind(elements.fenceCorner, "input", (event) => {
            state.fence.cornerQty = event.target.value;
            renderFence();
        });
        bind(elements.fenceWire, "change", (event) => {
            state.fence.wireDiameter = event.target.value;
            renderFence();
        });
        bind(elements.fenceSurface, "change", (event) => {
            state.fence.surface = event.target.value;
            renderFence();
        });

        bind(elements.gateType, "change", (event) => {
            state.gate.gateType = event.target.value;
            const isCustom = ["sliding_custom", "folding_custom", "custom"].includes(event.target.value);
            if (elements.gateCustomWidth) {
                elements.gateCustomWidth.disabled = !isCustom;
                if (!isCustom) elements.gateCustomWidth.value = "";
            }
            renderGate();
        });
        bind(elements.gateHeight, "change", (event) => {
            state.gate.gateHeight = event.target.value;
            renderGate();
        });
        bind(elements.gateBase, "change", (event) => {
            state.gate.baseType = event.target.value;
            renderGate();
        });
        bind(elements.gateSurface, "change", (event) => {
            state.gate.gateSurface = event.target.value;
            renderGate();
        });
        bind(elements.gateQty, "input", (event) => {
            state.gate.gateQty = event.target.value;
            renderGate();
        });
        if (elements.gateCustomWidth) {
            bind(elements.gateCustomWidth, "input", (event) => {
                state.gate.customWidth = event.target.value;
                renderGate();
            });
        }

        const estInputIds = ["fg-est-height", "fg-est-length", "fg-est-corner", "fg-est-single-gate", "fg-est-double-gate-2000", "fg-est-double-gate-4000"];
        estInputIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                bind(el, "input", () => renderEst());
                bind(el, "change", () => renderEst());
            }
        });
    }

    // ===================== EST 平フェンス データ＆計算 =====================
    const EST_PRODUCT_MASTER = {
        1200: {
            height: 1200,
            products: [
                { no: 1, key: "panel1200", unitKey: "枚", unitWeight: 2.4, price: 4.95, qtyFormula: "panel" },
                { no: 2, key: "post1200", unitKey: "本", unitWeight: 2.07, price: 4.20, qtyFormula: "post" },
                { no: 3, key: "singleGate", unitKey: "基", unitWeight: 13.5, price: 54.00, qtyFormula: "singleGate" },
                { no: 4, key: "doubleGate2000", unitKey: "基", unitWeight: 42.0, price: 185.00, qtyFormula: "doubleGate2000" },
                { no: 5, key: "doubleGate4000", unitKey: "基", unitWeight: 56.0, price: 205.00, qtyFormula: "doubleGate4000" },
                { no: 6, key: "hookBolt", unitKey: "袋", unitWeight: 0.12, price: 1.32, qtyFormula: "hookBolt" },
                { no: 7, key: "joint", unitKey: "袋", unitWeight: 0.22, price: 2.65, qtyFormula: "joint" }
            ]
        },
        1500: {
            height: 1500,
            products: [
                { no: 1, key: "panel1500", unitKey: "枚", unitWeight: 2.97, price: 5.60, qtyFormula: "panel" },
                { no: 2, key: "post1500", unitKey: "本", unitWeight: 2.46, price: 5.20, qtyFormula: "post" },
                { no: 3, key: "singleGate", unitKey: "基", unitWeight: 18.5, price: 62.00, qtyFormula: "singleGate" },
                { no: 4, key: "doubleGate2000", unitKey: "基", unitWeight: 51.0, price: 205.00, qtyFormula: "doubleGate2000" },
                { no: 5, key: "doubleGate4000", unitKey: "基", unitWeight: 75.0, price: 235.00, qtyFormula: "doubleGate4000" },
                { no: 6, key: "hookBolt", unitKey: "袋", unitWeight: 0.12, price: 1.32, qtyFormula: "hookBolt" },
                { no: 7, key: "joint", unitKey: "袋", unitWeight: 0.22, price: 2.65, qtyFormula: "joint" }
            ]
        },
        1800: {
            height: 1800,
            products: [
                { no: 1, key: "panel1800", unitKey: "枚", unitWeight: 3.5, price: 6.20, qtyFormula: "panel" },
                { no: 2, key: "post1800", unitKey: "本", unitWeight: 2.85, price: 5.45, qtyFormula: "post" },
                { no: 3, key: "singleGate", unitKey: "基", unitWeight: 22.0, price: 70.00, qtyFormula: "singleGate" },
                { no: 4, key: "doubleGate2000", unitKey: "基", unitWeight: 58.0, price: 225.00, qtyFormula: "doubleGate2000" },
                { no: 5, key: "doubleGate4000", unitKey: "基", unitWeight: 78.0, price: 265.00, qtyFormula: "doubleGate4000" },
                { no: 6, key: "hookBolt", unitKey: "袋", unitWeight: 0.12, price: 1.32, qtyFormula: "hookBolt" },
                { no: 7, key: "joint", unitKey: "袋", unitWeight: 0.22, price: 2.65, qtyFormula: "joint" }
            ]
        }
    };

    const EST_PRODUCT_NAMES = {
        panel1200: "平フェンス H1200 W2000",
        panel1500: "平フェンス H1500 W2000",
        panel1800: "平フェンス H1800 W2000",
        post1200: "斜め切一体型支柱 L1750",
        post1500: "斜め切一体型支柱 L2100",
        post1800: "斜め切一体型支柱 L2450",
        singleGate: "片開き門W830",
        doubleGate2000: "両開き門W2000",
        doubleGate4000: "両開き門W4000",
        hookBolt: "フックボルトL50",
        joint: "連結ジョイント"
    };

    function estGetQty(formula, qtys) {
        switch (formula) {
            case "panel": return qtys.panelQty;
            case "post": return qtys.postQty;
            case "singleGate": return qtys.singleGateQty;
            case "doubleGate2000": return qtys.doubleGate2000Qty;
            case "doubleGate4000": return qtys.doubleGate4000Qty;
            case "hookBolt": return qtys.hookBoltQty;
            case "joint": return qtys.jointQty;
            default: return 0;
        }
    }

    function estCalcQuantities(totalLen, corner, singleGate, doubleGate2000, doubleGate4000) {
        const panelQty = Math.ceil(totalLen / 2 + corner / 2);
        const postQty = Math.ceil(totalLen / 2 + 1 + corner + singleGate * 2);
        const hookBoltQty = Math.ceil(postQty * 3 / 10);
        const jointQty = Math.ceil(panelQty * 3 / 10);
        return { panelQty, postQty, singleGateQty: singleGate, doubleGate2000Qty: doubleGate2000, doubleGate4000Qty: doubleGate4000, hookBoltQty, jointQty };
    }

    function estCalcFOB(volumeM3) {
        const landFreightCNY = 370 * volumeM3;
        const customsFeeCNY = 500;
        const seaFreightCNY = (16000 / 55) * volumeM3;
        const fobCNY = landFreightCNY + customsFeeCNY - seaFreightCNY;
        return fobCNY / 6.9;
    }

    function estCalcVolume(products, qtys, height) {
        let totalWeight = 0;
        for (const prod of products) {
            totalWeight += prod.unitWeight * estGetQty(prod.qtyFormula, qtys);
        }
        let palletLength = 2140, palletWidth = 1340, palletHeightBase = 0;
        if (height === 1200) {
            palletLength = 2140; palletWidth = 1340;
            palletHeightBase = (qtys.panelQty * 3.5 + 3.5) + (Math.ceil(qtys.postQty / 46) * 32) +
                (Math.ceil(qtys.singleGateQty / 2) * 30) + (Math.ceil(qtys.singleGateQty * 2 / 13) * 50) +
                (Math.ceil(qtys.doubleGate2000Qty * 2 / 10) * 80) + (qtys.doubleGate2000Qty * 40 * 1) +
                (Math.ceil(qtys.doubleGate4000Qty * 2 / 10) * 80) + (qtys.doubleGate4000Qty * 40 * 2) + 180;
        } else if (height === 1500) {
            palletLength = 2240; palletWidth = 1640;
            palletHeightBase = (qtys.panelQty * 3.5 + 3.5) + (Math.ceil(qtys.postQty / 46) * 32) +
                (Math.ceil(qtys.singleGateQty / 2) * 30) + (Math.ceil(qtys.singleGateQty * 2 / 16) * 50) +
                (Math.ceil(qtys.doubleGate2000Qty * 2 / 12) * 80) + (qtys.doubleGate2000Qty * 40 * 1) +
                (Math.ceil(qtys.doubleGate4000Qty * 2 / 12) * 80) + (qtys.doubleGate4000Qty * 40 * 2) + 180;
        } else {
            palletLength = 2140; palletWidth = 2590;
            palletHeightBase = (qtys.panelQty * 3.5 + 3.5) + (Math.ceil(qtys.postQty / 62) * 32) +
                (Math.ceil(qtys.singleGateQty / 2) * 30) + (Math.ceil(qtys.singleGateQty * 2 / 22) * 50) +
                (Math.ceil(qtys.doubleGate2000Qty * 2 / 16) * 80) + (qtys.doubleGate2000Qty * 40 * 1) +
                (Math.ceil(qtys.doubleGate4000Qty * 2 / 16) * 80) + (qtys.doubleGate4000Qty * 40 * 2) + 180;
        }
        const palletHeight = Math.ceil(palletHeightBase + 60);
        const volumeM3 = (palletLength * palletWidth * palletHeight) / 1000000000;
        return { volumeM3, grossWeight: Math.ceil(totalWeight + 60) };
    }

    function renderEst() {
        const heightEl = document.getElementById("fg-est-height");
        const lengthEl = document.getElementById("fg-est-length");
        const cornerEl = document.getElementById("fg-est-corner");
        const singleEl = document.getElementById("fg-est-single-gate");
        const double2000El = document.getElementById("fg-est-double-gate-2000");
        const double4000El = document.getElementById("fg-est-double-gate-4000");
        if (!heightEl) return;

        const height = parseInt(heightEl.value) || 1500;
        const totalLen = parseFloat(lengthEl.value) || 100;
        const corner = parseInt(cornerEl.value) || 0;
        const singleGate = parseInt(singleEl.value) || 0;
        const doubleGate2000 = parseInt(double2000El.value) || 0;
        const doubleGate4000 = parseInt(double4000El.value) || 0;

        const master = EST_PRODUCT_MASTER[height];
        if (!master) return;
        const qtys = estCalcQuantities(totalLen, corner, singleGate, doubleGate2000, doubleGate4000);
        const products = master.products;

        let totalAmount = 0, totalWeight = 0;
        const rows = [];
        for (const prod of products) {
            const qty = estGetQty(prod.qtyFormula, qtys);
            const weight = prod.unitWeight * qty;
            const amount = prod.price * qty;
            totalWeight += weight;
            totalAmount += amount;
            rows.push({ ...prod, qty, weight, amount });
        }

        const vol = estCalcVolume(products, qtys, height);
        const fobUSD = estCalcFOB(vol.volumeM3);
        const grandTotal = totalAmount + fobUSD;

        const summaryEl = document.getElementById("fg-est-summary");
        if (summaryEl) {
            renderSummaryCards(summaryEl, [
                { label: "製品合計金額", value: "$" + totalAmount.toFixed(2), meta: "USD" },
                { label: "FOB費用", value: "$" + fobUSD.toFixed(2), meta: "USD" },
                { label: "総計", value: "$" + grandTotal.toFixed(2), meta: "USD" },
                { label: "総重量", value: vol.grossWeight + " kg", meta: "" },
            ]);
        }

        const tbody = document.getElementById("fg-est-body");
        if (!tbody) return;
        let html = "";
        for (const row of rows) {
            html += `<tr>
                <td>${row.no}</td>
                <td>${EST_PRODUCT_NAMES[row.key]}</td>
                <td>${row.qty}</td>
                <td>${row.unitKey}</td>
                <td>${row.unitWeight.toFixed(2)}</td>
                <td>${row.weight.toFixed(1)}</td>
                <td>${row.price.toFixed(2)}</td>
                <td>${row.amount.toFixed(2)}</td>
            </tr>`;
        }
        html += `<tr style="background:#eef3fc;font-weight:700;border-top:1px solid #cde0ed;">
            <td colspan="2">合計：</td><td></td><td></td><td></td>
            <td>${totalWeight.toFixed(1)} kg</td><td></td>
            <td>${totalAmount.toFixed(2)}</td></tr>`;
        html += `<tr style="background:#fef7e0;">
            <td colspan="7">追加諸係り（FOB）：</td>
            <td>${fobUSD.toFixed(2)}</td></tr>`;
        html += `<tr style="background:#eef3fc;font-weight:700;border-top:1px solid #cde0ed;">
            <td colspan="7">総計：</td>
            <td>${grandTotal.toFixed(2)}</td></tr>`;
        tbody.innerHTML = html;
    }

    window.KSFenceGateCalculator = {
        cloneDefaultState,
        getFenceStyleGroups,
        getFenceStyleMeta,
        buildFenceQuote,
        buildFenceQuoteByStyle,
        buildGateQuote,
        buildGateQuoteByStyle,
        ready: ensureFencePrices
    };

    window.FenceGatePage = {
        init(el, options) {
            containerEl = el;
            state = cloneDefaultState();
            cleanupFns = [];
            ensureStyles();
            containerEl.innerHTML = buildTemplate();
            initializeElements();
            bindEvents();
            const finalize = function () {
                if (options && options.tab) {
                    state.activeTab = options.tab;
                    renderTabs();
                    if (options.tab === "est") renderEst();
                } else {
                    render();
                }
            };
            ensureFencePrices().then(finalize).catch(finalize);
        },

        destroy() {
            cleanupFns.forEach((fn) => {
                try {
                    fn();
                } catch (error) {
                    console.error(error);
                }
            });
            cleanupFns = [];
            if (containerEl) {
                containerEl.innerHTML = "";
            }
            containerEl = null;
            state = null;
        }
    };
})();
