const LogisticsPage = {
    _state: null,

    init(container) {
        this._state = {
            isRunning: false,
            abortController: null,
            chatAbortController: null,
            chatStreamActive: false,
            chatStreamReader: null,
            generatedJSONs: { pallet: null, english: null, chinese: null },
            sessionId: '',
            chatMessages: [],
            tokenStats: { input: 0, output: 0, calls: 0 },
            editingState: { pallet: false, english: false, chinese: false },
            generatedFilenames: { en: null, ja: null },
        };
        this._container = container;
        this._render();
        this._bind();
    },

    destroy() {
        const s = this._state;
        if (!s) return;
        if (s.abortController) try { s.abortController.abort(); } catch(e) {}
        if (s.chatAbortController) try { s.chatAbortController.abort(); } catch(e) {}
        this._state = null;
        this._container = '';
    },

    _render() {
        const el = typeof this._container === 'string' ? document.getElementById(this._container) : this._container;
        if (!el) return;
        el.innerHTML = `
        <div class="logistics-page">
            <div class="logistics-token-bar">
                <div class="token-item"><span class="token-label">输入</span><span class="token-value" id="ltx-tokenIn">0</span></div>
                <div class="token-item"><span class="token-label">输出</span><span class="token-value" id="ltx-tokenOut">0</span></div>
                <div class="token-item"><span class="token-label">总Token</span><span class="token-value" id="ltx-tokenTotal">0</span></div>
                <div class="token-item"><span class="token-label">调用次数</span><span class="token-value" id="ltx-tokenCalls">0</span></div>
                <div style="flex:1;"></div>
                <div class="token-item"><span class="token-label">预估费用</span><span class="token-cost" id="ltx-tokenCost">¥0.00</span></div>
            </div>
            <div class="logistics-split">
                <div class="logistics-left">
                    <details style="margin-bottom:0;">
                        <summary class="logistics-section-title" style="cursor:pointer;user-select:none;">API 配置</summary>
                        <div class="logistics-config-grid" style="margin-top:8px;">
                            <div class="logistics-form-group"><label>API Base URL</label><input type="text" id="ltx-apiBaseUrl" value="https://open.bigmodel.cn/api/anthropic"></div>
                            <div class="logistics-form-group"><label>API Key</label><input type="password" id="ltx-apiKey" value="ce3cb32501964392ac95daae09cbf8f9.jg7ypsXoBTZccnp3"></div>
                            <div class="logistics-form-group"><label>模型</label>
                                <select id="ltx-modelSelect">
                                    <option value="glm-5.1" selected>glm-5.1</option>
                                    <option value="glm-5">glm-5</option>
                                    <option value="glm-4v-flash">glm-4v-flash (免费)</option>
                                    <option value="glm-4v-plus">glm-4v-plus</option>
                                    <option value="kimi-k2.6">kimi-k2.6</option>
                                </select>
                            </div>
                            <div class="logistics-form-group"><label>MAIN MARK</label><input type="text" id="ltx-mainMark" value="KSN-SN20260305-MG-01S"></div>
                        </div>
                    </details>
                    <hr class="logistics-section-divider">
                    <div class="logistics-section-title">物料参数</div>
                    <div class="logistics-config-grid">
                        <div class="logistics-form-group">
                            <label>托盘数量 <span class="required">*</span></label>
                            <div class="logistics-quantity-input"><input type="number" id="ltx-palletQty" placeholder="总数" min="1"><span class="logistics-quantity-unit">个</span></div>
                        </div>
                        <div class="logistics-form-group"><label>托盘备注</label><input type="text" id="ltx-palletRemarks" placeholder="01-141#、142-143#"></div>
                        <div class="logistics-form-group">
                            <label>英文单套预装明细</label>
                            <div class="logistics-quantity-input"><input type="number" id="ltx-kitQty" placeholder="数量" min="0"><span class="logistics-quantity-unit">个</span></div>
                        </div>
                        <div class="logistics-form-group"><label>英文套装备注</label><input type="text" id="ltx-kitRemarks"></div>
                        <div class="logistics-form-group">
                            <label>中文包装清单参考</label>
                            <div class="logistics-quantity-input"><input type="number" id="ltx-chineseQty" placeholder="数量" min="0"><span class="logistics-quantity-unit">个</span></div>
                        </div>
                        <div class="logistics-form-group"><label>中文清单备注</label><input type="text" id="ltx-chineseRemarks"></div>
                    </div>
                    <div class="logistics-form-group">
                        <label>上传 PDF 排柜图 <span class="required">*</span></label>
                        <div class="logistics-upload-area" id="ltx-uploadArea">
                            <p>点击上传 PDF 文件（排柜图）</p>
                            <p style="font-size:11px;margin-top:2px;">支持格式：.pdf，最大 20MB</p>
                            <input type="file" id="ltx-pdfFile" accept=".pdf">
                            <div class="file-name" id="ltx-pdfFileName"></div>
                        </div>
                    </div>
                    <div class="logistics-btn-group">
                        <button class="logistics-ai-btn" id="ltx-aiBtn">AI 自动提取编排</button>
                        <select id="ltx-sendMode" class="logistics-mode-select">
                            <option value="text" selected>仅文本</option>
                            <option value="both">图片+文本</option>
                            <option value="image">仅图片</option>
                        </select>
                        <button class="logistics-stop-btn" id="ltx-stopBtn" disabled>停止</button>
                    </div>
                    <div class="logistics-progress" id="ltx-progress">
                        <div class="prog-header"><div class="prog-spinner"></div><span class="prog-text" id="ltx-progressText">等待中...</span></div>
                        <div class="prog-bar"><div class="prog-fill" id="ltx-progressFill" style="width:0%"></div></div>
                    </div>
                </div>
                <div class="logistics-right">
                    <div class="logistics-result-toolbar" id="ltx-resultToolbar">
                        <div class="logistics-toolbar-stats">
                            <span class="logistics-toolbar-stat"><b id="ltx-statPallet">0</b>托盘</span>
                            <span class="logistics-toolbar-stat"><b id="ltx-statEnglish">0</b>英文套装</span>
                            <span class="logistics-toolbar-stat"><b id="ltx-statChinese">0</b>中文清单</span>
                        </div>
                        <button class="logistics-action-btn green" id="ltx-genEn">生成英文Excel</button>
                        <button class="logistics-action-btn green" id="ltx-genJa">生成日文Excel</button>
                        <button class="logistics-action-btn" id="ltx-downloadEn" style="display:none;">下载英文</button>
                        <button class="logistics-action-btn" id="ltx-downloadJa" style="display:none;">下载日文</button>
                        <button class="logistics-action-btn" id="ltx-downloadJson">下载JSON</button>
                        <button class="logistics-action-btn" id="ltx-toggleJson">JSON面板</button>
                    </div>
                    <div class="logistics-chat-messages" id="ltx-chatMessages">
                        <div class="logistics-chat-empty" id="ltx-chatEmpty">上传PDF并点击「AI 自动提取编排」开始</div>
                    </div>
                    <div class="logistics-json-section" id="ltx-jsonSection">
                        ${['pallet','english','chinese'].map(key => {
                            const names = {pallet:'托盘清单.json',english:'英文单套预装明细.json',chinese:'中文包装清单参考.json'};
                            return `<div class="logistics-json-accordion" id="ltx-acc-${key}">
                                <div class="logistics-json-accordion-header" data-key="${key}">
                                    <span class="logistics-json-accordion-arrow">&#9654;</span>
                                    <span>${names[key]}</span>
                                    <span id="ltx-count-${key}" style="font-weight:400;color:#94a3b8;font-size:10px;"></span>
                                    <div class="logistics-json-accordion-actions">
                                        <button class="logistics-json-edit-btn" id="ltx-editBtn-${key}" data-key="${key}" data-action="edit">编辑</button>
                                        <button class="logistics-json-edit-btn save" id="ltx-saveBtn-${key}" data-key="${key}" data-action="save" style="display:none;">保存</button>
                                        <button class="logistics-json-edit-btn cancel" id="ltx-cancelBtn-${key}" data-key="${key}" data-action="cancel" style="display:none;">取消</button>
                                    </div>
                                </div>
                                <div class="logistics-json-accordion-body">
                                    <pre id="ltx-display-${key}"></pre>
                                    <textarea id="ltx-editor-${key}" class="logistics-json-editor" style="display:none;" spellcheck="false"></textarea>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="logistics-chat-input-area">
                        <div class="logistics-supplement-panel" id="ltx-supplementPanel">
                            <span>补充PDF页码:</span>
                            <input type="text" id="ltx-supplementPages" placeholder="如: 4-6 或 1,3,5-7">
                            <button class="logistics-chat-send-btn" id="ltx-supplementGo">发送</button>
                            <button class="logistics-chat-send-btn" id="ltx-supplementCancel" style="background:#64748b;">取消</button>
                        </div>
                        <div class="logistics-chat-input-row">
                            <textarea id="ltx-chatInput" placeholder="请你单独补充剩下的21#-29#托盘..."></textarea>
                            <button class="logistics-chat-send-btn" id="ltx-chatSendBtn">发送</button>
                            <button class="logistics-chat-send-btn stop" id="ltx-chatStopBtn" style="display:none;">停止</button>
                            <button class="logistics-chat-send-btn continue-btn" id="ltx-chatContinueBtn" style="display:none;">继续输出</button>
                            <button class="logistics-chat-send-btn supplement" id="ltx-supplementBtn">补充页面</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    },

    _bind() {
        const $ = (id) => document.getElementById(id);
        const s = this._state;
        const self = this;

        $('ltx-modelSelect').addEventListener('change', function() {
            if (this.value === 'kimi-k2.6') {
                $('ltx-apiBaseUrl').value = 'https://api.moonshot.cn/v1';
                $('ltx-apiKey').value = 'sk-kimi-NO30oeeIDGEYtBeuqU5awSbb3vdtt5evkpMprYo5emfZtQCNtthx2HKmKUApA5nn';
            } else {
                $('ltx-apiBaseUrl').value = 'https://open.bigmodel.cn/api/anthropic';
                $('ltx-apiKey').value = 'ce3cb32501964392ac95daae09cbf8f9.jg7ypsXoBTZccnp3';
            }
        });

        $('ltx-pdfFile').addEventListener('change', function() {
            const file = this.files[0];
            const nameSpan = $('ltx-pdfFileName');
            if (file) {
                if (file.type !== 'application/pdf') { self._toast('请上传PDF文件','error'); this.value=''; nameSpan.innerHTML=''; return; }
                if (file.size > 20*1024*1024) { self._toast('文件不能超过20MB','error'); this.value=''; nameSpan.innerHTML=''; return; }
                nameSpan.innerHTML = `已选择: ${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`;
            } else { nameSpan.innerHTML = ''; }
        });

        $('ltx-aiBtn').addEventListener('click', () => self._sendToAI($('ltx-sendMode').value));
        $('ltx-stopBtn').addEventListener('click', () => self._stopAI());

        $('ltx-chatSendBtn').addEventListener('click', () => self._sendChat());
        $('ltx-chatStopBtn').addEventListener('click', () => self._stopChat());
        $('ltx-chatContinueBtn').addEventListener('click', () => self._continueOutput());
        $('ltx-supplementBtn').addEventListener('click', () => {
            const panel = $('ltx-supplementPanel');
            panel.classList.toggle('visible');
            if (panel.classList.contains('visible')) $('ltx-supplementPages').focus();
        });
        $('ltx-supplementGo').addEventListener('click', () => self._doSupplement());
        $('ltx-supplementCancel').addEventListener('click', () => { $('ltx-supplementPanel').classList.remove('visible'); });
        $('ltx-supplementPages').addEventListener('keydown', (e) => { if(e.key==='Enter'){e.preventDefault();self._doSupplement();} });
        $('ltx-chatInput').addEventListener('keydown', (e) => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();self._sendChat();} });

        $('ltx-genEn').addEventListener('click', () => self._runScript('en'));
        $('ltx-genJa').addEventListener('click', () => self._runScript('ja'));
        $('ltx-downloadEn').addEventListener('click', () => self._downloadExcel('en'));
        $('ltx-downloadJa').addEventListener('click', () => self._downloadExcel('ja'));
        $('ltx-downloadJson').addEventListener('click', () => self._downloadAllJSON());
        $('ltx-toggleJson').addEventListener('click', () => {
            $('ltx-jsonSection').classList.toggle('visible');
        });

        document.querySelectorAll('[data-key]').forEach(el => {
            el.addEventListener('click', function(e) {
                const key = this.getAttribute('data-key');
                const action = this.getAttribute('data-action');
                if (action === 'edit') { e.stopPropagation(); self._toggleEdit(key); }
                else if (action === 'save') { e.stopPropagation(); self._saveEdit(key); }
                else if (action === 'cancel') { e.stopPropagation(); self._cancelEdit(key); }
                else if (!action) { self._toggleAccordion(key); }
            });
        });
    },

    _toast(msg, type='success') {
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;padding:8px 18px;border-radius:30px;font-size:12px;z-index:10001;color:white;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:logistics-spin 0.3s ease;`;
        toast.style.background = type==='success'?'#10b981':type==='error'?'#ef4444':'#f59e0b';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    _showContinueBtn() {
        const s = this._state;
        const last = s.chatMessages[s.chatMessages.length-1];
        if (!last || last.role !== 'assistant' || !last.content) return;
        const btn = document.getElementById('ltx-chatContinueBtn');
        if (btn) btn.style.display = '';
    },

    _hideContinueBtn() {
        const btn = document.getElementById('ltx-chatContinueBtn');
        if (btn) btn.style.display = 'none';
    },

    _addMsg(role, content, extraClass) {
        const s = this._state;
        s.chatMessages.push({role, content, extraClass: extraClass||''});
        const el = document.getElementById('ltx-chatMessages');
        const empty = document.getElementById('ltx-chatEmpty');
        if (empty) empty.style.display = 'none';
        const escaped = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const cls = [role, extraClass||''].filter(Boolean).join(' ');
        const div = document.createElement('div');
        div.className = `logistics-chat-msg ${cls}`;
        div.innerHTML = `<div class="logistics-chat-bubble">${escaped}</div>`;
        el.appendChild(div);
        el.scrollTop = el.scrollHeight;
    },

    _updateLastMsg(content) {
        const s = this._state;
        if (!s.chatMessages.length) return;
        s.chatMessages[s.chatMessages.length-1].content = content;
        const el = document.getElementById('ltx-chatMessages');
        const bubbles = el.querySelectorAll('.logistics-chat-msg.assistant .logistics-chat-bubble');
        if (bubbles.length > 0) bubbles[bubbles.length-1].textContent = content;
    },

    _renderMessages() {
        const s = this._state;
        const el = document.getElementById('ltx-chatMessages');
        const empty = document.getElementById('ltx-chatEmpty');
        if (!s.chatMessages.length) { if(empty) empty.style.display=''; return; }
        if (empty) empty.style.display = 'none';
        el.innerHTML = s.chatMessages.map(m => {
            const escaped = m.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const cls = [m.role, m.extraClass||''].filter(Boolean).join(' ');
            return `<div class="logistics-chat-msg ${cls}"><div class="logistics-chat-bubble">${escaped}</div></div>`;
        }).join('');
        el.scrollTop = el.scrollHeight;
    },

    _updateProgress(pct, msg) {
        const fill = document.getElementById('ltx-progressFill');
        const text = document.getElementById('ltx-progressText');
        if (fill) fill.style.width = pct+'%';
        if (text && msg) text.textContent = msg;
    },

    _updateTokenDisplay() {
        const s = this._state;
        const $ = id => document.getElementById(id);
        $('ltx-tokenIn').textContent = s.tokenStats.input.toLocaleString();
        $('ltx-tokenOut').textContent = s.tokenStats.output.toLocaleString();
        $('ltx-tokenTotal').textContent = (s.tokenStats.input+s.tokenStats.output).toLocaleString();
        $('ltx-tokenCalls').textContent = s.tokenStats.calls;
        const cost = (s.tokenStats.input*0.01+s.tokenStats.output*0.01)/1000;
        $('ltx-tokenCost').textContent = `¥${cost.toFixed(4)}`;
    },

    _addTokens(inT, outT) {
        const s = this._state;
        s.tokenStats.input += inT;
        s.tokenStats.output += outT;
        s.tokenStats.calls += 1;
        this._updateTokenDisplay();
    },

    _refreshAccordions() {
        const s = this._state;
        ['pallet','english','chinese'].forEach(key => {
            const data = s.generatedJSONs[key];
            const countEl = document.getElementById(`ltx-count-${key}`);
            if (countEl) countEl.textContent = data&&data.length ? `(${data.length}条)` : '(空)';
            const display = document.getElementById(`ltx-display-${key}`);
            if (display && !s.editingState[key]) display.textContent = data ? JSON.stringify(data,null,2) : '// 空';
        });
        const statMap = {pallet:'ltx-statPallet',english:'ltx-statEnglish',chinese:'ltx-statChinese'};
        ['pallet','english','chinese'].forEach(key => {
            const statEl = document.getElementById(statMap[key]);
            if (statEl) statEl.textContent = s.generatedJSONs[key] ? s.generatedJSONs[key].length : 0;
        });
    },

    _toggleAccordion(key) {
        const s = this._state;
        if (s.editingState[key]) return;
        document.getElementById(`ltx-acc-${key}`).classList.toggle('open');
    },

    _toggleEdit(key) {
        const s = this._state;
        if (s.editingState[key]) return;
        const data = s.generatedJSONs[key];
        if (!data) { this._toast('无数据可编辑','error'); return; }
        s.editingState[key] = true;
        document.getElementById(`ltx-display-${key}`).style.display = 'none';
        const editor = document.getElementById(`ltx-editor-${key}`);
        editor.value = JSON.stringify(data,null,2);
        editor.style.display = 'block';
        document.getElementById(`ltx-editBtn-${key}`).style.display = 'none';
        document.getElementById(`ltx-saveBtn-${key}`).style.display = '';
        document.getElementById(`ltx-cancelBtn-${key}`).style.display = '';
        document.getElementById(`ltx-acc-${key}`).classList.add('open');
    },

    _cancelEdit(key) {
        const s = this._state;
        s.editingState[key] = false;
        document.getElementById(`ltx-editor-${key}`).style.display = 'none';
        document.getElementById(`ltx-display-${key}`).style.display = '';
        document.getElementById(`ltx-editBtn-${key}`).style.display = '';
        document.getElementById(`ltx-saveBtn-${key}`).style.display = 'none';
        document.getElementById(`ltx-cancelBtn-${key}`).style.display = 'none';
    },

    async _saveEdit(key) {
        const s = this._state;
        const editor = document.getElementById(`ltx-editor-${key}`);
        let parsed;
        try { parsed = JSON.parse(editor.value); } catch(e) { this._toast('JSON格式错误: '+e.message,'error'); return; }
        const names = {pallet:'托盘清单.json',english:'英文单套预装明细.json',chinese:'中文包装清单参考.json'};
        try {
            const resp = await fetch('/api/logistics/save-json', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({sessionId:s.sessionId, filename:names[key], data:parsed})
            });
            const result = await resp.json();
            if (!result.ok) { this._toast('保存失败: '+result.error,'error'); return; }
        } catch(e) { this._toast('保存失败: '+e.message,'error'); return; }
        s.generatedJSONs[key] = parsed;
        this._cancelEdit(key);
        this._refreshAccordions();
        this._toast(names[key]+' 已保存');
    },

    _mergeJsonArray(existing, incoming, ...keyFields) {
        if (!existing||!existing.length) return incoming||[];
        if (!incoming||!incoming.length) return existing;
        const keySet = new Set();
        existing.forEach(item => { for(const kf of keyFields) { if(item[kf]!==undefined&&String(item[kf]).trim()) keySet.add(String(item[kf]).trim()); } });
        const result = [...existing];
        incoming.forEach(item => { let exists=false; for(const kf of keyFields) { const v=item[kf]!==undefined?String(item[kf]).trim():''; if(v&&keySet.has(v)) { exists=true; break; } } if(!exists) result.push(item); });
        return result;
    },

    _applyJsonUpdate(evt) {
        const s = this._state;
        if (evt.pallet) s.generatedJSONs.pallet = this._mergeJsonArray(s.generatedJSONs.pallet, evt.pallet, '托盘序号','托盘编码');
        if (evt.english) s.generatedJSONs.english = this._mergeJsonArray(s.generatedJSONs.english, evt.english, '套装编码');
        if (evt.chinese) s.generatedJSONs.chinese = this._mergeJsonArray(s.generatedJSONs.chinese, evt.chinese, '包装清单名称');
        this._refreshAccordions();
    },

    _buildJsonContext() {
        const s = this._state;
        const parts = [];
        if (s.generatedJSONs.pallet&&s.generatedJSONs.pallet.length)
            parts.push(`当前托盘清单数据：\n${JSON.stringify(s.generatedJSONs.pallet,null,2)}`);
        if (s.generatedJSONs.english&&s.generatedJSONs.english.length)
            parts.push(`当前英文单套预装明细数据：\n${JSON.stringify(s.generatedJSONs.english,null,2)}`);
        if (s.generatedJSONs.chinese&&s.generatedJSONs.chinese.length)
            parts.push(`当前中文包装清单参考数据：\n${JSON.stringify(s.generatedJSONs.chinese,null,2)}`);
        return parts.join('\n\n');
    },

    async _ensureSession() {
        const s = this._state;
        if (s.sessionId) return s.sessionId;
        try {
            const resp = await fetch('/api/logistics/session', {method:'POST'});
            const data = await resp.json();
            if (data.ok) s.sessionId = data.sessionId;
        } catch(e) {}
        return s.sessionId;
    },

    _setUI(running) {
        const $ = id => document.getElementById(id);
        $('ltx-aiBtn').disabled = running;
        $('ltx-sendMode').disabled = running;
        if (running) $('ltx-aiBtn').classList.add('running');
        else $('ltx-aiBtn').classList.remove('running');
    },

    async _sendToAI(mode) {
        const s = this._state;
        const $ = id => document.getElementById(id);
        if (s.isRunning) { this._toast('AI正在处理中','warning'); return; }

        const pdfFile = $('ltx-pdfFile').files[0];
        const palletQty = parseInt($('ltx-palletQty').value)||0;
        const kitQty = parseInt($('ltx-kitQty').value)||0;
        const chineseQty = parseInt($('ltx-chineseQty').value)||0;
        if (!pdfFile) { this._toast('请上传PDF文件','error'); return; }
        if (palletQty<=0) { this._toast('请输入托盘数量','error'); return; }
        const apiBase = $('ltx-apiBaseUrl').value.trim().replace(/\/$/,'');
        const apiKey = $('ltx-apiKey').value.trim();
        const model = $('ltx-modelSelect').value;
        if (!apiKey) { this._toast('请输入API Key','error'); return; }

        s.chatMessages = [];
        s.generatedJSONs = {pallet:null,english:null,chinese:null};
        s.generatedFilenames = {en:null,ja:null};
        s.editingState = {pallet:false,english:false,chinese:false};
        s.tokenStats = {input:0,output:0,calls:0};
        this._updateTokenDisplay();
        $('ltx-chatMessages').innerHTML = '';
        const emptyEl = $('ltx-chatEmpty');
        if (emptyEl) emptyEl.style.display = '';
        $('ltx-resultToolbar').classList.remove('visible');
        $('ltx-jsonSection').classList.remove('visible');
        $('ltx-downloadEn').style.display = 'none';
        $('ltx-downloadJa').style.display = 'none';
        this._hideContinueBtn();
        s.sessionId = '';

        await this._ensureSession();
        if (!s.sessionId) { this._toast('无法创建会话','error'); return; }

        s.isRunning = true;
        $('ltx-progress').classList.add('active');
        this._setUI(true);
        $('ltx-stopBtn').disabled = false;

        const modeLabels = {both:'图片+文本',image:'仅图片',text:'仅文本'};
        this._addMsg('system',`开始处理 PDF: ${pdfFile.name} | 模式: ${modeLabels[mode]} | 模型: ${model}`,'info');

        try {
            s.abortController = new AbortController();
            const formData = new FormData();
            formData.append('pdf', pdfFile);
            formData.append('palletQty', palletQty);
            formData.append('kitQty', kitQty);
            formData.append('chineseQty', chineseQty);
            formData.append('palletRemarks', $('ltx-palletRemarks').value||'');
            formData.append('kitRemarks', $('ltx-kitRemarks').value||'');
            formData.append('chineseRemarks', $('ltx-chineseRemarks').value||'');
            formData.append('apiBase', apiBase);
            formData.append('apiKey', apiKey);
            formData.append('model', model);
            formData.append('sendMode', mode);
            formData.append('sessionId', s.sessionId);

            this._updateProgress(10,'正在连接后端...');
            const response = await fetch('/api/logistics/generate', {method:'POST',body:formData,signal:s.abortController.signal});

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let progress = 10;
            let streamReply = '';

            while (true) {
                const {done,value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream:true});
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    let evt;
                    try { evt = JSON.parse(line.slice(6)); } catch(e) { continue; }
                    if (evt.type==='status') { this._addMsg('system',evt.msg,'info'); }
                    else if (evt.type==='send') {
                        this._addMsg('system',`已发送: ${evt.label}`,'info');
                        progress = Math.min(progress+5,30);
                        this._updateProgress(progress,`已发送...`);
                        this._addMsg('assistant','');
                        streamReply = '';
                    } else if (evt.type==='token') {
                        streamReply += evt.text;
                        this._updateLastMsg(streamReply);
                        if (streamReply.length%200<evt.text.length) { progress=Math.min(30+(streamReply.length/200)%50,80); this._updateProgress(progress,`AI回复中... (${streamReply.length}字)`); }
                    } else if (evt.type==='recv') {
                        if (evt.tokens) this._addTokens(evt.tokens.input,evt.tokens.output);
                        progress = Math.min(progress+5,90);
                        this._updateProgress(progress,'解析中...');
                    } else if (evt.type==='parsed') {
                        this._addMsg('system',evt.msg,evt.ok?'ok':'err');
                    } else if (evt.type==='done') {
                        const saved = evt.saved||{};
                        this._addMsg('system',`保存完成 - 托盘:${saved.pallet||0} 套装:${saved.english||0} 清单:${saved.chinese||0}`,'ok');
                        s.generatedJSONs = {pallet:evt.pallet,english:evt.english,chinese:evt.chinese};
                        this._updateProgress(100,'处理完成！');
                    } else if (evt.type==='error') { throw new Error(evt.msg); }
                }
            }
            await new Promise(r=>setTimeout(r,200));
            $('ltx-statPallet').textContent = s.generatedJSONs.pallet?s.generatedJSONs.pallet.length:0;
            $('ltx-statEnglish').textContent = s.generatedJSONs.english?s.generatedJSONs.english.length:0;
            $('ltx-statChinese').textContent = s.generatedJSONs.chinese?s.generatedJSONs.chinese.length:0;
            $('ltx-resultToolbar').classList.add('visible');
            $('ltx-jsonSection').classList.add('visible');
            this._refreshAccordions();
            this._toast('JSON已生成');
            this._showContinueBtn();
        } catch(error) {
            if (error.name==='AbortError') { this._addMsg('system','请求已取消','err'); }
            else { this._addMsg('system',`错误: ${error.message}`,'err'); this._toast('处理失败','error'); }
        } finally {
            $('ltx-progress').classList.remove('active');
            this._setUI(false);
            $('ltx-stopBtn').disabled = true;
            s.isRunning = false;
            s.abortController = null;
        }
    },

    _stopAI() {
        const s = this._state;
        if (s.abortController) { s.abortController.abort(); s.abortController=null; }
        s.isRunning = false;
        document.getElementById('ltx-progress').classList.remove('active');
        this._setUI(false);
        document.getElementById('ltx-stopBtn').disabled = true;
        this._addMsg('system','已停止','err');
    },

    async _sendChat() {
        const s = this._state;
        const $ = id => document.getElementById(id);
        if (s.isRunning) { this._toast('AI正在运行','warning'); return; }
        const input = $('ltx-chatInput');
        const msg = input.value.trim();
        if (!s.sessionId) { this._toast('请先生成一次分析','error'); return; }
        if (!msg) return;
        const context = this._buildJsonContext();
        const fullMsg = context ? `${context}\n\n用户要求：${msg}` : msg;
        this._addMsg('user', msg);
        input.value = '';
        this._hideContinueBtn();
        $('ltx-chatSendBtn').style.display = 'none';
        $('ltx-chatStopBtn').style.display = '';
        this._addMsg('assistant','');
        s.chatAbortController = new AbortController();
        s.chatStreamActive = true;
        try {
            const resp = await fetch('/api/logistics/chat', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({sessionId:s.sessionId, message:fullMsg}),
                signal:s.chatAbortController.signal
            });
            const reader = resp.body.getReader();
            s.chatStreamReader = reader;
            const decoder = new TextDecoder();
            let buffer = '';
            let fullReply = '';
            while (s.chatStreamActive) {
                const {done,value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value,{stream:true});
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    let evt; try{evt=JSON.parse(line.slice(6));}catch(e){continue;}
                    if (evt.type==='token') { fullReply+=evt.text; this._updateLastMsg(fullReply); }
                    else if (evt.type==='done') { s.chatMessages[s.chatMessages.length-1].content=evt.reply||fullReply; if(evt.updated) this._applyJsonUpdate(evt); if(evt.tokens) this._addTokens(evt.tokens.input,evt.tokens.output); }
                    else if (evt.type==='error') { s.chatMessages[s.chatMessages.length-1].content=`[错误] ${evt.msg}`; }
                }
            }
            if (!s.chatStreamActive&&fullReply) { try{reader.cancel();}catch(e){} }
            if (!s.chatMessages[s.chatMessages.length-1].content&&fullReply) s.chatMessages[s.chatMessages.length-1].content=fullReply;
        } catch(e) {
            if (e.name==='AbortError') { if(!s.chatMessages[s.chatMessages.length-1].content) s.chatMessages[s.chatMessages.length-1].content='[已停止]'; }
            else { s.chatMessages[s.chatMessages.length-1].content=`[网络错误] ${e.message}`; }
        }
        s.chatAbortController = null;
        this._renderMessages();
        $('ltx-chatStopBtn').style.display='none';
        $('ltx-chatSendBtn').style.display='';
        this._showContinueBtn();
        input.focus();
    },

    _stopChat() {
        const s = this._state;
        s.chatStreamActive = false;
        if (s.chatStreamReader) { try{s.chatStreamReader.cancel();}catch(e){} s.chatStreamReader=null; }
        if (s.chatAbortController) { s.chatAbortController.abort(); s.chatAbortController=null; }
        document.getElementById('ltx-chatStopBtn').style.display='none';
        document.getElementById('ltx-chatSendBtn').style.display='';
        if (s.chatMessages.length>0&&!s.chatMessages[s.chatMessages.length-1].content) {
            s.chatMessages[s.chatMessages.length-1].content='[已停止]';
            this._renderMessages();
        }
    },

    async _continueOutput() {
        const s = this._state;
        const $ = id => document.getElementById(id);
        if (!s.sessionId) return;
        this._hideContinueBtn();
        let lastAssistant = '';
        for (let i=s.chatMessages.length-1;i>=0;i--) { if(s.chatMessages[i].role==='assistant'&&s.chatMessages[i].content) { lastAssistant=s.chatMessages[i].content; break; } }
        if (!lastAssistant) return;
        const tail = lastAssistant.slice(-3000);
        const prompt = `你上次的输出在下面这段内容处中断了，请从中断处继续输出，不要重复已有内容。如果之前的JSON数组没有写完，请从最后一个未完成的数组继续。不要从头开始。\n\n--- 上次输出的末尾 ---\n${tail}\n--- 末尾结束 ---`;
        $('ltx-chatSendBtn').style.display='none';
        $('ltx-chatStopBtn').style.display='';
        this._addMsg('user','(继续输出)');
        this._addMsg('assistant','');
        s.chatAbortController = new AbortController();
        try {
            const resp = await fetch('/api/logistics/chat', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({sessionId:s.sessionId, message:prompt}),
                signal:s.chatAbortController.signal
            });
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullReply = '';
            while (true) {
                const {done,value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value,{stream:true});
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    let evt; try{evt=JSON.parse(line.slice(6));}catch(e){continue;}
                    if (evt.type==='token') { fullReply+=evt.text; this._updateLastMsg(fullReply); }
                    else if (evt.type==='done') { s.chatMessages[s.chatMessages.length-1].content=evt.reply||fullReply; if(evt.updated) this._applyJsonUpdate(evt); if(evt.tokens) this._addTokens(evt.tokens.input,evt.tokens.output); }
                    else if (evt.type==='error') { s.chatMessages[s.chatMessages.length-1].content=`[错误] ${evt.msg}`; }
                }
            }
            if (!s.chatMessages[s.chatMessages.length-1].content&&fullReply) s.chatMessages[s.chatMessages.length-1].content=fullReply;
        } catch(e) {
            if (e.name==='AbortError') { if(!s.chatMessages[s.chatMessages.length-1].content) s.chatMessages[s.chatMessages.length-1].content='[已停止]'; }
            else { s.chatMessages[s.chatMessages.length-1].content=`[网络错误] ${e.message}`; }
        }
        s.chatAbortController = null;
        this._renderMessages();
        $('ltx-chatStopBtn').style.display='none';
        $('ltx-chatSendBtn').style.display='';
        this._showContinueBtn();
    },

    async _doSupplement() {
        const s = this._state;
        const $ = id => document.getElementById(id);
        if (!s.sessionId) { this._toast('请先生成一次分析','error'); return; }
        const pagesInput = $('ltx-supplementPages').value.trim();
        if (!pagesInput) { this._toast('请输入页码','error'); return; }
        const chatInputEl = $('ltx-chatInput');
        const userMsg = chatInputEl.value.trim();
        chatInputEl.value = '';
        $('ltx-supplementPanel').classList.remove('visible');
        this._addMsg('system',`正在提取PDF第 ${pagesInput} 页的文本...`,'info');
        try {
            const resp = await fetch('/api/logistics/extract-pages', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({sessionId:s.sessionId, pages:pagesInput})
            });
            const result = await resp.json();
            if (!result.ok) { this._addMsg('system',`提取失败: ${result.error}`,'err'); return; }
            this._addMsg('system',`已提取第 ${result.pages.join(', ')} 页文本 (${result.text.length} 字)`,'ok');
            let prompt = `以下是PDF中之前缺失的第 ${result.pages.join(',')} 页的文本内容。请只从下面的文本中提取新出现的托盘数据，用 ===托盘清单=== 标记包裹。\n\n--- 文本 ---\n${result.text}`;
            if (userMsg) prompt = `${userMsg}\n\n--- 附带PDF第${result.pages.join(',')}页文本 ---\n${result.text}`;
            this._addMsg('user', userMsg ? `${userMsg} (附带PDF第 ${result.pages.join(',')} 页文本)` : `(补充PDF第 ${result.pages.join(',')} 页文本)`);
            this._addMsg('assistant','');
            $('ltx-chatSendBtn').style.display='none';
            $('ltx-chatStopBtn').style.display='';
            s.chatAbortController = new AbortController();
            s.chatStreamActive = true;
            try {
                const chatResp = await fetch('/api/logistics/chat', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({sessionId:s.sessionId, message:prompt}),
                    signal:s.chatAbortController.signal
                });
                const reader = chatResp.body.getReader();
                s.chatStreamReader = reader;
                const decoder = new TextDecoder();
                let buffer = '';
                let fullReply = '';
                while (s.chatStreamActive) {
                    const {done,value} = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value,{stream:true});
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        let evt; try{evt=JSON.parse(line.slice(6));}catch(e){continue;}
                        if (evt.type==='token') { fullReply+=evt.text; this._updateLastMsg(fullReply); }
                    else if (evt.type==='done') { console.log('[CHAT done]', 'updated=', evt.updated, 'pallet=', evt.pallet?evt.pallet.length:'null'); s.chatMessages[s.chatMessages.length-1].content=evt.reply||fullReply; if(evt.updated) this._applyJsonUpdate(evt); if(evt.tokens) this._addTokens(evt.tokens.input,evt.tokens.output); }
                        else if (evt.type==='error') { s.chatMessages[s.chatMessages.length-1].content=`[错误] ${evt.msg}`; }
                    }
                }
                if (!s.chatStreamActive&&fullReply) { try{reader.cancel();}catch(e){} }
                if (!s.chatMessages[s.chatMessages.length-1].content&&fullReply) s.chatMessages[s.chatMessages.length-1].content=fullReply;
            } catch(e) {
                if (e.name==='AbortError') { if(!s.chatMessages[s.chatMessages.length-1].content) s.chatMessages[s.chatMessages.length-1].content='[已停止]'; }
                else { s.chatMessages[s.chatMessages.length-1].content=`[网络错误] ${e.message}`; }
            }
            s.chatAbortController = null;
            s.chatStreamReader = null;
            this._renderMessages();
            $('ltx-chatStopBtn').style.display='none';
            $('ltx-chatSendBtn').style.display='';
            this._showContinueBtn();
        } catch(e) {
            this._addMsg('system',`提取失败: ${e.message}`,'err');
        }
    },

    async _runScript(lang) {
        const s = this._state;
        if (!s.generatedJSONs.pallet&&!s.generatedJSONs.english&&!s.generatedJSONs.chinese) { this._toast('请先生成JSON','error'); return; }
        const langLabel = lang==='ja'?'日文':'英文';
        this._addMsg('system',`正在运行 ${langLabel} Excel脚本...`,'info');
        try {
            const resp = await fetch('/api/logistics/run-script', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({sessionId:s.sessionId, lang:lang})
            });
            const result = await resp.json();
            if (result.ok) {
                const filename = result.filename || `物流汇总表v10_${lang}.xlsx`;
                s.generatedFilenames[lang] = filename;
                const btn = document.getElementById(lang==='en'?'ltx-downloadEn':'ltx-downloadJa');
                btn.textContent = `下载 ${filename}`;
                btn.style.display = '';
                this._addMsg('system',`${langLabel} Excel生成成功: ${filename}`,'ok');
                this._toast(`${langLabel} Excel生成成功`);
            } else {
                this._addMsg('system',`${langLabel} Excel失败: ${result.error||result.stderr||''}`,'err');
                this._toast('Excel生成失败','error');
            }
        } catch(e) {
            this._addMsg('system',`请求失败: ${e.message}`,'err');
        }
    },

    _downloadExcel(lang) {
        const s = this._state;
        const filename = s.generatedFilenames[lang];
        if (!filename||!s.sessionId) { this._toast('请先生成Excel','error'); return; }
        window.open(`/api/logistics/download/${s.sessionId}/${filename}`);
    },

    _downloadAllJSON() {
        const s = this._state;
        const download = (data, filename) => {
            if (!data) return;
            const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json;charset=utf-8'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
        };
        download(s.generatedJSONs.pallet, '托盘清单.json');
        setTimeout(()=>download(s.generatedJSONs.english, '英文单套预装明细.json'), 200);
        setTimeout(()=>download(s.generatedJSONs.chinese, '中文包装清单参考.json'), 400);
        this._toast('已下载全部JSON');
    },
};

window.LogisticsPage = LogisticsPage;
