;(function () {
    var CAD_API_BASE = typeof KS_API_BASE_URL !== 'undefined' ? KS_API_BASE_URL : '';
    var DEFAULT_ANALYZE_PROMPT = '请先识别这张图纸中的阵列情况，列出每一组阵列的数量、总数和判断依据。';

    var state = { sessionId: null, busy: false, fileName: '', fileMode: '' };
    var el = {};
    var beforeUnloadHandler = null;

    function initializeElements() {
        el.fileInput = document.getElementById('cad-file-input');
        el.uploadButton = document.getElementById('cad-upload-trigger-btn');
        el.resetButton = document.getElementById('cad-reset-session-btn');
        el.autoAnalyzeButton = document.getElementById('cad-analyze-now-btn');
        el.statusBanner = document.getElementById('cad-status-banner');
        el.currentFileName = document.getElementById('cad-current-file-name');
        el.currentFileMode = document.getElementById('cad-current-file-mode');
        el.filePreviewList = document.getElementById('cad-file-preview-list');
        el.messageList = document.getElementById('cad-message-list');
        el.emptyState = document.getElementById('cad-empty-state');
        el.chatForm = document.getElementById('cad-chat-form');
        el.chatInput = document.getElementById('cad-chat-input');
        el.sendButton = document.getElementById('cad-send-btn');
        el.quickButtons = Array.from(document.querySelectorAll('[data-cad-prompt]'));
        el.sessionPill = document.getElementById('cad-session-pill');
        el.sessionMeta = document.getElementById('cad-session-meta');
    }

    function bindEvents() {
        if (el.uploadButton) {
            el.uploadButton.addEventListener('click', function () {
                if (el.fileInput) el.fileInput.click();
            });
        }
        if (el.fileInput) {
            el.fileInput.addEventListener('change', function (event) {
                var file = event.target.files && event.target.files[0];
                if (!file) return;
                uploadCadFile(file);
                el.fileInput.value = '';
            });
        }
        if (el.resetButton) {
            el.resetButton.addEventListener('click', function () {
                destroySession({ silent: true });
                resetView();
                showStatus('已清空当前会话，可以重新上传图纸。', 'info');
            });
        }
        if (el.autoAnalyzeButton) {
            el.autoAnalyzeButton.addEventListener('click', function () {
                sendPrompt(DEFAULT_ANALYZE_PROMPT);
            });
        }
        if (el.chatForm) {
            el.chatForm.addEventListener('submit', function (event) {
                event.preventDefault();
                var prompt = String(el.chatInput ? el.chatInput.value : '').trim();
                if (!prompt) return;
                sendPrompt(prompt);
            });
        }
        el.quickButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                var prompt = button.dataset.cadPrompt || '';
                sendPrompt(prompt);
            });
        });
        beforeUnloadHandler = function () {
            destroySession({ silent: true, keepalive: true });
        };
        window.addEventListener('beforeunload', beforeUnloadHandler);
    }

    function resetView() {
        state.sessionId = null;
        state.busy = false;
        state.fileName = '';
        state.fileMode = '';
        if (el.currentFileName) el.currentFileName.textContent = '未上传';
        if (el.currentFileMode) el.currentFileMode.textContent = '待准备';
        if (el.filePreviewList) el.filePreviewList.innerHTML = '<li>上传后会显示图纸摘要和会话状态。</li>';
        if (el.messageList) el.messageList.innerHTML = '';
        if (el.emptyState) {
            el.emptyState.style.display = 'block';
            el.messageList.appendChild(el.emptyState);
        }
        if (el.sessionPill) el.sessionPill.textContent = '未开始会话';
        if (el.sessionMeta) el.sessionMeta.textContent = '上传图纸后即可进入连续对话。';
        if (el.chatInput) {
            el.chatInput.value = '';
            el.chatInput.disabled = true;
            el.chatInput.placeholder = '先上传图纸，再输入你的问题，例如：请帮我数一下这张图纸里总共有几组阵列。';
        }
        setComposerEnabled(false);
        renderBusyState(false);
    }

    function setComposerEnabled(enabled) {
        if (el.sendButton) el.sendButton.disabled = !enabled;
        if (el.chatInput) el.chatInput.disabled = !enabled;
        if (el.autoAnalyzeButton) el.autoAnalyzeButton.disabled = !enabled;
        if (el.resetButton) el.resetButton.disabled = !enabled;
        el.quickButtons.forEach(function (button) { button.disabled = !enabled; });
    }

    function renderBusyState(busy) {
        state.busy = busy;
        if (el.uploadButton) el.uploadButton.disabled = busy;
        if (el.sendButton) el.sendButton.disabled = busy || !state.sessionId;
        if (el.autoAnalyzeButton) el.autoAnalyzeButton.disabled = busy || !state.sessionId;
        el.quickButtons.forEach(function (button) { button.disabled = busy || !state.sessionId; });
    }

    function showStatus(message, type) {
        if (!el.statusBanner) return;
        if (!message) {
            el.statusBanner.textContent = '';
            el.statusBanner.className = 'cad-status';
            return;
        }
        el.statusBanner.textContent = message;
        el.statusBanner.className = 'cad-status ' + (type || 'info');
    }

    async function uploadCadFile(file) {
        if (state.busy) return;
        await destroySession({ silent: true });
        renderBusyState(true);
        showStatus('正在上传图纸 ' + file.name + '...', 'info');
        var formData = new FormData();
        formData.append('file', file);
        try {
            var response = await fetch(CAD_API_BASE + '/cad-assistant/sessions', {
                method: 'POST',
                body: formData,
            });
            var data = await readApiJson(response);
            if (!response.ok || data.success === false) {
                throw new Error(data.message || '上传失败: HTTP ' + response.status);
            }
            state.sessionId = data.session_id;
            state.fileName = (data.file && data.file.filename) || file.name;
            state.fileMode = (data.file && data.file.analysis_mode) || 'image';
            updateFilePanel(data.file, data.preview_lines || []);
            setComposerEnabled(true);
            renderBusyState(false);
            showStatus(data.message || '图纸上传成功。', 'success');
            setSessionState(true);
            appendAssistantMessage(
                (data.message || '图纸已准备完成。') + '\n你现在可以直接问我阵列数量，也可以点左侧的快速提问。',
                null
            );
        } catch (error) {
            renderBusyState(false);
            resetView();
            showStatus(error.message || '图纸上传失败。', 'error');
        }
    }

    function updateFilePanel(file, previewLines) {
        if (el.currentFileName) el.currentFileName.textContent = (file && file.filename) || '未命名文件';
        if (el.currentFileMode) el.currentFileMode.textContent = formatMode(file && file.analysis_mode);
        if (el.filePreviewList) {
            var items = Array.isArray(previewLines) && previewLines.length > 0
                ? previewLines
                : ['图纸已上传，可以开始提问。'];
            el.filePreviewList.innerHTML = items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
        }
    }

    function formatMode(mode) {
        if (mode === 'image') return '视觉识别';
        if (mode === 'dxf_summary') return 'DXF 结构摘要';
        if (mode === 'text_summary') return '文本摘要';
        return '待准备';
    }

    function setSessionState(ready) {
        if (el.sessionPill) el.sessionPill.textContent = ready ? '会话已就绪' : '未开始会话';
        if (el.sessionMeta) {
            el.sessionMeta.textContent = ready
                ? '当前图纸: ' + (state.fileName || '未命名文件')
                : '上传图纸后即可进入连续对话。';
        }
        if (el.chatInput && ready) {
            el.chatInput.placeholder = '继续追问，例如：哪一组阵列最不确定？';
        }
    }

    async function sendPrompt(prompt) {
        if (!state.sessionId || state.busy) return;
        var normalizedPrompt = String(prompt || '').trim();
        if (!normalizedPrompt) return;
        renderBusyState(true);
        showStatus('正在向 CAD 助手提问...', 'info');
        appendUserMessage(normalizedPrompt);
        if (el.chatInput) el.chatInput.value = '';
        var typingNode = appendTypingMessage();
        try {
            var response = await fetch(CAD_API_BASE + '/cad-assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: state.sessionId, message: normalizedPrompt }),
            });
            var data = await readApiJson(response);
            if (!response.ok || data.success === false) {
                throw new Error(data.message || '对话失败: HTTP ' + response.status);
            }
            removeNode(typingNode);
            appendAssistantMessage(data.reply, data.parsed || null);
            showStatus('识别完成，可以继续追问。', 'success');
        } catch (error) {
            removeNode(typingNode);
            appendAssistantMessage('这次识别失败：' + error.message, {
                confidence: 'low',
                array_summary: [],
                uncertainties: [],
                next_question: '',
            });
            showStatus(error.message || '对话失败。', 'error');
        } finally {
            renderBusyState(false);
        }
    }

    function appendUserMessage(text) {
        appendMessage({ role: 'user', text: text });
    }

    function appendAssistantMessage(text, parsed) {
        appendMessage({ role: 'assistant', text: text, parsed: parsed });
    }

    function appendMessage(message) {
        if (!el.messageList) return;
        if (el.emptyState && el.emptyState.parentNode) el.emptyState.remove();
        var wrapper = document.createElement('div');
        wrapper.className = 'message ' + message.role;
        var avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = message.role === 'assistant' ? 'AI' : 'ME';
        wrapper.appendChild(avatar);
        var bubbleWrap = document.createElement('div');
        bubbleWrap.className = 'bubble-wrap';
        var bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = message.text || '';
        bubbleWrap.appendChild(bubble);
        if (message.role === 'assistant' && message.parsed) {
            var extras = buildAssistantExtras(message.parsed);
            extras.forEach(function (node) { bubbleWrap.appendChild(node); });
        }
        var time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = formatNow();
        bubbleWrap.appendChild(time);
        wrapper.appendChild(bubbleWrap);
        el.messageList.appendChild(wrapper);
        scrollMessagesToBottom();
    }

    function buildAssistantExtras(parsed) {
        var nodes = [];
        var arraySummary = Array.isArray(parsed.array_summary) ? parsed.array_summary : [];
        var uncertainties = Array.isArray(parsed.uncertainties) ? parsed.uncertainties : [];
        if (arraySummary.length > 0) {
            var grid = document.createElement('div');
            grid.className = 'summary-grid';
            arraySummary.forEach(function (item) {
                var card = document.createElement('div');
                card.className = 'summary-card';
                var name = document.createElement('div');
                name.className = 'summary-name';
                name.textContent = item.name || '未命名阵列';
                card.appendChild(name);
                var total = document.createElement('div');
                total.className = 'summary-total';
                total.textContent = Number.isFinite(Number(item.total)) ? String(item.total) : '-';
                card.appendChild(total);
                var expression = document.createElement('div');
                expression.className = 'summary-eq';
                expression.textContent = item.count_expression || '未给出计算式';
                card.appendChild(expression);
                if (item.evidence) {
                    var evidence = document.createElement('div');
                    evidence.className = 'summary-eq';
                    evidence.textContent = '依据: ' + item.evidence;
                    card.appendChild(evidence);
                }
                grid.appendChild(card);
            });
            nodes.push(grid);
        }
        if (uncertainties.length > 0) {
            var notes = document.createElement('div');
            notes.className = 'assistant-notes';
            notes.textContent = '需要注意: ' + uncertainties.join('；');
            nodes.push(notes);
        }
        if (parsed.confidence || parsed.next_question) {
            var foot = document.createElement('div');
            foot.className = 'assistant-foot';
            if (parsed.confidence) {
                var confidence = document.createElement('span');
                confidence.className = 'confidence ' + parsed.confidence;
                confidence.textContent = '置信度: ' + formatConfidence(parsed.confidence);
                foot.appendChild(confidence);
            }
            if (parsed.next_question) {
                var next = document.createElement('span');
                next.className = 'message-time';
                next.textContent = '下一步建议: ' + parsed.next_question;
                foot.appendChild(next);
            }
            nodes.push(foot);
        }
        return nodes;
    }

    function appendTypingMessage() {
        if (!el.messageList) return null;
        if (el.emptyState && el.emptyState.parentNode) el.emptyState.remove();
        var wrapper = document.createElement('div');
        wrapper.className = 'message assistant';
        wrapper.dataset.typing = 'true';
        var avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = 'AI';
        wrapper.appendChild(avatar);
        var bubbleWrap = document.createElement('div');
        bubbleWrap.className = 'bubble-wrap';
        var bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
        bubbleWrap.appendChild(bubble);
        wrapper.appendChild(bubbleWrap);
        el.messageList.appendChild(wrapper);
        scrollMessagesToBottom();
        return wrapper;
    }

    function removeNode(node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
    }

    function scrollMessagesToBottom() {
        if (el.messageList) el.messageList.scrollTop = el.messageList.scrollHeight;
    }

    function formatNow() {
        var now = new Date();
        return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    function formatConfidence(value) {
        if (value === 'high') return '高';
        if (value === 'medium') return '中';
        return '低';
    }

    async function destroySession(options) {
        var currentSessionId = state.sessionId;
        if (!currentSessionId) return;
        state.sessionId = null;
        try {
            await fetch(CAD_API_BASE + '/cad-assistant/sessions/' + encodeURIComponent(currentSessionId), {
                method: 'DELETE',
                keepalive: options && options.keepalive === true,
            });
        } catch (error) {
            if (!options || !options.silent) {
                console.error('删除会话失败:', error);
            }
        }
    }

    window.CadPage = {
        init: function (containerEl) {
            containerEl.innerHTML = '<section class="section">' +
                '<h2>CAD 阵列助手</h2>' +
                '<p>上传 CAD 导出图或 DXF 文件，直接在当前页面连续提问阵列数量、每组排布和判断依据。</p>' +
                '<div class="cad-shell">' +
                '<div class="cad-side">' +
                '<div class="cad-card">' +
                '<h3>上传图纸</h3>' +
                '<div class="muted">推荐优先上传 PNG、JPG、WEBP、BMP 导出图。DWG 和 PDF 当前请先导出成图片或 DXF 再上传。</div>' +
                '<div class="toolbar" style="margin-top: 14px;">' +
                '<button class="btn primary" id="cad-upload-trigger-btn" type="button">选择图纸</button>' +
                '<button class="btn" id="cad-reset-session-btn" type="button" disabled>新建会话</button>' +
                '</div>' +
                '<input id="cad-file-input" type="file" accept=".png,.jpg,.jpeg,.webp,.bmp,.dxf,.txt,.csv,.dwg,.pdf" hidden />' +
                '<div id="cad-status-banner" class="cad-status"></div>' +
                '</div>' +
                '<div class="cad-card">' +
                '<h3>当前文件</h3>' +
                '<div class="cad-file-meta">' +
                '<div class="cad-meta-row"><span class="cad-meta-label">文件名</span><span class="cad-meta-value" id="cad-current-file-name">未上传</span></div>' +
                '<div class="cad-meta-row"><span class="cad-meta-label">识别模式</span><span class="cad-meta-value" id="cad-current-file-mode">待准备</span></div>' +
                '</div>' +
                '<ul class="cad-preview-list" id="cad-file-preview-list"><li>上传后会显示图纸摘要和会话状态。</li></ul>' +
                '</div>' +
                '<div class="cad-card">' +
                '<h3>快速提问</h3>' +
                '<div class="muted">图纸上传成功后，可以直接点击下面的模板问题。</div>' +
                '<div class="cad-quick-grid">' +
                '<button class="btn cad-quick-btn" type="button" data-cad-prompt="请先识别这张图纸中的阵列情况，列出每一组阵列的数量和总数。" disabled>识别全部阵列</button>' +
                '<button class="btn cad-quick-btn" type="button" data-cad-prompt="如果图纸里有组件排布，请只统计组件阵列，并说明是根据哪些标注判断的。" disabled>只看组件阵列</button>' +
                '<button class="btn cad-quick-btn" type="button" data-cad-prompt="请把你判断阵列数量的依据写清楚，分别说明是来自文字标注、重复块统计还是图形排布。" disabled>解释判断依据</button>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="cad-chat-shell">' +
                '<div class="cad-chat-top">' +
                '<div>' +
                '<div class="cad-session-pill" id="cad-session-pill">未开始会话</div>' +
                '<div class="cad-session-meta" id="cad-session-meta">上传图纸后即可进入连续对话。</div>' +
                '</div>' +
                '<button class="btn" id="cad-analyze-now-btn" type="button" disabled>先自动识别一次</button>' +
                '</div>' +
                '<div class="cad-message-list" id="cad-message-list">' +
                '<div class="cad-empty-state" id="cad-empty-state">这里会显示和 CAD 助手的对话记录。建议第一句直接问："请统计图中的阵列数量，并给出依据。"</div>' +
                '</div>' +
                '<div class="cad-composer">' +
                '<form class="cad-composer-form" id="cad-chat-form">' +
                '<div class="cad-composer-box">' +
                '<textarea id="cad-chat-input" placeholder="先上传图纸，再输入你的问题，例如：请帮我数一下这张图纸里总共有几组阵列。" disabled></textarea>' +
                '<button class="btn primary" id="cad-send-btn" type="submit" disabled>发送问题</button>' +
                '</div>' +
                '<div class="cad-composer-tips">' +
                '<span>支持连续追问，例如"为什么是 24""哪一组不确定"。</span>' +
                '<span>模型: SiliconFlow / Pro/moonshotai/Kimi-K2.5</span>' +
                '</div>' +
                '</form>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</section>';
            initializeElements();
            bindEvents();
            resetView();
        },
        destroy: function () {
            destroySession({ silent: true });
            if (beforeUnloadHandler) {
                window.removeEventListener('beforeunload', beforeUnloadHandler);
                beforeUnloadHandler = null;
            }
            state = { sessionId: null, busy: false, fileName: '', fileMode: '' };
            el = {};
        }
    };
})();
