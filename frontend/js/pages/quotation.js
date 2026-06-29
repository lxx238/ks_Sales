(function () {

    const MAX_UPLOAD_FILE_SIZE = 64 * 1024 * 1024;
    const CONTACT_STORAGE_KEY = 'ks_contact_info_v1';
    const INQUIRY_REQUESTER_STORAGE_KEY = 'ks_inquiry_requester_v1';
    const DEFAULT_INQUIRY_REQUESTER = '冯光英';

    function getContactDefaults() {
        const group = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        if (group === '韩语组') {
            return { contact_name: '', phone: '', tel: '', fax: '' };
        }
        return { contact_name: '', phone: '', tel: '', fax: '' };
    }

    function createFreshState() {
        const defaults = getContactDefaults();
        return {
            bomFile: null,
            bomFileId: null,
            priceFile: null,
            priceFileId: null,
            standardFileId: null,
            matrixFile: null,
            matrixFileId: null,
            matrixInfo: null,
            bomTables: [],
            selectedBomKeys: [],
            unmatchedCodes: [],
            missingImageCodes: [],
            missingImageItems: [],
            manualPrices: {},
            outputFileId: null,
            inquiryFileId: null,
            inquiryFilename: null,
            unmatchedProducts: [],
            projectName: '',
            bomOriginalFilename: '',
            imageFolder: '',
            contactInfo: { ...defaults },
            inquiryRequesters: [DEFAULT_INQUIRY_REQUESTER],
            selectedInquiryRequester: DEFAULT_INQUIRY_REQUESTER,
            coatingThickness: 10,
            tempAutoMatched: [],
        };
    }

    let state = null;
    let elements = null;
    let containerEl = null;
    let _fileInputs = [];
    var confirmedEstFenceData = null;
    var confirmedNvFenceGateData = null;
    var _fenceGatePricesLoaded = false;
    var matSelectionState = {};

    const HTML_TEMPLATE = `
<section class="section" id="upload">
  <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
    <h2>资料上传</h2>
    <div data-group-only="日语组" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text);">
      <span style="font-weight: 600;">案件类型：</span>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ja-case-type" value="NV" checked style="width: 16px; height: 16px;">
        <span>通用模板</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ja-case-type" value="EST" style="width: 16px; height: 16px;">
        <span>定制模板</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ja-case-type" value="NORMAL" style="width: 16px; height: 16px;">
        <span>简易模板</span>
      </label>
    </div>
    <div data-group-only="韩语组" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text);">
      <span style="font-weight: 600;">案件类型：</span>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ko-case-type" value="NORMAL" checked style="width: 16px; height: 16px;">
        <span>韩语模板</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ko-case-type" value="KSD" style="width: 16px; height: 16px;">
        <span>英语模板</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ko-case-type" value="SIMPLE" style="width: 16px; height: 16px;">
        <span>英语简易模板</span>
      </label>
    </div>
    <div data-group-only="英语组" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text);">
      <span style="font-weight: 600;">案件类型：</span>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="en-case-type" value="COMMON" checked style="width: 16px; height: 16px;">
        <span>通用模板</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="en-case-type" value="SIMPLE" style="width: 16px; height: 16px;">
        <span>简易模板</span>
      </label>
      <span style="margin-left: 12px; font-weight: 600;">语言类型：</span>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="en-lang" value="en" checked style="width: 16px; height: 16px;">
        <span>English</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="en-lang" value="fr" style="width: 16px; height: 16px;">
        <span>Français</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="en-lang" value="es" style="width: 16px; height: 16px;">
        <span>Español</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="en-lang" value="zh" style="width: 16px; height: 16px;">
        <span>中文</span>
      </label>
    </div>
    <div data-group-only="亚太组" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text);">
      <span style="font-weight: 600;">案件类型：</span>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ap-case-type" value="ROOF" checked style="width: 16px; height: 16px;">
        <span>屋顶</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="radio" name="ap-case-type" value="GROUND" style="width: 16px; height: 16px;">
        <span>地面</span>
      </label>
    </div>
  </div>
  <p>统一使用标准定价表与 BOM 表进行匹配。若已设置全局价格表，日常只需上传 BOM 表即可。</p>
  <div class="upload-grid quotation-upload-grid">
    <div class="card quotation-card-wide">
      <h3>上传物料定价表</h3>
      <div class="muted">导入物料定价表，系统自动提取标准定价数据并生成匹配价格表。可设置为全局价格表（推荐）。</div>
      <div class="toolbar">
        <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text);">
          <input type="checkbox" id="set-global-price" style="width: 16px; height: 16px;">
          <span>设置为全局价格表（每天只需上传一次）</span>
        </label>
      </div>
      <div class="toolbar">
        <button class="btn primary" id="price-file-btn">选择物料表</button>
      </div>
      <div id="global-price-status" class="muted" style="margin-top: 8px; padding: 8px; background: var(--brand-soft); border-radius: 8px; display: none;">
        全局价格表：<span id="global-price-info"></span>
      </div>
      <div id="price-table-status" class="muted" style="margin-top: 8px; padding: 8px; background: #f0fdf4; border-radius: 8px; display: none;">
        <span id="price-table-info"></span>
      </div>
      <div id="price-report-area" class="muted" style="margin-top: 8px; padding: 8px; background: #e0f2fe; border-radius: 8px; display: none;">
  <div class="card" id="print-settings-card" style="margin-top:10px;padding:10px 14px;">
    <div id="print-settings-row" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--text);">
      <span style="font-weight:600;">🖨️ 打印设置（个人习惯）</span>
      <span id="print-case-label" style="font-size:12px;color:var(--muted);"></span>
      <label style="display:flex;align-items:center;gap:4px;">方向
        <select id="print-orientation" style="padding:3px 6px;">
          <option value="portrait">纵向</option>
          <option value="landscape">横向</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:4px;">缩放
        <select id="print-fit-mode" style="padding:3px 6px;">
          <option value="fit_width">所有列一页</option>
          <option value="fit_one">全部一页</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:4px;">水平居中
        <input type="checkbox" id="print-centered" style="width:16px;height:16px;">
      </label>
      <span style="color:var(--muted);">边距(英寸):</span>
      <label style="display:flex;align-items:center;gap:3px;">上<input type="number" id="print-mt" step="0.05" min="0" style="width:52px;padding:3px 4px;"></label>
      <label style="display:flex;align-items:center;gap:3px;">下<input type="number" id="print-mb" step="0.05" min="0" style="width:52px;padding:3px 4px;"></label>
      <label style="display:flex;align-items:center;gap:3px;">左<input type="number" id="print-ml" step="0.05" min="0" style="width:52px;padding:3px 4px;"></label>
      <label style="display:flex;align-items:center;gap:3px;">右<input type="number" id="print-mr" step="0.05" min="0" style="width:52px;padding:3px 4px;"></label>
      <button class="btn" id="print-restore-btn" style="margin-left:auto;">恢复默认</button>
      <span id="print-status" style="font-size:12px;color:var(--muted);"></span>
    </div>
  </div>
  <div class="toolbar">
          <button class="btn primary" id="price-download-report-btn">下载汇总报价表</button>
          <button class="btn" id="price-download-inquiry-btn" style="display: none;">下载询价表</button>
          <button class="btn primary" id="price-submit-inquiry-btn" style="display: none;">提交询价项到询价价格查询</button>
        </div>
        <div id="price-inquiry-remark-wrap" style="display:none; margin-top:10px;">
          <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:4px;">询价备注</label>
          <textarea id="price-inquiry-remark-input" rows="3" placeholder="请输入询价备注信息（选填）" style="width:100%;max-width:600px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical;font-family:inherit;"></textarea>
          <div style="margin-top:6px;">
            <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:4px;">附件</label>
            <label class="btn" style="cursor:pointer;display:inline-block;margin-bottom:6px;">上传附件<input type="file" id="price-inquiry-attachment-input" multiple style="display:none;"></label>
            <div id="price-inquiry-attachment-list" style="margin-top:4px;font-size:12px;color:var(--muted);"></div>
          </div>
        </div>
        <div id="price-report-info" class="muted"></div>
      </div>
    </div>
    <div class="card">
      <h3>上传 BOM 表</h3>
      <div class="muted">导入项目 BOM 文件，用于拆解产品编码与数量，并依据定价表进行匹配。</div>
      <div data-group-only="韩语组" style="margin-top: 10px; padding: 8px; background: #f0fdfa; border-radius: 8px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">物料处理选项</div>
        <style>
          .ko-mat-row{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;color:var(--text)}
          .ko-mat-label{width:120px;flex-shrink:0}
          .ko-mat-btns{display:flex;gap:0;border-radius:6px;overflow:hidden;border:1px solid #cbd5e1}
          .ko-mat-btns button{padding:4px 10px;font-size:11px;border:none;cursor:pointer;background:#fff;color:#475569;transition:background .15s}
          .ko-mat-btns button:not(:last-child){border-right:1px solid #cbd5e1}
          .ko-mat-btns button.active-blue{background:#3b82f6;color:#fff}
          .ko-mat-btns button.active-red{background:#ef4444;color:#fff}
          .ko-mat-btns button.active-green{background:#22c55e;color:#fff}
          .ko-mat-btns button.active-orange{background:#f97316;color:#fff}
        </style>
        <div class="ko-mat-row"><span class="ko-mat-label">导电片</span><div class="ko-mat-btns" data-mat-group="earth_clip"><button data-action="exclude">移动备选</button><button data-action="delete" class="active-red">删除</button><button data-action="include">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">接地铜线夹</span><div class="ko-mat-btns" data-mat-group="earth_lug"><button data-action="exclude">移动备选</button><button data-action="delete" class="active-red">删除</button><button data-action="include">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">导轨端盖</span><div class="ko-mat-btns" data-mat-group="rail_cap"><button data-action="exclude">移动备选</button><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">承重梁端盖</span><div class="ko-mat-btns" data-mat-group="beam_cap"><button data-action="exclude">移动备选</button><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
      </div>
      <div data-group-only="韩语组" id="ko-params-panel" style="margin-top: 10px; padding: 12px; background: #f0fdfa; border-radius: 10px; border: 1px solid #b2dfdb;">
        <div id="ko-trade-section">
        <div id="ko-trade-method-label" style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">贸易方式</div>
        <div id="ko-trade-method-btns" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="ko-trade-method" value="EXW" style="width: 16px; height: 16px;">
            <span>EXW</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="ko-trade-method" value="FOB" style="width: 16px; height: 16px;">
            <span>FOB</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="ko-trade-method" value="CIF" checked style="width: 16px; height: 16px;">
            <span>CIF</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="ko-trade-method" value="DDP" style="width: 16px; height: 16px;">
            <span>DDP</span>
          </label>
        </div>
        <div id="ko-port-row" style="margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text);">
          <span style="width: 80px; font-weight: 600;">目的港：</span>
          <select id="ko-dest-port" style="width: 140px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="부산" selected>부산</option>
            <option value="인천">인천</option>
            <option value="__custom__">自定义</option>
          </select>
          <input type="text" id="ko-dest-port-custom" placeholder="직접 입력" style="display:none; width: 120px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div id="ko-container-row" style="margin-top: 8px; font-size: 13px; color: var(--text);">
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="width: 80px; font-weight: 600;">柜型/数量：</span>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="ko-ct-20gp" value="20GP" style="width: 16px; height: 16px;">
              <span>20GP</span>
              <input type="number" id="ko-qty-20gp" value="1" min="1" step="1" style="width: 60px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;" disabled>
              <span>个</span>
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="ko-ct-40hq" value="40HQ" checked style="width: 16px; height: 16px;">
              <span>40HQ</span>
              <input type="number" id="ko-qty-40hq" value="1" min="1" step="1" style="width: 60px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
              <span>个</span>
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="ko-ct-lcl" value="LCL" style="width: 16px; height: 16px;">
              <span>LCL（散货）</span>
            </label>
          </div>
        </div>
        <div id="ko-cif-freight-row" style="display: none; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px; margin-top: 6px;">
          <span style="width: 120px;">CIF运费(USD)</span>
          <input type="number" id="ko-cif-freight" value="0" step="1" min="0" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div id="ko-freight-row" style="display: none; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span id="ko-freight-label" style="width: 120px;">运费(USD)</span>
          <input type="number" id="ko-freight" value="0" step="1" min="0" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div id="ko-ddp-address-row" style="display: none; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">DDP地址：</span>
          <input type="text" id="ko-ddp-address" value="" placeholder="请输入DDP地址" style="width: 200px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        </div>
        <div id="ko-sale-type-section" style="margin-top: 10px; font-size: 13px; color: var(--text); margin-bottom: 6px;">
          <div style="margin-bottom: 6px; font-weight: 600;">销售类型</div>
          <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="radio" name="ko-sale-type" value="export" checked style="width: 16px; height: 16px;">
              <span>外销(USD)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="radio" name="ko-sale-type" value="domestic" style="width: 16px; height: 16px;">
              <span>内销(RMB)</span>
            </label>
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">折扣率设置</div>
        <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>公司折扣(%)</span>
            <input type="number" id="ko-company-discount" value="74" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
          <span style="font-weight: 600;">+</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>开发服务费(%)</span>
            <input type="number" id="ko-commission" value="0" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
          <span style="font-weight: 600;">=</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>铝价折扣(%)</span>
            <input type="number" id="ko-discount-rate" value="81" readonly style="width: 60px; padding: 4px 6px; border: 1px solid #94a3b8; border-radius: 4px; font-size: 13px; background: #f1f5f9; color: #0f172a; font-weight: 600;">
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">碳钢折扣(%)</span>
          <input type="number" id="ko-steel-discount-rate" value="84" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span style="width: 110px; margin-left: 12px;">碳钢包装</span>
          <select id="ko-steel-pack" style="width: 110px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="jybz" selected>简易包装</option>
            <option value="tietuo">铁托</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">外购件折扣(%)</span>
          <input type="number" id="ko-purchased-discount-rate" value="94" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div id="ko-tariff-row" style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">关税(%)</span>
          <input type="number" id="ko-tariff-rate" value="1.6" step="0.1" min="0" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div id="ko-consumption-tax-row" style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">消费税(%)</span>
          <input type="number" id="ko-consumption-tax" value="10" step="0.1" min="0" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div class="form-row" style="margin-top: 10px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text);">
            <input type="checkbox" id="ko-need-total-materials" style="width: 16px; height: 16px;">
            <span>添加材料总表 (物料汇总)</span>
          </label>
        </div>

      </div>
      <div data-group-only="日语组" id="normal-params-panel" style="display: none; margin-top: 10px; padding: 12px; background: #f0fdfa; border-radius: 10px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">物料处理选项</div>
        <div class="ko-mat-row"><span class="ko-mat-label">导电片</span><div class="ko-mat-btns" data-mat-group="ja_normal_earth_clip"><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">接地铜线夹</span><div class="ko-mat-btns" data-mat-group="ja_normal_earth_lug"><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">端盖</span><div class="ko-mat-btns" data-mat-group="ja_normal_cap"><button data-action="delete" class="active-red">删除</button><button data-action="include">移动报价中</button></div></div>
        <div style="font-size: 13px; color: var(--text); margin-top: 8px; margin-bottom: 6px; font-weight: 600;">貿易方式</div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="normal-mitsumori-condition" value="CIF" checked style="width: 16px; height: 16px;">
            <span>CIF</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="normal-mitsumori-condition" value="DDP" style="width: 16px; height: 16px;">
            <span>DDP</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="normal-mitsumori-condition" value="CIF_DDP" style="width: 16px; height: 16px;">
            <span>CIF+DDP</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="normal-mitsumori-condition" value="TEST" style="width: 16px; height: 16px;">
            <span>测试</span>
          </label>
        </div>
        <div style="font-size: 13px; color: var(--text); margin-top: 10px; margin-bottom: 6px; font-weight: 600;">税率设置</div>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">架台折扣率</span>
          <input type="number" id="normal-discount-rate" value="71" step="1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">碳钢包装</span>
          <select id="normal-steel-pack" style="width: 100px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="jybz" selected>简易包装</option>
            <option value="tietuo">铁托</option>
          </select>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">消費税</span>
          <input type="number" id="normal-consumption-tax" value="10" step="0.1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">関税率</span>
          <input type="number" id="normal-tariff-rate" value="3" step="0.1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">围栏折扣率</span>
          <input type="number" id="normal-fence-discount-rate" value="94" step="1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">運賃</span>
          <input type="number" id="normal-shipping-fee" value="0" step="1" style="width: 100px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>USD</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">取引条件</span>
          <select id="normal-trade-condition" style="width: 280px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="取引基本契約書に基づく">取引基本契約書に基づく</option>
            <option value="納品後翌月末支払">納品後翌月末支払</option>
          </select>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">删除重量</span>
          <input type="checkbox" id="normal-remove-weight" style="width: 16px; height: 16px;">
          <span style="font-size: 12px; color: var(--text-muted);">生成时移除物料明细的重量列(G列)</span>
        </label>
      </div>
      <div data-group-only="日语组" id="nv-params-panel" style="display: none; margin-top: 10px; padding: 12px; background: #f0fdfa; border-radius: 10px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-top: 8px; margin-bottom: 6px; font-weight: 600;">顧客情報</div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 6px;">
          <span style="width: 90px; font-weight: 600;">顧客名</span>
          <input type="text" id="nv-customer-name" placeholder="顧客名を入力" style="width: 200px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div style="font-size: 13px; color: var(--text); margin-top: 8px; margin-bottom: 6px; font-weight: 600;">貿易方式</div>
        <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="nv-trade-method" value="CIF" checked style="width: 16px; height: 16px;">
            <span>CIF</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="nv-trade-method" value="DDP" style="width: 16px; height: 16px;">
            <span>DDP</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="nv-trade-method" value="CIF_DDP" style="width: 16px; height: 16px;">
            <span>CIF+DDP</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="nv-trade-method" value="NV" style="width: 16px; height: 16px;">
            <span>NV</span>
          </label>
        </div>
        <div id="nv-cif-section" style="margin-top: 10px;">
          <div id="nv-port-row" style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 6px;">
            <span style="width: 90px; font-weight: 600;">目的港</span>
            <select id="nv-dest-port" style="width: 120px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
              <option value="横浜" selected>横浜</option>
              <option value="名古屋">名古屋</option>
              <option value="神戸">神戸</option>
              <option value="東京">東京</option>
              <option value="大阪">大阪</option>
              <option value="門司">門司</option>
              <option value="博多">博多</option>
              <option value="仙台">仙台</option>
              <option value="苫小牧">苫小牧</option>
              <option value="__custom__">自定义</option>
            </select>
            <input type="text" id="nv-dest-port-custom" placeholder="直接入力" style="display:none; width: 100px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 6px;">
            <span style="width: 90px; font-weight: 600;">柜型/数量/运费</span>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="nv-ct-20gp" value="20GP" style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">20GP</span>
                <input type="number" id="nv-qty-20gp" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="nv-freight-20gp" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
              </label>
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="nv-ct-40hq" value="40HQ" checked style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">40HQ</span>
                <input type="number" id="nv-qty-40hq" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;">
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="nv-freight-40hq" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;">
              </label>
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="nv-ct-lcl" value="LCL" style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">LCL</span>
                <input type="number" id="nv-qty-lcl" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="nv-freight-lcl" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
              </label>
            </div>
          </div>
        </div>
        <div id="nv-ddp-section" style="display: none; margin-top: 10px;">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
            <span style="width: 90px; font-weight: 600;">车辆规格</span>
            <select id="nv-truck-size" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
              <option value="2T">2T</option>
              <option value="4T" selected>4T</option>
              <option value="7T">7T</option>
              <option value="10T">10T</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
            <label style="display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="nv-truck-unic" checked style="width: 16px; height: 16px;">
              <span>吊车</span>
            </label>
            <label style="display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="nv-truck-flat" checked style="width: 16px; height: 16px;">
              <span>平车</span>
            </label>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text);">
            <span style="width: 90px; font-weight: 600;">配送费(USD)</span>
            <input type="number" id="nv-truck-fee" value="0" step="0.01" min="0" style="width: 100px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;color:#475569;letter-spacing:0.05em;margin-top:16px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">─ 有料予備品 ─</div>
        <div style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:8px;margin-bottom:8px;">
          <div style="background:#f0fdfa;border:1px solid #b2dfdb;border-radius:6px;padding:6px 8px;">
            <div style="font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;">杭予備品</div>
            <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px;">
              <span style="font-size:11px;color:#64748b;width:32px;">基数</span>
              <input type="number" id="nv-pile-spare-count" value="0" step="1" style="width:54px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:3px;font-size:11px;">
              <span style="font-size:10px;color:#64748b;">本</span>
            </div>
            <div style="display:flex;align-items:center;gap:3px;">
              <span style="font-size:11px;color:#64748b;width:32px;">単価</span>
              <input type="number" id="nv-pile-spare-price" value="0" step="0.01" style="width:54px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:3px;font-size:11px;">
              <span style="font-size:10px;color:#64748b;">USD</span>
            </div>
          </div>
        </div>
        <div style="font-size: 13px; color: var(--text); margin-top: 10px; margin-bottom: 6px; font-weight: 600;">折扣设置</div>
        <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>公司折扣(%)</span>
            <input type="number" id="nv-company-discount" value="77" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
          <span style="font-weight: 600;">+</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>开发服务费(%)</span>
            <input type="number" id="nv-commission" value="0" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
          <span style="font-weight: 600;">=</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>铝价折扣(%)</span>
            <input type="number" id="nv-discount-rate" value="77" readonly style="width: 60px; padding: 4px 6px; border: 1px solid #94a3b8; border-radius: 4px; font-size: 13px; background: #f1f5f9; color: #0f172a; font-weight: 600;">
          </div>
        </div>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">围栏折扣率</span>
          <input type="number" id="nv-fence-discount-rate" value="94" step="1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">碳钢折扣(%)</span>
          <input type="number" id="nv-steel-discount-rate" value="84" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span style="width: 110px; margin-left: 12px;">碳钢包装</span>
          <select id="nv-steel-pack" style="width: 110px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="jybz" selected>简易包装</option>
            <option value="tietuo">铁托</option>
          </select>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">外购件折扣(%)</span>
          <input type="number" id="nv-purchased-discount-rate" value="94" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">汇率(1USD=)</span>
          <input type="number" id="nv-exchange-rate" value="151" step="1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>JPY</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">消費税</span>
          <input type="number" id="nv-consumption-tax" value="10" step="0.1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">関税</span>
          <input type="number" id="nv-tariff-rate" value="1.4" step="0.1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 6px; margin-bottom: 4px;">
          <span style="width: 120px; font-weight: 600;">取引条件</span>
          <select id="nv-torihiki-condition" style="flex: 1; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
            <option value="T/Tで発注時30％、B/Lコピー発行後70％支払" selected>T/Tで発注時30％、B/Lコピー発行後70％支払</option>
            <option value="納品月末締め翌々月末払い">納品月末締め翌々月末払い</option>
            <option value="納品月末締め翌月末払い">納品月末締め翌月末払い</option>
          </select>
        </div>
      </div>
      <div data-group-only="日语组" id="est-params-panel" style="margin-top: 10px; padding: 8px; background: #f0fdfa; border-radius: 8px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">物料处理选项</div>
        <div class="ko-mat-row"><span class="ko-mat-label">导电片</span><div class="ko-mat-btns" data-mat-group="ja_est_earth_clip"><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">接地铜线夹</span><div class="ko-mat-btns" data-mat-group="ja_est_earth_lug"><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">端盖</span><div class="ko-mat-btns" data-mat-group="ja_est_cap"><button data-action="delete" class="active-red">删除</button><button data-action="include">移动报价中</button></div></div>
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600; margin-top: 6px;">汇率与税率设置</div>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span>1美元＝</span>
          <input type="number" id="ja-exchange-rate" value="160" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>日元</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span>关税率</span>
          <input type="number" id="ja-tariff-rate" value="1.6" step="0.1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span>消费税率</span>
          <input type="number" id="ja-consumption-tax" value="10" step="0.1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text);">
          <span>税金率</span>
          <input type="number" id="ja-fence-tax" value="10" step="0.1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 4px;">
          <span>铝价折扣率</span>
          <input type="number" id="ja-discount-rate" value="71" step="1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 4px;">
          <span style="width: 80px;">碳钢折扣率</span>
          <input type="number" id="ja-steel-discount-rate" value="84" step="1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
          <span style="width: 80px; margin-left: 8px;">碳钢包装</span>
          <select id="ja-steel-pack" style="width: 100px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="jybz" selected>简易包装</option>
            <option value="tietuo">铁托</option>
          </select>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 4px;">
          <span style="width: 80px;">外购件折扣率</span>
          <input type="number" id="ja-purchased-discount-rate" value="94" step="1" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span>％</span>
        </label>
        <div style="font-size: 13px; color: var(--text); margin-top: 10px; margin-bottom: 6px; font-weight: 600;">配送车辆</div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span>车辆规格</span>
          <select id="ja-truck-size" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="2T">2T</option>
            <option value="4T" selected>4T</option>
            <option value="7T">7T</option>
            <option value="10T">10T</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--text);">
          <label style="display: flex; align-items: center; gap: 4px;">
            <input type="checkbox" id="ja-truck-unic" checked style="width: 16px; height: 16px;">
            <span>ユニック（吊车）</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px;">
            <input type="checkbox" id="ja-truck-flat" checked style="width: 16px; height: 16px;">
            <span>平車</span>
          </label>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 6px;">
          <span>配送費(USD)</span>
          <input type="number" id="ja-truck-fee" value="0" step="0.01" min="0" style="width: 100px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
      </div>
      <div data-group-only="英语组" id="en-params-panel" style="margin-top: 10px; padding: 12px; background: #f0fdfa; border-radius: 10px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">Seller</div>
        <div id="en-seller-btns" style="display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap; margin-bottom: 10px;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-seller" value="metal" checked style="width: 16px; height: 16px;">
            <span>Xiamen Kseng Metal Tech. Co., Ltd.</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-seller" value="new_energy" style="width: 16px; height: 16px;">
            <span>Xiamen Kseng New Energy Tech Co., Ltd.</span>
          </label>
        </div>
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">销售类型</div>
        <div id="en-sale-type-section" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap; margin-bottom: 10px;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-sale-type" value="export" checked style="width: 16px; height: 16px;">
            <span>外销(USD)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-sale-type" value="domestic" style="width: 16px; height: 16px;">
            <span>内销(RMB)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-sale-type" value="euro" style="width: 16px; height: 16px;">
            <span>欧元(EUR)</span>
          </label>
        </div>
        <div id="en-validity-row" style="margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text);">
          <span style="width: 120px; font-weight: 600;">有效期：</span>
          <select id="en-quote-validity" style="width: 140px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="1d">1天</option>
            <option value="7d" selected>7天</option>
            <option value="today">当天有效</option>
            <option value="custom">自定义</option>
          </select>
          <input type="number" id="en-quote-validity-custom" min="1" placeholder="天数" style="display: none; width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span id="en-quote-validity-custom-unit" style="display: none; font-size: 13px; color: var(--text);">天</span>
        </div>
        <div style="font-size: 13px; color: var(--text); margin-top: 8px; margin-bottom: 4px; font-weight: 600;">收款方式：</div>
        <div id="en-payment-term-btns" style="display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-payment-term" value="100advance" style="width: 16px; height: 16px;">
            <span>100% payment in advance</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-payment-term" value="3070shipment" checked style="width: 16px; height: 16px;">
            <span>30% deposit, 70% balance before shipment</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-payment-term" value="3070bl" style="width: 16px; height: 16px;">
            <span>30% deposit, 70% balance against B/L copy</span>
          </label>
        </div>
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">贸易方式</div>
        <div id="en-trade-method-btns" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-trade-method" value="EXW" checked style="width: 16px; height: 16px;">
            <span>EXW</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-trade-method" value="FCA" style="width: 16px; height: 16px;">
            <span>FCA</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-trade-method" value="FOB" style="width: 16px; height: 16px;">
            <span>FOB</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-trade-method" value="CIF" style="width: 16px; height: 16px;">
            <span>CIF</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-trade-method" value="DDU" style="width: 16px; height: 16px;">
            <span>DDU</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="en-trade-method" value="DDP" style="width: 16px; height: 16px;">
            <span>DDP</span>
          </label>
        </div>
        <div id="en-port-row" style="margin-top: 8px; display: none; align-items: center; gap: 8px; font-size: 13px; color: var(--text);">
          <span id="en-port-label" style="width: 80px; font-weight: 600;">FOB港口：</span>
          <select id="en-dest-port" style="width: 200px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="__custom__">自定义...</option>
            <option value="XIAMEN" selected>XIAMEN</option>
            <option value="TIANJIN">TIANJIN</option>
          </select>
          <input type="text" id="en-dest-port-custom" placeholder="输入自定义港口" style="display: none; width: 160px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div id="en-cif-port-row" style="margin-top: 8px; display: none; align-items: center; gap: 8px; font-size: 13px; color: var(--text);">
          <span style="width: 80px; font-weight: 600;">目的港：</span>
          <select id="en-cif-dest-port" style="width: 240px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="__custom__">自定义...</option>
            <option value="Rotterdam" selected>Rotterdam（鹿特丹）</option>
            <option value="Hamburg">Hamburg（汉堡）</option>
            <option value="Antwerp">Antwerp（安特卫普）</option>
            <option value="Rijeka">Rijeka（里耶卡）</option>
            <option value="Le Havre">Le Havre（勒阿弗尔）</option>
            <option value="Genoa">Genoa（热那亚）</option>
            <option value="Napoli">Napoli（那不勒斯）</option>
            <option value="Catania">Catania（卡塔尼亚）</option>
            <option value="Constanta">Constanta（康士坦沙）</option>
            <option value="Durban">Durban（德班）</option>
            <option value="Manzanillo">Manzanillo（曼萨尼略）</option>
            <option value="San Antonio">San Antonio（圣安东尼奥）</option>
            <option value="Colon">Colon（科隆）</option>
            <option value="Puerto Quetzal">Puerto Quetzal（夸特扎尔）</option>
            <option value="MARIEL">MARIEL（马里尔）</option>
            <option value="SANTO DOMINGO">SANTO DOMINGO（圣多名各）</option>
            <option value="Mombasa">Mombasa（蒙巴萨）</option>
            <option value="San Salvador">San Salvador（圣萨尔瓦多）</option>
            <option value="Lagos">Lagos（拉各斯）</option>
            <option value="Abidjan">Abidjan（阿比让）</option>
            <option value="Tema">Tema（特马）</option>
          </select>
          <input type="text" id="en-cif-dest-port-custom" placeholder="输入自定义港口" style="display: none; width: 160px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div id="en-container-row" style="margin-top: 8px; display: none; font-size: 13px; color: var(--text);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 80px; font-weight: 600;">柜型/数量/运费</span>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="en-ct-20gp" value="20GP" style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">20GP</span>
                <input type="number" id="en-qty-20gp" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="en-freight-20gp" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
              </label>
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="en-ct-40hq" value="40HQ" checked style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">40HQ</span>
                <input type="number" id="en-qty-40hq" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;">
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="en-freight-40hq" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;">
              </label>
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="en-ct-lcl" value="LCL" style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">LCL</span>
                <input type="number" id="en-qty-lcl" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="en-freight-lcl" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
              </label>
            </div>
          </div>
        </div>
        <div style="border-top: 1px solid #b2dfdb; margin-top: 10px; padding-top: 10px;">
          <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">折扣设置</div>
          <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span>公司折扣(%)</span>
              <input type="number" id="en-company-discount" value="74" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            </div>
            <span style="font-weight: 600;">+</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span>开发服务费(%)</span>
              <input type="number" id="en-commission" value="0" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            </div>
            <span style="font-weight: 600;">=</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span>铝折扣(%)</span>
              <input type="number" id="en-discount-rate" value="81" readonly style="width: 60px; padding: 4px 6px; border: 1px solid #94a3b8; border-radius: 4px; font-size: 13px; background: #f1f5f9; color: #0f172a; font-weight: 600;">
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
            <span style="width: 120px;">碳钢折扣(%)</span>
            <input type="number" id="en-steel-discount-rate" value="84" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <span style="width: 110px; margin-left: 12px;">碳钢包装</span>
            <select id="en-steel-pack" style="width: 110px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
              <option value="jybz" selected>简易包装</option>
              <option value="tietuo">铁托</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
            <span style="width: 120px;">外购件折扣(%)</span>
            <input type="number" id="en-purchased-discount-rate" value="94" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
        </div>
      </div>
      <div data-group-only="亚太组" id="ap-params-panel" style="margin-top: 10px; padding: 12px; background: #f0fdfa; border-radius: 10px; border: 1px solid #b2dfdb;">
        <div data-group-only="亚太组" style="margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13px; font-weight: 600; color: var(--text);">表面处理：</span>
          <button class="btn primary" id="btn-ap-coating-10" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">10um</button>
          <button class="btn" id="btn-ap-coating-15" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">15um</button>
          <button class="btn" id="btn-ap-coating-18" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">18um</button>
        </div>
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">贸易方式</div>
        <div id="ap-trade-method-btns" style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text); flex-wrap: wrap; margin-bottom: 10px;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="ap-trade-method" value="EXW" checked style="width: 16px; height: 16px;">
            <span>EXW</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="ap-trade-method" value="FOB" style="width: 16px; height: 16px;">
            <span>FOB</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="radio" name="ap-trade-method" value="CIF" style="width: 16px; height: 16px;">
            <span>CIF</span>
          </label>
        </div>
        <div id="ap-container-row" style="margin-top: 8px; display: none; font-size: 13px; color: var(--text);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 120px; font-weight: 600;">柜型/数量/运费</span>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="ap-ct-20gp" value="20GP" style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">20GP</span>
                <input type="number" id="ap-qty-20gp" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="ap-freight-20gp" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;" disabled>
              </label>
              <label style="display: flex; align-items: center; gap: 3px; cursor: pointer; padding: 3px 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 13px; color: var(--text);">
                <input type="checkbox" id="ap-ct-40hq" value="40HQ" checked style="width: 14px; height: 14px;">
                <span style="font-weight: 500;">40HQ</span>
                <input type="number" id="ap-qty-40hq" value="1" min="1" step="1" style="width: 42px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;">
                <span style="font-size: 11px; color: #64748b;">个</span>
                <input type="number" id="ap-freight-40hq" value="" step="1" min="0" placeholder="运费" style="width: 58px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; text-align: center;">
              </label>
            </div>
          </div>
        </div>
        <div id="ap-port-row" style="display: none; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 8px;">
          <span style="width: 120px;">港口</span>
          <select id="ap-port" style="width: 120px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="XIAMEN" selected>厦门</option>
            <option value="TIANJIN">天津</option>
          </select>
        </div>
        <div id="ap-module-wattage-row" style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 8px;">
          <span style="width: 120px;">单瓦功率(W)</span>
          <input type="number" id="module-wattage-input" value="670" step="1" min="0" placeholder="例如：670" style="width: 90px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">折扣率设置</div>
        <div style="display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>公司折扣(%)</span>
            <input type="number" id="ap-company-discount" value="74" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
          <span style="font-weight: 600;">+</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>开发服务费(%)</span>
            <input type="number" id="ap-commission" value="0" step="1" min="0" max="100" style="width: 60px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          </div>
          <span style="font-weight: 600;">=</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span>铝价折扣(%)</span>
            <input type="number" id="ap-discount-rate" value="74" readonly style="width: 60px; padding: 4px 6px; border: 1px solid #94a3b8; border-radius: 4px; font-size: 13px; background: #f1f5f9; color: #0f172a; font-weight: 600;">
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">碳钢折扣(%)</span>
          <input type="number" id="ap-steel-discount-rate" value="84" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
          <span style="width: 110px; margin-left: 12px;">碳钢包装</span>
          <select id="ap-steel-pack" style="width: 110px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
            <option value="jybz" selected>简易包装</option>
            <option value="tietuo">铁托</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-bottom: 4px;">
          <span style="width: 120px;">外购件折扣(%)</span>
          <input type="number" id="ap-purchased-discount-rate" value="94" step="1" min="0" max="100" style="width: 80px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px;">
        </div>
      </div>
      <div class="form-row" id="weight-code-row" data-group-only="日语组,韩语组" style="margin-top: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        <label id="single-weight-code-label" style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text);">
          <input type="checkbox" id="need-weight-code" style="width: 16px; height: 16px;">
          <span>添加重量和编码列</span>
        </label>
        <label id="nv-need-weight-label" style="display: none; align-items: center; gap: 8px; font-size: 14px; color: var(--text);">
          <input type="checkbox" id="nv-need-weight" style="width: 16px; height: 16px;">
          <span>添加重量列</span>
        </label>
        <label id="nv-need-code-label" style="display: none; align-items: center; gap: 8px; font-size: 14px; color: var(--text);">
          <input type="checkbox" id="nv-need-code" style="width: 16px; height: 16px;">
          <span>添加编码列</span>
        </label>
        <label data-group-only="日语组" style="display: none; align-items: center; gap: 8px; font-size: 14px; color: var(--text);" id="nv-jpy-quote-wrapper">
          <input type="checkbox" id="nv-need-jpy-quote" style="width: 16px; height: 16px;">
          <span>需要日元报价</span>
        </label>
      </div>
      <div id="en-simple-options" data-group-only="英语组" style="display: none; margin-top: 12px; margin-bottom: 8px;">
        <div class="form-row" style="margin-bottom: 6px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text);">
            <input type="checkbox" id="en-need-weight-code" style="width: 16px; height: 16px;">
            <span>添加重量和编码列</span>
          </label>
        </div>
        <div class="form-row">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text);">
            <input type="checkbox" id="need-total-qty" style="width: 16px; height: 16px;">
            <span>添加总数量列 (Total QTY)</span>
          </label>
        </div>
        <div class="form-row" style="margin-top: 6px; display: flex; align-items: center; gap: 16px;">
          <span style="font-size: 14px; font-weight: 600; color: var(--text);">折扣方式：</span>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 14px; color: var(--text);">
            <input type="radio" name="en-discount-method" value="project" checked style="width: 16px; height: 16px;">
            <span>项目折扣</span>
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 14px; color: var(--text);">
            <input type="radio" name="en-discount-method" value="unit_price" style="width: 16px; height: 16px;">
            <span>单价折扣</span>
          </label>
        </div>
        <div class="form-row" style="margin-top: 6px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text);">
            <input type="checkbox" id="en-need-total-materials" style="width: 16px; height: 16px;">
            <span>添加材料总表 (Total Materials)</span>
          </label>
        </div>
      </div>
      <div class="toolbar" style="margin-top: 12px;">
        <button class="btn primary" id="bom-file-btn">选择 BOM 表</button>
      </div>
      <div id="bom-upload-hint" class="muted" style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 8px; display: none;">
        ⚠️ 请先上传物料定价表
      </div>
    </div>
    <div class="card" data-group-only="韩语组,日语组,英语组">
      <h3>上传信息表</h3>
      <div class="muted">选填：上传信息表文件，作为和 BOM 表并列的项目输入文件。</div>
      <div data-group-only="韩语组" style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: var(--text);">表面处理：</span>
        <button class="btn primary" id="btn-ko-coating-10" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">10um</button>
        <button class="btn" id="btn-ko-coating-15" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">15um</button>
        <button class="btn" id="btn-ko-coating-18" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">18um</button>
      </div>
      <div data-group-only="日语组" style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: var(--text);">表面处理：</span>
        <button class="btn primary" id="btn-coating-10" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">10um</button>
        <button class="btn" id="btn-coating-15" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">15um</button>
        <button class="btn" id="btn-coating-18" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">18um</button>
      </div>
      <div data-group-only="日语组" id="nv-mat-options" style="margin-top: 8px; display: none; padding: 12px; background: #f0fdfa; border-radius: 10px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 4px; font-weight: 600;">物料处理选项</div>
        <div class="ko-mat-row"><span class="ko-mat-label">导电片 DP-</span><div class="ko-mat-btns" data-mat-group="ja_nv_handle_earth_clip"><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">接地铜线夹 GL-</span><div class="ko-mat-btns" data-mat-group="ja_nv_handle_earth_lug"><button data-action="delete">删除</button><button data-action="include" class="active-green">移动报价中</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">端盖 DG-</span><div class="ko-mat-btns" data-mat-group="ja_nv_handle_cap"><button data-action="delete" class="active-red">删除</button><button data-action="include">移动报价中</button></div></div>
        <div style="font-size: 13px; color: var(--text); margin-top: 10px; margin-bottom: 4px; font-weight: 600;">免费备品选项</div>
        <div class="ko-mat-row"><span class="ko-mat-label">导轨 R-</span><div class="ko-mat-btns" data-mat-group="ja_nv_rail"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">角铝 J-</span><div class="ko-mat-btns" data-mat-group="ja_nv_angle_aluminum"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">承重梁 B-</span><div class="ko-mat-btns" data-mat-group="ja_nv_beam"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">H连接件 VH-</span><div class="ko-mat-btns" data-mat-group="ja_nv_h_connector"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">立柱 L-</span><div class="ko-mat-btns" data-mat-group="ja_nv_post"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">底座 AB-</span><div class="ko-mat-btns" data-mat-group="ja_nv_base"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">连接件 SB-/SR-</span><div class="ko-mat-btns" data-mat-group="ja_nv_connector"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">压块 CM-/CE-/CT-</span><div class="ko-mat-btns" data-mat-group="ja_nv_clamp"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">螺栓 FA-</span><div class="ko-mat-btns" data-mat-group="ja_nv_bolt"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row"><span class="ko-mat-label">地桩 DZ-</span><div class="ko-mat-btns" data-mat-group="ja_nv_pile"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row" data-spare-depends="ja_nv_handle_earth_clip"><span class="ko-mat-label">导电片 DP-</span><div class="ko-mat-btns" data-mat-group="ja_nv_earth_clip"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row" data-spare-depends="ja_nv_handle_earth_lug"><span class="ko-mat-label">接地件 GL-</span><div class="ko-mat-btns" data-mat-group="ja_nv_earth_lug"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
        <div class="ko-mat-row" data-spare-depends="ja_nv_handle_cap" style="display:none;"><span class="ko-mat-label">端盖 DG-</span><div class="ko-mat-btns" data-mat-group="ja_nv_cap"><button data-action="exclude">免费备品</button><button data-action="include" class="active-green">不备品</button></div></div>
      </div>
      <div data-group-only="英语组" style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: var(--text);">表面处理：</span>
        <button class="btn primary" id="btn-en-coating-10" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">10um</button>
        <button class="btn" id="btn-en-coating-15" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">15um</button>
        <button class="btn" id="btn-en-coating-18" style="padding: 3px 12px; font-size: 12px; border-radius: 6px;">18um</button>
      </div>
      <div class="toolbar">
        <button class="btn primary" id="matrix-file-btn">选择信息表</button>
      </div>
      <div id="matrix-file-status" class="muted" style="margin-top: 8px; padding: 8px; background: #ecfeff; border-radius: 8px; display: none;"></div>
    </div>
    <div class="card">
      <h3>图片文件夹</h3>
      <div class="muted">选填：指定产品图片文件夹路径，用于报价表中自动插入图片。</div>
      <div class="toolbar">
        <input class="input" id="image-folder-input" placeholder="例如：D:\\\\lxx\\\\图片库" />
      </div>
      <div class="toolbar">
        <button class="btn" id="image-folder-btn">选择图片文件夹</button>
      </div>
      <div id="image-folder-status" class="muted" style="margin-top: 8px; padding: 8px; background: #f1f5f9; border-radius: 8px; display: none;"></div>
    </div>
    <div class="card">
      <h3>联系信息</h3>
      <div class="muted">用于报价汇总表头部信息填写。选择负责人后自动填入。</div>
      <div data-group-only="韩语组,亚太组" style="margin-top: 10px; padding: 8px; background: #f0fdfa; border-radius: 8px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">选择负责人</div>
        <div id="contact-list" style="display: flex; flex-wrap: wrap; gap: 8px;">加载中...</div>
        <div id="contact-preview" style="margin-top: 10px; padding: 10px; background: #fff; border-radius: 8px; font-size: 13px; color: var(--text); display: none; border: 1px solid #e2e8f0;">
          <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">已选负责人信息</div>
          <div id="contact-preview-name" style="margin-bottom: 2px;"><span style="color:#64748b;">담당자：</span>-</div>
          <div id="contact-preview-phone" style="margin-bottom: 2px;"><span style="color:#64748b;">전화：</span>-</div>
          <div id="contact-preview-email" style="margin-bottom: 2px;"><span style="color:#64748b;">Email：</span>-</div>
          <div id="contact-preview-fax"><span style="color:#64748b;">Fax：</span></div>
        </div>
      </div>
      <div class="form-actions" data-group-only="韩语组,亚太组" style="margin-top: 8px;">
        <button class="btn" type="button" id="contact-clear-btn">清除选择</button>
      </div>
      <div data-group-only="日语组" style="margin-top: 10px; padding: 8px; background: #f0fdfa; border-radius: 8px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">选择销售担当</div>
        <div id="ja-contact-list" style="display: flex; flex-wrap: wrap; gap: 8px;">加载中...</div>
        <div id="ja-contact-preview" style="margin-top: 10px; padding: 10px; background: #fff; border-radius: 8px; font-size: 13px; color: var(--text); display: none; border: 1px solid #e2e8f0;">
          <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">已选担当信息</div>
          <div id="ja-contact-preview-name" style="margin-bottom: 2px;"><span style="color:#64748b;">担当者：</span>-</div>
          <div id="ja-contact-preview-mob" style="margin-bottom: 2px;"><span style="color:#64748b;">Mob：</span>-</div>
          <div id="ja-contact-preview-tel" style="margin-bottom: 2px;"><span style="color:#64748b;">Tel：</span>-</div>
          <div id="ja-contact-preview-fax"><span style="color:#64748b;">Fax：</span>-</div>
        </div>
      </div>
      <div class="form-actions" data-group-only="日语组" style="margin-top: 8px;">
        <button class="btn" type="button" id="ja-contact-clear-btn">清除选择</button>
      </div>
      <div data-group-only="英语组" style="margin-top: 10px; padding: 8px; background: #f0fdfa; border-radius: 8px; border: 1px solid #b2dfdb;">
        <div style="font-size: 13px; color: var(--text); margin-bottom: 6px; font-weight: 600;">Select Sales Contact</div>
        <div id="en-contact-list" style="display: flex; flex-wrap: wrap; gap: 8px;">Loading...</div>
        <div id="en-contact-preview" style="margin-top: 10px; padding: 10px; background: #fff; border-radius: 8px; font-size: 13px; color: var(--text); display: none; border: 1px solid #e2e8f0;">
          <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">Selected Contact</div>
          <div id="en-contact-preview-name" style="margin-bottom: 2px;"><span style="color:#64748b;">Contact：</span>-</div>
          <div id="en-contact-preview-phone" style="margin-bottom: 2px;"><span style="color:#64748b;">Phone：</span>-</div>
          <div id="en-contact-preview-email" style="margin-bottom: 2px;"><span style="color:#64748b;">Email：</span>-</div>
        </div>
      </div>
      <div class="form-actions" data-group-only="英语组" style="margin-top: 8px;">
        <button class="btn" type="button" id="en-contact-clear-btn">Clear</button>
      </div>
    </div>
    <div class="card quotation-collapsible-card ja-standard-fence-gate-card" style="display:none;">
      <div class="quotation-collapsible-header" id="fence-gate-toggle">
        <h3>围栏 / 门快速报价</h3>
      </div>
      <div class="quotation-collapsible-body" id="fence-gate-body" style="display:block;">
        <div style="font-size:12px;font-weight:700;color:#475569;letter-spacing:0.05em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">── 共通パラメータ ──</div>
        <div class="form-row">
          <div class="form-field">
            <label for="quick-fence-coating">表面処理</label>
            <select class="input" id="quick-fence-coating">
              <option value="浸塑" selected>浸塑</option>
              <option value="热镀锌">熱亜鉛めっき</option>
            </select>
          </div>
          <div class="form-field">
            <label for="quick-fence-surface">表面处理</label>
            <select class="input" id="quick-fence-surface">
              <option value="白色浸塑">白色浸塑</option>
              <option value="咖啡色浸塑">咖啡色浸塑</option>
              <option value="シルバー">シルバー</option>
            </select>
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;color:#475569;letter-spacing:0.05em;margin-top:16px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <span>── 围栏 ──</span>
          <button type="button" class="btn" id="add-fence-row-btn" style="font-size:11px;padding:2px 10px;">+ 添加围栏</button>
        </div>
        <div id="fence-rows-container"></div>
        <div style="font-size:12px;font-weight:700;color:#475569;letter-spacing:0.05em;margin-top:16px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <span>── 门 ──</span>
          <button type="button" class="btn" id="add-gate-row-btn" style="font-size:11px;padding:2px 10px;">+ 添加门</button>
        </div>
        <div id="gate-rows-container"></div>
        <div id="quick-fence-gate-summary" class="quotation-quick-summary"></div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:12px;">
          <button class="btn primary" id="nv-fence-gate-confirm-btn" style="font-size:12px;padding:5px 16px;">确认</button>
          <span id="nv-fence-gate-confirm-status" style="font-size:12px;color:var(--muted);"></span>
        </div>
      </div>
    </div>
    <div class="card quotation-collapsible-card ja-external-fence-card" data-group-only="日语组" style="display:none;">
      <div class="quotation-collapsible-header" id="est-fence-toggle">
        <h3>EST 平フェンス見積</h3>
      </div>
      <div class="quotation-collapsible-body" id="est-fence-body" style="display:block;">
        <style>
          .est-seg-block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-top:10px;position:relative}
          .est-seg-remove{position:absolute;top:8px;right:8px;background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;padding:2px 6px;line-height:1}
          .est-seg-remove:hover{background:#fef2f2;border-radius:4px}
          .est-seg-row{display:grid;grid-template-columns:1fr 1fr;column-gap:14px;margin-top:8px}
          .est-seg-col{display:flex;flex-direction:column;gap:4px}
          .est-seg-col>label{font-size:12px;color:#475569;line-height:1.3}
          .est-seg-col select.est-sctl,
          .est-seg-col input.est-sctl{height:32px;padding:0 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;width:100%;box-sizing:border-box;outline:none}
          .est-seg-col select.est-sctl:focus,
          .est-seg-col input.est-sctl:focus{border-color:#3b82f6}
          .est-seg-col .est-gate-row{display:flex;align-items:center;gap:6px;height:32px}
          .est-seg-col .est-gate-row input[type=checkbox]{width:16px;height:16px;cursor:pointer;flex-shrink:0;margin:0}
          .est-seg-col .est-gate-row input.est-sctl{flex:1;min-width:0;text-align:center}
        </style>
        <div style="font-size:12px;font-weight:700;color:#475569;letter-spacing:0.05em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <span>── 围栏セグメント ──</span>
          <button type="button" class="btn" id="add-est-seg-btn" style="font-size:11px;padding:2px 10px;">+ 添加段</button>
        </div>
        <div id="est-segments-container"></div>
        <div class="est-seg-row" style="margin-top:12px;">
          <div class="est-seg-col">
            <label for="est-fence-additional-misc">追加諸係り (USD)</label>
            <input class="est-sctl" id="est-fence-additional-misc" type="number" min="0" step="1" value="" placeholder="0" />
          </div>
          <div class="est-seg-col"></div>
        </div>
        <div id="est-fence-summary" class="quotation-quick-summary"></div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
          <button class="btn primary" id="est-fence-confirm-btn" style="font-size:12px;padding:5px 16px;">确认</button>
          <span id="est-fence-confirm-status" style="font-size:12px;color:var(--muted);"></span>
        </div>
      </div>
    </div>
  </div>
  <div class="toolbar">
    <button class="btn" id="generate-report-btn">分析并生成报表</button>
    <button class="btn" id="save-prefs-btn" style="margin-left:8px;">保存我的习惯</button>
    <span id="save-prefs-status" style="font-size:13px;color:var(--muted);margin-left:8px;"></span>
  </div>
  <div class="status-box" style="display: none;"></div>
  <div id="report-area" class="report-box" style="display: none; margin-top: 16px;">
    <div class="report-title">报表已生成</div>
    <div id="report-info" class="muted"></div>
    <div class="toolbar">
      <button class="btn primary" id="download-report-btn">下载汇总报价表</button>
      <button class="btn" id="download-inquiry-btn" style="display: none;">下载询价表</button>
      <button class="btn primary" id="submit-inquiry-btn" style="display: none;">提交询价项到询价价格查询</button>
      <button class="btn" id="download-missing-image-btn" style="display: none;">存入询图列表</button>
    </div>
    <div id="inquiry-remark-wrap" style="display:none; margin-top:10px;">
      <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:4px;">询价备注</label>
      <textarea id="inquiry-remark-input" rows="3" placeholder="请输入询价备注信息（选填）" style="width:100%;max-width:600px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical;font-family:inherit;"></textarea>
      <div style="margin-top:6px;">
        <label style="font-size:13px;font-weight:600;color:var(--text);display:block;margin-bottom:4px;">附件</label>
        <label class="btn" style="cursor:pointer;display:inline-block;margin-bottom:6px;">上传附件<input type="file" id="inquiry-attachment-input" multiple style="display:none;"></label>
        <div id="inquiry-attachment-list" style="margin-top:4px;font-size:12px;color:var(--muted);"></div>
      </div>
    </div>
    <div id="inquiry-list-container" style="display:none; margin-top:12px;"></div>
    <div id="temp-pricing-container" style="display:none; margin-top:12px;"></div>
    <div id="temp-code-container" style="display:none; margin-top:12px;"></div>
  </div>
</section>
`;

    function getCardForElement(el) {
        return el && typeof el.closest === 'function' ? el.closest('.card') : null;
    }

    function initializeElements() {
        elements.priceFileButton = document.getElementById('price-file-btn');
        elements.matrixFileButton = document.getElementById('matrix-file-btn');
        elements.bomFileButton = document.getElementById('bom-file-btn');
        elements.generateButton = document.getElementById('generate-report-btn');
        elements.statusBox = document.querySelector('#upload .status-box');
        elements.downloadMissingImageBtn = document.getElementById('download-missing-image-btn');
        elements.bomUploadHint = document.getElementById('bom-upload-hint');
        elements.priceTableStatus = document.getElementById('price-table-status');
        elements.priceTableInfo = document.getElementById('price-table-info');
        elements.matrixFileStatus = document.getElementById('matrix-file-status');
        elements.reportArea = document.getElementById('report-area');
        elements.reportInfo = document.getElementById('report-info');
        elements.downloadReportButton = document.getElementById('download-report-btn');
        elements.inquiryDownloadReportButton = document.getElementById('download-inquiry-btn');
        elements.inquirySubmitButton = document.getElementById('submit-inquiry-btn');
        elements.inquiryListContainer = document.getElementById('inquiry-list-container');
        elements.inquiryRemarkWrap = document.getElementById('inquiry-remark-wrap');
        elements.inquiryRemarkInput = document.getElementById('inquiry-remark-input');
        elements.inquiryAttachmentInput = document.getElementById('inquiry-attachment-input');
        elements.inquiryAttachmentList = document.getElementById('inquiry-attachment-list');
        elements.priceInquiryRemarkWrap = document.getElementById('price-inquiry-remark-wrap');
        elements.priceInquiryRemarkInput = document.getElementById('price-inquiry-remark-input');
        elements.priceInquiryAttachmentInput = document.getElementById('price-inquiry-attachment-input');
        elements.priceInquiryAttachmentList = document.getElementById('price-inquiry-attachment-list');
        elements.priceReportArea = document.getElementById('price-report-area');
        elements.priceReportInfo = document.getElementById('price-report-info');
        elements.priceDownloadReportButton = document.getElementById('price-download-report-btn');
        elements.priceInquiryDownloadReportButton = document.getElementById('price-download-inquiry-btn');
        elements.priceInquirySubmitButton = document.getElementById('price-submit-inquiry-btn');
        elements.imageFolderInput = document.getElementById('image-folder-input');
        elements.imageFolderButton = document.getElementById('image-folder-btn');
        elements.imageFolderStatus = document.getElementById('image-folder-status');
        elements.contactList = document.getElementById('contact-list');
        elements.contactClearButton = document.getElementById('contact-clear-btn');
        elements.quickFenceSurface = document.getElementById('quick-fence-surface');
        elements.quickFenceCoating = document.getElementById('quick-fence-coating');
        elements.quickFenceGateSummary = document.getElementById('quick-fence-gate-summary');
        elements.fenceRowsContainer = document.getElementById('fence-rows-container');
        elements.gateRowsContainer = document.getElementById('gate-rows-container');
        elements.addFenceRowBtn = document.getElementById('add-fence-row-btn');
        elements.addGateRowBtn = document.getElementById('add-gate-row-btn');
        elements.estSegmentsContainer = document.getElementById('est-segments-container');
        elements.addEstSegBtn = document.getElementById('add-est-seg-btn');
        elements.bomTableSelectionPanel = document.getElementById('bom-table-selection-panel');
        elements.bomTableSelectionSummary = document.getElementById('bom-table-selection-summary');
        elements.bomTableSelectionList = document.getElementById('bom-table-selection-list');
        elements.bomTableSelectAllButton = document.getElementById('bom-table-select-all-btn');
        elements.bomTableClearButton = document.getElementById('bom-table-clear-btn');
        elements.inquiryRequesterSelect = null;
        elements.inquiryRequesterAddButton = null;
        elements.inquiryRequesterUpdateButton = null;
        elements.inquiryRequesterDeleteButton = null;
        elements.manualReportArea = null;
        elements.manualReportInfo = null;
        elements.manualDownloadReportButton = null;
        elements.manualInquiryDownloadReportButton = null;

        if (elements.inquiryAttachmentInput) {
            elements.inquiryAttachmentInput.addEventListener('change', function () {
                renderAttachmentList(elements.inquiryAttachmentInput, elements.inquiryAttachmentList);
            });
        }
        if (elements.priceInquiryAttachmentInput) {
            elements.priceInquiryAttachmentInput.addEventListener('change', function () {
                renderAttachmentList(elements.priceInquiryAttachmentInput, elements.priceInquiryAttachmentList);
            });
        }
    }

    function renderAttachmentList(inputEl, listEl) {
        if (!inputEl || !listEl) return;
        var files = inputEl.files;
        if (!files || files.length === 0) {
            listEl.innerHTML = '';
            return;
        }
        var html = '';
        for (var i = 0; i < files.length; i++) {
            html += '<div style="padding:2px 0;">📎 ' + escapeHtml(files[i].name) + ' (' + formatFileSize(files[i].size) + ')</div>';
        }
        listEl.innerHTML = html;
    }

    function getFenceGateCalculator() {
        return window.KSFenceGateCalculator || null;
    }

    var _FENCE_STYLE_OPTIONS_HTML = '<optgroup label="74x150 网片 - 38×t1.5 混凝土基础 (38CC)"><option value="38CC-100">38CC-100</option><option value="38CC-120">38CC-120</option><option value="38CC-150">38CC-150</option><option value="38CC-180">38CC-180</option><option value="38CC-200">38CC-200</option></optgroup><optgroup label="74x150 网片 - 38×t1.5 地桩基础 (38CG)"><option value="38CG-100">38CG-100</option><option value="38CG-120">38CG-120</option><option value="38CG-150">38CG-150</option><option value="38CG-180">38CG-180</option><option value="38CG-200">38CG-200</option></optgroup><optgroup label="74x150 网片 - 48×t2 混凝土基础 (48CC)"><option value="48CC-100">48CC-100</option><option value="48CC-120">48CC-120</option><option value="48CC-150">48CC-150</option><option value="48CC-180">48CC-180</option><option value="48CC-200">48CC-200</option></optgroup><optgroup label="74x150 网片 - 48×t2 一体打入式 (CP)"><option value="CP-100">CP-100</option><option value="CP-120">CP-120</option><option value="CP-150">CP-150</option><option value="CP-180">CP-180</option><option value="CP-200">CP-200</option></optgroup><optgroup label="74x150 网片 - 48×t2 地桩基础 (48CG)"><option value="48CG-100">48CG-100</option><option value="48CG-120">48CG-120</option><option value="48CG-150">48CG-150</option><option value="48CG-180">48CG-180</option><option value="48CG-200">48CG-200</option></optgroup><optgroup label="100x150 网片 - 38×t1.5 混凝土基础 (38C2C)"><option value="38C2C-100">38C2C-100</option><option value="38C2C-120">38C2C-120</option><option value="38C2C-150">38C2C-150</option><option value="38C2C-180">38C2C-180</option><option value="38C2C-200">38C2C-200</option></optgroup><optgroup label="100x150 网片 - 38×t1.5 地桩基础 (38C2G)"><option value="38C2G-100">38C2G-100</option><option value="38C2G-120">38C2G-120</option><option value="38C2G-150">38C2G-150</option><option value="38C2G-180">38C2G-180</option><option value="38C2G-200">38C2G-200</option></optgroup><optgroup label="100x150 网片 - 48×t2 混凝土基础 (48C2C)"><option value="48C2C-100">48C2C-100</option><option value="48C2C-120">48C2C-120</option><option value="48C2C-150">48C2C-150</option><option value="48C2C-180">48C2C-180</option><option value="48C2C-200">48C2C-200</option></optgroup><optgroup label="100x150 网片 - 48×t2 一体打入式 (C2P)"><option value="C2P-100">C2P-100</option><option value="C2P-120">C2P-120</option><option value="C2P-150">C2P-150</option><option value="C2P-180">C2P-180</option><option value="C2P-200">C2P-200</option></optgroup><optgroup label="100x150 网片 - 48×t2 地桩基础 (48C2G)"><option value="48C2G-100">48C2G-100</option><option value="48C2G-120">48C2G-120</option><option value="48C2G-150">48C2G-150</option><option value="48C2G-180">48C2G-180</option><option value="48C2G-200">48C2G-200</option></optgroup>';

    var _GATE_STYLE_OPTIONS_HTML = '<optgroup label="单开门 1.2m - 混凝土基础 (tsc)"><option value="tsc120-100">tsc120-100</option><option value="tsc120-120">tsc120-120</option><option value="tsc120-150">tsc120-150</option><option value="tsc120-180">tsc120-180</option><option value="tsc120-200">tsc120-200</option></optgroup><optgroup label="单开门 1.2m - 一体式基础 (tsp)"><option value="tsp120-100">tsp120-100</option><option value="tsp120-120">tsp120-120</option><option value="tsp120-150">tsp120-150</option><option value="tsp120-180">tsp120-180</option><option value="tsp120-200">tsp120-200</option></optgroup><optgroup label="单开门 1.2m - 地桩基础 (tsg)"><option value="tsg120-100">tsg120-100</option><option value="tsg120-120">tsg120-120</option><option value="tsg120-150">tsg120-150</option><option value="tsg120-180">tsg120-180</option><option value="tsg120-200">tsg120-200</option></optgroup><optgroup label="双开门 2.4m - 混凝土基础 (tdc)"><option value="tdc240-100">tdc240-100</option><option value="tdc240-120">tdc240-120</option><option value="tdc240-150">tdc240-150</option><option value="tdc240-180">tdc240-180</option><option value="tdc240-200">tdc240-200</option></optgroup><optgroup label="双开门 2.4m - 一体式基础 (tdp)"><option value="tdp240-100">tdp240-100</option><option value="tdp240-120">tdp240-120</option><option value="tdp240-150">tdp240-150</option><option value="tdp240-180">tdp240-180</option><option value="tdp240-200">tdp240-200</option></optgroup><optgroup label="双开门 2.4m - 地桩基础 (tdg)"><option value="tdg240-100">tdg240-100</option><option value="tdg240-120">tdg240-120</option><option value="tdg240-150">tdg240-150</option><option value="tdg240-180">tdg240-180</option><option value="tdg240-200">tdg240-200</option></optgroup><optgroup label="双开门 4.2m - 混凝土基础 (tdc)"><option value="tdc420-100">tdc420-100</option><option value="tdc420-120">tdc420-120</option><option value="tdc420-150">tdc420-150</option><option value="tdc420-180">tdc420-180</option><option value="tdc420-200">tdc420-200</option></optgroup><optgroup label="双开门 4.2m - 一体式基础 (tdp)"><option value="tdp420-100">tdp420-100</option><option value="tdp420-120">tdp420-120</option><option value="tdp420-150">tdp420-150</option><option value="tdp420-180">tdp420-180</option><option value="tdp420-200">tdp420-200</option></optgroup><optgroup label="双开门 4.2m - 地桩基础 (tdg)"><option value="tdg420-100">tdg420-100</option><option value="tdg420-120">tdg420-120</option><option value="tdg420-150">tdg420-150</option><option value="tdg420-180">tdg420-180</option><option value="tdg420-200">tdg420-200</option></optgroup>';

    function _getCommonSurface() {
        return elements.quickFenceSurface ? (elements.quickFenceCoating && elements.quickFenceCoating.value === '热镀锌' ? 'シルバー' : elements.quickFenceSurface.value) : '白色浸塑';
    }

    function setNvFenceGateInputsDisabled(disabled) {
        ['quick-fence-surface', 'quick-fence-coating'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = disabled;
        });
        if (elements.addFenceRowBtn) elements.addFenceRowBtn.disabled = disabled;
        if (elements.addGateRowBtn) elements.addGateRowBtn.disabled = disabled;
        if (elements.fenceRowsContainer) {
            var fenceInputs = elements.fenceRowsContainer.querySelectorAll('.input');
            fenceInputs.forEach(function(el) { el.disabled = disabled; });
            var fenceRemoveBtns = elements.fenceRowsContainer.querySelectorAll('.nv-row-remove-btn');
            fenceRemoveBtns.forEach(function(el) { el.disabled = disabled; el.style.opacity = disabled ? '0.3' : '1'; });
        }
        if (elements.gateRowsContainer) {
            var gateInputs = elements.gateRowsContainer.querySelectorAll('.input');
            gateInputs.forEach(function(el) { el.disabled = disabled; });
            var gateRemoveBtns = elements.gateRowsContainer.querySelectorAll('.nv-row-remove-btn');
            gateRemoveBtns.forEach(function(el) { el.disabled = disabled; el.style.opacity = disabled ? '0.3' : '1'; });
        }
    }

    function resetNvFenceGateConfirm() {
        if (!confirmedNvFenceGateData) return;
        confirmedNvFenceGateData = null;
        var btn = document.getElementById('nv-fence-gate-confirm-btn');
        if (btn) {
            btn.textContent = '确认';
            btn.classList.remove('btn-cancel');
            btn.classList.add('primary');
        }
        var statusEl = document.getElementById('nv-fence-gate-confirm-status');
        if (statusEl) statusEl.textContent = '';
        setNvFenceGateInputsDisabled(false);
    }

    function addFenceRow(style, length, corner, wire) {
        var container = elements.fenceRowsContainer;
        if (!container) return;
        if (container.children.length >= 10) return;
        var idx = container.children.length;
        var div = document.createElement('div');
        div.className = 'nv-multi-row';
        div.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;';
        div.innerHTML = '<div class="form-field" style="flex:2;min-width:160px;"><label>款式</label><select class="input nv-fence-style">' + _FENCE_STYLE_OPTIONS_HTML + '</select></div>'
            + '<div class="form-field" style="flex:1;min-width:80px;"><label>长度(m)</label><input class="input nv-fence-length" type="number" min="0" step="0.5" value="' + (length || 2) + '" /></div>'
            + '<div class="form-field" style="flex:0.7;min-width:60px;"><label>拐角</label><input class="input nv-fence-corner" type="number" min="0" step="1" value="' + (corner || 0) + '" /></div>'
            + '<div class="form-field" style="flex:0.8;min-width:70px;"><label>丝径</label><select class="input nv-fence-wire"><option value="3.0">3.0mm</option><option value="3.2">3.2mm</option><option value="3.5">3.5mm</option><option value="4.0">4.0mm</option><option value="4.5">4.5mm</option></select></div>'
            + '<button type="button" class="nv-row-remove-btn" style="background:none;border:1px solid #e2e8f0;border-radius:4px;color:#ef4444;font-size:14px;cursor:pointer;padding:4px 8px;height:34px;flex-shrink:0;" title="删除此行">×</button>';
        container.appendChild(div);
        var styleEl = div.querySelector('.nv-fence-style');
        if (style) styleEl.value = style;
        var wireEl = div.querySelector('.nv-fence-wire');
        if (wire) wireEl.value = wire;
        var inputs = div.querySelectorAll('.input');
        inputs.forEach(function(el) {
            el.addEventListener('change', function() { resetNvFenceGateConfirm(); renderNvSummary(); });
            el.addEventListener('input', function() { resetNvFenceGateConfirm(); renderNvSummary(); });
        });
        div.querySelector('.nv-row-remove-btn').addEventListener('click', function() {
            if (container.children.length <= 1) return;
            div.remove();
            resetNvFenceGateConfirm();
            renderNvSummary();
        });
        renderNvSummary();
    }

    function addGateRow(style, qty, color) {
        var container = elements.gateRowsContainer;
        if (!container) return;
        if (container.children.length >= 10) return;
        var div = document.createElement('div');
        div.className = 'nv-multi-row';
        div.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;';
        div.innerHTML = '<div class="form-field" style="flex:2;min-width:160px;"><label>型号</label><select class="input nv-gate-style">' + _GATE_STYLE_OPTIONS_HTML + '</select></div>'
            + '<div class="form-field" style="flex:0.7;min-width:60px;"><label>数量</label><input class="input nv-gate-qty" type="number" min="1" step="1" value="' + (qty || 1) + '" /></div>'
            + '<div class="form-field" style="flex:0.8;min-width:70px;"><label>颜色</label><select class="input nv-gate-color"><option value="白色"' + (color === '白色' || !color ? ' selected' : '') + '>白色</option><option value="茶色"' + (color === '茶色' ? ' selected' : '') + '>茶色</option></select></div>'
            + '<button type="button" class="nv-row-remove-btn" style="background:none;border:1px solid #e2e8f0;border-radius:4px;color:#ef4444;font-size:14px;cursor:pointer;padding:4px 8px;height:34px;flex-shrink:0;" title="删除此行">×</button>';
        container.appendChild(div);
        var styleEl = div.querySelector('.nv-gate-style');
        if (style) styleEl.value = style;
        var inputs = div.querySelectorAll('.input');
        inputs.forEach(function(el) {
            el.addEventListener('change', function() { resetNvFenceGateConfirm(); renderNvSummary(); });
            el.addEventListener('input', function() { resetNvFenceGateConfirm(); renderNvSummary(); });
        });
        div.querySelector('.nv-row-remove-btn').addEventListener('click', function() {
            if (container.children.length <= 1) return;
            div.remove();
            resetNvFenceGateConfirm();
            renderNvSummary();
        });
        renderNvSummary();
    }

    function addEstSegment(height, length, corner, sgEnabled, sgQty, dg2kEnabled, dg2kQty, dg4kEnabled, dg4kQty, showGates) {
        var container = elements.estSegmentsContainer;
        if (!container) return;
        if (container.children.length >= 10) return;
        var idx = container.children.length;
        var segId = 'est-seg-' + Date.now() + '-' + idx;
        var div = document.createElement('div');
        div.className = 'est-seg-block';
        div.id = segId;
        var gateHtml = '';
        if (showGates !== false) {
            var sgChecked = sgEnabled !== false ? ' checked' : '';
            var dg2kChecked = dg2kEnabled !== false ? ' checked' : '';
            var dg4kChecked = dg4kEnabled !== false ? ' checked' : '';
            gateHtml = '<div class="est-seg-row"><div class="est-seg-col"><label>片開き門</label><div class="est-gate-row"><input type="checkbox" class="est-seg-sg-enabled"' + sgChecked + '><input class="est-sctl est-seg-sg-qty" type="number" min="0" step="1" value="' + (sgQty || 1) + '" /></div></div>'
                + '<div class="est-seg-col"><label>両開きW2000</label><div class="est-gate-row"><input type="checkbox" class="est-seg-dg2k-enabled"' + dg2kChecked + '><input class="est-sctl est-seg-dg2k-qty" type="number" min="0" step="1" value="' + (dg2kQty || 1) + '" /></div></div></div>'
                + '<div class="est-seg-row"><div class="est-seg-col"><label>両開きW4000</label><div class="est-gate-row"><input type="checkbox" class="est-seg-dg4k-enabled"' + dg4kChecked + '><input class="est-sctl est-seg-dg4k-qty" type="number" min="0" step="1" value="' + (dg4kQty || 1) + '" /></div></div>'
                + '<div class="est-seg-col"></div></div>';
        }
        div.innerHTML = '<button type="button" class="est-seg-remove" title="删除此段">×</button>'
            + '<div class="est-seg-row"><div class="est-seg-col"><label>高度</label><select class="est-sctl est-seg-height"><option value="1200"' + (height == 1200 ? ' selected' : '') + '>H1200</option><option value="1500"' + (height == 1500 || !height ? ' selected' : '') + '>H1500</option><option value="1800"' + (height == 1800 ? ' selected' : '') + '>H1800</option></select></div>'
            + '<div class="est-seg-col"><label>总长 (m)</label><input class="est-sctl est-seg-length" type="number" min="1" step="10" value="' + (length || 100) + '" /></div></div>'
            + '<div class="est-seg-row"><div class="est-seg-col"><label>转角数</label><input class="est-sctl est-seg-corner" type="number" min="0" step="1" value="' + (corner || 3) + '" /></div>'
            + '<div class="est-seg-col"></div></div>'
            + gateHtml;
        container.appendChild(div);
        var inputs = div.querySelectorAll('.est-sctl');
        inputs.forEach(function(el) {
            el.addEventListener('input', function() { renderEstFenceSummary(); });
            el.addEventListener('change', function() { renderEstFenceSummary(); });
        });
        var checkboxes = div.querySelectorAll('input[type=checkbox]');
        checkboxes.forEach(function(cb) {
            cb.addEventListener('change', function() {
                var qtyInput = cb.parentElement.querySelector('.est-sctl');
                if (qtyInput) qtyInput.disabled = !cb.checked;
                renderEstFenceSummary();
            });
        });
        div.querySelector('.est-seg-remove').addEventListener('click', function() {
            if (container.children.length <= 1) return;
            div.remove();
            renderEstFenceSummary();
        });
        renderEstFenceSummary();
    }

    function getAllFenceInputs() {
        var container = elements.fenceRowsContainer;
        if (!container) return [];
        var rows = [];
        var rowEls = container.querySelectorAll('.nv-multi-row');
        rowEls.forEach(function(row) {
            var styleEl = row.querySelector('.nv-fence-style');
            var lengthEl = row.querySelector('.nv-fence-length');
            var cornerEl = row.querySelector('.nv-fence-corner');
            var wireEl = row.querySelector('.nv-fence-wire');
            rows.push({
                style: styleEl ? styleEl.value : '38CC-100',
                totalLength: lengthEl ? lengthEl.value : 2,
                cornerQty: cornerEl ? cornerEl.value : 0,
                wireDiameter: wireEl ? wireEl.value : '3.0',
                surface: _getCommonSurface(),
                coating: elements.quickFenceCoating ? elements.quickFenceCoating.value : '浸塑'
            });
        });
        return rows;
    }

    function getAllGateInputs() {
        var container = elements.gateRowsContainer;
        if (!container) return [];
        var rows = [];
        var rowEls = container.querySelectorAll('.nv-multi-row');
        rowEls.forEach(function(row) {
            var styleEl = row.querySelector('.nv-gate-style');
            var qtyEl = row.querySelector('.nv-gate-qty');
            var colorEl = row.querySelector('.nv-gate-color');
            rows.push({
                gateStyle: styleEl ? styleEl.value : 'tsc120-100',
                gateQty: qtyEl ? qtyEl.value : 1,
                gateColor: colorEl ? colorEl.value : '白色'
            });
        });
        return rows;
    }

    function getAllEstSegments() {
        var container = elements.estSegmentsContainer;
        if (!container) return [];
        var segs = [];
        var segEls = container.querySelectorAll('.est-seg-block');
        var firstSegGates = null;
        segEls.forEach(function(seg, idx) {
            var heightEl = seg.querySelector('.est-seg-height');
            var lengthEl = seg.querySelector('.est-seg-length');
            var cornerEl = seg.querySelector('.est-seg-corner');
            var sgEnabledEl = seg.querySelector('.est-seg-sg-enabled');
            var sgQtyEl = seg.querySelector('.est-seg-sg-qty');
            var dg2kEnabledEl = seg.querySelector('.est-seg-dg2k-enabled');
            var dg2kQtyEl = seg.querySelector('.est-seg-dg2k-qty');
            var dg4kEnabledEl = seg.querySelector('.est-seg-dg4k-enabled');
            var dg4kQtyEl = seg.querySelector('.est-seg-dg4k-qty');
            var segData = {
                height: heightEl ? heightEl.value : '1500',
                length: lengthEl ? lengthEl.value : 100,
                corner: cornerEl ? cornerEl.value : 3,
                singleGateEnabled: false,
                singleGateQty: 0,
                doubleGate2000Enabled: false,
                doubleGate2000Qty: 0,
                doubleGate4000Enabled: false,
                doubleGate4000Qty: 0
            };
            if (sgEnabledEl) {
                segData.singleGateEnabled = sgEnabledEl.checked;
                segData.singleGateQty = sgQtyEl ? sgQtyEl.value : 0;
                segData.doubleGate2000Enabled = dg2kEnabledEl ? dg2kEnabledEl.checked : false;
                segData.doubleGate2000Qty = dg2kQtyEl ? dg2kQtyEl.value : 0;
                segData.doubleGate4000Enabled = dg4kEnabledEl ? dg4kEnabledEl.checked : false;
                segData.doubleGate4000Qty = dg4kQtyEl ? dg4kQtyEl.value : 0;
                if (idx === 0) firstSegGates = segData;
            }
            segs.push(segData);
        });
        return segs;
    }

    function getQuickFenceInput() {
        var rows = getAllFenceInputs();
        if (rows.length > 0) return rows[0];
        return { style: '38CC-100', totalLength: 2, cornerQty: 0, wireDiameter: '3.0', surface: _getCommonSurface(), coating: '浸塑' };
    }

    function getQuickGateInput() {
        var gateInputs = getAllGateInputs();
        if (gateInputs.length > 0) return gateInputs[0];
        return { gateStyle: 'tsc120-100', gateQty: 1, gateColor: '白色' };
    }

    function renderQuickQuoteCards(container, cards) {
        if (!container) return;
        if (!cards || !cards.length) {
            container.innerHTML = '<div class="muted" style="margin-top:12px;">暂无结果</div>';
            return;
        }
        container.innerHTML = cards.map(function (card) {
            return '<div class="quotation-quick-card">'
                + '<div class="quotation-quick-card-label">' + escapeHtml(card.label || '') + '</div>'
                + '<div class="quotation-quick-card-value">' + escapeHtml(card.value || '') + '</div>'
                + '<div class="quotation-quick-card-meta">' + escapeHtml(card.meta || '') + '</div>'
                + '</div>';
        }).join('');
    }

    function renderNvSummary() {
        var calc = getFenceGateCalculator();
        if (!calc) return;
        var fgBody = document.getElementById('fence-gate-body');
        if (fgBody && fgBody.style.display === 'none') return;
        var renderCore = function () {
            var allCards = [];
            var fenceInputs = getAllFenceInputs();
            fenceInputs.forEach(function(input) {
                var result = calc.buildFenceQuoteByStyle(input.style, input.totalLength, input.cornerQty, input.wireDiameter, input.surface);
                if (result.summaryCards) allCards = allCards.concat(result.summaryCards);
            });
            var gateInputs = getAllGateInputs();
            gateInputs.forEach(function(input) {
                var result = calc.buildGateQuoteByStyle(input.gateStyle, input.gateQty);
                if (result.summaryCards) allCards = allCards.concat(result.summaryCards);
            });
            renderQuickQuoteCards(elements.quickFenceGateSummary, allCards);
        };
        if (typeof calc.ready === 'function' && !_fenceGatePricesLoaded) {
            _fenceGatePricesLoaded = true;
            Promise.resolve(calc.ready()).then(function () { renderCore(); }).catch(function () {});
        }
        renderCore();
    }

    function renderQuickFenceSummary() { renderNvSummary(); }
    function renderQuickGateSummary() { renderNvSummary(); }

    var _latestEstResult = null;

    function renderEstFenceSummary() {
        var calc = window.KSEstFenceCalculator;
        if (!calc) return;
        var summaryEl = document.getElementById('est-fence-summary');
        var bodyEl = document.getElementById('est-fence-body');
        if (bodyEl && bodyEl.style.display === 'none') return;

        var segments = getAllEstSegments();
        var totalAmount = 0;
        var totalWeight = 0;
        var allRows = [];
        var segIndex = 0;

        segments.forEach(function(seg) {
            var params = {
                height: seg.height,
                totalLength: seg.length,
                cornerCount: seg.corner,
                singleGateQty: seg.singleGateEnabled ? (parseInt(seg.singleGateQty) || 0) : 0,
                doubleGate2000Qty: seg.doubleGate2000Enabled ? (parseInt(seg.doubleGate2000Qty) || 0) : 0,
                doubleGate4000Qty: seg.doubleGate4000Enabled ? (parseInt(seg.doubleGate4000Qty) || 0) : 0,
                singleGateEnabled: seg.singleGateEnabled,
                doubleGate2000Enabled: seg.doubleGate2000Enabled,
                doubleGate4000Enabled: seg.doubleGate4000Enabled
            };
            var result = calc.buildEstFenceQuote(params);
            if (result.rows) {
                result.rows.forEach(function(row) {
                    row._segIndex = segIndex;
                    allRows.push(row);
                });
                totalAmount += result.totalAmount;
                totalWeight += result.totalWeight;
            }
            segIndex++;
        });

        _latestEstResult = { rows: allRows, totalAmount: totalAmount, totalWeight: totalWeight };

        if (summaryEl) {
            var additionalMisc = parseFloat((document.getElementById('est-fence-additional-misc') || {}).value || 0) || 0;
            var grandTotal = totalAmount + additionalMisc;
            summaryEl.innerHTML = '<div style="margin:12px 0 0;padding:12px 14px;background:linear-gradient(180deg,#ffffff,#f0fdfa);border-radius:14px;border:1px solid #b2dfdb;box-shadow:0 8px 18px rgba(15,118,110,0.05);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;overflow:hidden;">'
                + '<span style="font-size:12px;font-weight:700;color:#64748b;letter-spacing:0.04em;">围栏合计金额 (' + segments.length + '段)</span>'
                + '<span style="font-size:24px;font-weight:700;color:#0f172a;">$' + grandTotal.toFixed(2) + '</span>'
                + '</div>';
        }
        confirmedEstFenceData = null;
        var statusEl = document.getElementById('est-fence-confirm-status');
        if (statusEl) statusEl.textContent = '';
    }

    function switchFenceMode(mode) {
        var grid = containerEl ? containerEl.querySelector('.quotation-upload-grid') : null;
        var fgCards = containerEl ? containerEl.querySelectorAll('.ja-standard-fence-gate-card') : [];
        var externalFenceCards = containerEl ? containerEl.querySelectorAll('.ja-external-fence-card') : [];

        if (mode === 'external') {
            if (grid) grid.classList.add('ja-external-mode');
            fgCards.forEach(function (c) { c.style.display = 'none'; });
            externalFenceCards.forEach(function (c) { c.style.display = ''; c.classList.add('is-expanded'); });
            renderEstFenceSummary();
        } else if (mode === 'none') {
            if (grid) grid.classList.remove('ja-external-mode');
            fgCards.forEach(function (c) { c.style.display = 'none'; });
            externalFenceCards.forEach(function (c) { c.style.display = 'none'; });
        } else {
            if (grid) grid.classList.remove('ja-external-mode');
            fgCards.forEach(function (c) { c.style.display = ''; });
            externalFenceCards.forEach(function (c) { c.style.display = 'none'; });
        }
    }

    function initializeQuickQuoteCards() {
        var calc = getFenceGateCalculator();
        if (!calc) return;

        if (elements.fenceRowsContainer && elements.fenceRowsContainer.children.length === 0) {
            addFenceRow('38CC-100', 2, 0, '3.0');
        }
        if (elements.gateRowsContainer && elements.gateRowsContainer.children.length === 0) {
            addGateRow('tsc120-100', 1, '白色');
        }
        if (elements.estSegmentsContainer && elements.estSegmentsContainer.children.length === 0) {
            addEstSegment(1500, 100, 3, true, 1, true, 1, true, 1);
        }

        renderNvSummary();
        renderEstFenceSummary();
    }

    function reorganizeQuotationCards() {
        if (!containerEl) return;
        var grid = containerEl.querySelector('.quotation-upload-grid');
        if (!grid) return;

        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        var isKorean = currentGroup === '韩语组';
        var isEnglish = currentGroup === '英语组';
        var isAp = currentGroup === '亚太组';

        var existingCards = Array.from(grid.children).filter(function (child) {
            return child && child.classList && child.classList.contains('card');
        });

        var priceCard = getCardForElement(elements.priceFileButton);
        var bomCard = getCardForElement(elements.bomFileButton);
        var infoCard = getCardForElement(elements.matrixFileButton);
        var imageCard = getCardForElement(elements.imageFolderButton || elements.imageFolderInput);
        var contactAnchor = document.getElementById('contact-list') || document.getElementById('en-contact-list') || elements.contactClearButton;
        var contactCard = getCardForElement(contactAnchor);

        if (!infoCard || !contactCard || !bomCard) {
            return;
        }

        if (priceCard) {
            priceCard.classList.remove('quotation-card-wide');
        }
        if (bomCard) {
            bomCard.classList.add('quotation-card-bom');
        }

        infoCard.classList.remove('card');
        contactCard.classList.remove('card');
        infoCard.classList.add('quotation-subcard', 'quotation-subcard-info');
        contactCard.classList.add('quotation-subcard', 'quotation-subcard-contact');

        var combinedCard = document.createElement('div');
        combinedCard.className = 'card quotation-combined-card';
        combinedCard.appendChild(infoCard);
        combinedCard.appendChild(contactCard);

        var ordered;
        var usedCards;

        if (isAp && !isApGroundCase()) {
            grid.classList.add('ko-no-fence');
            combinedCard.style.minHeight = 'auto';
            // 亚太屋顶：仅 BOM 上传流程，隐藏信息表卡片（保留节点便于切换地面时恢复）
            infoCard.style.display = 'none';
            // 贸易方式 / 表面处理 移入 BOM 卡片下方
            var apPanel = containerEl.querySelector('#ap-params-panel');
            if (apPanel && bomCard) {
                apPanel.style.gridColumn = '';
                apPanel.style.marginTop = '14px';
                apPanel.style.background = '#f7faf9';
                bomCard.appendChild(apPanel);
            }
            ordered = [combinedCard, bomCard];
            if (priceCard) ordered.push(priceCard);
            if (imageCard) ordered.push(imageCard);
            usedCards = new Set([priceCard, bomCard, infoCard, contactCard, imageCard, apPanel]);
            existingCards.forEach(function (card) {
                if (!usedCards.has(card)) {
                    ordered.push(card);
                }
            });
        } else if (isKorean || isEnglish || isApGroundCase()) {
            // 地面案件需要信息表：确保信息表卡片显示
            infoCard.style.display = '';
            grid.classList.add('ko-no-fence');
            var fenceCardKo = containerEl.querySelector('.ja-standard-fence-gate-card');
            var estFenceCardKo = containerEl.querySelector('.ja-external-fence-card');
            ordered = [combinedCard, bomCard];
            if (priceCard) ordered.push(priceCard);
            if (imageCard) ordered.push(imageCard);
            usedCards = new Set([priceCard, bomCard, infoCard, contactCard, imageCard, fenceCardKo, estFenceCardKo]);
            existingCards.forEach(function (card) {
                if (!usedCards.has(card)) {
                    ordered.push(card);
                }
            });
        } else {
            var fenceCard = containerEl.querySelector('.ja-standard-fence-gate-card');
            var estFenceCard = containerEl.querySelector('.ja-external-fence-card');
            if (!fenceCard) return;

            var fgPanel = document.createElement('div');
            fgPanel.className = 'quotation-fg-panel';
            fgPanel.appendChild(fenceCard);
            if (estFenceCard) fgPanel.appendChild(estFenceCard);

            var fgToggleBtn = document.createElement('button');
            fgToggleBtn.className = 'quotation-fg-toggle-btn is-expanded';
            fgToggleBtn.id = 'fg-horizontal-toggle';
            fgToggleBtn.title = '收起围栏/门面板';
            fgToggleBtn.textContent = '›';
            combinedCard.appendChild(fgToggleBtn);

            ordered = [combinedCard, fgPanel, bomCard];
            if (priceCard) ordered.push(priceCard);
            if (imageCard) ordered.push(imageCard);
            usedCards = new Set([priceCard, bomCard, infoCard, contactCard, fenceCard, imageCard, estFenceCard]);
            existingCards.forEach(function (card) {
                if (!usedCards.has(card)) {
                    ordered.push(card);
                }
            });
        }

        grid.innerHTML = '';
        ordered.forEach(function (node) {
            if (node) grid.appendChild(node);
        });
    }

    function bindEvents() {
        var savePrefsBtn = document.getElementById('save-prefs-btn');
        if (savePrefsBtn) {
            savePrefsBtn.addEventListener('click', function () {
                saveMyPreferences();
            });
        }

        const bomInput = document.createElement('input');
        bomInput.type = 'file';
        bomInput.accept = '.xlsx,.xls';
        bomInput.style.display = 'none';
        document.body.appendChild(bomInput);
        elements.bomFileInput = bomInput;
        _fileInputs.push(bomInput);

        const priceInput = document.createElement('input');
        priceInput.type = 'file';
        priceInput.accept = '.xlsx,.xls';
        priceInput.style.display = 'none';
        document.body.appendChild(priceInput);
        elements.priceFileInput = priceInput;
        _fileInputs.push(priceInput);

        const matrixInput = document.createElement('input');
        matrixInput.type = 'file';
        matrixInput.accept = '.xlsx,.xls';
        matrixInput.style.display = 'none';
        document.body.appendChild(matrixInput);
        elements.matrixFileInput = matrixInput;
        _fileInputs.push(matrixInput);

        const imageFolderPicker = document.createElement('input');
        imageFolderPicker.type = 'file';
        imageFolderPicker.webkitdirectory = true;
        imageFolderPicker.directory = true;
        imageFolderPicker.style.display = 'none';
        document.body.appendChild(imageFolderPicker);
        elements.imageFolderPicker = imageFolderPicker;
        _fileInputs.push(imageFolderPicker);

        var koCompanyDiscountEl = document.getElementById('ko-company-discount');
        var koCommissionEl = document.getElementById('ko-commission');
        var koDiscountRateResultEl = document.getElementById('ko-discount-rate');
        function updateKoDiscountRate() {
            var company = parseFloat(koCompanyDiscountEl ? koCompanyDiscountEl.value : 0) || 0;
            var commission = parseFloat(koCommissionEl ? koCommissionEl.value : 0) || 0;
            if (koDiscountRateResultEl) {
                koDiscountRateResultEl.value = company + commission;
            }
        }
        if (koCompanyDiscountEl) koCompanyDiscountEl.addEventListener('input', updateKoDiscountRate);
        if (koCommissionEl) koCommissionEl.addEventListener('input', updateKoDiscountRate);
        updateKoDiscountRate();

        var apCompanyDiscountEl = document.getElementById('ap-company-discount');
        var apCommissionEl = document.getElementById('ap-commission');
        var apDiscountRateResultEl = document.getElementById('ap-discount-rate');
        function updateApDiscountRate() {
            var company = parseFloat(apCompanyDiscountEl ? apCompanyDiscountEl.value : 0) || 0;
            var commission = parseFloat(apCommissionEl ? apCommissionEl.value : 0) || 0;
            if (apDiscountRateResultEl) {
                apDiscountRateResultEl.value = company + commission;
            }
        }
        if (apCompanyDiscountEl) apCompanyDiscountEl.addEventListener('input', updateApDiscountRate);
        if (apCommissionEl) apCommissionEl.addEventListener('input', updateApDiscountRate);
        updateApDiscountRate();

        var nvCompanyDiscountEl = document.getElementById('nv-company-discount');
        var nvCommissionEl = document.getElementById('nv-commission');
        var nvDiscountRateResultEl = document.getElementById('nv-discount-rate');
        function updateNvDiscountRate() {
            var company = parseFloat(nvCompanyDiscountEl ? nvCompanyDiscountEl.value : 0) || 0;
            var commission = parseFloat(nvCommissionEl ? nvCommissionEl.value : 0) || 0;
            if (nvDiscountRateResultEl) {
                nvDiscountRateResultEl.value = company + commission;
            }
        }
        if (nvCompanyDiscountEl) nvCompanyDiscountEl.addEventListener('input', updateNvDiscountRate);
        if (nvCommissionEl) nvCommissionEl.addEventListener('input', updateNvDiscountRate);
        updateNvDiscountRate();

        var enCompanyDiscountEl = document.getElementById('en-company-discount');
        var enCommissionEl = document.getElementById('en-commission');
        var enDiscountRateResultEl = document.getElementById('en-discount-rate');
        function updateEnDiscountRate() {
            var company = parseFloat(enCompanyDiscountEl ? enCompanyDiscountEl.value : 0) || 0;
            var commission = parseFloat(enCommissionEl ? enCommissionEl.value : 0) || 0;
            if (enDiscountRateResultEl) {
                enDiscountRateResultEl.value = company + commission;
            }
        }
        if (enCompanyDiscountEl) enCompanyDiscountEl.addEventListener('input', updateEnDiscountRate);
        if (enCommissionEl) enCommissionEl.addEventListener('input', updateEnDiscountRate);
        updateEnDiscountRate();

        elements.bomFileButton.addEventListener('click', function () {
            elements.bomFileInput.click();
        });

        elements.bomFileInput.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (file) {
                uploadBOMFile(file);
            }
        });

        elements.priceFileButton.addEventListener('click', function () {
            elements.priceFileInput.click();
        });

        elements.priceFileInput.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (file) {
                uploadPriceFile(file);
            }
        });

        if (elements.matrixFileButton) {
            elements.matrixFileButton.addEventListener('click', function () {
                elements.matrixFileInput.click();
            });
        }

        if (elements.matrixFileInput) {
            elements.matrixFileInput.addEventListener('change', function (e) {
                var file = e.target.files[0];
                if (file) {
                    uploadMatrixFile(file);
                }
            });
        }

        if (elements.imageFolderButton) {
            elements.imageFolderButton.addEventListener('click', function () {
                if (elements.imageFolderPicker) {
                    elements.imageFolderPicker.click();
                }
            });
        }

        if (elements.imageFolderPicker) {
            elements.imageFolderPicker.addEventListener('change', function (e) {
                var files = e.target.files;
                if (!files || files.length === 0) {
                    return;
                }
                var firstFile = files[0];
                var folderPath = '';
                if (firstFile && firstFile.path) {
                    folderPath = firstFile.path;
                }
                if (folderPath && elements.imageFolderInput) {
                    elements.imageFolderInput.value = folderPath;
                    state.imageFolder = folderPath;
                    updateImageFolderStatus('已选择：' + folderPath);
                } else {
                    updateImageFolderStatus('图片文件夹：未获取完整路径，请手动填写完整路径。');
                }
            });
        }

        if (elements.imageFolderInput) {
            elements.imageFolderInput.addEventListener('input', function (e) {
                var value = (e.target.value || '').trim();
                state.imageFolder = value;
                if (value) {
                    updateImageFolderStatus('已设置：' + value);
                } else {
                    updateImageFolderStatus('');
                }
            });
        }

        if (elements.contactList) {
            elements.contactList.addEventListener('click', function (e) {
                var card = e.target.closest('[data-contact-id]');
                if (!card) return;
                var allCards = elements.contactList.querySelectorAll('[data-contact-id]');
                allCards.forEach(function (c) {
                    c.classList.remove('contact-card-selected');
                    c.style.borderColor = '#e2e8f0';
                    c.style.background = '#fff';
                });
                card.classList.add('contact-card-selected');
                card.style.borderColor = '#0f766e';
                card.style.background = '#e6fffb';
                applySelectedContact();
            });
        }

        if (elements.contactClearButton) {
            elements.contactClearButton.addEventListener('click', function () {
                var cards = document.querySelectorAll('[data-contact-id]');
                cards.forEach(function (c) {
                    c.classList.remove('contact-card-selected');
                    c.style.borderColor = '#e2e8f0';
                    c.style.background = '#fff';
                });
                state.contactInfo = { contact_name: '', phone: '', tel: '', fax: '', inquiry_requester: '' };
                updateContactPreview(null);
                showStatus('联系信息已清除', 'info');
            });
        }

        var jaContactClearBtn = document.getElementById('ja-contact-clear-btn');
        if (jaContactClearBtn) {
            jaContactClearBtn.addEventListener('click', function () {
                var cards = document.querySelectorAll('[data-ja-contact-id]');
                cards.forEach(function (c) {
                    c.classList.remove('contact-card-selected');
                    c.style.borderColor = '#e2e8f0';
                    c.style.background = '';
                });
                _selectedJaContact = {};
                localStorage.removeItem('ks_ja_contact_id');
                var preview = document.getElementById('ja-contact-preview');
                if (preview) preview.style.display = 'none';
                showStatus('担当选择已清除', 'info');
            });
        }

        var enContactClearBtn = document.getElementById('en-contact-clear-btn');
        if (enContactClearBtn) {
            enContactClearBtn.addEventListener('click', function () {
                var container = document.getElementById('en-contact-list');
                if (container) {
                    container.querySelectorAll('.contact-card').forEach(function (c) {
                        c.classList.remove('contact-card-selected');
                        c.style.borderColor = '#e2e8f0';
                        c.style.background = '';
                    });
                }
                _selectedEnContact = {};
                localStorage.removeItem('ks_en_contact_id');
                var preview = document.getElementById('en-contact-preview');
                if (preview) preview.style.display = 'none';
                state.contactInfo = { contact_name: '', phone: '', tel: '', fax: '' };
                showStatus('Contact cleared', 'info');
            });
        }

        // Collapsible toggle for fence/gate cards
        var fgToggle = document.getElementById('fence-gate-toggle');
        var fgBody = document.getElementById('fence-gate-body');
        var fgCard = fgToggle ? fgToggle.closest('.quotation-collapsible-card') : null;

        function toggleCollapsible(body, card, storageKey, onExpand) {
            var isExpanded = card.classList.contains('is-expanded');
            var arrow = card.querySelector('.quotation-collapsible-arrow');
            if (isExpanded) {
                body.style.display = 'none';
                card.classList.remove('is-expanded');
                if (arrow) arrow.textContent = '‹';
                try { localStorage.setItem(storageKey, '0'); } catch (e) {}
            } else {
                body.style.display = 'block';
                card.classList.add('is-expanded');
                if (arrow) arrow.textContent = '›';
                try { localStorage.setItem(storageKey, '1'); } catch (e) {}
                if (typeof onExpand === 'function') onExpand();
            }
        }

        function restoreCollapsible(body, card, storageKey) {
            var saved = null;
            try { saved = localStorage.getItem(storageKey); } catch (e) {}
            if (saved === '0') {
                body.style.display = 'none';
                card.classList.remove('is-expanded');
            } else {
                body.style.display = 'block';
                card.classList.add('is-expanded');
                var arrow = card.querySelector('.quotation-collapsible-arrow');
                if (arrow) arrow.textContent = '›';
            }
        }

        if (fgToggle && fgBody && fgCard) {
            restoreCollapsible(fgBody, fgCard, 'ks_fence_gate_expanded');
            fgToggle.addEventListener('click', function () {
                toggleCollapsible(fgBody, fgCard, 'ks_fence_gate_expanded', function () {
                    renderQuickFenceSummary();
                    renderQuickGateSummary();
                });
            });
        }

        var fgHToggle = document.getElementById('fg-horizontal-toggle');
        var fgGrid = containerEl ? containerEl.querySelector('.quotation-upload-grid') : null;
        if (fgHToggle && fgGrid) {
            var savedFgPanel = null;
            try { savedFgPanel = localStorage.getItem('ks_fg_panel_expanded'); } catch (e) {}
            if (savedFgPanel === '0') {
                fgGrid.classList.add('fg-collapsed');
                fgHToggle.classList.remove('is-expanded');
                fgHToggle.classList.add('is-collapsed');
                fgHToggle.textContent = '‹';
                fgHToggle.title = '展开围栏/门面板';
            }
            fgHToggle.addEventListener('click', function () {
                var isCollapsed = fgGrid.classList.contains('fg-collapsed');
                if (isCollapsed) {
                    fgGrid.classList.remove('fg-collapsed');
                    fgHToggle.classList.remove('is-collapsed');
                    fgHToggle.classList.add('is-expanded');
                    fgHToggle.textContent = '›';
                    fgHToggle.title = '收起围栏/门面板';
                    try { localStorage.setItem('ks_fg_panel_expanded', '1'); } catch (e) {}
                } else {
                    fgGrid.classList.add('fg-collapsed');
                    fgHToggle.classList.remove('is-expanded');
                    fgHToggle.classList.add('is-collapsed');
                    fgHToggle.textContent = '‹';
                    fgHToggle.title = '展开围栏/门面板';
                    try { localStorage.setItem('ks_fg_panel_expanded', '0'); } catch (e) {}
                }
            });
        }

        if (elements.addFenceRowBtn) {
            elements.addFenceRowBtn.addEventListener('click', function() { addFenceRow(); });
        }
        if (elements.addGateRowBtn) {
            elements.addGateRowBtn.addEventListener('click', function() { addGateRow(); });
        }
        if (elements.quickFenceCoating) {
            elements.quickFenceCoating.addEventListener('change', function () {
                var surfaceEl = elements.quickFenceSurface;
                if (!surfaceEl) return;
                var isGalvanized = elements.quickFenceCoating.value === '热镀锌';
                var prev = surfaceEl.value;
                surfaceEl.innerHTML = '';
                if (isGalvanized) {
                    var opt = document.createElement('option');
                    opt.value = 'シルバー'; opt.textContent = 'シルバー';
                    surfaceEl.appendChild(opt);
                } else {
                    var opt1 = document.createElement('option');
                    opt1.value = '白色浸塑'; opt1.textContent = '白色浸塑';
                    surfaceEl.appendChild(opt1);
                    var opt2 = document.createElement('option');
                    opt2.value = '咖啡色浸塑'; opt2.textContent = '咖啡色浸塑';
                    surfaceEl.appendChild(opt2);
                    var opt3 = document.createElement('option');
                    opt3.value = 'シルバー'; opt3.textContent = 'シルバー';
                    surfaceEl.appendChild(opt3);
                }
                if (isGalvanized) {
                    surfaceEl.value = 'シルバー';
                } else if (prev === 'シルバー') {
                    surfaceEl.value = 'シルバー';
                } else if (prev === '咖啡色浸塑') {
                    surfaceEl.value = '咖啡色浸塑';
                } else {
                    surfaceEl.value = '白色浸塑';
                }
                resetNvFenceGateConfirm(); renderNvSummary();
            });
        }
        if (elements.quickFenceSurface) {
            elements.quickFenceSurface.addEventListener('change', function () { resetNvFenceGateConfirm(); renderNvSummary(); });
        }

        elements.generateButton.addEventListener('click', function () {
            analyzeAndGenerate();
        });

        var coatingButtons = [
            { id: 'btn-coating-10', value: 10 },
            { id: 'btn-coating-15', value: 15 },
            { id: 'btn-coating-18', value: 18 }
        ];
        coatingButtons.forEach(function (item) {
            var btn = document.getElementById(item.id);
            if (btn) {
                btn.addEventListener('click', function () {
                    state.coatingThickness = item.value;
                    coatingButtons.forEach(function (b) {
                        var el = document.getElementById(b.id);
                        if (el) {
                            el.classList.remove('primary');
                        }
                    });
                    btn.classList.add('primary');
                });
            }
        });

        var koCoatingButtons = [
            { id: 'btn-ko-coating-10', value: 10 },
            { id: 'btn-ko-coating-15', value: 15 },
            { id: 'btn-ko-coating-18', value: 18 }
        ];
        koCoatingButtons.forEach(function (item) {
            var btn = document.getElementById(item.id);
            if (btn) {
                btn.addEventListener('click', function () {
                    state.coatingThickness = item.value;
                    koCoatingButtons.forEach(function (b) {
                        var el = document.getElementById(b.id);
                        if (el) el.classList.remove('primary');
                    });
                    btn.classList.add('primary');
                });
            }
        });

        var enCoatingButtons = [
            { id: 'btn-en-coating-10', value: 10 },
            { id: 'btn-en-coating-15', value: 15 },
            { id: 'btn-en-coating-18', value: 18 }
        ];
        enCoatingButtons.forEach(function (item) {
            var btn = document.getElementById(item.id);
            if (btn) {
                btn.addEventListener('click', function () {
                    state.coatingThickness = item.value;
                    enCoatingButtons.forEach(function (b) {
                        var el = document.getElementById(b.id);
                        if (el) el.classList.remove('primary');
                    });
                    btn.classList.add('primary');
                });
            }
        });

        var apCoatingButtons = [
            { id: 'btn-ap-coating-10', value: 10 },
            { id: 'btn-ap-coating-15', value: 15 },
            { id: 'btn-ap-coating-18', value: 18 }
        ];
        apCoatingButtons.forEach(function (item) {
            var btn = document.getElementById(item.id);
            if (btn) {
                btn.addEventListener('click', function () {
                    state.coatingThickness = item.value;
                    apCoatingButtons.forEach(function (b) {
                        var el = document.getElementById(b.id);
                        if (el) el.classList.remove('primary');
                    });
                    btn.classList.add('primary');
                });
            }
        });

        var koMatBtnGroups = containerEl ? containerEl.querySelectorAll('.ko-mat-btns') : [];
        koMatBtnGroups.forEach(function (group) {
            var btns = group.querySelectorAll('button');
            var matGroup = group.getAttribute('data-mat-group') || '';
            var _initBtn = group.querySelector('button.active-blue, button.active-red, button.active-green, button.active-orange');
            if (_initBtn && matGroup) {
                matSelectionState[matGroup] = _initBtn.getAttribute('data-action');
            }
            btns.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    btns.forEach(function (b) {
                        b.classList.remove('active-blue', 'active-red', 'active-green', 'active-orange');
                    });
                    var action = btn.getAttribute('data-action');
                    if (action === 'exclude') btn.classList.add('active-blue');
                    else if (action === 'delete') btn.classList.add('active-red');
                    else if (action === 'include') btn.classList.add('active-green');
                    else if (action === 'include_below') btn.classList.add('active-orange');
                    if (matGroup) {
                        matSelectionState[matGroup] = action;
                    }
                    if (matGroup.indexOf('cap') >= 0) {
                        console.log('[DEBUG_CAP_CLICK] group=' + matGroup + ' action=' + action);
                        try {
                            var _base = (typeof KS_API_BASE_URL !== 'undefined') ? KS_API_BASE_URL : '/api';
                            fetch(_base + '/debug-cap-click', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ group: matGroup, action: action })
                            }).catch(function () {});
                        } catch (e) {}
                    }
                    if (matGroup.indexOf('ja_nv_handle_') === 0) {
                        var spareRow = containerEl.querySelector('[data-spare-depends="' + matGroup + '"]');
                        if (spareRow) {
                            spareRow.style.display = action === 'delete' ? 'none' : '';
                        }
                    }
                });
            });
        });

        var enMatBtnGroups = containerEl ? containerEl.querySelectorAll('.en-mat-btns') : [];
        enMatBtnGroups.forEach(function (group) {
            var btns = group.querySelectorAll('button');
            btns.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    btns.forEach(function (b) {
                        b.classList.remove('active-blue', 'active-red', 'active-green', 'active-orange');
                    });
                    var action = btn.getAttribute('data-action');
                    if (action === 'exclude') btn.classList.add('active-blue');
                    else if (action === 'delete') btn.classList.add('active-red');
                    else if (action === 'include') btn.classList.add('active-green');
                    else if (action === 'include_below') btn.classList.add('active-orange');
                });
            });
        });

        function updateKoContainerQtyVisibility() {
            var cb20gp = document.getElementById('ko-ct-20gp');
            var cb40hq = document.getElementById('ko-ct-40hq');
            var qty20gp = document.getElementById('ko-qty-20gp');
            var qty40hq = document.getElementById('ko-qty-40hq');
            if (qty20gp) qty20gp.disabled = !(cb20gp && cb20gp.checked);
            if (qty40hq) qty40hq.disabled = !(cb40hq && cb40hq.checked);
        }
        var koCt20gp = document.getElementById('ko-ct-20gp');
        var koCt40hq = document.getElementById('ko-ct-40hq');
        var koCtLcl = document.getElementById('ko-ct-lcl');
        if (koCt20gp) koCt20gp.addEventListener('change', updateKoContainerQtyVisibility);
        if (koCt40hq) koCt40hq.addEventListener('change', updateKoContainerQtyVisibility);
        if (koCtLcl) koCtLcl.addEventListener('change', updateKoContainerQtyVisibility);
        updateKoContainerQtyVisibility();

        function updateKoPortVisibility() {
            var methodEl = document.querySelector('input[name="ko-trade-method"]:checked');
            var portRow = document.getElementById('ko-port-row');
            var containerRow = document.getElementById('ko-container-row');
            var cifFreightRow = document.getElementById('ko-cif-freight-row');
            var ddpAddressRow = document.getElementById('ko-ddp-address-row');
            var tariffRow = document.getElementById('ko-tariff-row');
            var consumptionTaxRow = document.getElementById('ko-consumption-tax-row');
            var freightRow = document.getElementById('ko-freight-row');
            var freightLabel = document.getElementById('ko-freight-label');
            var method = methodEl ? methodEl.value : 'CIF';

            if (portRow) {
                portRow.style.display = (method === 'CIF') ? 'flex' : 'none';
            }
            if (containerRow) {
                containerRow.style.display = (method !== 'EXW') ? 'block' : 'none';
            }
            if (cifFreightRow) {
                cifFreightRow.style.display = (method === 'DDP') ? 'flex' : 'none';
            }
            if (ddpAddressRow) {
                ddpAddressRow.style.display = (method === 'DDP') ? 'flex' : 'none';
            }
            if (tariffRow) {
                tariffRow.style.display = (method === 'DDP') ? 'flex' : 'none';
            }
            if (consumptionTaxRow) {
                consumptionTaxRow.style.display = (method === 'DDP') ? 'flex' : 'none';
            }
            if (freightRow) {
                if (method === 'EXW') {
                    freightRow.style.display = 'none';
                } else {
                    freightRow.style.display = 'flex';
                    if (freightLabel) {
                        freightLabel.textContent = (method === 'DDP') ? '目的港运费(USD)' : '运费(USD)';
                    }
                }
            }
        }
        var koTradeRadios = document.querySelectorAll('input[name="ko-trade-method"]');
        koTradeRadios.forEach(function (r) {
            r.addEventListener('change', updateKoPortVisibility);
        });
        updateKoPortVisibility();
        updateKoContainerQtyVisibility();

        function updateEnTradeVisibility() {
            var methodEl = document.querySelector('input[name="en-trade-method"]:checked');
            var method = methodEl ? methodEl.value : 'EXW';
            var portRow = document.getElementById('en-port-row');
            var cifPortRow = document.getElementById('en-cif-port-row');
            var containerRow = document.getElementById('en-container-row');
            var showFobPort = ['FOB', 'FCA'].indexOf(method) >= 0;
            var showCifPort = ['CIF', 'DDU', 'DDP'].indexOf(method) >= 0;
            var showShipping = ['FOB', 'CIF', 'DDU', 'DDP', 'FCA'].indexOf(method) >= 0;
            if (portRow) {
                var portLabel = portRow.querySelector('span');
                if (portLabel) portLabel.textContent = method + '港口：';
                portRow.style.display = showFobPort ? 'flex' : 'none';
            }
            if (cifPortRow) cifPortRow.style.display = showCifPort ? 'flex' : 'none';
            if (containerRow) containerRow.style.display = showShipping ? 'block' : 'none';
        }

        function updateApTradeVisibility() {
            var methodEl = document.querySelector('input[name="ap-trade-method"]:checked');
            var method = methodEl ? methodEl.value : 'EXW';
            var needFreight = ['FOB', 'CIF'].indexOf(method) >= 0;
            var containerRow = document.getElementById('ap-container-row');
            var portRow = document.getElementById('ap-port-row');
            // 柜型/运费仅地面案件且 FOB/CIF 时显示
            if (containerRow) {
                containerRow.style.display = (isApGroundCase() && needFreight) ? 'block' : 'none';
            }
            if (portRow) {
                portRow.style.display = ['EXW', 'FOB', 'CIF'].indexOf(method) >= 0 ? 'flex' : 'none';
            }
            updateApModuleWattageVisibility();
        }

        function updateApContainerQtyVisibility() {
            var cb20gp = document.getElementById('ap-ct-20gp');
            var cb40hq = document.getElementById('ap-ct-40hq');
            var qty20gp = document.getElementById('ap-qty-20gp');
            var qty40hq = document.getElementById('ap-qty-40hq');
            var freight20gp = document.getElementById('ap-freight-20gp');
            var freight40hq = document.getElementById('ap-freight-40hq');
            if (qty20gp) qty20gp.disabled = !(cb20gp && cb20gp.checked);
            if (qty40hq) qty40hq.disabled = !(cb40hq && cb40hq.checked);
            if (freight20gp) freight20gp.disabled = !(cb20gp && cb20gp.checked);
            if (freight40hq) freight40hq.disabled = !(cb40hq && cb40hq.checked);
        }

        function updateApModuleWattageVisibility() {
            var wattRow = document.getElementById('ap-module-wattage-row');
            if (wattRow) {
                wattRow.style.display = isApGroundCase() ? 'flex' : 'none';
            }
        }

        function setupCustomPortToggle(selectId, customId) {
            var sel = document.getElementById(selectId);
            var custom = document.getElementById(customId);
            if (!sel || !custom) return;
            sel.addEventListener('change', function () {
                custom.style.display = sel.value === '__custom__' ? 'inline-block' : 'none';
                if (sel.value !== '__custom__') custom.value = '';
            });
        }
        setupCustomPortToggle('en-dest-port', 'en-dest-port-custom');
        setupCustomPortToggle('en-cif-dest-port', 'en-cif-dest-port-custom');
        function updateEnContainerQtyVisibility() {
            var cb20gp = document.getElementById('en-ct-20gp');
            var cb40hq = document.getElementById('en-ct-40hq');
            var cbLcl = document.getElementById('en-ct-lcl');
            var qty20gp = document.getElementById('en-qty-20gp');
            var qty40hq = document.getElementById('en-qty-40hq');
            var qtyLcl = document.getElementById('en-qty-lcl');
            var freight20gp = document.getElementById('en-freight-20gp');
            var freight40hq = document.getElementById('en-freight-40hq');
            var freightLcl = document.getElementById('en-freight-lcl');
            if (qty20gp) qty20gp.disabled = !(cb20gp && cb20gp.checked);
            if (qty40hq) qty40hq.disabled = !(cb40hq && cb40hq.checked);
            if (qtyLcl) qtyLcl.disabled = !(cbLcl && cbLcl.checked);
            if (freight20gp) freight20gp.disabled = !(cb20gp && cb20gp.checked);
            if (freight40hq) freight40hq.disabled = !(cb40hq && cb40hq.checked);
            if (freightLcl) freightLcl.disabled = !(cbLcl && cbLcl.checked);
        }
        var enTradeRadios = document.querySelectorAll('input[name="en-trade-method"]');
        enTradeRadios.forEach(function (r) {
            r.addEventListener('change', updateEnTradeVisibility);
        });
        ['en-ct-20gp', 'en-ct-40hq', 'en-ct-lcl'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', updateEnContainerQtyVisibility);
        });

        var apTradeRadios = document.querySelectorAll('input[name="ap-trade-method"]');
        apTradeRadios.forEach(function (r) {
            r.addEventListener('change', updateApTradeVisibility);
        });
        ['ap-ct-20gp', 'ap-ct-40hq'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', updateApContainerQtyVisibility);
        });

        var enValiditySelect = document.getElementById('en-quote-validity');
        var enValidityCustom = document.getElementById('en-quote-validity-custom');
        var enValidityCustomUnit = document.getElementById('en-quote-validity-custom-unit');
        if (enValiditySelect) {
            enValiditySelect.addEventListener('change', function () {
                var isCustom = this.value === 'custom';
                if (enValidityCustom) enValidityCustom.style.display = isCustom ? 'inline-block' : 'none';
                if (enValidityCustomUnit) enValidityCustomUnit.style.display = isCustom ? 'inline' : 'none';
            });
        }
        updateEnTradeVisibility();
        updateEnContainerQtyVisibility();
        updateApTradeVisibility();
        updateApContainerQtyVisibility();

        var koDestPortSelectEl = document.getElementById('ko-dest-port');
        var koDestPortCustomInputEl = document.getElementById('ko-dest-port-custom');
        if (koDestPortSelectEl) {
            koDestPortSelectEl.addEventListener('change', function () {
                if (koDestPortCustomInputEl) {
                    koDestPortCustomInputEl.style.display = this.value === '__custom__' ? 'inline-block' : 'none';
                }
            });
        }

        function updateKoTradeSectionVisibility() {
            var caseTypeEl = document.querySelector('input[name="ko-case-type"]:checked');
            var caseType = caseTypeEl ? caseTypeEl.value : 'NORMAL';
            var tradeSection = document.getElementById('ko-trade-section');
            if (tradeSection) {
                tradeSection.style.display = (caseType === 'KSD') ? 'none' : 'block';
            }
            if (caseType === 'KSD') {
                var exwRadio = document.querySelector('input[name="ko-trade-method"][value="EXW"]');
                if (exwRadio) exwRadio.checked = true;
                var tariffRow = document.getElementById('ko-tariff-row');
                var consumptionTaxRow = document.getElementById('ko-consumption-tax-row');
                var freightRow = document.getElementById('ko-freight-row');
                if (tariffRow) tariffRow.style.display = 'none';
                if (consumptionTaxRow) consumptionTaxRow.style.display = 'none';
                if (freightRow) freightRow.style.display = 'none';
                var saleTypeSection = document.getElementById('ko-sale-type-section');
                if (saleTypeSection) saleTypeSection.style.display = '';
            } else if (caseType === 'SIMPLE') {
                var tradeLabel = document.getElementById('ko-trade-method-label');
                var tradeBtns = document.getElementById('ko-trade-method-btns');
                if (tradeLabel) tradeLabel.style.display = 'none';
                if (tradeBtns) tradeBtns.style.display = 'none';
                var portRow = document.getElementById('ko-port-row');
                if (portRow) portRow.style.display = 'none';
                var containerRow = document.getElementById('ko-container-row');
                if (containerRow) containerRow.style.display = 'none';
                var cifFreightRow = document.getElementById('ko-cif-freight-row');
                if (cifFreightRow) cifFreightRow.style.display = 'none';
                var freightRow = document.getElementById('ko-freight-row');
                if (freightRow) freightRow.style.display = 'none';
                var ddpAddressRow = document.getElementById('ko-ddp-address-row');
                if (ddpAddressRow) ddpAddressRow.style.display = 'none';
                var saleTypeSection = document.getElementById('ko-sale-type-section');
                if (saleTypeSection) saleTypeSection.style.display = 'none';
            } else {
                var tradeLabel = document.getElementById('ko-trade-method-label');
                var tradeBtns = document.getElementById('ko-trade-method-btns');
                if (tradeLabel) tradeLabel.style.display = '';
                if (tradeBtns) tradeBtns.style.display = 'flex';
                var saleTypeSection = document.getElementById('ko-sale-type-section');
                if (saleTypeSection) saleTypeSection.style.display = '';
                updateKoPortVisibility();
            }
            var weightCodeRow = document.getElementById('weight-code-row');
            if (weightCodeRow) {
                var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
                if (currentGroup === '韩语组') {
                    weightCodeRow.style.display = (caseType === 'KSD' || caseType === 'SIMPLE') ? '' : 'none';
                }
            }

        }
        var koCaseTypeRadios = document.querySelectorAll('input[name="ko-case-type"]');
        koCaseTypeRadios.forEach(function (r) {
            r.addEventListener('change', updateKoTradeSectionVisibility);
        });
        updateKoTradeSectionVisibility();

        var estMiscEl = document.getElementById('est-fence-additional-misc');
        if (estMiscEl) {
            estMiscEl.addEventListener('input', renderEstFenceSummary);
            estMiscEl.addEventListener('change', renderEstFenceSummary);
        }
        if (elements.addEstSegBtn) {
            elements.addEstSegBtn.addEventListener('click', function() { addEstSegment(null, null, null, null, null, null, null, null, null, false); });
        }

        var estConfirmBtn = document.getElementById('est-fence-confirm-btn');
        if (estConfirmBtn) {
            estConfirmBtn.addEventListener('click', function () {
                if (confirmedEstFenceData) {
                    confirmedEstFenceData = null;
                    estConfirmBtn.textContent = '確認';
                    estConfirmBtn.classList.remove('btn-cancel');
                    estConfirmBtn.classList.add('primary');
                    var statusEl = document.getElementById('est-fence-confirm-status');
                    if (statusEl) statusEl.textContent = '';
                    setEstInputsDisabled(false);
                    renderEstFenceSummary();
                    return;
                }
                if (!_latestEstResult || !_latestEstResult.rows) {
                    return;
                }
                var segments = getAllEstSegments();
                var segData = segments.map(function(seg) {
                    var params = {
                        height: seg.height,
                        totalLength: seg.length,
                        cornerCount: seg.corner,
                        singleGateQty: seg.singleGateEnabled ? (parseInt(seg.singleGateQty) || 0) : 0,
                        doubleGate2000Qty: seg.doubleGate2000Enabled ? (parseInt(seg.doubleGate2000Qty) || 0) : 0,
                        doubleGate4000Qty: seg.doubleGate4000Enabled ? (parseInt(seg.doubleGate4000Qty) || 0) : 0,
                        singleGateEnabled: seg.singleGateEnabled,
                        doubleGate2000Enabled: seg.doubleGate2000Enabled,
                        doubleGate4000Enabled: seg.doubleGate4000Enabled
                    };
                    var calc = window.KSEstFenceCalculator;
                    var result = calc ? calc.buildEstFenceQuote(params) : { rows: [], totalAmount: 0 };
                    return {
                        height: parseInt(seg.height) || 1500,
                        length: Math.ceil(parseFloat(seg.length) || 100),
                        corner: parseInt(seg.corner) || 0,
                        singleGate: seg.singleGateEnabled ? (parseInt(seg.singleGateQty) || 0) : 0,
                        doubleGate2000: seg.doubleGate2000Enabled ? (parseInt(seg.doubleGate2000Qty) || 0) : 0,
                        doubleGate4000: seg.doubleGate4000Enabled ? (parseInt(seg.doubleGate4000Qty) || 0) : 0,
                        items: (result.rows || []).map(function(row) {
                             return { code: row.code || '', name: row.name, unit: row.unit, unit_price: row.price, qty: row.qty };
                         })
                    };
                });
                var additionalMisc = parseFloat((document.getElementById('est-fence-additional-misc') || {}).value || 0) || 0;
                confirmedEstFenceData = {
                    segments: segData,
                    additional_misc: additionalMisc,
                    items: _latestEstResult.rows.map(function(row) {
                        return { code: row.code || '', name: row.name, unit: row.unit, unit_price: row.price, qty: row.qty };
                    })
                };
                var statusEl = document.getElementById('est-fence-confirm-status');
                if (statusEl) statusEl.textContent = '已確認';
                estConfirmBtn.textContent = '取消確認';
                estConfirmBtn.classList.remove('primary');
                estConfirmBtn.classList.add('btn-cancel');
                setEstInputsDisabled(true);
            });
        }

        var nvConfirmBtn = document.getElementById('nv-fence-gate-confirm-btn');
        if (nvConfirmBtn) {
            nvConfirmBtn.addEventListener('click', async function () {
                if (confirmedNvFenceGateData) {
                    confirmedNvFenceGateData = null;
                    nvConfirmBtn.textContent = '确认';
                    nvConfirmBtn.classList.remove('btn-cancel');
                    nvConfirmBtn.classList.add('primary');
                    var statusEl = document.getElementById('nv-fence-gate-confirm-status');
                    if (statusEl) statusEl.textContent = '';
                    setNvFenceGateInputsDisabled(false);
                    renderNvSummary();
                    return;
                }
                var calc = getFenceGateCalculator();
                if (!calc) return;
                if (typeof calc.ready === 'function') {
                    try { await calc.ready(); } catch (e) {}
                }
                var fenceInputs = getAllFenceInputs();
                var gateInputs = getAllGateInputs();
                var fenceDataList = [];
                var gateDataList = [];
                var coating = elements.quickFenceCoating ? elements.quickFenceCoating.value : '浸塑';
                var surface = _getCommonSurface();
                fenceInputs.forEach(function(input) {
                    var result = calc.buildFenceQuoteByStyle(input.style, input.totalLength, input.cornerQty, input.wireDiameter, input.surface);
                    fenceDataList.push({
                        style: input.style,
                        totalLength: input.totalLength,
                        cornerQty: input.cornerQty,
                        wireDiameter: input.wireDiameter,
                        surface: input.surface,
                        summaryCards: result.summaryCards || [],
                        rows: (result.rows || []).map(function (r) {
                            return { code: r.code || '', name: r.name, spec: r.spec, unit_price: r.unitPrice, qty: r.qty, amount: r.lineTotal };
                        })
                    });
                });
                gateInputs.forEach(function(input) {
                    var result = calc.buildGateQuoteByStyle(input.gateStyle, input.gateQty);
                    gateDataList.push({
                        gateStyle: input.gateStyle,
                        gateQty: input.gateQty,
                        gateColor: input.gateColor || '白色',
                        summaryCards: result.summaryCards || [],
                        rows: (result.rows || []).map(function (r) {
                            return { code: r.code || '', name: r.name, spec: r.spec, unit_price: r.unitPrice, qty: r.qty, amount: r.lineTotal };
                        })
                    });
                });
                if (fenceDataList.length === 0 && gateDataList.length === 0) return;
                confirmedNvFenceGateData = {
                    coating: coating,
                    surface: surface,
                    fences: fenceDataList,
                    gates: gateDataList,
                    fence: fenceDataList.length > 0 ? fenceDataList[0] : {},
                    gate: gateDataList.length > 0 ? gateDataList[0] : {}
                };
                var statusEl = document.getElementById('nv-fence-gate-confirm-status');
                if (statusEl) statusEl.textContent = '已確認';
                nvConfirmBtn.textContent = '取消確認';
                nvConfirmBtn.classList.remove('primary');
                nvConfirmBtn.classList.add('btn-cancel');
                setNvFenceGateInputsDisabled(true);
            });
        }
    }

    function ensureInquiryRequesterControls() {
        var group = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        if (group !== '韩语组' && group !== '亚太组') return;
        loadContactsAndInquiryRequester();
    }

    function loadContactsAndInquiryRequester() {
        var container = elements.contactList;
        if (!container) return;

        var contactsApiUrl = typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : buildApiBaseUrl();
        var _contactGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        fetch(contactsApiUrl + '/ucontacts?group=' + encodeURIComponent(_contactGroup), { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success || !Array.isArray(data.data)) {
                    container.innerHTML = '<span style="color:#991b1b; font-size:13px;">联系人数据为空</span>';
                    return;
                }
                var contacts = data.data.filter(function (c) { return c.nickname && c.nickname.trim(); });
                container.innerHTML = '';
                contacts.forEach(function (c) {
                    var card = document.createElement('div');
                    card.setAttribute('data-contact-id', c.id);
                    card.setAttribute('data-name-ko', c.nickname || '');
                    card.setAttribute('data-phone', c.mob || '');
                    card.setAttribute('data-email', c.email || '');
                    card.setAttribute('data-name', c.name_china || '');
                    card.className = 'contact-card';
                    card.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 14px; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; transition: all 0.15s ease; background: #fff; min-width: 80px; text-align: center;';
                    card.innerHTML = '<div class="contact-name" style="font-size: 13px; font-weight: 600; color: #0f172a;">' + escapeHtml(c.name_china) + '</div>' +
                        '<div class="contact-name-ko" style="font-size: 11px; color: #64748b;">' + escapeHtml(c.nickname || '') + '</div>' +
                        '<div class="contact-detail" style="font-size: 11px; color: #64748b;">' + escapeHtml(c.mob || '-') + '</div>' +
                        '<div class="contact-detail" style="font-size: 11px; color: #64748b;">' + escapeHtml(c.email || '-') + '</div>';
                    card.addEventListener('mouseenter', function () {
                        if (!card.classList.contains('contact-card-selected')) {
                            card.style.borderColor = '#0ea5e9';
                            card.style.background = '#f0f9ff';
                        }
                    });
                    card.addEventListener('mouseleave', function () {
                        if (!card.classList.contains('contact-card-selected')) {
                            card.style.borderColor = '#e2e8f0';
                            card.style.background = '#fff';
                        }
                    });
                    container.appendChild(card);
                });

                var storedId = localStorage.getItem(CONTACT_STORAGE_KEY);
                if (storedId && !/^\d+$/.test(storedId)) storedId = '';
                var authData = null;
                try { authData = JSON.parse(localStorage.getItem('ks_auth_v1') || 'null'); } catch (e) {}

                var targetId = '';
                if (authData && authData.id) {
                    var authMatch = contacts.find(function (c) { return c.id === authData.id; });
                    if (authMatch) targetId = String(authMatch.id);
                }
                if (!targetId && storedId) {
                    targetId = storedId;
                }
                if (!targetId && contacts.length > 0) {
                    targetId = String(contacts[0].id);
                }
                if (targetId) {
                    var targetCard = container.querySelector('[data-contact-id="' + targetId + '"]');
                    if (targetCard) {
                        targetCard.classList.add('contact-card-selected');
                        targetCard.style.borderColor = '#0f766e';
                        targetCard.style.background = '#e6fffb';
                    }
                }
                applySelectedContact();
            })
            .catch(function (err) {
                container.innerHTML = '<span style="color:#991b1b; font-size:13px;">加载联系人失败：' + escapeHtml(err.message || '未知错误') + '</span>';
            });
    }

    function applySelectedContact() {
        var selected = document.querySelector('.contact-card-selected[data-contact-id]');
        if (!selected) {
            state.contactInfo = { contact_name: '', phone: '', tel: '', fax: '', inquiry_requester: '' };
            updateContactPreview(null);
            return;
        }
        var nameKo = selected.getAttribute('data-name-ko') || '';
        var phone = selected.getAttribute('data-phone') || '';
        var email = selected.getAttribute('data-email') || '';
        var name = selected.getAttribute('data-name') || '';
        var contactId = selected.getAttribute('data-contact-id') || '';

        state.contactInfo = {
            contact_name: nameKo,
            phone: phone,
            tel: email,
            fax: '',
            inquiry_requester: name,
        };
        state.selectedInquiryRequester = name;
        localStorage.setItem(CONTACT_STORAGE_KEY, contactId);
        persistInquiryRequesterConfig();
        updateContactPreview({ name_ko: nameKo, phone: phone, email: email });
    }

    function updateContactPreview(info) {
        var preview = document.getElementById('contact-preview');
        var nameEl = document.getElementById('contact-preview-name');
        var phoneEl = document.getElementById('contact-preview-phone');
        var emailEl = document.getElementById('contact-preview-email');
        var faxEl = document.getElementById('contact-preview-fax');
        if (preview) preview.style.display = info ? 'block' : 'none';
        if (nameEl) nameEl.innerHTML = '<span style="color:#64748b;">담당자：</span>' + (info ? (info.name_ko || '-') : '-');
        if (phoneEl) phoneEl.innerHTML = '<span style="color:#64748b;">전화：</span>' + (info ? (info.phone || '-') : '-');
        if (emailEl) emailEl.innerHTML = '<span style="color:#64748b;">Email：</span>' + (info ? (info.email || '-') : '-');
        if (faxEl) faxEl.innerHTML = '<span style="color:#64748b;">Fax：</span>';
    }

    function loadContactInfo() {
        var defaults = getContactDefaults();
        state.contactInfo = {
            ...defaults,
            inquiry_requester: state.selectedInquiryRequester || DEFAULT_INQUIRY_REQUESTER,
        };
    }

    function saveContactInfo() {
        var info = state.contactInfo || {};
        var inquiryRequester = info.inquiry_requester || DEFAULT_INQUIRY_REQUESTER;
        state.selectedInquiryRequester = inquiryRequester;
        state.contactInfo = { ...info, inquiry_requester: inquiryRequester };
    }

    function buildContactInfoPayload() {
        var inquiryRequester = state.selectedInquiryRequester || state.contactInfo.inquiry_requester || DEFAULT_INQUIRY_REQUESTER;
        state.selectedInquiryRequester = inquiryRequester;
        return {
            ...state.contactInfo,
            inquiry_requester: inquiryRequester,
        };
    }

    function persistInquiryRequesterConfig() {
        localStorage.setItem(INQUIRY_REQUESTER_STORAGE_KEY, state.selectedInquiryRequester || DEFAULT_INQUIRY_REQUESTER);
    }

    function loadInquiryRequesterConfig() {
        var storedSelectedRequester = String(
            localStorage.getItem(INQUIRY_REQUESTER_STORAGE_KEY) || DEFAULT_INQUIRY_REQUESTER
        ).trim();

        state.inquiryRequesters = [DEFAULT_INQUIRY_REQUESTER];
        state.selectedInquiryRequester = storedSelectedRequester || DEFAULT_INQUIRY_REQUESTER;
        renderInquiryRequesterOptions();
        state.contactInfo = buildContactInfoPayload();
        persistInquiryRequesterConfig();
    }

    function renderInquiryRequesterOptions() {
    }

    async function checkBackendHealth() {
        try {
            var response = await fetch(KS_API_BASE_URL + '/health');
            var data = await readApiJson(response);
            if (data.status === 'ok') {
                console.log('后端服务正常');
            } else {
                showStatus('后端服务异常，请检查服务是否启动', 'error');
            }
        } catch (error) {
            console.error('无法连接到后端服务:', error);
            showStatus('无法连接到后端服务，请确保Flask服务已启动', 'error');
        }
    }

    function checkGlobalPriceStatus() {
        applyDatabaseOnlyMode();
    }

    function applyDatabaseOnlyMode() {
        var priceCard = getCardForElement(elements.priceFileButton || document.getElementById('price-file-btn'));
        var imageCard = getCardForElement(elements.imageFolderInput || document.getElementById('image-folder-input'));

        if (priceCard) {
            priceCard.style.display = 'none';
        }

        if (imageCard) {
            imageCard.style.display = 'none';
        }

        if (elements.priceReportArea) {
            elements.priceReportArea.style.display = 'none';
        }

        if (elements.priceTableStatus) {
            elements.priceTableStatus.style.display = 'none';
        }

        if (elements.bomUploadHint) {
            var _apGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
            if (_apGroup === '亚太组' && !isApGroundCase()) {
                elements.bomUploadHint.style.display = 'block';
                elements.bomUploadHint.style.background = '#ecfeff';
                elements.bomUploadHint.style.color = '#155e75';
                elements.bomUploadHint.textContent = '请上传 BOM 表即可生成报价。';
            } else {
                elements.bomUploadHint.style.display = 'block';
                elements.bomUploadHint.style.background = '#fef3c7';
                elements.bomUploadHint.style.color = '#92400e';
                elements.bomUploadHint.textContent = '⚠️ 请先上传信息表，再上传 BOM 表。';
            }
        }
    }

    async function uploadBOMFile(file) {
        var _bomGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        if (!state.matrixFileId && _bomGroup !== '亚太组') {
            showStatus('请先上传信息表，再上传 BOM 表。', 'error');
            return;
        }
        if (!state.matrixFileId && _bomGroup === '亚太组' && isApGroundCase()) {
            showStatus('请先上传信息表，再上传 BOM 表。', 'error');
            return;
        }

        showStatus('正在上传 BOM 表 ' + file.name + '...', 'info');

        var formData = new FormData();
        formData.append('file', file);

        try {
            var response = await fetch(KS_API_BASE_URL + '/upload-bom', {
                method: 'POST',
                body: formData
            });

            var data = await readApiJson(response);
            if (!data.success) {
                showStatus('上传失败: ' + data.message, 'error');
                return;
            }

            state.bomFile = file;
            state.bomFileId = data.file_id;
            state.bomTables = Array.isArray(data.bom_tables) ? data.bom_tables : [];
            state.selectedBomKeys = state.bomTables.map(function (item) { return item.key; });
            resetReportState();

            var _bomGroup2 = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
            if (_bomGroup2 === '亚太组' && !isApGroundCase()) {
                renderBomTableSelection();
            } else {
                generateQuotation();
            }

            if (elements.bomFileButton) {
                elements.bomFileButton.textContent = '已上传: ' + file.name;
                elements.bomFileButton.classList.add('success');
            }

            if (elements.bomUploadHint) {
                elements.bomUploadHint.style.display = 'block';
                var totalCount = data.bom_table_count || 0;
                if (_bomGroup2 === '亚太组' && !isApGroundCase()) {
                    elements.bomUploadHint.style.background = '#ecfeff';
                    elements.bomUploadHint.style.color = '#155e75';
                    elements.bomUploadHint.textContent = 'BOM 上传成功，已识别 ' + totalCount + ' 个 BOM 表。请勾选需要生成的 BOM 表后点击“分析并生成报表”。';
                } else {
                    elements.bomUploadHint.style.background = '#ecfeff';
                    elements.bomUploadHint.style.color = '#155e75';
                    elements.bomUploadHint.textContent = 'BOM 上传成功，已识别 ' + totalCount + ' 个 BOM 表。';
                }
            }

            if (_bomGroup2 === '亚太组' && !isApGroundCase()) {
                showStatus('BOM 上传成功，检测到 ' + data.sheet_count + ' 个工作表、' + (data.bom_table_count || 0) + ' 个 BOM 表。请选择要生成的 BOM 表后点击“分析并生成报表”。', 'success');
            } else {
                showStatus('BOM 上传成功，检测到 ' + data.sheet_count + ' 个工作表、' + (data.bom_table_count || 0) + ' 个 BOM 表。', 'success');
            }
        } catch (error) {
            console.error('上传 BOM 失败:', error);
            showStatus('上传失败: ' + error.message, 'error');
        }
    }

    async function uploadPriceFile(file) {
        showStatus('正在上传物料定价表: ' + file.name + '...', 'info');

        var formData = new FormData();
        formData.append('file', file);

        var setAsGlobal = document.getElementById('set-global-price').checked;
        if (setAsGlobal) {
            formData.append('set_as_global', 'true');
        }

        try {
            var response = await fetch(KS_API_BASE_URL + '/upload-price', {
                method: 'POST',
                body: formData
            });

            var data = await readApiJson(response);

            if (data.success) {
                state.priceFile = file;
                state.priceFileId = data.file_id;
                state.standardFileId = data.standard_file_id;

                showStatus('物料定价表上传成功！共 ' + data.price_count + ' 条价格记录（已自动生成标准定价表）', 'success');

                elements.priceFileButton.textContent = '已上传: ' + file.name;
                elements.priceFileButton.classList.add('success');

                elements.priceTableStatus.style.display = 'none';
                if (elements.priceTableInfo) {
                    elements.priceTableInfo.textContent = '';
                }

                if (elements.bomUploadHint) {
                    elements.bomUploadHint.style.display = 'none';
                }

                addDownloadStandardButton(data.standard_file_id, file.name);

                if (setAsGlobal) {
                    checkGlobalPriceStatus();
                }
            } else {
                showStatus('上传失败: ' + data.message, 'error');
            }
        } catch (error) {
            console.error('上传失败:', error);
            showStatus('上传失败: ' + error.message, 'error');
        }
    }

    async function uploadMatrixFile(file) {
        if (file.size > MAX_UPLOAD_FILE_SIZE) {
            var limitMb = Math.round(MAX_UPLOAD_FILE_SIZE / (1024 * 1024));
            var message = '信息表文件过大：' + formatFileSize(file.size) + '，当前限制为 ' + limitMb + 'MB';
            updateMatrixFileStatus(message, 'error');
            showStatus('上传失败: ' + message, 'error');
            return;
        }

        showStatus('正在上传信息表: ' + file.name + '...', 'info');

        var formData = new FormData();
        formData.append('file', file);
        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        if (currentGroup) {
            formData.append('group', currentGroup);
        }
        if (currentGroup === '亚太组') {
            var apCaseTypeEl = document.querySelector('input[name="ap-case-type"]:checked');
            formData.append('ap_case_type', apCaseTypeEl ? apCaseTypeEl.value : 'ROOF');
        }

        try {
            var response = await fetch(KS_API_BASE_URL + '/upload-matrix', {
                method: 'POST',
                body: formData
            });

            var data = await readApiJson(response);

            if (data.success) {
                state.matrixFile = file;
                state.matrixFileId = data.file_id;
                state.matrixInfo = {
                    project_name: data.project_name,
                    output_wp: data.output_wp,
                    set_count: data.set_count,
                    array_rows: data.array_rows,
                    array_cols: data.array_cols,
                    arrays: data.arrays || [],
                    module_wattage: data.module_wattage
                };

                var moduleWattageInput = document.getElementById('module-wattage-input');
                if (moduleWattageInput && data.module_wattage) {
                    moduleWattageInput.value = data.module_wattage;
                }

                resetReportState();

                if (elements.matrixFileButton) {
                    elements.matrixFileButton.textContent = '已上传: ' + file.name;
                    elements.matrixFileButton.classList.add('success');
                }

                var statusHtml = '<b>项目：</b>' + escapeHtml(data.project_name) + ' | 功率：' + data.output_wp + ' Wp | 组数：' + data.set_count;
                updateMatrixFileStatus(statusHtml);
                showStatus('信息表上传成功！项目：' + data.project_name + '，组数：' + data.set_count, 'success');
            } else {
                updateMatrixFileStatus(data.message || '信息表解析失败', 'error');
                showStatus('上传失败: ' + data.message, 'error');
            }
        } catch (error) {
            console.error('信息表上传失败:', error);
            updateMatrixFileStatus(error.message, 'error');
            showStatus('上传失败: ' + error.message, 'error');
        }
    }

    async function analyzeAndGenerate() {
        if (!state.bomFileId) {
            showStatus('请先上传 BOM 表。', 'error');
            return;
        }

        var selectedBomKeys = getSelectedBomKeys();
        if (Array.isArray(state.bomTables) && state.bomTables.length > 0 && selectedBomKeys.length === 0) {
            showStatus('请至少勾选一个 BOM 表。', 'error');
            return;
        }

        var stopAnalyzeStatus = startLongRunningStatus('正在根据数据库分析 BOM...', 'info');

        try {
            var requestBody = {
                bom_file_id: state.bomFileId,
                selected_bom_keys: selectedBomKeys,
                group: typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组'
            };

            var moduleWattageEl = document.getElementById('module-wattage-input');
            if (moduleWattageEl && moduleWattageEl.value) {
                requestBody.module_wattage = parseFloat(moduleWattageEl.value) || 0;
            }

            var response = await fetch(KS_API_BASE_URL + '/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            var data = await readApiJson(response);
            if (!data.success) {
                showStatus('分析失败: ' + data.message, 'error');
                return;
            }

            state.unmatchedCodes = data.unmatched_codes || [];
            state.missingImageCodes = data.missing_image_codes || [];
            state.missingImageItems = data.missing_image_items || [];
            displayUnmatchedCodes(state.unmatchedCodes);

            var issueItems = data.unmatched_items_count || 0;
            var totalProducts = data.total_products || 0;
            var matchRate = totalProducts > 0 ? ((data.matched_count / totalProducts) * 100).toFixed(1) : '0.0';

            if (issueItems > 0) {
                stopAnalyzeStatus();
                showStatus(
                    '分析完成：共 ' + totalProducts + ' 项，完整匹配 ' + data.matched_count + ' 项（' + matchRate + '%），待维护 ' + issueItems + ' 项。正在生成报表...',
                    'warning'
                );
            } else {
                stopAnalyzeStatus();
                showStatus('分析完成：共 ' + totalProducts + ' 项，全部已从数据库匹配。正在生成报表...', 'success');
            }

            await generateQuotation();
        } catch (error) {
            console.error('分析失败:', error);
            showStatus('分析失败: ' + error.message, 'error');
        } finally {
            stopAnalyzeStatus();
        }
    }

    async function generateQuotation() {
        var sb = elements.statusBox;
        if (sb && sb.parentNode) {
            var next = sb.nextElementSibling;
            while (next) {
                var curr = next;
                next = curr.nextElementSibling;
                if (curr.id === 'report-area') break;
                curr.remove();
            }
        }

        if (!state.bomFileId) {
            showStatus('请先上传 BOM 表。', 'error');
            return;
        }

        var selectedBomKeys = getSelectedBomKeys();
        if (Array.isArray(state.bomTables) && state.bomTables.length > 0 && selectedBomKeys.length === 0) {
            showStatus('请至少勾选一个 BOM 表。', 'error');
            return;
        }

        var stopGenerateStatus = startLongRunningStatus('正在根据数据库生成报表，请稍候...', 'info');

        try {
            var requestBody = {
                bom_file_id: state.bomFileId,
                bom_filename: state.bomFile ? state.bomFile.name : '',
                selected_bom_keys: selectedBomKeys,
                center_images: true,
                contact_info: state.contactInfo,
                group: typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组'
            };

            var moduleWattageEl = document.getElementById('module-wattage-input');
            if (moduleWattageEl && moduleWattageEl.value) {
                requestBody.module_wattage = parseFloat(moduleWattageEl.value) || 0;
            }

            var needWeightCodeEl = document.getElementById('need-weight-code');
            var enNeedWeightCodeEl = document.getElementById('en-need-weight-code');
            if ((needWeightCodeEl && needWeightCodeEl.checked) || (enNeedWeightCodeEl && enNeedWeightCodeEl.checked)) {
                requestBody.need_weight_code = true;
            }

            var nvNeedWeightEl = document.getElementById('nv-need-weight');
            var nvNeedCodeEl = document.getElementById('nv-need-code');
            if (nvNeedWeightEl && nvNeedWeightEl.checked) {
                requestBody.need_weight = true;
            }
            if (nvNeedCodeEl && nvNeedCodeEl.checked) {
                requestBody.need_code = true;
            }

            var needTotalQtyEl = document.getElementById('need-total-qty');
            if (needTotalQtyEl && needTotalQtyEl.checked) {
                requestBody.need_total_qty = true;
            }

            var deleteOptions = {};
            var excludeOptions = {};
            var koMatBtnGroups2 = containerEl ? containerEl.querySelectorAll('.ko-mat-btns:not([data-mat-group^="ja_"])') : [];
            koMatBtnGroups2.forEach(function (group) {
                var matGroup = group.getAttribute('data-mat-group');
                var activeBtn = group.querySelector('button.active-blue, button.active-red, button.active-green');
                if (activeBtn && matGroup) {
                    var action = activeBtn.getAttribute('data-action');
                    if (action === 'delete') deleteOptions[matGroup] = true;
                    else if (action === 'exclude') excludeOptions[matGroup] = true;
                    else if (action === 'include') excludeOptions[matGroup] = false;
                }
            });

            if (Object.keys(deleteOptions).length > 0) {
                requestBody.delete_options = deleteOptions;
            }
            requestBody.ko_exclude_options = excludeOptions;

            function _readAction(matGroup) {
                var action = matSelectionState[matGroup];
                if (action) return action;
                var btn = containerEl.querySelector('.ko-mat-btns[data-mat-group="' + matGroup + '"] button.active-blue, .ko-mat-btns[data-mat-group="' + matGroup + '"] button.active-red, .ko-mat-btns[data-mat-group="' + matGroup + '"] button.active-green, .ko-mat-btns[data-mat-group="' + matGroup + '"] button.active-orange');
                return btn ? btn.getAttribute('data-action') : '';
            }

            function _setCap(opts) {
                opts.rail_cap = true;
                opts.beam_cap = true;
            }

            function collectNvMatOptions() {
                var del = {};
                var exc = {};
                var handleGroups = containerEl ? containerEl.querySelectorAll('.ko-mat-btns[data-mat-group^="ja_nv_handle_"]') : [];
                handleGroups.forEach(function (group) {
                    var handleKey = group.getAttribute('data-mat-group').replace(/^ja_nv_handle_/, '');
                    if (_readAction(group.getAttribute('data-mat-group')) === 'delete') {
                        if (handleKey === 'cap') { _setCap(del); } else { del[handleKey] = true; }
                    }
                });
                var spareGroups = containerEl ? containerEl.querySelectorAll('.ko-mat-btns[data-mat-group^="ja_nv_"]:not([data-mat-group^="ja_nv_handle_"])') : [];
                spareGroups.forEach(function (group) {
                    var key = group.getAttribute('data-mat-group').replace(/^ja_nv_/, '');
                    if (_readAction(group.getAttribute('data-mat-group')) === 'exclude') {
                        if (key === 'cap') { _setCap(exc); } else { exc[key] = true; }
                    }
                });
                return { exclude: exc, del: del };
            }

            function collectEstMatOptions() {
                var del = {};
                var groups = containerEl ? containerEl.querySelectorAll('.ko-mat-btns[data-mat-group^="ja_est_"]') : [];
                groups.forEach(function (group) {
                    var key = group.getAttribute('data-mat-group').replace(/^ja_est_/, '');
                    var action = _readAction(group.getAttribute('data-mat-group'));
                    if (action === 'exclude' || action === 'delete') {
                        if (key === 'cap') { _setCap(del); } else { del[key] = true; }
                    }
                });
                return { exclude: {}, del: del };
            }

            function collectNormalMatOptions() {
                var exc = {};
                var groups = containerEl ? containerEl.querySelectorAll('.ko-mat-btns[data-mat-group^="ja_normal_"]') : [];
                groups.forEach(function (group) {
                    var key = group.getAttribute('data-mat-group').replace(/^ja_normal_/, '');
                    if (_readAction(group.getAttribute('data-mat-group')) === 'exclude') {
                        if (key === 'cap') { _setCap(exc); } else { exc[key] = true; }
                    }
                });
                return { exclude: exc, del: {} };
            }

            var _nvMatResult = { exclude: {}, del: {} };
            switch (getSelectedCaseType()) {
                case 'NV': _nvMatResult = collectNvMatOptions(); break;
                case 'EST': _nvMatResult = collectEstMatOptions(); break;
                case 'NORMAL': _nvMatResult = collectNormalMatOptions(); break;
            }
            var excludeOptions = _nvMatResult.exclude;
            var deleteOptions = _nvMatResult.del;

            if (Object.keys(excludeOptions).length > 0) {
                requestBody.exclude_options = excludeOptions;
            }
            if (Object.keys(deleteOptions).length > 0) {
                requestBody.exclude_delete_options = deleteOptions;
            }
            console.log('[DEBUG_CAP_SUBMIT] case=' + getSelectedCaseType() + ' exclude_options=', JSON.stringify(excludeOptions), 'exclude_delete_options=', JSON.stringify(deleteOptions));
            var _capHandle = document.querySelector('.ko-mat-btns[data-mat-group="ja_nv_handle_cap"]');
            if (_capHandle) {
                var _ab = _capHandle.querySelector('button.active-blue, button.active-red, button.active-green, button.active-orange');
                console.log('[DEBUG_CAP_SUBMIT] ja_nv_handle_cap activeBtn action=', _ab ? _ab.getAttribute('data-action') : 'NONE', 'classes=', _ab ? _ab.className : '-');
            }

            var caseType = getSelectedCaseType();

            if (caseType === 'EST') {
                var jaRateEl = document.getElementById('ja-exchange-rate');
                if (jaRateEl) {
                    requestBody.exchange_rate = parseFloat(jaRateEl.value) || 160;
                }
                var jaTariffEl = document.getElementById('ja-tariff-rate');
                if (jaTariffEl) {
                    requestBody.tariff_rate = parseFloat(jaTariffEl.value) || 1.6;
                }
                var jaConsTaxEl = document.getElementById('ja-consumption-tax');
                if (jaConsTaxEl) {
                    requestBody.consumption_tax = parseFloat(jaConsTaxEl.value) || 10;
                }
                var jaFenceTaxEl = document.getElementById('ja-fence-tax');
                if (jaFenceTaxEl) {
                    requestBody.fence_tax = parseFloat(jaFenceTaxEl.value) || 10;
                }
                var jaDiscountEl = document.getElementById('ja-discount-rate');
                if (jaDiscountEl) {
                    requestBody.discount_rate = parseFloat(jaDiscountEl.value) || 71;
                }
                var jaSteelDiscountEl = document.getElementById('ja-steel-discount-rate');
                if (jaSteelDiscountEl) {
                    requestBody.steel_discount_rate = parseFloat(jaSteelDiscountEl.value) || 84;
                }
                var jaPurchasedDiscountEl = document.getElementById('ja-purchased-discount-rate');
                if (jaPurchasedDiscountEl) {
                    requestBody.purchased_discount_rate = parseFloat(jaPurchasedDiscountEl.value) || 94;
                }
                var jaSteelPackEl = document.getElementById('ja-steel-pack');
                if (jaSteelPackEl) {
                    requestBody.steel_pack = jaSteelPackEl.value || 'jybz';
                }

                var truckSizeEl = document.getElementById('ja-truck-size');
                var truckUnicEl = document.getElementById('ja-truck-unic');
                var truckFlatEl = document.getElementById('ja-truck-flat');
                if (truckSizeEl) {
                    var truckParts = [];
                    var size = truckSizeEl.value || '4T';
                    var useUnic = truckUnicEl && truckUnicEl.checked;
                    var useFlat = truckFlatEl && truckFlatEl.checked;
                    if (useUnic) truckParts.push(size + 'ユニック');
                    if (useFlat) truckParts.push(size + '平車');
                    requestBody.truck_desc = truckParts.length > 0 ? truckParts.join('+') + ' 配送' : '';
                }

                var truckFeeEl = document.getElementById('ja-truck-fee');
                if (truckFeeEl) {
                    requestBody.truck_fee = parseFloat(truckFeeEl.value) || 0;
                }
            }

            if (state.coatingThickness && state.coatingThickness !== 10) {
                requestBody.coating_thickness = state.coatingThickness;
            }
            if (state.coatingThickness && state.coatingThickness === 10) {
                requestBody.coating_thickness = 10;
            }

            var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
            if (currentGroup === '韩语组') {
                var koTradeMethodEl = document.querySelector('input[name="ko-trade-method"]:checked');
                requestBody.trade_method = koTradeMethodEl ? koTradeMethodEl.value : 'CIF';

                var koCaseTypeEl = document.querySelector('input[name="ko-case-type"]:checked');
                if (koCaseTypeEl && koCaseTypeEl.value === 'KSD') {
                    requestBody.trade_method = 'EXW';
                }

                var koDestPortEl = document.getElementById('ko-dest-port');
                var koDestPortCustomEl = document.getElementById('ko-dest-port-custom');
                if (koDestPortEl && koDestPortEl.value === '__custom__') {
                    requestBody.dest_port = koDestPortCustomEl ? koDestPortCustomEl.value.trim() || '부산' : '부산';
                } else {
                    requestBody.dest_port = koDestPortEl ? koDestPortEl.value : '부산';
                }

                var koCheckedTypes = [];
                var koContainerParts = [];
                ['20gp', '40hq'].forEach(function (t) {
                    var cb = document.getElementById('ko-ct-' + t);
                    var qty = document.getElementById('ko-qty-' + t);
                    if (cb && cb.checked) {
                        var q = parseInt(qty ? qty.value : 1) || 1;
                        koCheckedTypes.push(cb.value);
                        koContainerParts.push(cb.value + '*' + q);
                    }
                });
                var koCtLclEl = document.getElementById('ko-ct-lcl');
                if (koCtLclEl && koCtLclEl.checked) {
                    koCheckedTypes.push('LCL');
                    koContainerParts.push('LCL');
                }
                requestBody.container_type = koContainerParts.length > 0 ? koContainerParts.join('+') : '40HQ*1';
                requestBody.container_qty = 1;

                var koCaseTypeEl = document.querySelector('input[name="ko-case-type"]:checked');
                requestBody.ko_case_type = koCaseTypeEl ? koCaseTypeEl.value : 'NORMAL';

                var koNeedTotalMaterialsEl = document.getElementById('ko-need-total-materials');
                if (koNeedTotalMaterialsEl && koNeedTotalMaterialsEl.checked) {
                    requestBody.need_total_materials = true;
                }

                var koSaleTypeEl = document.querySelector('input[name="ko-sale-type"]:checked');
                requestBody.sale_type = koSaleTypeEl ? koSaleTypeEl.value : 'export';

                var koDiscountRateEl = document.getElementById('ko-discount-rate');
                requestBody.ko_discount_rate = koDiscountRateEl ? parseFloat(koDiscountRateEl.value) || 96 : 96;

                var koSteelDiscountRateEl = document.getElementById('ko-steel-discount-rate');
                requestBody.ko_steel_discount_rate = koSteelDiscountRateEl ? parseFloat(koSteelDiscountRateEl.value) || 84 : 84;

                var koPurchasedDiscountRateEl = document.getElementById('ko-purchased-discount-rate');
                requestBody.ko_purchased_discount_rate = koPurchasedDiscountRateEl ? parseFloat(koPurchasedDiscountRateEl.value) || 94 : 94;

                if (!koCaseTypeEl || koCaseTypeEl.value !== 'KSD') {
                    var koTariffRateEl = document.getElementById('ko-tariff-rate');
                    requestBody.ko_tariff_rate = koTariffRateEl ? parseFloat(koTariffRateEl.value) || 1.6 : 1.6;

                    var koConsumptionTaxEl = document.getElementById('ko-consumption-tax');
                    requestBody.ko_consumption_tax = koConsumptionTaxEl ? parseFloat(koConsumptionTaxEl.value) || 10 : 10;

                    var koFreightEl = document.getElementById('ko-freight');
                    requestBody.ko_freight = koFreightEl ? parseFloat(koFreightEl.value) || 0 : 0;
                }

                var koCifFreightEl = document.getElementById('ko-cif-freight');
                requestBody.ko_cif_freight = koCifFreightEl ? parseFloat(koCifFreightEl.value) || 0 : 0;

                var koDdpAddressEl = document.getElementById('ko-ddp-address');
                requestBody.ko_ddp_address = koDdpAddressEl ? koDdpAddressEl.value.trim() : '';


            }

            if (caseType === 'EST') {
                if (confirmedEstFenceData) {
                    requestBody.fence_data = confirmedEstFenceData;
                }
            }

            if (state.matrixFileId) {
                requestBody.matrix_file_id = state.matrixFileId;
            }

            if (caseType === 'NV') {
                requestBody.case_type = 'NV';
                requestBody.nv_params = collectNvParams();
                if (confirmedNvFenceGateData) {
                    requestBody.nv_fence_gate_data = confirmedNvFenceGateData;
                }
            } else if (caseType === 'NORMAL') {
                requestBody.case_type = 'NORMAL';
                var normalMitsumoriEl = document.querySelector('input[name="normal-mitsumori-condition"]:checked');
                requestBody.normal_params = {
                    discount_rate: parseFloat((document.getElementById('normal-discount-rate') || {}).value) || 71,
                    steel_pack: (document.getElementById('normal-steel-pack') || {}).value || 'jybz',
                    consumption_tax: parseFloat((document.getElementById('normal-consumption-tax') || {}).value) || 10,
                    tariff_rate: parseFloat((document.getElementById('normal-tariff-rate') || {}).value) || 3,
                    fence_discount_rate: parseFloat((document.getElementById('normal-fence-discount-rate') || {}).value) || 94,
                    shipping_fee: parseFloat((document.getElementById('normal-shipping-fee') || {}).value) || 0,
                    trade_condition: (document.getElementById('normal-trade-condition') || {}).value || '取引基本契約書に基づく',
                    mitsumori_condition: normalMitsumoriEl ? normalMitsumoriEl.value : 'CIF',
                    pile_spare_count: parseFloat((document.getElementById('nv-pile-spare-count') || {}).value) || 0,
                    pile_spare_price: parseFloat((document.getElementById('nv-pile-spare-price') || {}).value) || 0,
                    post_spare_count: parseFloat((document.getElementById('nv-post-spare-count') || {}).value) || 0,
                    post_spare_price: parseFloat((document.getElementById('nv-post-spare-price') || {}).value) || 0,
                    sales_name: _selectedJaContact.name_ja || '',
                    sales_phone: _selectedJaContact.mob || '',
                    sales_tel: _selectedJaContact.tel || '',
                    sales_fax: _selectedJaContact.fax || '-',
                    remove_weight: !!(document.getElementById('normal-remove-weight') || {}).checked
                };
                if (confirmedNvFenceGateData) {
                    requestBody.nv_fence_gate_data = confirmedNvFenceGateData;
                }
            } else {
                requestBody.case_type = 'EST';
                var jaSteelDiscountRateEl = document.getElementById('ja-steel-discount-rate');
                requestBody.steel_discount_rate = jaSteelDiscountRateEl ? parseFloat(jaSteelDiscountRateEl.value) || 84 : 84;
                var jaPurchasedDiscountRateEl = document.getElementById('ja-purchased-discount-rate');
                requestBody.purchased_discount_rate = jaPurchasedDiscountRateEl ? parseFloat(jaPurchasedDiscountRateEl.value) || 94 : 94;
                var jaSteelPackEl = document.getElementById('ja-steel-pack');
                requestBody.steel_pack = jaSteelPackEl ? jaSteelPackEl.value || 'jybz' : 'jybz';
            }

            if (currentGroup === '英语组') {
                var enDiscountRateEl = document.getElementById('en-discount-rate');
                requestBody.ko_discount_rate = enDiscountRateEl ? parseFloat(enDiscountRateEl.value) || 100 : 100;

                var enSteelDiscountRateEl = document.getElementById('en-steel-discount-rate');
                requestBody.ko_steel_discount_rate = enSteelDiscountRateEl ? parseFloat(enSteelDiscountRateEl.value) || 84 : 84;

                var enPurchasedDiscountRateEl = document.getElementById('en-purchased-discount-rate');
                requestBody.ko_purchased_discount_rate = enPurchasedDiscountRateEl ? parseFloat(enPurchasedDiscountRateEl.value) || 94 : 94;

                var enDeleteOptions = {};
                var enExcludeOptions = {};
                var enMatBtnGroups = containerEl ? containerEl.querySelectorAll('.en-mat-btns') : [];
                enMatBtnGroups.forEach(function (group) {
                    var matGroup = group.getAttribute('data-mat-group');
                    var enKey = matGroup.replace('en_', '');
                    var activeBtn = group.querySelector('button.active-blue, button.active-red, button.active-green');
                    if (activeBtn && matGroup) {
                        var action = activeBtn.getAttribute('data-action');
                        if (action === 'delete') enDeleteOptions[enKey] = true;
                        else if (action === 'exclude') enExcludeOptions[enKey] = true;
                        else if (action === 'include') enExcludeOptions[enKey] = false;
                    }
                });
                if (Object.keys(enDeleteOptions).length > 0) {
                    requestBody.delete_options = enDeleteOptions;
                }
                requestBody.ko_exclude_options = enExcludeOptions;

                var enTradeMethodEl = document.querySelector('input[name="en-trade-method"]:checked');
                var enTradeMethod = enTradeMethodEl ? enTradeMethodEl.value : 'EXW';
                requestBody.trade_method = enTradeMethod;

                var enNeedShipping = ['FOB', 'CIF', 'DDU', 'DDP', 'FCA'].indexOf(enTradeMethod) >= 0;
                if (enNeedShipping) {
                    var enDestPortEl;
                    var enCustomPortEl;
                    if (['CIF', 'DDU', 'DDP'].indexOf(enTradeMethod) >= 0) {
                        enDestPortEl = document.getElementById('en-cif-dest-port');
                        enCustomPortEl = document.getElementById('en-cif-dest-port-custom');
                    } else {
                        enDestPortEl = document.getElementById('en-dest-port');
                        enCustomPortEl = document.getElementById('en-dest-port-custom');
                    }
                    var enPortVal = enDestPortEl ? enDestPortEl.value : 'XIAMEN';
                    if (enPortVal === '__custom__' && enCustomPortEl && enCustomPortEl.value.trim()) {
                        requestBody.dest_port = enCustomPortEl.value.trim();
                    } else {
                        requestBody.dest_port = enPortVal === '__custom__' ? 'XIAMEN' : enPortVal;
                    }

                    var enContainerParts = [];
                    var enTotalFreight = 0;
                    var enContainerDetails = [];
                    ['20gp', '40hq', 'lcl'].forEach(function (t) {
                        var cb = document.getElementById('en-ct-' + t);
                        var qty = document.getElementById('en-qty-' + t);
                        var freight = document.getElementById('en-freight-' + t);
                        if (cb && cb.checked) {
                            var q = parseInt(qty ? qty.value : 1) || 1;
                            enContainerParts.push(cb.value + '*' + q);
                            var f = parseFloat(freight ? freight.value : 0) || 0;
                            enTotalFreight += f * q;
                            enContainerDetails.push({
                                type: cb.value.toUpperCase(),
                                qty: q,
                                freight_per_unit: f,
                                amount: f * q,
                            });
                        }
                    });
                    requestBody.container_type = enContainerParts.length > 0 ? enContainerParts.join('+') : '40HQ*1';
                    requestBody.ko_cif_freight = enTotalFreight;
                    requestBody.container_details = enContainerDetails;
                } else {
                    requestBody.container_type = '';
                    requestBody.ko_cif_freight = 0;
                }

                requestBody.ko_ddp_address = '';

                var enCaseTypeEl = document.querySelector('input[name="en-case-type"]:checked');
                requestBody.en_case_type = enCaseTypeEl ? enCaseTypeEl.value : 'SIMPLE';

                var enLangEl = document.querySelector('input[name="en-lang"]:checked');
                requestBody.en_lang = enLangEl ? enLangEl.value : 'en';

                var enSaleTypeEl = document.querySelector('input[name="en-sale-type"]:checked');
                requestBody.sale_type = enSaleTypeEl ? enSaleTypeEl.value : 'export';

                var enValidityEl = document.getElementById('en-quote-validity');
                var enValidityCustomEl = document.getElementById('en-quote-validity-custom');
                if (enValidityEl && enValidityEl.value === 'custom' && enValidityCustomEl && enValidityCustomEl.value) {
                    requestBody.quote_validity = enValidityCustomEl.value + 'd';
                } else {
                    requestBody.quote_validity = enValidityEl ? enValidityEl.value : '7d';
                }

                var enDiscountMethodEl = document.querySelector('input[name="en-discount-method"]:checked');
                requestBody.discount_method = enDiscountMethodEl ? enDiscountMethodEl.value : 'project';

                var enPaymentTermEl = document.querySelector('input[name="en-payment-term"]:checked');
                requestBody.payment_term = enPaymentTermEl ? enPaymentTermEl.value : '3070shipment';

                var enSellerEl = document.querySelector('input[name="en-seller"]:checked');
                requestBody.seller_name = enSellerEl ? enSellerEl.value : 'metal';

                var enNeedTotalMaterialsEl = document.getElementById('en-need-total-materials');
                if (enNeedTotalMaterialsEl && enNeedTotalMaterialsEl.checked) {
                    requestBody.need_total_materials = true;
                }
            }

            if (currentGroup === '亚太组') {
                var apCaseTypeEl = document.querySelector('input[name="ap-case-type"]:checked');
                requestBody.ap_case_type = apCaseTypeEl ? apCaseTypeEl.value : 'ROOF';

                var apTradeMethodEl = document.querySelector('input[name="ap-trade-method"]:checked');
                requestBody.trade_method = apTradeMethodEl ? apTradeMethodEl.value : 'EXW';

                var apNeedFreight = ['FOB', 'CIF'].indexOf(requestBody.trade_method) >= 0;
                if (apNeedFreight) {
                    var apContainers = [];
                    [['20GP', 'ap-ct-20gp', 'ap-qty-20gp', 'ap-freight-20gp'],
                     ['40HQ', 'ap-ct-40hq', 'ap-qty-40hq', 'ap-freight-40hq']].forEach(function (cfg) {
                        var cbEl = document.getElementById(cfg[1]);
                        if (!cbEl || !cbEl.checked) return;
                        var qtyEl = document.getElementById(cfg[2]);
                        var frEl = document.getElementById(cfg[3]);
                        var qty = qtyEl ? (parseInt(qtyEl.value, 10) || 0) : 0;
                        var fr = frEl ? (parseFloat(frEl.value) || 0) : 0;
                        if (qty > 0) {
                            apContainers.push({ type: cfg[0], qty: qty, freight_per_unit: fr });
                        }
                    });
                    requestBody.container_details = apContainers;
                    requestBody.ap_freight = apContainers.reduce(function (s, c) {
                        return s + c.qty * c.freight_per_unit;
                    }, 0);
                } else {
                    requestBody.ap_freight = 0;
                }
                var apPortEl = document.getElementById('ap-port');
                requestBody.dest_port = apPortEl ? apPortEl.value : 'XIAMEN';

                var apDiscountRateEl = document.getElementById('ap-discount-rate');
                requestBody.ap_discount_rate = apDiscountRateEl ? parseFloat(apDiscountRateEl.value) || 100 : 100;

                var apSteelDiscountRateEl = document.getElementById('ap-steel-discount-rate');
                requestBody.ap_steel_discount_rate = apSteelDiscountRateEl ? parseFloat(apSteelDiscountRateEl.value) || 100 : 100;

                var apPurchasedDiscountRateEl = document.getElementById('ap-purchased-discount-rate');
                requestBody.ap_purchased_discount_rate = apPurchasedDiscountRateEl ? parseFloat(apPurchasedDiscountRateEl.value) || 100 : 100;
            }


            // 碳钢包装（简易包装/铁托）：按当前语言组的选择决定碳钢单价取哪套吨价
            var _steelPackIdMap = { '韩语组': 'ko-steel-pack', '日语组': 'nv-steel-pack', '英语组': 'en-steel-pack', '亚太组': 'ap-steel-pack' };
            var _steelPackId = _steelPackIdMap[currentGroup];
            var _steelPackEl = _steelPackId ? document.getElementById(_steelPackId) : null;
            requestBody.steel_pack = _steelPackEl ? _steelPackEl.value : 'jybz';

            var response = await fetch(KS_API_BASE_URL + '/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            var data = await readApiJson(response);
            if (!data.success) {
                showStatus('生成失败: ' + data.message, 'error');
                return;
            }

            state.outputFileId = data.output_file_id;
            state.inquiryFileId = data.inquiry_file_id || null;
            state.inquiryFilename = data.inquiry_filename || null;
            state.projectName = (data.matrix_data && data.matrix_data.project_name) || '';
            state.bomOriginalFilename = state.bomFile ? state.bomFile.name : '';

            var analysisData = data.analysis || {};
            var inquiryFromResult = (data.unmatched_products || []).filter(function (p) {
                var code = (p.code || '').toString().trim();
                if (!code) return false;
                if (/[a-zA-Z]/.test(code) && /\d/.test(code)) return true;
                return false;
            });
            state.unmatchedProducts = inquiryFromResult;

            var imageCount = data.image_source && typeof data.image_source.image_count === 'number'
                ? data.image_source.image_count
                : 0;
            showStatus(
                '报表已生成：' + data.statistics.sheet_count + ' 个工作表，数据库图片已写入 ' + imageCount + ' 张。',
                'success'
            );

            var arrayMatchedDetails = data.array_matched_details || [];
            var arrayUnmatchedInfo = data.array_unmatched_info || [];

            if (arrayMatchedDetails.length > 0 || arrayUnmatchedInfo.length > 0) {
                var matchHtml = '<div style="margin-top:8px;padding:8px;background:#e9ecef;border:1px solid #adb5bd;border-radius:4px;">'
                    + '<strong>信息表阵列匹配结果</strong>';

                matchHtml += '<table style="width:100%;margin-top:6px;border-collapse:collapse;font-size:12px;">'
                    + '<tr style="background:#c3e6cb;">'
                    + '<th style="padding:3px 6px;border:1px solid #999;">信息表(阵列_基)</th>'
                    + '<th style="padding:3px 6px;border:1px solid #999;">信息表缺板</th>'
                    + '<th style="padding:3px 6px;border:1px solid #999;">BOM表(阵列_基)</th>'
                    + '<th style="padding:3px 6px;border:1px solid #999;">BOM基数</th>'
                    + '<th style="padding:3px 6px;border:1px solid #999;">BOM缺板</th>'
                    + '<th style="padding:3px 6px;border:1px solid #999;">BOM角度</th>'
                    + '<th style="padding:3px 6px;border:1px solid #999;">状态</th>'
                    + '</tr>';

                for (var ri = 0; ri < arrayMatchedDetails.length; ri++) {
                    var r = arrayMatchedDetails[ri];
                    var isDirect = r.status === '直接匹配成功';
                    var isIndirect = r.status && r.status.indexOf('间接匹配') >= 0;
                    var bg = isDirect ? '' : ' style="background:#fff3cd;"';
                    var statusIcon = isDirect ? '✅' : '⚠️';
                    matchHtml += '<tr' + bg + '>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + escapeHtml(r.info_label || '') + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + (r.info_missing || 0) + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + escapeHtml(r.bom_label || '') + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + (r.bom_base || 0) + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + (r.bom_missing || 0) + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + escapeHtml(r.bom_angle || '') + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + statusIcon + ' ' + escapeHtml(r.status || '') + '</td>'
                        + '</tr>';
                }

                for (var ui = 0; ui < arrayUnmatchedInfo.length; ui++) {
                    var u = arrayUnmatchedInfo[ui];
                    matchHtml += '<tr style="background:#f8d7da;">'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + escapeHtml(u.info_label || '') + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">' + (u.info_missing || 0) + '</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;color:#dc3545;">-</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">-</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">-</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;">-</td>'
                        + '<td style="padding:3px 6px;border:1px solid #999;color:#dc3545;font-weight:bold;">❌ ' + escapeHtml(u.status || '无法匹配') + '</td>'
                        + '</tr>';
                }

                matchHtml += '</table></div>';
                var statusBox = elements.statusBox;
                if (statusBox) statusBox.insertAdjacentHTML('afterend', matchHtml);
            }

            addDownloadButton(data.output_filename, data.output_dir, data.output_path);
            setInquiryDownloadButtons(state.inquiryFileId, state.inquiryFilename);
            renderInquiryList(state.unmatchedProducts);

            var genMissingImg = data.missing_image_codes || [];
            var genMissingItems = data.missing_image_items || [];
            if (genMissingImg.length > 0) {
                state.missingImageCodes = genMissingImg;
            }
            if (genMissingItems.length > 0) {
                state.missingImageItems = genMissingItems;
            }
            updateMissingImageBtn();

            var tempAutoMatched = data.temp_auto_matched || [];
            state.tempAutoMatched = tempAutoMatched;

            var tempPricingMatched = data.temp_pricing_matched || [];
            state.tempPricingMatched = tempPricingMatched;
            renderTempPricingPanel(tempPricingMatched);

            renderTempCodePanels(tempAutoMatched);
        } catch (error) {
            console.error('生成失败:', error);
            showStatus('生成失败: ' + error.message, 'error');
        } finally {
            stopGenerateStatus();
        }
    }

    function displayUnmatchedCodes(codes) {
        updateMissingImageBtn();
    }

    function updateMissingImageBtn() {
        if (elements.downloadMissingImageBtn) {
            var missingImgCodes = state.missingImageCodes || [];
            if (missingImgCodes.length > 0) {
                elements.downloadMissingImageBtn.style.display = '';
                elements.downloadMissingImageBtn.textContent = '存入询图列表（' + missingImgCodes.length + ' 个编码）';
                elements.downloadMissingImageBtn.onclick = function () {
                    saveImageInquiryItems(missingImgCodes);
                };
            } else {
                elements.downloadMissingImageBtn.style.display = 'none';
                elements.downloadMissingImageBtn.onclick = null;
            }
        }
        updateInquiryRemarkVisibility();
    }

    function updateInquiryRemarkVisibility() {
        var hasUnmatched = !!(state.unmatchedProducts && state.unmatchedProducts.length);
        var hasMissingImage = !!(state.missingImageCodes && state.missingImageCodes.length);
        var show = hasUnmatched || hasMissingImage;
        if (elements.inquiryRemarkWrap) {
            elements.inquiryRemarkWrap.style.display = show ? 'block' : 'none';
        }
        if (elements.priceInquiryRemarkWrap) {
            elements.priceInquiryRemarkWrap.style.display = show ? 'block' : 'none';
        }
    }

    function saveImageInquiryItems(codes) {
        var btn = elements.downloadMissingImageBtn;
        var originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '存入中...';
        }

        var items = state.missingImageItems && state.missingImageItems.length > 0
            ? state.missingImageItems
            : codes.map(function (c) { return { code: c, name: '' }; });

        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '';

        fetch(KS_API_BASE_URL + '/save-image-inquiry-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codes: codes,
                items: items,
                source_group: currentGroup,
            })
        })
        .then(function (response) { return readApiJson(response); })
        .then(function (data) {
            if (data.success) {
                showStatus('已存入询图列表: ' + (data.message || '') + '，周一统一发送', 'success');
            } else {
                showStatus('存入失败: ' + (data.message || '未知错误'), 'error');
            }
        })
        .catch(function (error) {
            showStatus('存入失败: ' + error.message, 'error');
        })
        .finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText || '存入询图列表';
            }
        });
    }

    function resetReportState() {
        state.outputFileId = null;
        state.inquiryFileId = null;
        state.inquiryFilename = null;
        state.unmatchedProducts = [];
        state.projectName = '';
        state.bomOriginalFilename = '';
        state.missingImageItems = [];
        state.missingImageCodes = [];
        updateInquiryRemarkVisibility();

        renderInquiryList([]);
        renderTempPricingPanel([]);
        renderTempCodePanels([], []);

        var areas = [elements.reportArea, elements.priceReportArea];
        areas.forEach(function (area) {
            if (area) {
                area.style.display = 'none';
            }
        });

        var infoEls = [elements.reportInfo, elements.priceReportInfo];
        infoEls.forEach(function (infoEl) {
            if (infoEl) {
                infoEl.textContent = '';
                infoEl.style.display = 'none';
            }
        });

        var reportButtons = [
            elements.downloadReportButton,
            elements.priceDownloadReportButton
        ];
        reportButtons.forEach(function (button) {
            if (button) {
                button.onclick = null;
            }
        });

        setInquiryDownloadButtons(null, null);
    }

    function showStatus(message, type) {
        type = type || 'info';
        var statusBox = elements.statusBox;

        if (!statusBox) {
            console.error('Status box element not found');
            return;
        }

        statusBox.textContent = message;
        statusBox.style.display = message ? 'block' : 'none';

        statusBox.classList.remove('success', 'error', 'warning', 'info');
        statusBox.classList.add(type);

        switch (type) {
            case 'success':
                statusBox.style.background = '#dcfce7';
                statusBox.style.color = '#166534';
                break;
            case 'error':
                statusBox.style.background = '#fee2e2';
                statusBox.style.color = '#991b1b';
                break;
            case 'warning':
                statusBox.style.background = '#fff7ed';
                statusBox.style.color = '#9a3412';
                break;
            default:
                statusBox.style.background = '#eff6ff';
                statusBox.style.color = '#1e40af';
        }
    }

    function addDownloadButton(filename, outputDir, outputPath) {
        var oldButton = document.querySelector('#upload .download-btn');
        if (oldButton) {
            oldButton.remove();
        }

        var bindDownload = function (area, infoEl, buttonEl) {
            if (area) {
                area.style.display = 'block';
            }
            if (infoEl) {
                infoEl.textContent = '';
                infoEl.style.display = 'none';
            }
            if (buttonEl) {
                buttonEl.onclick = function () {
                    downloadFile(state.outputFileId, filename);
                };
            }
        };

        bindDownload(elements.reportArea, elements.reportInfo, elements.downloadReportButton);
        bindDownload(elements.priceReportArea, elements.priceReportInfo, elements.priceDownloadReportButton);
        bindDownload(elements.manualReportArea, elements.manualReportInfo, elements.manualDownloadReportButton);
    }

    function setInquiryDownloadButtons(fileId, filename) {
        var buttons = [
            elements.inquiryDownloadReportButton,
            elements.priceInquiryDownloadReportButton
        ];
        var submitButtons = [
            elements.inquirySubmitButton,
            elements.priceInquirySubmitButton
        ];

        var hasUnmatched = !!(state.unmatchedProducts && state.unmatchedProducts.length);

        // 没有询价项、或没有生成的询价文件时，两个按钮都隐藏
        if (!hasUnmatched || !fileId || !filename) {
            state.inquiryFileId = null;
            state.inquiryFilename = null;

            buttons.forEach(function (button) {
                if (button) {
                    button.style.display = 'none';
                    button.onclick = null;
                }
            });
            submitButtons.forEach(function (button) {
                if (button) {
                    button.style.display = 'none';
                    button.onclick = null;
                }
            });

            return;
        }

        state.inquiryFileId = fileId;
        state.inquiryFilename = filename;

        buttons.forEach(function (button) {
            if (button) {
                button.style.display = '';
                button.onclick = function () {
                    downloadFile(fileId, filename);
                };
            }
        });

        submitButtons.forEach(function (button) {
            if (button) {
                button.style.display = '';
                button.onclick = function () {
                    sendInquiryEmail(fileId, filename);
                };
            }
        });
    }

    function sendInquiryEmail(fileId, filename) {
        if (!state.unmatchedProducts || state.unmatchedProducts.length === 0) {
            showStatus('没有待询价的物料', 'error');
            return;
        }

        var btn = elements.inquirySubmitButton || elements.priceInquirySubmitButton;
        var originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '提交中...';
        }

        var remarkInput = elements.inquiryRemarkInput || elements.priceInquiryRemarkInput;
        var remark = remarkInput ? remarkInput.value.trim() : '';

        var materials = state.unmatchedProducts.map(function (p) {
            return {
                code: p.code || '',
                name: p.name || '',
                spec: p.spec || '',
                quantity: p.quantity || 0,
                unit: p.unit || '',
                weight: p.weight || 0,
            };
        });

        var formData = new FormData();
        formData.append('data', JSON.stringify({
            inquiry_file_id: fileId,
            project_name: state.projectName || '',
            bom_filename: state.bomOriginalFilename || '',
            inquiry_requester: state.selectedInquiryRequester || '',
            unmatched_products: materials,
            remark: remark,
        }));

        var attachmentInput = elements.inquiryAttachmentInput || elements.priceInquiryAttachmentInput;
        if (attachmentInput && attachmentInput.files && attachmentInput.files.length > 0) {
            for (var i = 0; i < attachmentInput.files.length; i++) {
                formData.append('attachments', attachmentInput.files[i]);
            }
        }

        fetch(KS_API_BASE_URL + '/send-inquiry', {
            method: 'POST',
            body: formData
        })
        .then(function (response) { return readApiJson(response); })
        .then(function (data) {
            if (data.success) {
                showStatus('询价项已提交到询价价格查询页面: ' + (data.message || ''), 'success');
                renderInquiryConfirmList(materials, data.record_id);
            } else {
                showStatus('发送失败: ' + (data.message || '未知错误'), 'error');
            }
        })
        .catch(function (error) {
            showStatus('发送失败: ' + error.message, 'error');
        })
        .finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText || '提交询价项到询价价格查询';
            }
        });
    }

    function renderInquiryConfirmList(materials, recordId) {
        var container = elements.inquiryListContainer;
        if (!container) return;

        if (!materials || materials.length === 0) {
            return;
        }

        container.style.display = 'block';

        var html = '<div style="background:#f0fdf4; border:2px solid #22c55e; border-radius:8px; padding:12px;">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
            + '<strong style="font-size:14px;color:#166534;">✅ 询价项已提交到「询价价格查询」页面，请前往填写价格（' + materials.length + ' 项）</strong>'
            + (recordId ? '<span style="font-size:11px;color:#6b7280;">记录ID: ' + recordId + '</span>' : '')
            + '</div>'
            + '<div style="max-height:400px;overflow-y:auto;border-radius:6px;">'
            + '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;">'
            + '<thead><tr style="background:#dcfce7;position:sticky;top:0;z-index:1;">'
            + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:center;width:36px;">#</th>'
            + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;min-width:90px;">产品编码</th>'
            + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;">产品名称</th>'
            + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;min-width:100px;">规格</th>'
            + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;min-width:60px;">预装情况</th>'
            + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:right;">数量</th>'
            + '</tr></thead><tbody>';

        for (var i = 0; i < materials.length; i++) {
            var p = materials[i];
            var bg = i % 2 === 0 ? '#ffffff' : '#f0fdf4';
            var _pre = p.preinstall || '预装';
            var _preBg = _pre === '非预装' ? '#fef2f2' : '#f0fdf4';
            var _preColor = _pre === '非预装' ? '#dc2626' : '#15803d';
            html += '<tr style="background:' + bg + ';">'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;color:#166534;">' + (i + 1) + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600;color:#1e40af;">' + escapeHtml(p.code || '') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;">' + escapeHtml(p.name || '') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(p.spec || '') + '">' + escapeHtml(p.spec || '') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:' + _preBg + ';color:' + _preColor + ';">' + escapeHtml(_pre) + '</span></td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">' + (p.quantity || '') + '</td>'
                + '</tr>';
        }

        html += '</tbody></table></div></div>';
        container.innerHTML = html;

        try {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}
    }

    function renderTempPricingPanel(pricingMatched) {
        var container = document.getElementById('temp-pricing-container');
        if (!container) return;

        if (!pricingMatched || pricingMatched.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'block';

        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '';
        var showPre = (currentGroup === '日语组' || currentGroup === '韩语组');

        var html = '<div style="background:#eff6ff; border:2px solid #3b82f6; border-radius:8px; padding:12px;">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
            + '<strong style="font-size:14px;color:#1e40af;">临时数据统计情况（' + pricingMatched.length + ' 项）</strong>'
            + '</div>'
            + '<div style="max-height:360px;overflow-y:auto;border-radius:6px;">'
            + '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;">'
            + '<thead><tr style="background:#dbeafe;position:sticky;top:0;z-index:1;">'
            + '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:center;width:36px;">序号</th>'
            + '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:left;min-width:90px;">编码</th>'
            + '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:left;min-width:80px;">规格长度</th>';
        if (showPre) {
            html += '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:left;min-width:60px;">预装情况</th>';
        }
        html += '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:right;min-width:90px;">总重量(吨)</th>'
            + '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:right;min-width:90px;">单价</th>';
        if (showPre) {
            html += '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:right;min-width:100px;">预装情况对应金额</th>';
        }
        html += '<th style="padding:6px 8px;border:1px solid #93c5fd;text-align:left;min-width:160px;">使用价格说明</th>'
            + '</tr></thead><tbody>';

        for (var i = 0; i < pricingMatched.length; i++) {
            var item = pricingMatched[i];
            var sideLabel = item.side === 'external' ? '外部' : '内部';
            var priceDesc = item.length_tier + '米|' + item.ton_tier + '吨——' + sideLabel;
            var bg = i % 2 === 0 ? '#ffffff' : '#eff6ff';
            var _tpi = item.preinstall || '预装';
            var _tpiBg = _tpi === '非预装' ? '#fef2f2' : '#f0fdf4';
            var _tpiColor = _tpi === '非预装' ? '#dc2626' : '#15803d';
            html += '<tr style="background:' + bg + ';">'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;color:#1e40af;">' + (i + 1) + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600;color:#1e40af;">' + escapeHtml(item.code || '') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;">' + escapeHtml(item.spec || '') + '</td>';
            if (showPre) {
                html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:' + _tpiBg + ';color:' + _tpiColor + ';">' + escapeHtml(_tpi) + '</span></td>';
            }
            html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;">' + (item.total_weight_ton != null ? item.total_weight_ton : '-') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1e40af;">' + (item.price != null ? item.price : '-') + '</td>';
            if (showPre) {
                html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1d4ed8;">' + (item.adjusted_price != null ? item.adjusted_price : '-') + '</td>';
            }
            html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;">'
                + '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:#dbeafe;color:#1e40af;">' + escapeHtml(priceDesc) + '</span>'
                + '</td>'
                + '</tr>';
        }

        html += '</tbody></table></div></div>';
        container.innerHTML = html;

        try {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}
    }

    function renderTempCodePanels(autoMatched) {
        var container = document.getElementById('temp-code-container');
        if (!container) return;

        if (!autoMatched || autoMatched.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'block';
        var html = '';

        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '';
        var showPre = (currentGroup === '日语组' || currentGroup === '韩语组');

        if (autoMatched && autoMatched.length > 0) {
            html += '<div style="background:#f0fdf4; border:2px solid #22c55e; border-radius:8px; padding:12px; margin-bottom:12px;">'
                + '<strong style="font-size:14px;color:#166534;">临时询价库自动匹配（' + autoMatched.length + ' 项，编码+规格+数量完全一致）</strong>'
                + '<div style="max-height:300px;overflow-y:auto;margin-top:8px;border-radius:6px;">'
                + '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;">'
                + '<thead><tr style="background:#dcfce7;position:sticky;top:0;z-index:1;">'
                + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:center;width:36px;">#</th>'
                + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;">产品编码</th>'
                + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;">规格</th>';
            if (showPre) {
                html += '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;">预装情况</th>';
            }
            html += '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:right;">数量</th>'
                + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:right;">匹配价格</th>';
            if (showPre) {
                html += '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:right;">预装情况对应金额</th>';
            }
            html += '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;">单位</th>'
                + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;">来源</th>'
                + '<th style="padding:6px 8px;border:1px solid #bbf7d0;text-align:left;">来源日期</th>'
                + '</tr></thead><tbody>';

            for (var i = 0; i < autoMatched.length; i++) {
                var item = autoMatched[i];
                var bg = i % 2 === 0 ? '#ffffff' : '#f0fdf4';
                var _tpi = item.preinstall || '预装';
                var _tpiBg = _tpi === '非预装' ? '#fef2f2' : '#f0fdf4';
                var _tpiColor = _tpi === '非预装' ? '#dc2626' : '#15803d';
                html += '<tr style="background:' + bg + ';">'
                    + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;color:#166534;">' + (i + 1) + '</td>'
                    + '<td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600;color:#1e40af;">' + escapeHtml(item.code || '') + '</td>'
                    + '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;">' + escapeHtml(item.spec || '') + '</td>';
                if (showPre) {
                    html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:' + _tpiBg + ';color:' + _tpiColor + ';">' + escapeHtml(_tpi) + '</span></td>';
                }
                html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;">' + (item.quantity || '') + '</td>'
                    + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;color:#166534;">' + (item.price != null ? item.price : '-') + '</td>';
                if (showPre) {
                    html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1d4ed8;">' + (item.adjusted_price != null ? item.adjusted_price : '-') + '</td>';
                }
                html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;">' + escapeHtml(item.unit || '') + '</td>'
                    + '<td style="padding:5px 8px;border:1px solid #e5e7eb;"><span style="background:#dcfce7;color:#166534;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;">临时库</span></td>'
                    + '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;">' + escapeHtml(item.source_date || '') + '</td>'
                    + '</tr>';
            }
            html += '</tbody></table></div></div>';
        }

        container.innerHTML = html;

        try {
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}
    }


    function handleGenerateResponse(data, stopStatusFn) {
        try {
            if (!data.success) {
                showStatus('生成失败: ' + data.message, 'error');
                return;
            }

            state.outputFileId = data.output_file_id;
            state.inquiryFileId = data.inquiry_file_id || null;
            state.inquiryFilename = data.inquiry_filename || null;
            state.projectName = (data.matrix_data && data.matrix_data.project_name) || '';
            state.bomOriginalFilename = state.bomFile ? state.bomFile.name : '';

            var analysisData = data.analysis || {};
            var inquiryFromResult = (data.unmatched_products || []).filter(function (p) {
                var code = (p.code || '').toString().trim();
                if (!code) return false;
                if (/[a-zA-Z]/.test(code) && /\d/.test(code)) return true;
                return false;
            });
            state.unmatchedProducts = inquiryFromResult;

            var imageCount = data.image_source && typeof data.image_source.image_count === 'number'
                ? data.image_source.image_count
                : 0;
            showStatus(
                '报表已生成：' + data.statistics.sheet_count + ' 个工作表，数据库图片已写入 ' + imageCount + ' 张。',
                'success'
            );

            addDownloadButton(data.output_filename, data.output_dir, data.output_path);
            setInquiryDownloadButtons(state.inquiryFileId, state.inquiryFilename);
            renderInquiryList(state.unmatchedProducts);

            var genMissingImg = data.missing_image_codes || [];
            var genMissingItems = data.missing_image_items || [];
            if (genMissingImg.length > 0) state.missingImageCodes = genMissingImg;
            if (genMissingItems.length > 0) state.missingImageItems = genMissingItems;
            updateMissingImageBtn();

            var tempAuto = data.temp_auto_matched || [];
            state.tempAutoMatched = tempAuto;

            var tempPricing = data.temp_pricing_matched || [];
            state.tempPricingMatched = tempPricing;
            renderTempPricingPanel(tempPricing);

            renderTempCodePanels(tempAuto);
        } catch (error) {
            console.error('处理响应失败:', error);
            showStatus('处理响应失败: ' + error.message, 'error');
        } finally {
            if (stopStatusFn) stopStatusFn();
        }
    }

    function renderInquiryList(products) {
        var container = elements.inquiryListContainer;
        if (!container) return;

        if (!products || products.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'block';

        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '';
        var showPre = (currentGroup === '日语组' || currentGroup === '韩语组');

        var html = '<div style="background:#fffbeb; border:1px solid #fbbf24; border-radius:8px; padding:12px;">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
            + '<strong style="font-size:14px;color:#92400e;">待询价物料（' + products.length + ' 项）</strong>'
            + '</div>'
            + '<div style="max-height:360px;overflow-y:auto;border-radius:6px;">'
            + '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;">'
            + '<thead><tr style="background:#fef3c7;position:sticky;top:0;z-index:1;">'
            + '<th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;width:36px;">#</th>'
            + '<th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left;min-width:90px;">产品编码</th>'
            + '<th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left;">产品名称</th>'
            + '<th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left;min-width:100px;">规格</th>';
        if (showPre) {
            html += '<th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left;min-width:60px;">预装情况</th>';
        }
        html += '<th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;">数量</th>'
            + '<th style="padding:6px 8px;border:1px solid #e5e7eb;text-align:left;min-width:120px;">缺失原因</th>'
            + '</tr></thead><tbody>';

        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            var reason = p.issue_reason || '';
            var isPrice = reason.indexOf('价格') >= 0 || reason.indexOf('无匹配') >= 0;
            var tagColor = isPrice ? '#dc2626' : '#d97706';
            var tagBg = isPrice ? '#fef2f2' : '#fffbeb';
            var tagText = isPrice ? '缺价' : '缺图';
            var bg = i % 2 === 0 ? '#ffffff' : '#fffef5';
            var _preinstall = p.preinstall || '预装';
            var _preTagBg = _preinstall === '非预装' ? '#fef2f2' : '#f0fdf4';
            var _preTagColor = _preinstall === '非预装' ? '#dc2626' : '#15803d';
            html += '<tr style="background:' + bg + ';">'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;color:#92400e;">' + (i + 1) + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600;color:#1e40af;">' + escapeHtml(p.code || '') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;">' + escapeHtml(p.name || '') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(p.spec || '') + '">' + escapeHtml(p.spec || '') + '</td>';
            if (showPre) {
                html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;"><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:' + _preTagBg + ';color:' + _preTagColor + ';">' + escapeHtml(_preinstall) + '</span></td>';
            }
            html += '<td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">' + (p.quantity || '') + '</td>'
                + '<td style="padding:5px 8px;border:1px solid #e5e7eb;">'
                + '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;background:' + tagBg + ';color:' + tagColor + ';">' + tagText + '</span> '
                + '<span style="color:#6b7280;">' + escapeHtml(reason) + '</span>'
                + '</td>'
                + '</tr>';
        }

        html += '</tbody></table></div></div>';
        container.innerHTML = html;
    }

    function downloadFile(fileId, filename) {
        var url = KS_API_BASE_URL + '/download/' + fileId;
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('开始下载报价表', 'success');
    }

    function addDownloadStandardButton(standardFileId, originalFilename) {
        var oldButton = document.querySelector('#upload .download-standard-btn');
        if (oldButton) {
            oldButton.remove();
        }

        var downloadButton = document.createElement('button');
        downloadButton.className = 'btn download-standard-btn';
        downloadButton.textContent = '下载标准定价表';
        downloadButton.addEventListener('click', function () {
            downloadStandardFile(standardFileId, originalFilename);
        });

        var checkboxContainer = document.getElementById('set-global-price').parentElement;
        if (checkboxContainer) {
            checkboxContainer.appendChild(downloadButton);
        }
    }

    function downloadStandardFile(standardFileId, originalFilename) {
        var url = KS_API_BASE_URL + '/download-standard/' + standardFileId;
        var link = document.createElement('a');
        link.href = url;
        link.download = originalFilename.replace('.xlsx', '') + '_标准定价提取结果.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus('开始下载标准定价表...', 'success');
    }

    function updateMatrixFileStatus(message, type) {
        type = type || 'info';
        if (!elements.matrixFileStatus) {
            return;
        }

        if (!message) {
            elements.matrixFileStatus.style.display = 'none';
            elements.matrixFileStatus.textContent = '';
            return;
        }

        elements.matrixFileStatus.style.display = 'block';
        elements.matrixFileStatus.innerHTML = message;
        elements.matrixFileStatus.style.background = type === 'error' ? '#fee2e2' : '#ecfeff';
        elements.matrixFileStatus.style.color = type === 'error' ? '#991b1b' : '#155e75';
    }

    function updateImageFolderStatus(message) {
        if (!elements.imageFolderStatus) {
            return;
        }

        if (message) {
            elements.imageFolderStatus.style.display = 'block';
            elements.imageFolderStatus.textContent = message;
        } else {
            elements.imageFolderStatus.style.display = 'none';
            elements.imageFolderStatus.textContent = '';
        }
    }

    async function cleanupFiles() {
        var fileIds = [];

        if (state.bomFileId) fileIds.push(state.bomFileId);
        if (state.matrixFileId) fileIds.push(state.matrixFileId);

        if (fileIds.length === 0) {
            return;
        }

        try {
            await fetch(KS_API_BASE_URL + '/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_ids: fileIds })
            });
        } catch (error) {
            console.error('清理文件失败:', error);
        }
    }

    function startLongRunningStatus(baseMessage, type) {
        type = type || 'info';
        var startedAt = Date.now();
        showStatus(baseMessage, type);

        var timerId = window.setInterval(function () {
            var elapsedSeconds = Math.max(Math.floor((Date.now() - startedAt) / 1000), 1);
            showStatus(baseMessage + ' 已等待 ' + elapsedSeconds + ' 秒，后端仍在处理中...', type);
        }, 5000);

        return function () {
            window.clearInterval(timerId);
        };
    }

    function ensureBomTableSelectionPanel() {
        if (elements.bomTableSelectionPanel && elements.bomTableSelectionList && elements.bomTableSelectionSummary) {
            return elements.bomTableSelectionPanel;
        }

        var bomCard = getCardForElement(elements.bomFileButton);
        if (!bomCard) {
            return null;
        }

        var panel = document.createElement('div');
        panel.id = 'bom-table-selection-panel';
        panel.style.display = 'none';
        panel.style.marginTop = '0';
        panel.style.padding = '0';
        panel.style.overflow = 'hidden';
        panel.style.height = '0';
        panel.style.border = 'none';
        panel.innerHTML =
            '<div style="font-weight: 600; color: #0f172a;">选择需要生成的 BOM 表</div>' +
            '<div id="bom-table-selection-summary" class="muted" style="margin-top: 6px;"></div>' +
            '<div class="toolbar" style="margin-top: 10px; gap: 8px;">' +
            '<button type="button" class="btn" id="bom-table-select-all-btn">全选</button>' +
            '<button type="button" class="btn" id="bom-table-clear-btn">清空</button>' +
            '<button type="button" class="btn primary" id="bom-table-confirm-btn">确认生成</button>' +
            '</div>' +
            '<div id="bom-table-selection-list" style="margin-top: 10px; display: grid; gap: 8px;"></div>';

        var anchor = elements.bomUploadHint && elements.bomUploadHint.parentNode ? elements.bomUploadHint : null;
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(panel, anchor.nextSibling);
        } else {
            bomCard.appendChild(panel);
        }

        elements.bomTableSelectionPanel = panel;
        elements.bomTableSelectionSummary = panel.querySelector('#bom-table-selection-summary');
        elements.bomTableSelectionList = panel.querySelector('#bom-table-selection-list');
        elements.bomTableSelectAllButton = panel.querySelector('#bom-table-select-all-btn');
        elements.bomTableClearButton = panel.querySelector('#bom-table-clear-btn');

        elements.bomTableSelectionList.addEventListener('change', function (event) {
            if (event.target && event.target.matches('input[type="checkbox"][data-bom-key]')) {
                syncSelectedBomKeysFromDom();
            }
        });
        elements.bomTableSelectAllButton.addEventListener('click', function () {
            setAllBomTableSelection(true);
        });
        elements.bomTableClearButton.addEventListener('click', function () {
            setAllBomTableSelection(false);
        });
        elements.bomTableConfirmButton = panel.querySelector('#bom-table-confirm-btn');
        if (elements.bomTableConfirmButton) {
            elements.bomTableConfirmButton.addEventListener('click', function () {
                var selected = getSelectedBomKeys();
                if (Array.isArray(state.bomTables) && state.bomTables.length > 0 && selected.length === 0) {
                    showStatus('请至少勾选一个 BOM 表。', 'error');
                    return;
                }
                generateQuotation();
            });
        }

        return panel;
    }

    function syncSelectedBomKeysFromDom() {
        if (!elements.bomTableSelectionList) {
            return state.selectedBomKeys || [];
        }

        state.selectedBomKeys = Array.from(
            elements.bomTableSelectionList.querySelectorAll('input[type="checkbox"][data-bom-key]:checked')
        ).map(function (input) { return input.value; });

        updateBomTableSelectionSummary();
        return state.selectedBomKeys;
    }

    function updateBomTableSelectionSummary() {
        if (!elements.bomTableSelectionSummary) {
            return;
        }

        var matrixRows = (state.matrixInfo && state.matrixInfo.array_rows) || null;
        var matrixCols = (state.matrixInfo && state.matrixInfo.array_cols) || null;
        var allCount = 0;
        var allBomTables = Array.isArray(state.bomTables) ? state.bomTables : [];
        allCount = allBomTables.length;

        var displayedCount = elements.bomTableSelectionList
            ? elements.bomTableSelectionList.querySelectorAll('input[type="checkbox"][data-bom-key]').length
            : 0;
        var selectedCount = Array.isArray(state.selectedBomKeys) ? state.selectedBomKeys.length : 0;

        if (!allCount) {
            elements.bomTableSelectionSummary.textContent = '当前文件未识别到可匹配的 BOM 表。';
            return;
        }

        if (matrixRows !== null && matrixCols !== null && displayedCount < allCount) {
            var matrixArrays2 = (state.matrixInfo && state.matrixInfo.arrays) || [];
            var arrayDesc2 = matrixArrays2.length > 1
                ? matrixArrays2.map(function(a) { return a.rows + '×' + a.cols; }).join(', ')
                : matrixRows + '×' + matrixCols;
            elements.bomTableSelectionSummary.textContent =
                '已识别 ' + allCount + ' 个 BOM 表，当前选中 ' + selectedCount + ' 个。';
        } else {
            elements.bomTableSelectionSummary.textContent =
                '已识别 ' + allCount + ' 个 BOM 表，当前选中 ' + selectedCount + ' 个。';
        }
    }

    function setAllBomTableSelection(checked) {
        if (!elements.bomTableSelectionList) {
            return;
        }

        elements.bomTableSelectionList
            .querySelectorAll('input[type="checkbox"][data-bom-key]')
            .forEach(function (input) {
                input.checked = checked;
            });

        syncSelectedBomKeysFromDom();
    }

    function renderBomTableSelection() {
        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        if (currentGroup !== '亚太组') {
            return;
        }

        var panel = ensureBomTableSelectionPanel();
        if (!panel || !elements.bomTableSelectionList) {
            return;
        }

        var allBomTables = Array.isArray(state.bomTables) ? state.bomTables : [];
        if (!allBomTables.length) {
            panel.style.display = 'none';
            return;
        }

        var matrixRows = (state.matrixInfo && state.matrixInfo.array_rows) || null;
        var matrixCols = (state.matrixInfo && state.matrixInfo.array_cols) || null;
        var matrixArrays = (state.matrixInfo && state.matrixInfo.arrays) || [];

        var bomTables = allBomTables;
        if (matrixRows !== null && matrixCols !== null) {
            var allowedArrayTags;
            if (matrixArrays.length > 1) {
                allowedArrayTags = new Set(
                    matrixArrays.map(function (a) { return (a.rows + 'x' + a.cols).toLowerCase(); })
                );
            } else {
                allowedArrayTags = new Set([(matrixRows + 'x' + matrixCols).toLowerCase()]);
            }
            var filtered = allBomTables.filter(function (item) {
                var arr = (item.array || '').replace(/[×X*]/g, 'x').toLowerCase();
                return allowedArrayTags.has(arr);
            });
            if (filtered.length > 0) {
                bomTables = filtered;
            }
            state.selectedBomKeys = bomTables.map(function (item) { return item.key; });
        }

        var selectedKeySet = new Set(
            Array.isArray(state.selectedBomKeys) && state.selectedBomKeys.length
                ? state.selectedBomKeys
                : bomTables.map(function (item) { return item.key; })
        );

        elements.bomTableSelectionList.innerHTML = bomTables.map(function (item) {
            return '<label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #dbeafe; border-radius: 8px; background: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' +
                '<input type="checkbox" data-bom-key="' + escapeHtml(item.key) + '" value="' + escapeHtml(item.key) + '"' + (selectedKeySet.has(item.key) ? ' checked' : '') + ' style="flex-shrink: 0;" />' +
                '<span style="font-weight: 600; color: #0f172a; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(item.display_name) + '</span>' +
                '<span class="muted" style="flex-shrink: 0;">' + escapeHtml(item.sheet_name) + ' #' + escapeHtml(String(item.start_row)) + '</span>' +
                '</label>';
        }).join('');

        panel.style.display = 'block';
        panel.style.height = 'auto';
        panel.style.overflow = 'visible';
        panel.style.padding = '12px';
        panel.style.border = '1px solid #dbeafe';
        panel.style.borderRadius = '8px';
        panel.style.background = '#ffffff';
        panel.style.marginTop = '10px';
        syncSelectedBomKeysFromDom();
    }

    function initCaseTypeSwitcher() {
        var group = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';

        if (group === '英语组') {
            var enRadios = containerEl.querySelectorAll('input[name="en-case-type"]');
            var enSimpleOpts = document.getElementById('en-simple-options');
            function updateEnVisibility() {
                var selected = 'COMMON';
                enRadios.forEach(function(r) { if (r.checked) selected = r.value; });
                if (enSimpleOpts) enSimpleOpts.style.display = 'block';
            }
            enRadios.forEach(function(r) { r.addEventListener('change', updateEnVisibility); });
            updateEnVisibility();
            return;
        }

        var radios = containerEl.querySelectorAll('input[name="ja-case-type"]');
        var nvPanel = document.getElementById('nv-params-panel');
        var estPanel = document.getElementById('est-params-panel');
        var normalPanel = document.getElementById('normal-params-panel');

        if (group === '韩语组') {
            switchFenceMode('standard');
            return;
        }

        if (group !== '日语组') {
            return;
        }

        function updateNvTradeVisibility() {
            var tradeEl = document.querySelector('input[name="nv-trade-method"]:checked');
            var val = tradeEl ? tradeEl.value : 'CIF';
            var showCif = (val === 'CIF' || val === 'CIF_DDP' || val === 'NV');
            var showDdp = (val === 'DDP' || val === 'CIF_DDP' || val === 'NV');
            var cifSection = document.getElementById('nv-cif-section');
            var ddpSection = document.getElementById('nv-ddp-section');
            if (cifSection) cifSection.style.display = showCif ? '' : 'none';
            if (ddpSection) ddpSection.style.display = showDdp ? '' : 'none';
            var jpyWrapper = document.getElementById('nv-jpy-quote-wrapper');
            if (jpyWrapper) jpyWrapper.style.display = (showCif || showDdp) ? 'flex' : 'none';
        }

        function updateVisibility() {
            var selected = 'EST';
            radios.forEach(function(r) { if (r.checked) selected = r.value; });
            if (nvPanel) nvPanel.style.display = (selected === 'NV') ? 'block' : 'none';
            if (estPanel) estPanel.style.display = (selected === 'EST') ? 'block' : 'none';
            if (normalPanel) normalPanel.style.display = (selected === 'NORMAL') ? 'block' : 'none';
            var weightCodeRow = document.getElementById('weight-code-row');
            if (weightCodeRow) weightCodeRow.style.display = (selected === 'EST' || selected === 'NV') ? '' : 'none';
            var singleWcLabel = document.getElementById('single-weight-code-label');
            var nvWeightLabel = document.getElementById('nv-need-weight-label');
            var nvCodeLabel = document.getElementById('nv-need-code-label');
            if (selected === 'NV') {
                if (singleWcLabel) singleWcLabel.style.display = 'none';
                if (nvWeightLabel) nvWeightLabel.style.display = 'flex';
                if (nvCodeLabel) nvCodeLabel.style.display = 'flex';
            } else {
                if (singleWcLabel) singleWcLabel.style.display = 'flex';
                if (nvWeightLabel) nvWeightLabel.style.display = 'none';
                if (nvCodeLabel) nvCodeLabel.style.display = 'none';
            }
            var nvMatOptions = document.getElementById('nv-mat-options');
            if (nvMatOptions) nvMatOptions.style.display = (selected === 'NV') ? '' : 'none';
            var jpyWrapper = document.getElementById('nv-jpy-quote-wrapper');
            if (jpyWrapper) jpyWrapper.style.display = (selected === 'NV') ? 'flex' : 'none';
            if (selected === 'NV') {
                switchFenceMode('standard');
                loadDz1001DefaultPrice();
                updateNvTradeVisibility();
            } else if (selected === 'NORMAL') {
                switchFenceMode('standard');
                loadDz1001DefaultPrice();
            } else {
                switchFenceMode('external');
            }
        }

        function loadDz1001DefaultPrice() {
            var sparePriceInput = document.getElementById('nv-pile-spare-price');
            if (!sparePriceInput || (sparePriceInput.value && sparePriceInput.value !== '0')) return;
            var baseUrl = typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : '';
            fetch(baseUrl + '/material-price/DZ-1001', { credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success && data.price != null && sparePriceInput.value === '0') {
                        sparePriceInput.value = data.price;
                    }
                })
                .catch(function() {});
        }

        radios.forEach(function(r) {
            r.addEventListener('change', updateVisibility);
        });

        var nvTradeRadios = containerEl ? containerEl.querySelectorAll('input[name="nv-trade-method"]') : [];
        nvTradeRadios.forEach(function(r) {
            r.addEventListener('change', updateNvTradeVisibility);
        });

        function _nvToggleCt(cbId, qtyId, freightId) {
            var cb = document.getElementById(cbId);
            var qty = document.getElementById(qtyId);
            var freight = document.getElementById(freightId);
            if (cb) cb.addEventListener('change', function() {
                if (qty) { qty.disabled = !cb.checked; if (!cb.checked) qty.value = ''; }
                if (freight) { freight.disabled = !cb.checked; if (!cb.checked) freight.value = ''; }
            });
        }
        _nvToggleCt('nv-ct-20gp', 'nv-qty-20gp', 'nv-freight-20gp');
        _nvToggleCt('nv-ct-40hq', 'nv-qty-40hq', 'nv-freight-40hq');
        _nvToggleCt('nv-ct-lcl', 'nv-qty-lcl', 'nv-freight-lcl');
        var nvDestPort = document.getElementById('nv-dest-port');
        var nvDestPortCustom = document.getElementById('nv-dest-port-custom');
        if (nvDestPort && nvDestPortCustom) {
            nvDestPort.addEventListener('change', function() { nvDestPortCustom.style.display = nvDestPort.value === '__custom__' ? '' : 'none'; });
        }

        updateVisibility();
        updateNvTradeVisibility();
    }

    function getSelectedCaseType() {
        var radios = containerEl.querySelectorAll('input[name="ja-case-type"]');
        var selected = 'EST';
        radios.forEach(function(r) { if (r.checked) selected = r.value; });
        return selected;
    }

    function isApGroundCase() {
        var g = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        if (g !== '亚太组') return false;
        var el = document.querySelector('input[name="ap-case-type"]:checked');
        return el ? el.value === 'GROUND' : false;
    }

    function collectNvParams() {
        var nvTradeEl = document.querySelector('input[name="nv-trade-method"]:checked');
        var tradeVal = nvTradeEl ? nvTradeEl.value : 'CIF';
        var needCif = (tradeVal === 'CIF' || tradeVal === 'CIF_DDP' || tradeVal === 'NV');
        var needDdp = (tradeVal === 'DDP' || tradeVal === 'CIF_DDP' || tradeVal === 'NV');
        var destPortEl = document.getElementById('nv-dest-port');
        var destPortVal = destPortEl && destPortEl.value === '__custom__' ? (document.getElementById('nv-dest-port-custom') || {}).value || '' : (destPortEl || {}).value || '横浜';
        var containers = [];
        function _addCt(cbId, qtyId, freightId, type) {
            var cb = document.getElementById(cbId);
            if (cb && cb.checked) {
                var qty = parseInt((document.getElementById(qtyId) || {}).value) || 1;
                var freight = parseFloat((document.getElementById(freightId) || {}).value) || 0;
                containers.push({ type: type, qty: qty, freight: freight });
            }
        }
        if (needCif) {
            _addCt('nv-ct-20gp', 'nv-qty-20gp', 'nv-freight-20gp', '20GP');
            _addCt('nv-ct-40hq', 'nv-qty-40hq', 'nv-freight-40hq', '40HQ');
            _addCt('nv-ct-lcl', 'nv-qty-lcl', 'nv-freight-lcl', 'LCL');
        }
        var truckSizeEl = document.getElementById('nv-truck-size');
        var truckParts = [];
        if (truckSizeEl) truckParts.push(truckSizeEl.value);
        var truckUnic = document.getElementById('nv-truck-unic');
        var truckFlat = document.getElementById('nv-truck-flat');
        if (truckUnic && truckUnic.checked) truckParts.push('ユニック');
        if (truckFlat && truckFlat.checked) truckParts.push('平車');
        return {
            nv_discount_rate: parseFloat((document.getElementById('nv-discount-rate') || {}).value) || 77,
            nv_fence_discount_rate: parseFloat((document.getElementById('nv-fence-discount-rate') || {}).value) || 94,
            nv_steel_discount_rate: parseFloat((document.getElementById('nv-steel-discount-rate') || {}).value) || 84,
            nv_purchased_discount_rate: parseFloat((document.getElementById('nv-purchased-discount-rate') || {}).value) || 94,
            dest_port: destPortVal,
            containers: containers,
            truck_size: needDdp ? ((truckSizeEl || {}).value || '4T') : '',
            truck_desc: needDdp ? truckParts.join('+') : '',
            truck_fee: needDdp ? (parseFloat((document.getElementById('nv-truck-fee') || {}).value) || 0) : 0,
            exchange_rate: parseFloat((document.getElementById('nv-exchange-rate') || {}).value) || 151,
            consumption_tax: parseFloat((document.getElementById('nv-consumption-tax') || {}).value) || 10,
            tariff_rate: parseFloat((document.getElementById('nv-tariff-rate') || {}).value) || 1.4,
            nv_adjustment: parseFloat((document.getElementById('nv-adjustment') || {}).value) || 0,
            mitsumori_condition: nvTradeEl ? nvTradeEl.value : 'CIF',
            torihiki_condition: (document.getElementById('nv-torihiki-condition') || {}).value || '翌月末払い',
            pile_spare_count: parseFloat((document.getElementById('nv-pile-spare-count') || {}).value) || 0,
            pile_spare_price: parseFloat((document.getElementById('nv-pile-spare-price') || {}).value) || 0,
            post_spare_count: parseFloat((document.getElementById('nv-post-spare-count') || {}).value) || 0,
            post_spare_price: parseFloat((document.getElementById('nv-post-spare-price') || {}).value) || 0,
            sales_name: _selectedJaContact.name_ja || '',
            sales_phone: _selectedJaContact.mob || '',
            sales_tel: _selectedJaContact.tel || '',
            sales_fax: _selectedJaContact.fax || '-',
            customer_name: (document.getElementById('nv-customer-name') || {}).value || '',
            pile_include_dz: true,
            need_jpy_quote: (document.getElementById('nv-need-jpy-quote') || {}).checked || false,
        };
    }

    // ========== 用户报价习惯 (preferences) ==========
    var PREF_FIELD_MAP = {
        '韩语组': [
            { key: 'trade_method', type: 'radio', name: 'ko-trade-method' },
            { key: 'sale_type', type: 'radio', name: 'ko-sale-type' },
            { key: 'dest_port', type: 'destport', ids: ['ko-dest-port'], customs: ['ko-dest-port-custom'] },
            { key: 'ko_company_discount', type: 'num', id: 'ko-company-discount', trigger: 'input' },
            { key: 'ko_commission', type: 'num', id: 'ko-commission', trigger: 'input' },
            { key: 'ko_steel_discount_rate', type: 'num', id: 'ko-steel-discount-rate' },
            { key: 'ko_purchased_discount_rate', type: 'num', id: 'ko-purchased-discount-rate' },
            { key: 'ko_tariff_rate', type: 'num', id: 'ko-tariff-rate' },
            { key: 'ko_consumption_tax', type: 'num', id: 'ko-consumption-tax' },
            { key: 'coating_thickness', type: 'coating', prefix: 'ko' },
        ],
        '日语组': {
            'EST': [
                { key: 'ja_exchange_rate', type: 'num', id: 'ja-exchange-rate' },
                { key: 'ja_tariff_rate', type: 'num', id: 'ja-tariff-rate' },
                { key: 'ja_consumption_tax', type: 'num', id: 'ja-consumption-tax' },
                { key: 'ja_fence_tax', type: 'num', id: 'ja-fence-tax' },
                { key: 'ja_discount_rate', type: 'num', id: 'ja-discount-rate' },
                { key: 'ja_steel_discount_rate', type: 'num', id: 'ja-steel-discount-rate' },
                { key: 'ja_purchased_discount_rate', type: 'num', id: 'ja-purchased-discount-rate' },
                { key: 'ja_steel_pack', type: 'text', id: 'ja-steel-pack' },
                { key: 'ja_truck_size', type: 'text', id: 'ja-truck-size' },
                { key: 'ja_truck_unic', type: 'check', id: 'ja-truck-unic' },
                { key: 'ja_truck_flat', type: 'check', id: 'ja-truck-flat' },
                { key: 'coating_thickness', type: 'coating', prefix: '' },
            ],
            'NORMAL': [
                { key: 'normal_discount_rate', type: 'num', id: 'normal-discount-rate' },
                { key: 'normal_steel_pack', type: 'text', id: 'normal-steel-pack' },
                { key: 'normal_consumption_tax', type: 'num', id: 'normal-consumption-tax' },
                { key: 'normal_tariff_rate', type: 'num', id: 'normal-tariff-rate' },
                { key: 'normal_fence_discount_rate', type: 'num', id: 'normal-fence-discount-rate' },
                { key: 'normal_shipping_fee', type: 'num', id: 'normal-shipping-fee' },
                { key: 'normal_trade_condition', type: 'text', id: 'normal-trade-condition' },
                { key: 'normal_mitsumori_condition', type: 'radio', name: 'normal-mitsumori-condition' },
                { key: 'normal_remove_weight', type: 'check', id: 'normal-remove-weight' },
                { key: 'coating_thickness', type: 'coating', prefix: '' },
            ],
            'NV': [
                { key: 'nv_company_discount', type: 'num', id: 'nv-company-discount', trigger: 'input' },
                { key: 'nv_commission', type: 'num', id: 'nv-commission', trigger: 'input' },
                { key: 'nv_fence_discount_rate', type: 'num', id: 'nv-fence-discount-rate' },
                { key: 'nv_steel_discount_rate', type: 'num', id: 'nv-steel-discount-rate' },
                { key: 'nv_purchased_discount_rate', type: 'num', id: 'nv-purchased-discount-rate' },
                { key: 'nv_exchange_rate', type: 'num', id: 'nv-exchange-rate' },
                { key: 'nv_consumption_tax', type: 'num', id: 'nv-consumption-tax' },
                { key: 'nv_tariff_rate', type: 'num', id: 'nv-tariff-rate' },
                { key: 'nv_dest_port', type: 'destport', ids: ['nv-dest-port'], customs: ['nv-dest-port-custom'] },
                { key: 'nv_truck_size', type: 'text', id: 'nv-truck-size' },
                { key: 'nv_truck_unic', type: 'check', id: 'nv-truck-unic' },
                { key: 'nv_truck_flat', type: 'check', id: 'nv-truck-flat' },
                { key: 'nv_torihiki_condition', type: 'text', id: 'nv-torihiki-condition' },
                { key: 'nv_mitsumori_condition', type: 'radio', name: 'nv-trade-method', trigger: 'change' },
                { key: 'nv_need_jpy_quote', type: 'check', id: 'nv-need-jpy-quote' },
                { key: 'nv_adjustment', type: 'num', id: 'nv-adjustment' },
                { key: 'coating_thickness', type: 'coating', prefix: '' },
            ],
        },
        '英语组': [
            { key: 'en_company_discount', type: 'num', id: 'en-company-discount', trigger: 'input' },
            { key: 'en_commission', type: 'num', id: 'en-commission', trigger: 'input' },
            { key: 'en_steel_discount_rate', type: 'num', id: 'en-steel-discount-rate' },
            { key: 'en_purchased_discount_rate', type: 'num', id: 'en-purchased-discount-rate' },
            { key: 'en_trade_method', type: 'radio', name: 'en-trade-method', trigger: 'change' },
            { key: 'en_dest_port', type: 'destport', ids: ['en-dest-port', 'en-cif-dest-port'], customs: ['en-dest-port-custom', 'en-cif-dest-port-custom'] },
            { key: 'en_sale_type', type: 'radio', name: 'en-sale-type' },
            { key: 'en_lang', type: 'radio', name: 'en-lang' },
            { key: 'en_case_type', type: 'radio', name: 'en-case-type' },
            { key: 'en_quote_validity', type: 'validity', id: 'en-quote-validity', custom: 'en-quote-validity-custom' },
            { key: 'en_discount_method', type: 'radio', name: 'en-discount-method' },
            { key: 'en_payment_term', type: 'radio', name: 'en-payment-term' },
            { key: 'en_seller_name', type: 'radio', name: 'en-seller' },
            { key: 'coating_thickness', type: 'coating', prefix: 'en' },
        ],
        '亚太组': [
            { key: 'ap_trade_method', type: 'radio', name: 'ap-trade-method', trigger: 'change' },
            { key: 'ap_freight', type: 'num', id: 'ap-freight' },
            { key: 'ap_port', type: 'text', id: 'ap-port' },
            { key: 'ap_company_discount', type: 'num', id: 'ap-company-discount', trigger: 'input' },
            { key: 'ap_commission', type: 'num', id: 'ap-commission', trigger: 'input' },
            { key: 'ap_steel_discount_rate', type: 'num', id: 'ap-steel-discount-rate' },
            { key: 'ap_purchased_discount_rate', type: 'num', id: 'ap-purchased-discount-rate' },
            { key: 'coating_thickness', type: 'coating', prefix: 'ap' },
        ],
    };

    function getCurrentPrefCaseType(group) {
        if (group === '日语组') return getSelectedCaseType();
        return null;
    }

    function getCurrentPrefFields() {
        var group = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        var entry = PREF_FIELD_MAP[group];
        if (!entry) return { group: group, caseType: null, fields: [] };
        if (group === '日语组') {
            var ct = getCurrentPrefCaseType(group);
            return { group: group, caseType: ct, fields: entry[ct] || [] };
        }
        return { group: group, caseType: null, fields: Array.isArray(entry) ? entry : [] };
    }

    function _dispatch(el, eventName) {
        try { el.dispatchEvent(new Event(eventName, { bubbles: true })); } catch (e) {}
    }

    function _applyOne(field, value) {
        if (value === undefined || value === null || value === '') return;
        switch (field.type) {
            case 'num':
            case 'text': {
                var el = document.getElementById(field.id);
                if (el) { el.value = value; if (field.trigger) _dispatch(el, field.trigger); }
                break;
            }
            case 'radio': {
                var r = document.querySelector('input[name="' + field.name + '"][value="' + value + '"]');
                if (r && !r.checked) { r.checked = true; if (field.trigger) _dispatch(r, field.trigger); }
                break;
            }
            case 'check': {
                var c = document.getElementById(field.id);
                if (c) { c.checked = !!value; _dispatch(c, 'change'); }
                break;
            }
            case 'coating': {
                var btnId = 'btn-' + (field.prefix ? field.prefix + '-' : '') + 'coating-' + value;
                var btn = document.getElementById(btnId);
                if (btn) btn.click();
                break;
            }
            case 'destport': {
                var matched = false;
                (field.ids || []).forEach(function (sid) {
                    var sel = document.getElementById(sid);
                    if (!sel || matched) return;
                    var has = false;
                    for (var k = 0; k < sel.options.length; k++) { if (sel.options[k].value === value) { has = true; break; } }
                    if (has) { sel.value = value; _dispatch(sel, 'change'); matched = true; }
                });
                if (!matched) {
                    var firstSel = document.getElementById((field.ids || [])[0]);
                    if (firstSel) { firstSel.value = '__custom__'; _dispatch(firstSel, 'change'); }
                    var cust = document.getElementById((field.customs || [])[0]);
                    if (cust) cust.value = value;
                }
                break;
            }
            case 'validity': {
                var vsel = document.getElementById(field.id);
                if (!vsel) break;
                var vhas = false;
                for (var m = 0; m < vsel.options.length; m++) { if (vsel.options[m].value === value) { vhas = true; break; } }
                if (vhas) { vsel.value = value; _dispatch(vsel, 'change'); }
                else { vsel.value = 'custom'; _dispatch(vsel, 'change'); var vc = document.getElementById(field.custom); if (vc) vc.value = String(value).replace(/d$/i, ''); }
                break;
            }
        }
    }

    function _collectOne(field) {
        switch (field.type) {
            case 'num':
            case 'text': {
                var el = document.getElementById(field.id);
                if (!el) return undefined;
                if (field.type === 'num') { var f = parseFloat(el.value); return isNaN(f) ? undefined : f; }
                return el.value && el.value !== '' ? el.value : undefined;
            }
            case 'radio': {
                var r = document.querySelector('input[name="' + field.name + '"]:checked');
                return r ? r.value : undefined;
            }
            case 'check': {
                var c = document.getElementById(field.id);
                return c ? !!c.checked : undefined;
            }
            case 'coating': {
                return state && state.coatingThickness ? state.coatingThickness : undefined;
            }
            case 'destport': {
                var ids = field.ids || [], customs = field.customs || [];
                for (var i = 0; i < ids.length; i++) {
                    var sel = document.getElementById(ids[i]);
                    if (!sel || !sel.offsetParent) continue;
                    if (sel.value === '__custom__') {
                        var cu = document.getElementById(customs[i]);
                        return (cu && cu.value && cu.value.trim()) ? cu.value.trim() : undefined;
                    }
                    if (sel.value) return sel.value;
                }
                return undefined;
            }
            case 'validity': {
                var vsel = document.getElementById(field.id);
                if (!vsel) return undefined;
                if (vsel.value === 'custom') {
                    var vc = document.getElementById(field.custom);
                    return (vc && vc.value) ? vc.value + 'd' : undefined;
                }
                return vsel.value || undefined;
            }
        }
        return undefined;
    }

    function applyUserPreferences() {
        var info = getCurrentPrefFields();
        var prefs = window._ksAuth && window._ksAuth.preferences ? window._ksAuth.preferences : null;
        if (!prefs) return;
        var sub;
        if (info.group === '日语组') {
            sub = (prefs['日语组'] || {})[info.caseType] || {};
        } else {
            sub = prefs[info.group] || {};
        }
        if (!sub || typeof sub !== 'object') return;
        info.fields.forEach(function (f) {
            if (sub[f.key] !== undefined && sub[f.key] !== null) {
                _applyOne(f, sub[f.key]);
            }
        });
    }

    function collectUserPreferences() {
        var info = getCurrentPrefFields();
        var section = {};
        info.fields.forEach(function (f) {
            var v = _collectOne(f);
            if (v !== undefined && v !== null && v !== '') section[f.key] = v;
        });
        var payload = {};
        if (info.group === '日语组') {
            payload['日语组'] = {};
            payload['日语组'][info.caseType] = section;
        } else {
            payload[info.group] = section;
        }
        return payload;
    }

    function _showPrefStatus(msg, isError) {
        var st = document.getElementById('save-prefs-status');
        if (!st) return;
        st.textContent = msg;
        st.style.color = isError ? '#991b1b' : 'var(--muted)';
        clearTimeout(st._timer);
        st._timer = setTimeout(function () { st.textContent = ''; }, 4000);
    }

    function saveMyPreferences() {
        var payload = collectUserPreferences();
        var printPayload = collectPrintPreferences();
        if (printPayload) { for (var pk in printPayload) { payload[pk] = printPayload[pk]; } }

        var firstKey = Object.keys(payload)[0];
        var inner = firstKey ? payload[firstKey] : null;
        if (info_groupIsJapanese()) {
            inner = inner && inner[Object.keys(inner)[0]] ? inner[Object.keys(inner)[0]] : null;
        }
        var hasPrint = payload.print && Object.keys(payload.print).length > 0;
        if ((!inner || Object.keys(inner).length === 0) && !hasPrint) { _showPrefStatus('未检测到可保存的字段', true); return; }

        var btn = document.getElementById('save-prefs-btn');
        if (btn) btn.disabled = true;
        _showPrefStatus('正在保存...', false);
        var baseUrl = typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : '';
        fetch(baseUrl + '/auth/me/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ preferences: payload }),
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (btn) btn.disabled = false;
                if (data && data.success) {
                    if (data.data && data.data.preferences && window._ksAuth) {
                        window._ksAuth.preferences = data.data.preferences;
                        if (typeof setAuth === 'function') setAuth(window._ksAuth);
                    }
                    _showPrefStatus('习惯已保存', false);
                } else {
                    _showPrefStatus(data && data.message ? data.message : '保存失败', true);
                }
            })
            .catch(function () {
                if (btn) btn.disabled = false;
                _showPrefStatus('保存失败，请检查网络', true);
            });
    }

    function info_groupIsJapanese() {
        var g = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        return g === '日语组';
    }

    // ========== 打印设置（个人习惯） ==========
    // 各案件默认打印参数取自公共全局（见 utils.js），与后端 print_settings.py 一致。
    var PRINT_CASE_DEFAULTS = window.KS_PRINT_DEFAULTS;
    var PRINT_CASE_LABELS = window.KS_PRINT_LABELS;

    function _printGroup() {
        return typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
    }
    function _radioVal(name, fallback) {
        var el = document.querySelector('input[name="' + name + '"]:checked');
        return el ? el.value : fallback;
    }
    function _printCaseKey() {
        var g = _printGroup();
        if (g === '韩语组') return 'ko_' + (_radioVal('ko-case-type', 'NORMAL').toLowerCase());
        if (g === '日语组') {
            var v = (typeof getSelectedCaseType === 'function') ? getSelectedCaseType() : _radioVal('ja-case-type', 'NV');
            return 'ja_' + String(v).toLowerCase();
        }
        if (g === '英语组') {
            var ev = _radioVal('en-case-type', 'COMMON');
            return ev === 'SIMPLE' ? 'en_simple' : 'en_common';
        }
        if (g === '亚太组') return _radioVal('ap-case-type', 'ROOF') === 'GROUND' ? 'ap_ground' : 'ap_common';
        return 'ko_normal';
    }
    function _getStoredPrint(caseKey) {
        var prefs = window._ksAuth && window._ksAuth.preferences ? window._ksAuth.preferences : null;
        var p = prefs && prefs.print ? prefs.print[caseKey] : null;
        return (p && typeof p === 'object') ? p : null;
    }
    function _readPrintInputs() {
        return {
            orientation: (document.getElementById('print-orientation') || {}).value || 'portrait',
            fit_mode: (document.getElementById('print-fit-mode') || {}).value || 'fit_width',
            horizontal_centered: !!(document.getElementById('print-centered') || {}).checked,
            margin_top: parseFloat((document.getElementById('print-mt') || {}).value),
            margin_bottom: parseFloat((document.getElementById('print-mb') || {}).value),
            margin_left: parseFloat((document.getElementById('print-ml') || {}).value),
            margin_right: parseFloat((document.getElementById('print-mr') || {}).value),
        };
    }
    function _fillPrintInputs(s) {
        var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v; };
        var chk = function (id, v) { var el = document.getElementById(id); if (el) el.checked = !!v; };
        set('print-orientation', s.orientation);
        set('print-fit-mode', s.fit_mode);
        chk('print-centered', s.horizontal_centered);
        set('print-mt', s.margin_top);
        set('print-mb', s.margin_bottom);
        set('print-ml', s.margin_left);
        set('print-mr', s.margin_right);
    }
    function refreshPrintPanel() {
        var card = document.getElementById('print-settings-card');
        if (!card) return;
        var caseKey = _printCaseKey();
        var label = document.getElementById('print-case-label');
        if (label) label.textContent = '当前案件：' + (PRINT_CASE_LABELS[caseKey] || caseKey);
        var def = PRINT_CASE_DEFAULTS[caseKey] || PRINT_CASE_DEFAULTS.ko_normal;
        var stored = _getStoredPrint(caseKey);
        _fillPrintInputs(stored || def);
    }
    function _printEq(a, b) {
        return a.orientation === b.orientation && a.fit_mode === b.fit_mode &&
            !!a.horizontal_centered === !!b.horizontal_centered &&
            Math.abs((a.margin_top || 0) - b.margin_top) < 1e-6 &&
            Math.abs((a.margin_bottom || 0) - b.margin_bottom) < 1e-6 &&
            Math.abs((a.margin_left || 0) - b.margin_left) < 1e-6 &&
            Math.abs((a.margin_right || 0) - b.margin_right) < 1e-6;
    }
    function collectPrintPreferences() {
        var card = document.getElementById('print-settings-card');
        if (!card) return null;
        var caseKey = _printCaseKey();
        var cur = _readPrintInputs();
        var def = PRINT_CASE_DEFAULTS[caseKey] || PRINT_CASE_DEFAULTS.ko_normal;
        if (_printEq(cur, def)) {
            // 与默认一致 → 发送 null 清除该案件的自定义（真正「默认」）
            return { print: {} };
        }
        var sec = {
            orientation: cur.orientation,
            fit_mode: cur.fit_mode,
            horizontal_centered: !!cur.horizontal_centered,
            margin_top: cur.margin_top,
            margin_bottom: cur.margin_bottom,
            margin_left: cur.margin_left,
            margin_right: cur.margin_right,
        };
        var payload = { print: {} };
        payload.print[caseKey] = sec;
        return payload;
    }
    function applyPrintPreferences() { refreshPrintPanel(); }
    function _showPrintStatus(msg, isError) {
        var st = document.getElementById('print-status');
        if (!st) return;
        st.textContent = msg;
        st.style.color = isError ? '#991b1b' : 'var(--muted)';
        clearTimeout(st._timer);
        st._timer = setTimeout(function () { st.textContent = ''; }, 4000);
    }
    function restorePrintDefault() {
        var caseKey = _printCaseKey();
        var def = PRINT_CASE_DEFAULTS[caseKey] || PRINT_CASE_DEFAULTS.ko_normal;
        _fillPrintInputs(def);
        // 发送 null 删除该案件的自定义打印设置
        var payload = { print: {} };
        payload.print[caseKey] = null;
        var btn = document.getElementById('print-restore-btn');
        if (btn) btn.disabled = true;
        _showPrintStatus('正在恢复默认...', false);
        var baseUrl = typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : '';
        fetch(baseUrl + '/auth/me/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ preferences: payload }),
        }).then(function (r) { return r.json(); }).then(function (data) {
            if (btn) btn.disabled = false;
            if (data && data.success) {
                if (data.data && data.data.preferences && window._ksAuth) {
                    window._ksAuth.preferences = data.data.preferences;
                    if (typeof setAuth === 'function') setAuth(window._ksAuth);
                }
                _showPrintStatus('已恢复默认', false);
            } else {
                _showPrintStatus(data && data.message ? data.message : '恢复失败', true);
            }
        }).catch(function () {
            if (btn) btn.disabled = false;
            _showPrintStatus('恢复失败，请检查网络', true);
        });
    }
    function _bindPrintControls() {
        var restore = document.getElementById('print-restore-btn');
        if (restore && !restore._bound) { restore._bound = true; restore.addEventListener('click', restorePrintDefault); }
        // 切换案件类型时刷新面板
        ['ko-case-type', 'ja-case-type', 'en-case-type', 'ap-case-type'].forEach(function (name) {
            document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
                if (!r._printBound) { r._printBound = true; r.addEventListener('change', refreshPrintPanel); }
                if (name === 'ap-case-type' && !r._reorganizeBound) {
                    r._reorganizeBound = true;
                    r.addEventListener('change', function () {
                        var infoCard = containerEl.querySelector('.quotation-subcard-info');
                        if (infoCard) infoCard.style.display = isApGroundCase() ? '' : 'none';
                        if (typeof updateApModuleWattageVisibility === 'function') updateApModuleWattageVisibility();
                    });
                }
            });
        });
    }

    var _selectedJaContact = {};

    function loadJaContacts() {
        var container = document.getElementById('ja-contact-list');
        if (!container) return;
        var url = (typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : '') + '/ucontacts?group=' + encodeURIComponent('日语组');
        fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success || !Array.isArray(data.data)) {
                    container.innerHTML = '<span style="color:#991b1b; font-size:13px;">联系人数据为空</span>';
                    return;
                }
                var contacts = data.data.filter(function (c) { return c.nickname && c.nickname.trim(); });
                container.innerHTML = '';
                contacts.forEach(function (c) {
                    var card = document.createElement('div');
                    card.setAttribute('data-ja-contact-id', c.id);
                    card.setAttribute('data-name', c.name_china || '');
                    card.setAttribute('data-name-ja', c.nickname || '');
                    card.setAttribute('data-mob', c.mob || '');
                    card.setAttribute('data-tel', c.tel || '');
                    card.setAttribute('data-fax', c.fax || '-');
                    card.className = 'contact-card';
                    card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:all .15s;min-width:70px;';
                    card.innerHTML =
                        '<div style="font-weight:600;font-size:12px;color:#0f172a;">' + escapeHtml(c.name_china || '') + '</div>' +
                        '<div style="font-size:11px;color:#64748b;">' + escapeHtml(c.nickname || '') + '</div>';
                    card.addEventListener('mouseenter', function () {
                        if (!this.classList.contains('contact-card-selected')) {
                            this.style.borderColor = '#3b82f6';
                            this.style.background = '#eff6ff';
                        }
                    });
                    card.addEventListener('mouseleave', function () {
                        if (!this.classList.contains('contact-card-selected')) {
                            this.style.borderColor = '#e2e8f0';
                            this.style.background = '';
                        }
                    });
                    card.addEventListener('click', function () {
                        container.querySelectorAll('.contact-card').forEach(function (el) {
                            el.classList.remove('contact-card-selected');
                            el.style.borderColor = '#e2e8f0';
                            el.style.background = '';
                        });
                        this.classList.add('contact-card-selected');
                        this.style.borderColor = '#0f766e';
                        this.style.background = '#e6fffb';
                        applyJaContact();
                    });
                    container.appendChild(card);
                });
                var storedId = localStorage.getItem('ks_ja_contact_id') || '';
                var authData = null;
                try { authData = JSON.parse(localStorage.getItem('ks_auth_v1') || 'null'); } catch (e) {}

                var targetCard = null;
                if (authData && authData.id) {
                    var authMatch = contacts.find(function (c) { return c.id === authData.id; });
                    if (authMatch) targetCard = container.querySelector('[data-ja-contact-id="' + authMatch.id + '"]');
                }
                if (!targetCard && storedId) {
                    targetCard = container.querySelector('[data-ja-contact-id="' + storedId + '"]');
                }
                if (!targetCard && contacts.length > 0) {
                    targetCard = container.querySelector('[data-ja-contact-id="' + contacts[0].id + '"]');
                }
                if (targetCard) {
                    targetCard.classList.add('contact-card-selected');
                    targetCard.style.borderColor = '#0f766e';
                    targetCard.style.background = '#e6fffb';
                }
                applyJaContact();
            })
            .catch(function (err) {
                container.innerHTML = '<span style="color:#991b1b; font-size:13px;">加载失败：' + escapeHtml(err.message) + '</span>';
            });
    }

    function applyJaContact() {
        var container = document.getElementById('ja-contact-list');
        var preview = document.getElementById('ja-contact-preview');
        var nameEl = document.getElementById('ja-contact-preview-name');
        var mobEl = document.getElementById('ja-contact-preview-mob');
        var telEl = document.getElementById('ja-contact-preview-tel');
        var faxEl = document.getElementById('ja-contact-preview-fax');
        if (!container) return;
        var selected = container.querySelector('.contact-card-selected[data-ja-contact-id]');
        if (!selected) {
            _selectedJaContact = {};
            if (preview) preview.style.display = 'none';
            return;
        }
        _selectedJaContact = {
            name: selected.getAttribute('data-name') || '',
            name_ja: selected.getAttribute('data-name-ja') || '',
            mob: selected.getAttribute('data-mob') || '',
            tel: selected.getAttribute('data-tel') || '',
            fax: selected.getAttribute('data-fax') || '-',
        };
        localStorage.setItem('ks_ja_contact_id', selected.getAttribute('data-ja-contact-id'));
        if (preview && nameEl && mobEl && telEl && faxEl) {
            preview.style.display = 'block';
            nameEl.innerHTML = '<span style="color:#64748b;">担当者：</span>' + escapeHtml(_selectedJaContact.name) + '（' + escapeHtml(_selectedJaContact.name_ja) + '）';
            mobEl.innerHTML = '<span style="color:#64748b;">Mob：</span>' + escapeHtml(_selectedJaContact.mob);
            telEl.innerHTML = '<span style="color:#64748b;">Tel：</span>' + escapeHtml(_selectedJaContact.tel);
            faxEl.innerHTML = '<span style="color:#64748b;">Fax：</span>' + escapeHtml(_selectedJaContact.fax);
        }
    }

    function getSelectedBomKeys() {
        var bomTables = Array.isArray(state.bomTables) ? state.bomTables : [];
        if (!bomTables.length) {
            return [];
        }

        var selectedKeys = syncSelectedBomKeysFromDom();
        return Array.isArray(selectedKeys) ? selectedKeys : [];
    }

    var _selectedEnContact = {};

    function loadEnContacts() {
        var container = document.getElementById('en-contact-list');
        if (!container) return;
        var url = (typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : '') + '/ucontacts?group=' + encodeURIComponent('英语组');
        fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success || !Array.isArray(data.data)) {
                    container.innerHTML = '<span style="color:#991b1b; font-size:13px;">No contacts</span>';
                    return;
                }
                var contacts = data.data.filter(function (c) { return c.nickname && c.nickname.trim(); });
                container.innerHTML = '';
                contacts.forEach(function (c) {
                    var card = document.createElement('div');
                    card.setAttribute('data-en-contact-id', c.id);
                    card.setAttribute('data-name', c.nickname || '');
                    card.setAttribute('data-name-cn', c.name_china || '');
                    card.setAttribute('data-phone', c.mob || '');
                    card.setAttribute('data-tel', c.tel || '');
                    card.setAttribute('data-email', c.email || '');
                    card.className = 'contact-card';
                    card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:all .15s;min-width:70px;';
                    card.innerHTML =
                        '<div style="font-weight:600;font-size:12px;color:#0f172a;">' + escapeHtml(c.nickname || '') + '</div>' +
                        '<div style="font-size:11px;color:#64748b;">' + escapeHtml(c.name_china || '') + '</div>';
                    card.addEventListener('mouseenter', function () {
                        if (!this.classList.contains('contact-card-selected')) {
                            this.style.borderColor = '#3b82f6';
                            this.style.background = '#eff6ff';
                        }
                    });
                    card.addEventListener('mouseleave', function () {
                        if (!this.classList.contains('contact-card-selected')) {
                            this.style.borderColor = '#e2e8f0';
                            this.style.background = '';
                        }
                    });
                    card.addEventListener('click', function () {
                        container.querySelectorAll('.contact-card').forEach(function (el) {
                            el.classList.remove('contact-card-selected');
                            el.style.borderColor = '#e2e8f0';
                            el.style.background = '';
                        });
                        this.classList.add('contact-card-selected');
                        this.style.borderColor = '#0f766e';
                        this.style.background = '#e6fffb';
                        applyEnContact();
                    });
                    container.appendChild(card);
                });
                var storedId = localStorage.getItem('ks_en_contact_id') || '';
                var authData = null;
                try { authData = JSON.parse(localStorage.getItem('ks_auth_v1') || 'null'); } catch (e) {}

                var targetCard = null;
                if (authData && authData.id) {
                    var authMatch = contacts.find(function (c) { return c.id === authData.id; });
                    if (authMatch) targetCard = container.querySelector('[data-en-contact-id="' + authMatch.id + '"]');
                }
                if (!targetCard && storedId) {
                    targetCard = container.querySelector('[data-en-contact-id="' + storedId + '"]');
                }
                if (!targetCard && contacts.length > 0) {
                    targetCard = container.querySelector('[data-en-contact-id="' + contacts[0].id + '"]');
                }
                if (targetCard) {
                    targetCard.classList.add('contact-card-selected');
                    targetCard.style.borderColor = '#0f766e';
                    targetCard.style.background = '#e6fffb';
                }
                applyEnContact();
            })
            .catch(function (err) {
                container.innerHTML = '<span style="color:#991b1b; font-size:13px;">Load failed: ' + escapeHtml(err.message) + '</span>';
            });
    }

    function applyEnContact() {
        var container = document.getElementById('en-contact-list');
        var preview = document.getElementById('en-contact-preview');
        var nameEl = document.getElementById('en-contact-preview-name');
        var phoneEl = document.getElementById('en-contact-preview-phone');
        var emailEl = document.getElementById('en-contact-preview-email');
        if (!container) return;
        var selected = container.querySelector('.contact-card-selected[data-en-contact-id]');
        if (!selected) {
            _selectedEnContact = {};
            if (preview) preview.style.display = 'none';
            return;
        }
        _selectedEnContact = {
            name: selected.getAttribute('data-name') || '',
            name_cn: selected.getAttribute('data-name-cn') || '',
            phone: selected.getAttribute('data-phone') || '',
            tel_num: selected.getAttribute('data-tel') || '',
            email: selected.getAttribute('data-email') || '',
        };
        localStorage.setItem('ks_en_contact_id', selected.getAttribute('data-en-contact-id'));
        if (preview && nameEl && phoneEl && emailEl) {
            preview.style.display = 'block';
            nameEl.innerHTML = '<span style="color:#64748b;">Contact：</span>' + escapeHtml(_selectedEnContact.name) + '（' + escapeHtml(_selectedEnContact.name_cn) + '）';
            phoneEl.innerHTML = '<span style="color:#64748b;">Phone：</span>' + escapeHtml(_selectedEnContact.phone);
            emailEl.innerHTML = '<span style="color:#64748b;">Email：</span>' + escapeHtml(_selectedEnContact.email);
        }
        var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
        if (currentGroup === '英语组') {
            state.contactInfo = {
                contact_name: _selectedEnContact.name,
                phone: _selectedEnContact.phone,
                tel: _selectedEnContact.email,
                tel_num: _selectedEnContact.tel_num,
                fax: '',
            };
        }
    }

    window.QuotationPage = {
        init: function (el) {
            containerEl = el;
            state = createFreshState();
            elements = {};
            _fileInputs = [];

            containerEl.innerHTML = HTML_TEMPLATE;

            var currentGroup = typeof KSRouter !== 'undefined' ? KSRouter.getGroup() : '韩语组';
            containerEl.querySelectorAll('[data-group-only]').forEach(function (el) {
                var allowed = el.getAttribute('data-group-only');
                var allowedList = allowed.split(',').map(function (s) { return s.trim(); });
                if (allowedList.indexOf(currentGroup) === -1) {
                    el.style.display = 'none';
                }
            });

            initializeElements();
            reorganizeQuotationCards();
            ensureInquiryRequesterControls();
            bindEvents();
            initializeQuickQuoteCards();
            loadContactInfo();
            loadInquiryRequesterConfig();
            checkBackendHealth();
            checkGlobalPriceStatus();
            initCaseTypeSwitcher();
            if (currentGroup === '日语组') loadJaContacts();
            if (currentGroup === '英语组') loadEnContacts();

            if (currentGroup === '日语组') {
                var jaCaseRadios = containerEl.querySelectorAll('input[name="ja-case-type"]');
                jaCaseRadios.forEach(function (r) {
                    r.addEventListener('change', function () { setTimeout(applyUserPreferences, 0); });
                });
            }
            setTimeout(applyUserPreferences, 0);
            _bindPrintControls();
            setTimeout(applyPrintPreferences, 0);
        },

        destroy: function () {
            cleanupFiles();
            _fileInputs.forEach(function (el) {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            _fileInputs = [];
            state = null;
            elements = null;
            containerEl = null;
        }
    };

})();
