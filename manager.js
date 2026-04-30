/* ========================================================
 * manager.js — 账号管理后台页面逻辑
 * ======================================================== */

// ── SVG 图标 ────────────────────────────────────────────────
const EYE_ON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
</svg>`;

const EYE_OFF = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
    stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
</svg>`;

const LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
</svg>`;

const MOON_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
</svg>`;

const SUN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
</svg>`;

const TRASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
</svg>`;

// ── 全局数据 ────────────────────────────────────────────
let allRows    = [];        // { id, domains, username, password, remark }[]
let keyword    = '';        // 当前搜索关键词
let revealedKeys = new Set(); // 已显示明文的行 ID (vault.id)

// ── 验证会话缓存（5 分钟内不重复验证）─────────────────
const AUTH_SESSION_DURATION = 5 * 60 * 1000; // 5 分钟
let authSessionExpiry = 0;

function isAuthSessionValid() {
    return Date.now() < authSessionExpiry;
}

function refreshAuthSession() {
    authSessionExpiry = Date.now() + AUTH_SESSION_DURATION;
}

// ── 主题管理 ────────────────────────────────────────────────
const THEME_KEY = 'al_manager_theme';

function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('btn-theme');
    if (!btn) return;
    if (theme === 'dark') {
        btn.innerHTML = SUN_ICON;
        btn.title = '切换到亮色模式';
    } else {
        btn.innerHTML = MOON_ICON;
        btn.title = '切换到暗色模式';
    }
}

function toggleTheme() {
    const current = getTheme();
    const next    = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
}

// ── 从 storage 加载所有账号 ─────────────────────────────────
function loadAllAccounts() {
    chrome.storage.local.get(['vault'], (result) => {
        const vault = result.vault || [];
        allRows = vault.map(acc => ({
            id: acc.id || Math.random().toString(36).slice(2, 9),
            domain: acc.domains?.[0] || 'unknown', // 用于排序的基础域
            domains: acc.domains || [],
            username: acc.username || '',
            password: acc.password || '',
            remark:   acc.remark   || '',
        }));

        allRows.sort((a, b) => a.domain.localeCompare(b.domain));
        updateStats();
        renderTable();
    });
}

// ── 更新统计 ────────────────────────────────────────────────
function updateStats() {
    const domains = new Set(allRows.map(r => r.domain)).size;
    document.getElementById('stat-domains').textContent  = domains;
    document.getElementById('stat-accounts').textContent = allRows.length;
}

// ── 工具函数 ────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function highlight(text, kw) {
    if (!kw) return escHtml(text);
    const escaped = escHtml(text);
    const kwEsc   = escHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(kwEsc, 'gi'), m => `<mark>${m}</mark>`);
}

// ── 显示主密码验证对话框（返回 Promise）────────────────
function showMasterPwDialog() {
    return new Promise((resolve) => {
        const modal   = document.getElementById('masterpw-verify-modal');
        const input   = document.getElementById('masterpw-verify-input');
        const btnOk   = document.getElementById('masterpw-verify-ok');
        const btnCancel = document.getElementById('masterpw-verify-cancel');

        input.value = '';
        modal.classList.remove('hidden');
        input.focus();

        function cleanup() {
            modal.classList.add('hidden');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKeydown);
        }

        function onOk() {
            const pw = input.value;
            cleanup();
            resolve(pw || null);
        }

        function onCancel() {
            cleanup();
            resolve(null);
        }

        function onKeydown(e) {
            if (e.key === 'Enter') { e.preventDefault(); onOk(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeydown);
    });
}

// ── 统一身份验证入口（带会话缓存）────────────────
async function requireAuth() {
    // 会话内已验证过，直接通过
    if (isAuthSessionValid()) return true;

    const result = await verifyIdentity(showMasterPwDialog);

    if (result === null) {
        // 未设置任何验证方式，引导用户设置
        const setup = confirm('您还未设置安全验证。\n是否现在设置生物识别或主密码？');
        if (setup) openAuthSetupModal();
        return false;
    }

    if (result) {
        refreshAuthSession();
    }

    return result;
}

// ── 原地切换密码显示（需验证 + 解密）───────────────
async function togglePasswordInPlace(id, btn) {
    const rowData = allRows.find(r => r.id === id);
    if (!rowData) return;

    // 查找父级行容器中的密码显示组件
    const rowEl = btn.closest('.table-row');
    const pwSpan = rowEl?.querySelector('.password-display');
    if (!pwSpan) return;

    const willReveal = !revealedKeys.has(id);
    if (willReveal) {
        // 查看密码前需要验证身份
        const authed = await requireAuth();
        if (!authed) return;

        // 解密密码
        let plainPwd = rowData._plainPassword;
        if (!plainPwd) {
            try {
                plainPwd = isEncrypted(rowData.password)
                    ? await decryptPassword(rowData.password)
                    : rowData.password;
                rowData._plainPassword = plainPwd; // 缓存
            } catch (e) {
                console.error('[Crypto] 解密失败:', e);
                alert('密码解密失败');
                return;
            }
        }

        revealedKeys.add(id);
        pwSpan.textContent = plainPwd;
        pwSpan.classList.add('revealed');
        pwSpan.title = plainPwd;
        btn.innerHTML = EYE_OFF;
        btn.title = '隐藏密码';
    } else {
        revealedKeys.delete(id);
        pwSpan.textContent = '••••••••';
        pwSpan.classList.remove('revealed');
        pwSpan.title = '点击眼睛图标查看密码';
        btn.innerHTML = EYE_ON;
        btn.title = '查看密码';
    }
}

// ── 渲染表格 ────────────────────────────────────────────────
function renderTable() {
    const tableWrap  = document.getElementById('account-table-wrap');
    const tableBody  = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');
    const noResult   = document.getElementById('no-result');

    const kw = keyword.toLowerCase();
    const filtered = kw
        ? allRows.filter(r =>
              r.username.toLowerCase().includes(kw) ||
              r.remark.toLowerCase().includes(kw)   ||
              (r.domains && r.domains.some(d => d.toLowerCase().includes(kw))))
        : allRows;

    tableBody.innerHTML = '';
    noResult.classList.add('hidden');
    emptyState.classList.add('hidden');
    tableWrap.classList.remove('hidden');

    if (allRows.length === 0) {
        tableWrap.classList.add('hidden');
        emptyState.classList.add('hidden'); // simplified
        emptyState.classList.remove('hidden');
        return;
    }

    if (filtered.length === 0) {
        tableWrap.classList.add('hidden');
        noResult.classList.remove('hidden');
        return;
    }

    let prevDomain = null;

    filtered.forEach((row, idx) => {
        const isNewDomain = row.domain !== prevDomain;
        prevDomain = row.domain;

        const tr = document.createElement('div');
        tr.className = 'table-row' + (isNewDomain ? ' domain-first-row' : '');
        tr.style.animationDelay = `${idx * 18}ms`;
        const rowId = row.id;
        const revealed = revealedKeys.has(rowId);
        const pwDisplay = revealed ? (row._plainPassword || '******') : '••••••••';

        // 渲染所有关联域名标签
        const domainsHtml = (row.domains || []).map(d => `
            <div class="domain-tag" data-domain="${escHtml(d)}" data-id="${escHtml(rowId)}">
                <span class="tag-text" title="在新窗口打开 ${escHtml(d)}">${highlight(d, keyword)}</span>
                <button class="tag-remove" title="移除此域名对该账号的关联">×</button>
            </div>
        `).join('');

        tr.innerHTML = `
            <div class="cell cell-domain">
                <div class="domain-tags-wrap">
                    ${domainsHtml}
                </div>
            </div>
            <div class="cell cell-username">${highlight(row.username, keyword)}</div>
            <div class="cell cell-password">
                <span class="password-display${revealed ? ' revealed' : ''}"
                      title="${revealed ? escHtml(row._plainPassword || '') : '点击眼睛图标查看密码'}">
                    ${pwDisplay}
                </span>
                <button class="btn-eye" data-id="${escHtml(rowId)}" title="${revealed ? '隐藏密码' : '查看密码'}">
                    ${revealed ? EYE_OFF : EYE_ON}
                </button>
            </div>
            <div class="cell cell-remark">${highlight(row.remark, keyword) || '<span style="opacity:0.35">—</span>'}</div>
            <div class="cell cell-actions">
                <button class="btn-copy" data-id="${escHtml(rowId)}" title="复制密码到剪贴板">
                    ${COPY_ICON} 复制密码
                </button>
                <button class="btn-delete" data-id="${escHtml(rowId)}" title="删除账号">
                    ${TRASH_ICON}
                </button>
            </div>
        `;

        tableBody.appendChild(tr);
    });
}

// ── 事件委托：表格操作 ──────────────────────────────────────
function initTableEvents() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;

    tableBody.addEventListener('click', (e) => {
        const eyeBtn = e.target.closest('.btn-eye');
        if (eyeBtn) {
            togglePasswordInPlace(eyeBtn.dataset.id, eyeBtn);
            return;
        }

        const copyBtn = e.target.closest('.btn-copy');
        if (copyBtn) {
            handleCopy(copyBtn);
            return;
        }

        const deleteBtn = e.target.closest('.btn-delete');
        if (deleteBtn) {
            handleDelete(deleteBtn.dataset.id);
            return;
        }

        const aliasRemoveBtn = e.target.closest('.btn-alias-remove');
        if (aliasRemoveBtn) {
            handleUnlinkAlias(aliasRemoveBtn.dataset.alias, aliasRemoveBtn.dataset.primary);
            return;
        }

        const tagText = e.target.closest('.tag-text');
        if (tagText) {
            const domain = tagText.parentElement.dataset.domain;
            handleOpenDomain(domain);
            return;
        }

        const tagRemove = e.target.closest('.tag-remove');
        if (tagRemove) {
            const domain = tagRemove.parentElement.dataset.domain;
            const id = tagRemove.parentElement.dataset.id;
            handleRemoveDomain(domain, id);
        }
    });
}

// ── 跳转域名 ──────────────────────────────────────────
function handleOpenDomain(domain) {
    let url = domain;
    if (!/^https?:\/\//.test(url)) {
        url = 'http://' + url;
    }
    window.open(url, '_blank');
}

// ── 移除特定账号的特定域名关联 ──────────────────────────
async function handleRemoveDomain(clickedDomain, accountId) {
    chrome.storage.local.get(['vault'], async (result) => {
        const vault = result.vault || [];
        const accIdx = vault.findIndex(a => a.id === accountId);
        if (accIdx === -1) return;

        const account = vault[accIdx];
        const domains = account.domains || [];

        if (domains.length === 1 && domains[0] === clickedDomain) {
            // 最后一个域名，询问是否彻底删除账号
            if (confirm(`域名 "${clickedDomain}" 是该账号关联的唯一域名。\n\n移除后该账号将彻底删除，确定吗？`)) {
                const authed = await requireAuth();
                if (!authed) return;
                vault.splice(accIdx, 1);
            } else {
                return;
            }
        } else {
            // 仅移除当前域名关联
            if (confirm(`确定要移除域名 "${clickedDomain}" 对账号 [${account.username}] 的关联吗？`)) {
                account.domains = domains.filter(d => d !== clickedDomain);
            } else {
                return;
            }
        }

        chrome.storage.local.set({ vault }, () => {
            console.log('[Manager] 域名关联已更新');
            loadAllAccounts();
        });
    });
}

// ── 删除账号 ──────────────────────────────────────────
async function handleDelete(id) {
    const row = allRows.find(r => r.id === id);
    if (!row) return;

    if (!confirm(`确定要彻底删除账号 [${row.username}] 吗？\n删除后，该账号关联的所有域名都将失效。`)) {
        return;
    }

    const authed = await requireAuth();
    if (!authed) return;

    chrome.storage.local.get(['vault'], (result) => {
        const vault = result.vault || [];
        const newVault = vault.filter(acc => acc.id !== id);
        chrome.storage.local.set({ vault: newVault }, () => {
            console.log('[Manager] 账号已彻底删除');
            loadAllAccounts();
        });
    });
}

// ── 解除域名共享关联 (弃用，保留接口防止报错) ──────────
async function handleUnlinkAlias() {}

// ── 复制密码（需验证 + 解密）────────────────────────
async function handleCopy(btn) {
    const id = btn.dataset.id;
    const row = allRows.find(r => r.id === id);
    if (!row) return;

    // 如果已解密缓存过，直接用缓存
    let plainPwd = row._plainPassword;
    if (!plainPwd) {
        // 需要验证身份
        const authed = await requireAuth();
        if (!authed) return;

        try {
            plainPwd = isEncrypted(row.password)
                ? await decryptPassword(row.password)
                : row.password;
        } catch (e) {
            console.error('[Crypto] 解密失败:', e);
            alert('密码解密失败');
            return;
        }
    }

    try {
        await navigator.clipboard.writeText(plainPwd);
        btn.classList.add('copied');
        btn.innerHTML = `${CHECK_ICON} 已复制`;
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = `${COPY_ICON} 复制密码`;
        }, 1800);
    } catch (err) {
        console.error('复制失败', err);
    }
}

// ── 搜索逻辑 ────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
    keyword = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !keyword);
    renderTable();
});

searchClear.addEventListener('click', () => {
    keyword = '';
    searchInput.value = '';
    searchClear.classList.add('hidden');
    searchInput.focus();
    renderTable();
});

// ── 安全验证设置面板 ───────────────────────────────

async function openAuthSetupModal() {
    const modal = document.getElementById('auth-setup-modal');
    const statusText = document.getElementById('auth-status-text');
    const webauthnSection = document.getElementById('auth-webauthn-section');
    const masterPwSection = document.getElementById('auth-masterpw-section');

    modal.classList.remove('hidden');

    // 检测平台支持和当前状态
    const platformAvail = await isPlatformAuthAvailable();
    const authState = await hasRegisteredAuth();

    if (authState.webauthn) {
        statusText.textContent = '✅ 已启用生物识别验证';
        statusText.className = 'auth-status auth-status-ok';
        document.getElementById('btn-register-webauthn').textContent = '重新注册';
    } else if (authState.masterPw) {
        statusText.textContent = '✅ 已设置主密码验证';
        statusText.className = 'auth-status auth-status-ok';
    } else {
        statusText.textContent = '⚠️ 未设置安全验证，查看密码时将无法保护';
        statusText.className = 'auth-status auth-status-warn';
    }

    if (platformAvail) {
        webauthnSection.classList.remove('hidden');
    } else {
        webauthnSection.classList.add('hidden');
    }

    masterPwSection.classList.remove('hidden');
}

// 安全设置按钮
document.getElementById('btn-auth-setup').addEventListener('click', openAuthSetupModal);

// 关闭安全设置弹窗
document.getElementById('auth-setup-close').addEventListener('click', () => {
    document.getElementById('auth-setup-modal').classList.add('hidden');
});

// 点击遮罩层关闭
document.getElementById('auth-setup-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// 注册 WebAuthn
document.getElementById('btn-register-webauthn').addEventListener('click', async () => {
    const btn = document.getElementById('btn-register-webauthn');
    btn.disabled = true;
    btn.textContent = '请在系统弹窗中验证…';

    const success = await registerCredential();
    if (success) {
        alert('生物识别验证设置成功！');
        openAuthSetupModal(); // 刷新状态
    } else {
        alert('注册失败，请重试或使用主密码方案。');
    }
    btn.disabled = false;
    btn.textContent = '注册生物识别验证';
});

// 设置主密码
document.getElementById('btn-set-masterpw').addEventListener('click', async () => {
    const pw      = document.getElementById('auth-masterpw-input').value;
    const confirm = document.getElementById('auth-masterpw-confirm').value;

    if (!pw) { alert('请输入主密码'); return; }
    if (pw.length < 4) { alert('主密码至少 4 位'); return; }
    if (pw !== confirm) { alert('两次输入不一致'); return; }

    await setMasterPassword(pw);
    alert('主密码设置成功！');
    document.getElementById('auth-masterpw-input').value = '';
    document.getElementById('auth-masterpw-confirm').value = '';
    openAuthSetupModal(); // 刷新状态
});

// ── 主题切换按钮 ────────────────────────────────────
document.getElementById('btn-theme').addEventListener('click', toggleTheme);

// ── storage 变更监听 ───────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.accounts) {
        loadAllAccounts();
    }
});

// ── 列宽拖拽与持久化 ──────────────────────────────────────
function loadColumnWidths() {
    const saved = localStorage.getItem('manager_col_widths');
    if (saved) {
        try {
            const widths = JSON.parse(saved);
            const tableWrap = document.getElementById('account-table-wrap');
            for (const [key, val] of Object.entries(widths)) {
                if (val) tableWrap.style.setProperty(key, val);
            }
        } catch(e) {}
    }
}

function initColumnResizers() {
    const tableWrap = document.getElementById('account-table-wrap');
    let isResizing = false;
    let currentResizer = null;
    let startX = 0;
    let startWidth = 0;
    let targetVar = '';

    document.querySelectorAll('.col-resizer').forEach(resizer => {
        resizer.addEventListener('mousedown', function(e) {
            isResizing = true;
            currentResizer = this;
            targetVar = this.dataset.col;
            startX = e.clientX;
            
            const headerCol = this.parentElement;
            startWidth = headerCol.getBoundingClientRect().width;
            
            this.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
    });

    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        let newWidth = startWidth + dx;
        if (newWidth < 60) newWidth = 60; // 最小宽度限制
        tableWrap.style.setProperty(targetVar, newWidth + 'px');
    });

    document.addEventListener('mouseup', function() {
        if (!isResizing) return;
        isResizing = false;
        if (currentResizer) currentResizer.classList.remove('active');
        currentResizer = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // 保存到 localStorage
        const widths = {
            '--col-domain': tableWrap.style.getPropertyValue('--col-domain'),
            '--col-username': tableWrap.style.getPropertyValue('--col-username'),
            '--col-password': tableWrap.style.getPropertyValue('--col-password')
        };
        localStorage.setItem('manager_col_widths', JSON.stringify(widths));
    });
}

// ── 数据迁移 ──────────────────────────────────────────
async function migrateToVault() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['accounts', 'domainGroupOf', 'vault'], (res) => {
            if (res.vault) return resolve(); // 已经迁移过

            console.log('[Migration] Starting migration to vault schema...');
            const accounts = res.accounts || {};
            const domainGroupOf = res.domainGroupOf || {};
            const vault = [];

            const primaryToAliases = {};
            for (const [alias, primary] of Object.entries(domainGroupOf)) {
                if (!primaryToAliases[primary]) primaryToAliases[primary] = [];
                primaryToAliases[primary].push(alias);
            }

            for (const [primary, list] of Object.entries(accounts)) {
                if (!Array.isArray(list)) continue;
                const aliases = primaryToAliases[primary] || [];
                for (const acc of list) {
                    vault.push({
                        id: Math.random().toString(36).slice(2, 10),
                        username: acc.username || '',
                        password: acc.password || '',
                        remark: acc.remark || '',
                        domains: [primary, ...aliases]
                    });
                }
            }

            chrome.storage.local.set({ vault }, () => {
                console.log('[Migration] Success');
                resolve();
            });
        });
    });
}

// ── 监听存储变更 ─────────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
    if (changes.vault) {
        console.log('[Manager] Storage changed, refreshing...');
        loadAllAccounts();
    }
});

(async () => {
    applyTheme(getTheme());
    loadColumnWidths();
    await migrateToVault();
    await migrateToEncrypted().catch(e => console.warn('[Crypto] 迁移检查失败', e));
    initTableEvents();
    initColumnResizers();
    loadAllAccounts();
})();
