(() => {
    const PRODUCT_MASTER = {
        1200: {
            height: 1200,
            products: [
                { no: 1, key: "panel1200", code: "FN01-W0101-1200", unitKey: "unitPiece", unitWeight: 2.4, price: 4.95, qtyFormula: "panel" },
                { no: 2, key: "post1200", code: "FN01-L0204-1410", unitKey: "unitRod", unitWeight: 2.07, price: 4.20, qtyFormula: "post" },
                { no: 3, key: "singleGate", code: "FN01-M0001-0800", unitKey: "unitSet", unitWeight: 13.5, price: 54.00, qtyFormula: "singleGate" },
                { no: 4, key: "doubleGate2000", code: "FN01-M0002-0800", unitKey: "unitSet", unitWeight: 42.0, price: 185.00, qtyFormula: "doubleGate2000" },
                { no: 5, key: "doubleGate4000", code: "FN01-M1002-2000", unitKey: "unitSet", unitWeight: 56.0, price: 205.00, qtyFormula: "doubleGate4000" },
                { no: 6, key: "hookBolt", code: "FN-PJ-0003", unitKey: "unitBag", unitWeight: 0.12, price: 1.32, qtyFormula: "hookBolt" },
                { no: 7, key: "joint", code: "FN-PJ-0001", unitKey: "unitBag", unitWeight: 0.22, price: 2.65, qtyFormula: "joint" }
            ]
        },
        1500: {
            height: 1500,
            products: [
                { no: 1, key: "panel1500", code: "FN01-W0101-1500", unitKey: "unitPiece", unitWeight: 2.97, price: 5.60, qtyFormula: "panel" },
                { no: 2, key: "post1500", code: "FN01-L0205-1710", unitKey: "unitRod", unitWeight: 2.46, price: 5.20, qtyFormula: "post" },
                { no: 3, key: "singleGate", code: "FN01-M0001-0800", unitKey: "unitSet", unitWeight: 18.5, price: 62.00, qtyFormula: "singleGate" },
                { no: 4, key: "doubleGate2000", code: "FN01-M0002-0800", unitKey: "unitSet", unitWeight: 51.0, price: 205.00, qtyFormula: "doubleGate2000" },
                { no: 5, key: "doubleGate4000", code: "FN01-M1002-2000", unitKey: "unitSet", unitWeight: 75.0, price: 235.00, qtyFormula: "doubleGate4000" },
                { no: 6, key: "hookBolt", code: "FN-PJ-0003", unitKey: "unitBag", unitWeight: 0.12, price: 1.32, qtyFormula: "hookBolt" },
                { no: 7, key: "joint", code: "FN-PJ-0001", unitKey: "unitBag", unitWeight: 0.22, price: 2.65, qtyFormula: "joint" }
            ]
        },
        1800: {
            height: 1800,
            products: [
                { no: 1, key: "panel1800", code: "FN01-W0101-1800", unitKey: "unitPiece", unitWeight: 3.5, price: 6.20, qtyFormula: "post" },
                { no: 2, key: "post1800", code: "FN01-L0206-2060", unitKey: "unitRod", unitWeight: 2.85, price: 5.45, qtyFormula: "post" },
                { no: 3, key: "singleGate", code: "FN01-M0001-0800", unitKey: "unitSet", unitWeight: 22.0, price: 70.00, qtyFormula: "singleGate" },
                { no: 4, key: "doubleGate2000", code: "FN01-M0002-0800", unitKey: "unitSet", unitWeight: 58.0, price: 225.00, qtyFormula: "doubleGate2000" },
                { no: 5, key: "doubleGate4000", code: "FN01-M1002-2000", unitKey: "unitSet", unitWeight: 78.0, price: 265.00, qtyFormula: "doubleGate4000" },
                { no: 6, key: "hookBolt", code: "FN-PJ-0003", unitKey: "unitBag", unitWeight: 0.12, price: 1.32, qtyFormula: "hookBolt" },
                { no: 7, key: "joint", code: "FN-PJ-0001", unitKey: "unitBag", unitWeight: 0.22, price: 2.65, qtyFormula: "joint" }
            ]
        }
    };

    const PRODUCT_NAMES_JA = {
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

    const PRODUCT_NAMES_ZH = {
        panel1200: "平栅栏 H1200 W2000",
        panel1500: "平栅栏 H1500 W2000",
        panel1800: "平栅栏 H1800 W2000",
        post1200: "斜切一体型支柱 L1750",
        post1500: "斜切一体型支柱 L2100",
        post1800: "斜切一体型支柱 L2450",
        singleGate: "单开门W830",
        doubleGate2000: "双开门W2000",
        doubleGate4000: "双开门W4000",
        hookBolt: "钩螺栓L50",
        joint: "连接件"
    };

    const UNIT_MAP = {
        unitPiece: "枚",
        unitRod: "本",
        unitSet: "基",
        unitBag: "袋"
    };

    function calculateQuantities(totalLen, corner, singleGate, doubleGate2000, doubleGate4000) {
        const panelQty = Math.ceil(totalLen / 2 + corner / 2);
        const postQty = Math.ceil(totalLen / 2 + 1 + corner + singleGate * 2);
        const hookBoltQty = Math.ceil(postQty * 3 / 10);
        const jointQty = Math.ceil(panelQty * 3 / 10);
        return { panelQty, postQty, singleGateQty: singleGate, doubleGate2000Qty: doubleGate2000, doubleGate4000Qty: doubleGate4000, hookBoltQty, jointQty };
    }

    function getQtyForFormula(formula, qtys) {
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

    function calculateFOB(volumeM3) {
        const landFreightCNY = 370 * volumeM3;
        const customsFeeCNY = 500;
        const seaFreightCNY = (16000 / 55) * volumeM3;
        const fobCNY = landFreightCNY + customsFeeCNY - seaFreightCNY;
        const fobUSD = fobCNY / 6.9;
        return { fobCNY, fobUSD };
    }

    function calculateVolumeAndWeight(products, qtys, height) {
        let totalWeight = 0;
        for (const prod of products) {
            const qty = getQtyForFormula(prod.qtyFormula, qtys);
            totalWeight += prod.unitWeight * qty;
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
        return { volumeM3, estimatedGrossWeight: Math.ceil(totalWeight + 60) };
    }

    function buildEstFenceQuote(params) {
        const height = parseInt(params.height) || 1200;
        const totalLen = parseFloat(params.totalLength) || 100;
        const corner = parseInt(params.cornerCount) || 0;
        const singleGateEnabled = params.singleGateEnabled !== false;
        const doubleGate2000Enabled = params.doubleGate2000Enabled !== false;
        const doubleGate4000Enabled = params.doubleGate4000Enabled !== false;
        const singleGate = singleGateEnabled ? (parseInt(params.singleGateQty) || 0) : 0;
        const doubleGate2000 = doubleGate2000Enabled ? (parseInt(params.doubleGate2000Qty) || 0) : 0;
        const doubleGate4000 = doubleGate4000Enabled ? (parseInt(params.doubleGate4000Qty) || 0) : 0;

        const master = PRODUCT_MASTER[height];
        if (!master) return { rows: [], totalAmount: 0, totalWeight: 0 };

        const qtys = calculateQuantities(totalLen, corner, singleGate, doubleGate2000, doubleGate4000);
        const products = master.products;
        const names = PRODUCT_NAMES_JA;

        let totalAmount = 0;
        let totalWeight = 0;
        const rows = [];

        for (const prod of products) {
            const qty = getQtyForFormula(prod.qtyFormula, qtys);
            if (qty === 0) continue;
            const weight = prod.unitWeight * qty;
            const amount = prod.price * qty;
            totalWeight += weight;
            totalAmount += amount;
            rows.push({
                no: rows.length + 1,
                code: prod.code || '',
                name: names[prod.key],
                qty: qty,
                unit: UNIT_MAP[prod.unitKey],
                unitWeight: prod.unitWeight,
                totalWeight: weight,
                price: prod.price,
                amount: amount,
                isGate: ['singleGate', 'doubleGate2000', 'doubleGate4000'].includes(prod.qtyFormula)
            });
        }

        return { rows, totalAmount, totalWeight };
    }

    function buildEstFenceTableHTML(params) {
        const result = buildEstFenceQuote(params);
        if (!result.rows || !result.rows.length) return "";

        let html = '<div style="margin:12px 0 0;padding:12px 14px;background:linear-gradient(180deg,#ffffff,#f0fdfa);border-radius:14px;border:1px solid #b2dfdb;box-shadow:0 8px 18px rgba(15,118,110,0.05);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;overflow:hidden;">';
        html += '<span style="font-size:12px;font-weight:700;color:#64748b;letter-spacing:0.04em;">围栏合计金额</span>';
        html += '<span style="font-size:24px;font-weight:700;color:#0f172a;">' + result.totalAmount.toFixed(2) + '</span>';
        html += '</div>';
        return html;
    }

    window.KSEstFenceCalculator = {
        buildEstFenceQuote,
        buildEstFenceTableHTML,
        PRODUCT_MASTER
    };
})();
