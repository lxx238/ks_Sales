function formatRoleLabel(account) {
    if (!account) return '';
    if (account.group === '设计组' && account.role === '业务助理') return '设计组';
    if (account.roleLabel) return account.roleLabel;
    if (account.role === 'admin') return '管理员';
    return account.role || '';
}

function showAdminMessage(message, type = 'info') {
    const box = document.getElementById('admin-message');
    if (!box) return;
    if (!message) {
        box.style.display = 'none';
        box.textContent = '';
        return;
    }
    box.style.display = 'block';
    box.textContent = message;
    if (type === 'error') {
        box.style.background = '#fee2e2';
        box.style.borderColor = '#fecaca';
        box.style.color = '#991b1b';
    } else if (type === 'success') {
        box.style.background = '#dcfce7';
        box.style.borderColor = '#bbf7d0';
        box.style.color = '#166534';
    } else {
        box.style.background = '#f1f5f9';
        box.style.borderColor = '#e2e8f0';
        box.style.color = '#475569';
    }
}

function showImportMessage(message, type = 'info') {
    const box = document.getElementById('import-message');
    if (!box) return;
    if (!message) {
        box.style.display = 'none';
        box.textContent = '';
        return;
    }
    box.style.display = 'block';
    box.textContent = message;
    if (type === 'error') {
        box.style.background = '#fee2e2';
        box.style.borderColor = '#fecaca';
        box.style.color = '#991b1b';
    } else if (type === 'success') {
        box.style.background = '#dcfce7';
        box.style.borderColor = '#bbf7d0';
        box.style.color = '#166534';
    } else {
        box.style.background = '#f1f5f9';
        box.style.borderColor = '#e2e8f0';
        box.style.color = '#475569';
    }
}

function showBoxMessage(boxId, message, type = 'info') {
    const box = document.getElementById(boxId);
    if (!box) return;
    if (!message) {
        box.style.display = 'none';
        box.textContent = '';
        return;
    }
    box.style.display = 'block';
    box.textContent = message;
    if (type === 'error') {
        box.style.background = '#fee2e2';
        box.style.borderColor = '#fecaca';
        box.style.color = '#991b1b';
    } else if (type === 'success') {
        box.style.background = '#dcfce7';
        box.style.borderColor = '#bbf7d0';
        box.style.color = '#166534';
    } else {
        box.style.background = '#f1f5f9';
        box.style.borderColor = '#e2e8f0';
        box.style.color = '#475569';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const authPromise = window.ksAuthSyncPromise;
    let auth = null;
    if (authPromise) {
        try {
            auth = await authPromise;
        } catch (e) {
            auth = null;
        }
    }

    if (!auth || auth.role !== 'admin') {
        if (!auth) {
            if (typeof redirectToLogin === 'function') redirectToLogin();
        } else {
            window.location.href = typeof buildPermissionTarget === 'function'
                ? buildPermissionTarget(auth)
                : resolveFrontendPageTarget(auth.target || 'app.html?group=韩语组');
        }
        return;
    }

    const roleEl = document.getElementById('user-role');
    const nameEl = document.getElementById('user-name');
    if (roleEl) roleEl.textContent = auth.roleLabel || auth.role || '管理员';
    if (nameEl) nameEl.textContent = auth.username || 'admin';

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (typeof logoutSession === 'function') logoutSession();
        });
    }

    const totalEl = document.getElementById('total-accounts');
    const activeEl = document.getElementById('active-accounts');
    const disabledEl = document.getElementById('disabled-accounts');
    const koEl = document.getElementById('ko-accounts');
    const jaEl = document.getElementById('ja-accounts');
    const enEl = document.getElementById('en-accounts');
    const wlEl = document.getElementById('wl-accounts');
    const designEl = document.getElementById('design-accounts');
    const adminEl = document.getElementById('admin-accounts');

    const tableBody = document.getElementById('account-table-body');
    const formPanel = document.getElementById('user-form-panel');
    const formTitle = document.getElementById('form-title');
    const form = document.getElementById('account-form');
    const usernameInput = document.getElementById('account-username');
    const nameInput = document.getElementById('account-name');
    const nicknameInput = document.getElementById('account-nickname');
    const mobInput = document.getElementById('account-mob');
    const telInput = document.getElementById('account-tel');
    const faxInput = document.getElementById('account-fax');
    const emailInput = document.getElementById('account-email');
    const dingtalkIdInput = document.getElementById('account-dingtalk-id');
    const groupSelect = document.getElementById('account-group');
    const passwordInput = document.getElementById('account-password');
    const roleSelect = document.getElementById('account-role');
    const enabledToggle = document.getElementById('account-enabled');
    const permissionCheckboxes = document.querySelectorAll('.account-permission');
    const permissionsRow = document.getElementById('permissions-row');
    const resetButton = document.getElementById('reset-accounts-btn');
    const btnAddUser = document.getElementById('btn-add-user');
    const btnCancelForm = document.getElementById('btn-cancel-form');
    const filterGroup = document.getElementById('filter-group');

    let allAccounts = [];

    function updateStats(accounts) {
        const total = accounts.length;
        const enabled = accounts.filter(a => a.enabled !== false).length;
        const disabled = total - enabled;

        if (totalEl) totalEl.textContent = total;
        if (activeEl) activeEl.textContent = enabled;
        if (disabledEl) disabledEl.textContent = disabled;
        if (koEl) koEl.textContent = accounts.filter(a => a.group === '韩语组').length;
        if (jaEl) jaEl.textContent = accounts.filter(a => a.group === '日语组').length;
        if (enEl) enEl.textContent = accounts.filter(a => a.group === '英语组').length;
        if (wlEl) wlEl.textContent = accounts.filter(a => a.group === '物流组').length;
        if (designEl) designEl.textContent = accounts.filter(a => a.group === '设计组').length;
        if (adminEl) adminEl.textContent = accounts.filter(a => a.role === 'admin').length;
    }

    function collectPermissions() {
        const perms = [];
        permissionCheckboxes.forEach(cb => {
            if (cb.checked) perms.push(cb.value);
        });
        return perms;
    }

    function setPermissionCheckboxes(perms) {
        permissionCheckboxes.forEach(cb => {
            cb.checked = Array.isArray(perms) && perms.includes(cb.value);
        });
    }

    const ROLE_PERMISSION_PRESETS = {
        '管理员': ['quotation', 'cad', 'database', 'database_submit', 'database_download', 'records', 'records_review', 'questions', 'logistics', 'schedule'],
        '韩语业务员': ['quotation', 'cad', 'database', 'records', 'questions'],
        '英语业务员': ['quotation', 'cad', 'database', 'records', 'questions'],
        '日语业务员': ['quotation', 'cad', 'database', 'records', 'questions'],
        '亚太业务员': ['quotation', 'cad', 'database', 'records', 'questions'],
        '业务助理': ['quotation', 'database', 'records'],
        '设计组': ['quotation'],
        '总助': ['schedule'],
        '物流专员': ['logistics'],
    };

    const GROUP_DEFAULT_ROLE = {
        '韩语组': '韩语业务员',
        '英语组': '英语业务员',
        '日语组': '日语业务员',
        '亚太组': '亚太业务员',
        '物流组': '物流专员',
        '人事组': '总助',
        '设计组': '设计组',
    };
    const GROUP_PERMISSION_PRESETS = {
        '设计组': ['quotation'],
    };

    function openForm(title) {
        if (formTitle) formTitle.textContent = title || '新增人员';
        if (formPanel) formPanel.style.display = 'block';
        if (formPanel) formPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeForm() {
        if (formPanel) formPanel.style.display = 'none';
        clearForm();
    }

    function clearForm() {
        if (usernameInput) { usernameInput.value = ''; delete usernameInput.dataset.existing; }
        if (nameInput) nameInput.value = '';
        if (nicknameInput) nicknameInput.value = '';
        if (mobInput) mobInput.value = '';
        if (telInput) telInput.value = '';
        if (faxInput) faxInput.value = '';
        if (emailInput) emailInput.value = '';
        if (dingtalkIdInput) dingtalkIdInput.value = '';
        if (groupSelect) groupSelect.value = '';
        if (passwordInput) passwordInput.value = '';
        if (roleSelect) roleSelect.value = '韩语业务员';
        if (enabledToggle) enabledToggle.checked = true;
        setPermissionCheckboxes(ROLE_PERMISSION_PRESETS['韩语业务员']);
        if (permissionsRow) permissionsRow.style.display = '';
        showAdminMessage('');
    }

    if (roleSelect) {
        roleSelect.addEventListener('change', () => {
            const preset = ROLE_PERMISSION_PRESETS[roleSelect.value];
            if (preset) setPermissionCheckboxes(preset);
        });
    }

    if (groupSelect) {
        groupSelect.addEventListener('change', () => {
            const g = groupSelect.value;
            const defaultRole = GROUP_DEFAULT_ROLE[g];
            if (defaultRole) roleSelect.value = defaultRole;
            const preset = GROUP_PERMISSION_PRESETS[g] || ROLE_PERMISSION_PRESETS[roleSelect.value];
            if (preset) setPermissionCheckboxes(preset);
        });
    }

    if (btnAddUser) {
        btnAddUser.addEventListener('click', () => {
            clearForm();
            openForm('新增人员');
        });
    }

    if (btnCancelForm) {
        btnCancelForm.addEventListener('click', () => {
            closeForm();
        });
    }

    async function handleTableAction(action, username) {
        const target = allAccounts.find((item) => item.username === username);
        if (!target) return;

        try {
            if (action === 'reset') {
                const newPassword = prompt(`设置 ${username} 的新密码`, '');
                if (!newPassword) return;
                await updateAccountPassword(username, newPassword);
                showAdminMessage(`${username} 的密码已更新。`, 'success');
            } else if (action === 'toggle') {
                await toggleAccount(username, target.enabled === false);
                showAdminMessage(`${username} 的状态已更新。`, 'success');
            } else if (action === 'delete') {
                if (!confirm(`确认删除 ${target.name || username} 吗？`)) return;
                await deleteAccount(username);
                showAdminMessage(`${target.name || username} 已删除。`, 'success');
            }

            await renderAll();
        } catch (error) {
            showAdminMessage(error.message || '操作失败', 'error');
        }
    }

    function renderTable() {
        if (!tableBody) return;

        let filtered = allAccounts;
        const gf = filterGroup ? filterGroup.value : '';
        if (gf) filtered = filtered.filter(a => a.group === gf);

        tableBody.innerHTML = '';

        filtered.forEach((account) => {
            const row = document.createElement('tr');
            const statusTag = account.enabled === false
                ? '<span class="tag warn">停用</span>'
                : '<span class="tag success">启用</span>';

            row.innerHTML = `
                <td style="font-size:12px; color:#64748b;">${account.username || '-'}</td>
                <td>${account.name || ''}</td>
                <td style="font-size:12px;">${account.nickname || ''}</td>
                <td><span class="tag">${account.group || '-'}</span></td>
                <td style="font-size:12px;">${account.mob || '-'}</td>
                <td style="font-size:12px;">${account.email || '-'}</td>
                <td style="font-size:12px;">${formatRoleLabel(account)}</td>
                <td>${statusTag}</td>
                <td class="table-actions">
                  <button class="btn small" data-action="edit" data-username="${account.username}">编辑</button>
                  <button class="btn small" data-action="reset" data-username="${account.username}">重置密码</button>
                  <button class="btn small" data-action="toggle" data-username="${account.username}">
                    ${account.enabled === false ? '启用' : '停用'}
                  </button>
                  <button class="btn small warn" data-action="delete" data-username="${account.username}">删除</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        tableBody.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-action');
                const username = btn.getAttribute('data-username');
                if (!action || !username) return;

                if (action === 'edit') {
                    const target = allAccounts.find(a => a.username === username);
                    if (!target) return;
                    usernameInput.value = target.username || '';
                    usernameInput.dataset.existing = 'true';
                    nameInput.value = target.name || '';
                    nicknameInput.value = target.nickname || '';
                    mobInput.value = target.mob || '';
                    telInput.value = target.tel || '';
                    faxInput.value = target.fax || '';
                    emailInput.value = target.email || '';
                    if (dingtalkIdInput) dingtalkIdInput.value = target.dingtalkId || '';
                    groupSelect.value = target.group || '';
                    passwordInput.value = '';
                    if (target.group === '设计组' && target.role === '业务助理') {
                        roleSelect.value = '设计组';
                    } else {
                        roleSelect.value = target.role === 'admin' ? 'admin' : (target.role || '韩语业务员');
                    }
                    if (enabledToggle) enabledToggle.checked = target.enabled !== false;
                    setPermissionCheckboxes(target.permissions || []);
                    openForm('编辑：' + (target.name || target.username));
                } else {
                    await handleTableAction(action, username);
                }
            });
        });
    }

    async function renderAll() {
        try {
            allAccounts = await fetchAccounts();
            updateStats(allAccounts);
            renderTable();
        } catch (error) {
            showAdminMessage(error.message || '加载列表失败', 'error');
        }
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = (usernameInput.value || '').trim();
            const name = (nameInput.value || '').trim();
            const nickname = (nicknameInput.value || '').trim();
            const mob = (mobInput.value || '').trim();
            const tel = (telInput.value || '').trim();
            const fax = (faxInput.value || '').trim();
            const email = (emailInput.value || '').trim();
            const dingtalkId = (dingtalkIdInput ? dingtalkIdInput.value : '').trim();
            let group = groupSelect.value;
            const password = (passwordInput.value || '').trim();
            const roleValue = roleSelect.value;
            const enabled = !!(enabledToggle && enabledToggle.checked);

            if (!name) {
                showAdminMessage('中文名不能为空。', 'error');
                return;
            }

            let role = roleValue === '管理员' ? 'admin' : roleValue;
            if (role === '设计组') {
                role = '业务助理';
                group = '设计组';
            }

            if (role && !password && !usernameInput.dataset.existing) {
                showAdminMessage('新账号必须设置密码。', 'error');
                return;
            }

            const permissions = collectPermissions();

            try {
                await upsertAccount({
                    username,
                    password,
                    name,
                    nickname,
                    mob,
                    tel,
                    fax,
                    email,
                    dingtalkId,
                    group,
                    role,
                    enabled,
                    permissions,
                });
                await renderAll();
                closeForm();
                showAdminMessage(`人员 ${username || name} 已保存。`, 'success');
            } catch (error) {
                showAdminMessage(error.message || '保存失败', 'error');
            }
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', async () => {
            if (!confirm('确认恢复默认人员数据吗？当前所有人员数据将被覆盖。')) return;

            try {
                await resetAccounts();
                await renderAll();
                closeForm();
                showAdminMessage('默认数据已恢复。', 'success');
            } catch (error) {
                showAdminMessage(error.message || '恢复默认数据失败', 'error');
            }
        });
    }

    if (filterGroup) {
        filterGroup.addEventListener('change', () => renderTable());
    }

    const downloadTemplateBtn = document.getElementById('download-template-btn');
    if (downloadTemplateBtn) {
        downloadTemplateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            downloadImportTemplate();
        });
    }

    const importForm = document.getElementById('import-form');
    const importFileInput = document.getElementById('import-file');
    if (importForm) {
        importForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = importFileInput ? importFileInput.files[0] : null;
            if (!file) {
                showImportMessage('请先选择要上传的 Excel 文件。', 'error');
                return;
            }

            const importBtn = document.getElementById('import-btn');
            if (importBtn) {
                importBtn.disabled = true;
                importBtn.textContent = '导入中...';
            }

            try {
                const result = await importAccounts(file);
                showImportMessage(result.message || '导入完成', 'success');
                await renderAll();
            } catch (error) {
                showImportMessage(error.message || '导入失败', 'error');
            } finally {
                if (importBtn) {
                    importBtn.disabled = false;
                    importBtn.textContent = '开始导入';
                }
                if (importFileInput) importFileInput.value = '';
            }
        });
    }

    const importUseridsForm = document.getElementById('import-userids-form');
    const importUseridsFileInput = document.getElementById('import-userids-file');
    if (importUseridsForm) {
        importUseridsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = importUseridsFileInput ? importUseridsFileInput.files[0] : null;
            if (!file) {
                showBoxMessage('import-userids-message', '请先选择要上传的 Excel 文件。', 'error');
                return;
            }

            const useridsBtn = document.getElementById('import-userids-btn');
            if (useridsBtn) {
                useridsBtn.disabled = true;
                useridsBtn.textContent = '补充中...';
            }

            try {
                const result = await importDingtalkUserids(file);
                const failed = Array.isArray(result.failedItems) ? result.failedItems : [];
                let message = result.message || '补充完成';
                if (failed.length) {
                    const detail = failed.map(f => `${f.name}（${f.reason}）`).join('、');
                    message += `。未匹配：${detail}`;
                }
                showBoxMessage('import-userids-message', message, failed.length ? 'info' : 'success');
                await renderAll();
            } catch (error) {
                showBoxMessage('import-userids-message', error.message || '补充失败', 'error');
            } finally {
                if (useridsBtn) {
                    useridsBtn.disabled = false;
                    useridsBtn.textContent = '开始补充';
                }
                if (importUseridsFileInput) importUseridsFileInput.value = '';
            }
        });
    }

    await renderAll();
});
