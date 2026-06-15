function normalize(value) {
    return (value || '').trim();
}

function setLoginError(errorBox, message) {
    if (!errorBox) return;
    if (!message) {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
        return;
    }
    errorBox.textContent = message;
    errorBox.style.display = 'block';
}

function getPermissionPage(permissions) {
    const permPageMap = {
        'quotation': 'quotation',
        'cad': 'cad',
        'database': 'database',
        'records': 'records',
        'questions': 'questions',
        'logistics': 'logistics',
    };
    if (Array.isArray(permissions) && permissions.length > 0) {
        for (const perm of permissions) {
            if (permPageMap[perm]) return permPageMap[perm];
        }
    }
    return 'quotation';
}

function buildTargetWithPermission(account) {
    const baseTarget = account.target || 'app.html?group=韩语组';
    if (account.role === 'admin') return resolveFrontendPageTarget(baseTarget);
    const page = getPermissionPage(account.permissions);
    const url = buildFrontendPageUrl(baseTarget);
    url.searchParams.set('page', page);
    return `${url.pathname}${url.search}${url.hash}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('login-form');
    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    const errorBox = document.getElementById('login-error');

    if (!form) return;

    const existing = typeof syncCurrentAuth === 'function'
        ? await syncCurrentAuth({ redirectOnFail: false })
        : (typeof getAuth === 'function' ? getAuth() : null);

    if (existing && existing.target) {
        window.location.href = buildTargetWithPermission(existing);
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = normalize(userInput.value);
        const password = normalize(passInput.value);

        try {
            const account = typeof loginAccount === 'function'
                ? await loginAccount(username, password)
                : null;

            if (!account) {
                throw new Error('登录失败，请稍后重试');
            }

            setLoginError(errorBox, '');

            if (typeof setAuth === 'function') {
                setAuth({
                    username: account.username,
                    role: account.role,
                    roleLabel: account.roleLabel,
                    target: account.target,
                    permissions: account.permissions,
                    loginAt: new Date().toISOString(),
                });
            }

            window.location.href = buildTargetWithPermission(account);
        } catch (error) {
            setLoginError(errorBox, error.message || '账号或密码不正确，或账号已停用。');
        }
    });
});
