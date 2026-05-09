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
let domainMatchModes = {};
let settingsPageOpen = false;

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

function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── 从 storage 加载所有账号 ─────────────────────────────────
function loadAllAccounts() {
    chrome.storage.local.get(['vault', DOMAIN_MATCH_MODES_KEY], (result) => {
        domainMatchModes = result[DOMAIN_MATCH_MODES_KEY] || {};
        const vault = result.vault || [];
        allRows = vault.map(acc => ({
            id: acc.id || Math.random().toString(36).slice(2, 9),
            domain: pkGetDomainKey(acc.domains?.[0] || 'unknown', domainMatchModes), // 用于排序的基础域
            domains: acc.domains || [],
            username: acc.username || '',
            password: acc.password || '',
            remark:   acc.remark   || '',
        }));

        allRows.sort((a, b) => a.domain.localeCompare(b.domain));
        updateStats();
        renderTable();
        renderDomainMatchSettings();
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
                if (e.message === 'LOCKED') {
                    const pw = await showMasterPwDialog();
                    if (!pw) return;
                    try {
                        plainPwd = await decryptPassword(rowData.password, pw);
                        rowData._plainPassword = plainPwd;
                    } catch (err) {
                        alert('解锁失败或密码错误'); return;
                    }
                } else {
                    console.error('[Crypto] 解密失败:', e);
                    alert('密码解密失败');
                    return;
                }
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
    if (settingsPageOpen) return;

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
            if (e.message === 'LOCKED') {
                const pw = await showMasterPwDialog();
                if (!pw) return;
                try {
                    plainPwd = await decryptPassword(row.password, pw);
                } catch (err) {
                    alert('解锁失败或密码错误'); return;
                }
            } else {
                console.error('[Crypto] 解密失败:', e);
                alert('密码解密失败');
                return;
            }
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

// ── 设置页 ────────────────────────────────────────────────
function showSettingsPage(show) {
    settingsPageOpen = show;
    document.querySelector('.search-wrap')?.classList.toggle('hidden', show);
    document.getElementById('account-table-wrap')?.classList.toggle('hidden', show);
    document.getElementById('empty-state')?.classList.add('hidden');
    document.getElementById('no-result')?.classList.add('hidden');
    document.getElementById('settings-page')?.classList.toggle('hidden', !show);
    if (!show) renderTable();
}

document.getElementById('btn-settings-page')?.addEventListener('click', () => {
    showSettingsPage(true);
    renderDomainMatchSettings();
    loadModelConfigs();
});

document.getElementById('btn-settings-back')?.addEventListener('click', () => {
    showSettingsPage(false);
});

function renderDomainMatchSettings() {
    const wrap = document.getElementById('domain-match-settings');
    if (!wrap) return;
    clearNode(wrap);

    const originSet = new Set(
        allRows
            .flatMap(row => row.domains || [])
            .map(domain => pkGetOrigin(domain))
            .filter(Boolean)
    );

    const sourceUrl = new URLSearchParams(location.search).get('sourceUrl');
    const sourceOrigin = sourceUrl ? pkGetOrigin(sourceUrl) : '';
    if (sourceOrigin) originSet.add(sourceOrigin);

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        const activeOrigin = tab?.url && !tab.url.startsWith('chrome-extension://')
            ? pkGetOrigin(tab.url)
            : '';
        if (activeOrigin) originSet.add(activeOrigin);
        renderDomainMatchRows(wrap, Array.from(originSet).sort());
    });
}

function getSourceUrlForOrigin(origin) {
    const sourceUrl = new URLSearchParams(location.search).get('sourceUrl');
    if (sourceUrl && pkGetOrigin(sourceUrl) === origin) return sourceUrl;

    const rowDomain = allRows
        .flatMap(row => row.domains || [])
        .find(domain => pkGetOrigin(domain) === origin && pkGetFirstPathKey(domain) !== origin);
    return rowDomain || origin;
}

function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
    return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

async function saveDomainMatchMode(origin, enabled) {
    const next = { ...domainMatchModes };
    let nextVault = null;

    if (enabled) {
        next[origin] = DOMAIN_MATCH_MODE_FIRST_PATH;
        const targetKey = pkGetFirstPathKey(getSourceUrlForOrigin(origin));

        if (targetKey && targetKey !== origin) {
            const { vault = [] } = await storageGet(['vault']);
            nextVault = vault.map((account) => {
                const domains = account.domains || [];
                const migratedDomains = domains.map((domain) => {
                    if (pkGetOrigin(domain) !== origin) return domain;
                    const isOriginOnly = pkNormalizeUrlInput(domain) === origin;
                    const isSameFirstPath = pkGetFirstPathKey(domain) === targetKey;
                    return isOriginOnly || isSameFirstPath ? targetKey : domain;
                });
                return {
                    ...account,
                    domains: Array.from(new Set(migratedDomains))
                };
            });
        }
    } else {
        delete next[origin];
    }

    const payload = { [DOMAIN_MATCH_MODES_KEY]: next };
    if (nextVault) payload.vault = nextVault;
    await storageSet(payload);
    domainMatchModes = next;
    loadAllAccounts();
}

function renderDomainMatchRows(wrap, origins) {
    clearNode(wrap);

    if (!origins.length) {
        const empty = document.createElement('div');
        empty.className = 'settings-empty';
        empty.textContent = '暂无可配置域名';
        wrap.appendChild(empty);
        return;
    }

    origins.forEach((origin) => {
        const row = document.createElement('div');
        row.className = 'domain-match-row';

        const info = document.createElement('div');
        info.className = 'domain-match-info';
        const title = document.createElement('span');
        title.className = 'domain-match-title';
        title.textContent = origin;
        const desc = document.createElement('span');
        desc.className = 'domain-match-desc';
        desc.textContent = domainMatchModes[origin] === DOMAIN_MATCH_MODE_FIRST_PATH
            ? '当前按域名 + 第一个路径段匹配'
            : '当前按域名匹配，登录前后路径变化仍会命中';
        info.append(title, desc);

        const label = document.createElement('label');
        label.className = 'toggle-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = domainMatchModes[origin] === DOMAIN_MATCH_MODE_FIRST_PATH;
        const slider = document.createElement('span');
        slider.className = 'slider';
        label.append(input, slider);

        input.addEventListener('change', async () => {
            input.disabled = true;
            await saveDomainMatchMode(origin, input.checked);
        });

        row.append(info, label);
        wrap.appendChild(row);
    });
}

// ── 设置页：模型配置 ────────────────────────────────────────
const TYPE_LABELS = { ollama: 'Ollama', gemini: 'Gemini', openai: 'OpenAI-compatible' };
let modelConfigs = [];
let activeModelId = null;
let editingModelId = null;

function migrateOldModel(stored) {
    if ((stored.modelConfigs || []).length > 0) return;
    const old = stored.ollamaModel;
    if (!old) return;
    const cfg = {
        id: genId(),
        name: '本地 Ollama',
        type: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: old
    };
    chrome.storage.local.set({ modelConfigs: [cfg], activeModelId: cfg.id });
}

function renderActiveSelect() {
    const select = document.getElementById('select-active-model');
    if (!select) return;
    clearNode(select);
    if (!modelConfigs.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '未配置模型';
        select.appendChild(option);
        return;
    }
    modelConfigs.forEach((cfg) => {
        const option = document.createElement('option');
        option.value = cfg.id;
        option.selected = cfg.id === activeModelId;
        option.textContent = `${cfg.name} (${TYPE_LABELS[cfg.type] || cfg.type})`;
        select.appendChild(option);
    });
}

function renderModelList() {
    const list = document.getElementById('model-config-list');
    if (!list) return;
    clearNode(list);

    modelConfigs.forEach((cfg) => {
        const row = document.createElement('div');
        row.className = 'mcl-row' + (cfg.id === activeModelId ? ' mcl-active' : '');

        const info = document.createElement('div');
        info.className = 'mcl-info';
        const name = document.createElement('span');
        name.className = 'mcl-name';
        name.textContent = cfg.name;
        const type = document.createElement('span');
        type.className = 'mcl-type';
        type.textContent = `${TYPE_LABELS[cfg.type] || cfg.type} · ${cfg.model}`;
        info.append(name, type);

        const btns = document.createElement('div');
        btns.className = 'mcl-btns';
        const editBtn = document.createElement('button');
        editBtn.className = 'mcl-btn';
        editBtn.title = '编辑';
        editBtn.dataset.id = cfg.id;
        editBtn.dataset.action = 'edit';
        editBtn.innerHTML = LINK_ICON;
        const delBtn = document.createElement('button');
        delBtn.className = 'mcl-btn mcl-del';
        delBtn.title = '删除';
        delBtn.dataset.id = cfg.id;
        delBtn.dataset.action = 'del';
        delBtn.innerHTML = TRASH_ICON;
        btns.append(editBtn, delBtn);

        row.append(info, btns);
        list.appendChild(row);
    });
}

function loadModelConfigs() {
    chrome.storage.local.get(['modelConfigs', 'activeModelId', 'ollamaModel'], (stored) => {
        migrateOldModel(stored);
        chrome.storage.local.get(['modelConfigs', 'activeModelId'], (s2) => {
            modelConfigs = s2.modelConfigs || [];
            activeModelId = s2.activeModelId || (modelConfigs[0]?.id ?? null);
            renderActiveSelect();
            renderModelList();
        });
    });
}

function updateModelFormFields(type) {
    document.querySelectorAll('.mcf-ollama').forEach(el =>
        el.classList.toggle('hidden', type !== 'ollama'));
    document.querySelectorAll('.mcf-api-key').forEach(el =>
        el.classList.toggle('hidden', type === 'ollama'));
    document.querySelectorAll('.mcf-openai').forEach(el =>
        el.classList.toggle('hidden', type !== 'openai'));
}

function openModelForm(id) {
    editingModelId = id || null;
    const cfg = id ? modelConfigs.find(c => c.id === id) : null;
    document.getElementById('mcf-name').value = cfg?.name || '';
    document.getElementById('mcf-base-url').value = cfg?.baseUrl || 'http://localhost:11434';
    document.getElementById('mcf-api-key').value = cfg?.apiKey || '';
    document.getElementById('mcf-openai-url').value = cfg?.openaiUrl || '';
    document.getElementById('mcf-model').value = cfg?.model || '';
    document.getElementById('mcf-type').value = cfg?.type || 'ollama';
    updateModelFormFields(document.getElementById('mcf-type').value);
    document.getElementById('model-cfg-form').classList.remove('hidden');
    document.getElementById('btn-add-model-cfg').classList.add('hidden');
}

document.getElementById('select-active-model')?.addEventListener('change', (e) => {
    activeModelId = e.target.value;
    chrome.storage.local.set({ activeModelId });
    renderModelList();
});

document.getElementById('mcf-type')?.addEventListener('change', (e) => updateModelFormFields(e.target.value));
document.getElementById('btn-add-model-cfg')?.addEventListener('click', () => openModelForm(null));
document.getElementById('mcf-cancel')?.addEventListener('click', () => {
    document.getElementById('model-cfg-form').classList.add('hidden');
    document.getElementById('btn-add-model-cfg').classList.remove('hidden');
    editingModelId = null;
});

document.getElementById('model-config-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.mcl-btn');
    if (!btn) return;
    if (btn.dataset.action === 'edit') openModelForm(btn.dataset.id);
    if (btn.dataset.action === 'del') deleteModelCfg(btn.dataset.id);
});

document.getElementById('mcf-save')?.addEventListener('click', () => {
    const name = document.getElementById('mcf-name').value.trim();
    const type = document.getElementById('mcf-type').value;
    const model = document.getElementById('mcf-model').value.trim();
    if (!name || !model) { alert('名称和模型名不能为空'); return; }

    const cfg = {
        id: editingModelId || genId(),
        name,
        type,
        model,
        baseUrl: document.getElementById('mcf-base-url').value.trim(),
        apiKey: document.getElementById('mcf-api-key').value.trim(),
        openaiUrl: document.getElementById('mcf-openai-url').value.trim(),
    };

    if (editingModelId) {
        const idx = modelConfigs.findIndex(c => c.id === editingModelId);
        if (idx >= 0) modelConfigs[idx] = cfg;
    } else {
        modelConfigs.push(cfg);
        if (!activeModelId) activeModelId = cfg.id;
    }

    chrome.storage.local.set({ modelConfigs, activeModelId }, () => {
        document.getElementById('model-cfg-form').classList.add('hidden');
        document.getElementById('btn-add-model-cfg').classList.remove('hidden');
        editingModelId = null;
        renderActiveSelect();
        renderModelList();
    });
});

function deleteModelCfg(id) {
    if (!confirm('确定删除此模型配置吗？')) return;
    modelConfigs = modelConfigs.filter(c => c.id !== id);
    if (activeModelId === id) activeModelId = modelConfigs[0]?.id ?? null;
    chrome.storage.local.set({ modelConfigs, activeModelId }, () => {
        renderActiveSelect();
        renderModelList();
    });
}

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
    // 如果已经设置过任何验证方式，重新注册必须强制验证身份（不走缓存，指纹优先）
    const authState = await hasRegisteredAuth();
    if (authState.webauthn || authState.masterPw) {
        const authed = await verifyIdentity(showMasterPwDialog);
        if (!authed) return;
    }

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

    const hasMaster = await hasMasterPassword();
    if (hasMaster) {
        // 如果已经有密码了，用户正在请求重置
        const unlocked = typeof isVaultUnlocked === 'function' ? await isVaultUnlocked() : true;
        if (!unlocked) {
            alert('🔒 堡垒已锁定，必须先关闭高防模式才能修改密码。如果您忘记了旧密码，数据可能无法恢复。');
            return;
        }
        
        // 要求身份验证（强制验证，不走缓存，指纹优先）
        const authed = await verifyIdentity(showMasterPwDialog);
        if (!authed) return;
        
        await setMasterPassword(pw);
        
        // 如果开启了高防模式，还需要用新密码重新包裹内存中的真实密钥！
        const isHighSec = typeof isAntiSnoopMode === 'function' ? await isAntiSnoopMode() : false;
        if (isHighSec) {
            try {
                await enableHighSecurity(pw);
            } catch(e) {
                alert('重置密码失败: ' + e.message);
                return;
            }
        }
        alert('主密码重置成功！下次需使用新密码解锁。');
    } else {
        await setMasterPassword(pw);
        alert('主密码设置成功！');
    }

    document.getElementById('auth-masterpw-input').value = '';
    document.getElementById('auth-masterpw-confirm').value = '';
    openAuthSetupModal(); // 刷新状态
});

// ── 应急自锁功能 (Anti-Snoop) ──────────────────────────────
let antiSnoopMode = false;
let antiSnoopTimer = null;

function toggleAntiSnoopTimer(enable) {
    if (antiSnoopTimer) {
        clearInterval(antiSnoopTimer);
        antiSnoopTimer = null;
    }
    if (enable) {
        antiSnoopTimer = setInterval(() => {
            const start = performance.now();
            debugger;
            if (performance.now() - start > 100) {
                triggerLockdown();
            }
        }, 1000);
    }
}

function triggerLockdown() {
    console.warn('[Security] DevTools detected. Triggering lockdown.');
    authSessionExpiry = 0;
    revealedKeys.clear();
    allRows.forEach(r => delete r._plainPassword);
    renderTable();
    
    // 销毁纯内存中的真实主密钥
    destroySessionKey();
    
    // 如果安全设置弹窗开启，先关掉
    document.getElementById('auth-setup-modal').classList.add('hidden');
    
    // 显示锁定遮罩层
    document.getElementById('lockdown-overlay').classList.remove('hidden');
}

// 初始化加载配置
chrome.storage.local.get(['antiSnoopMode'], (res) => {
    antiSnoopMode = !!res.antiSnoopMode;
    const toggleEl = document.getElementById('toggle-anti-snoop');
    if (toggleEl) toggleEl.checked = antiSnoopMode;
    toggleAntiSnoopTimer(antiSnoopMode);
});

// 监听开关变化
document.getElementById('toggle-anti-snoop').addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    
    // UI状态乐观更新的回滚机制：先切回原始状态，操作成功再改变
    e.target.checked = !isChecked;
    
    if (isChecked) {
        // 开启高防模式涉及底层的包裹，必须使用主密码（即使当前已解锁）
        const hasMaster = await hasMasterPassword();
        if (!hasMaster) {
            alert('开启高防模式必须先设置主密码。');
            return;
        }
        
        const pw = await showMasterPwDialog();
        if (!pw) return;
        
        // 必须校验用户输入的主密码是否正确！否则会用错误的密码包裹密钥导致死锁
        const isPwCorrect = typeof verifyMasterPassword === 'function' ? await verifyMasterPassword(pw) : true;
        if (!isPwCorrect) {
            alert('主密码错误，开启高防模式失败。');
            return;
        }
        
        try {
            await enableHighSecurity(pw);
            e.target.checked = true;
            toggleAntiSnoopTimer(true);
            refreshAuthSession();
        } catch (err) {
            alert('开启失败: ' + err.message);
        }
    } else {
        // 关闭高防模式
        // 如果金库当前已经解锁（在内存中有密钥），我们不需要主密码！可以使用指纹！
        const unlocked = typeof isVaultUnlocked === 'function' ? await isVaultUnlocked() : false;
        
        if (unlocked) {
            // 已解锁状态下，只需要做常规身份验证（指纹或密码）即可关闭
            const authed = await requireAuth();
            if (!authed) return;
            try {
                await disableHighSecurity(); // 无需传入密码
                e.target.checked = false;
                toggleAntiSnoopTimer(false);
            } catch (err) {
                alert('关闭失败: ' + err.message);
            }
        } else {
            // 金库处于被锁状态，没有密码无法解包
            const pw = await showMasterPwDialog();
            if (!pw) return;
            try {
                await disableHighSecurity(pw);
                e.target.checked = false;
                toggleAntiSnoopTimer(false);
                refreshAuthSession();
            } catch (err) {
                if (err.message === 'WRONG_PASSWORD') {
                    alert('主密码错误');
                } else {
                    alert('关闭失败: ' + err.message);
                }
            }
        }
    }
});

// 解锁按钮
document.getElementById('btn-lockdown-unlock').addEventListener('click', async () => {
    // 这里强制弹出验证，不走缓存，因为缓存已经被清空
    const result = await verifyIdentity(showMasterPwDialog);
    if (result) {
        refreshAuthSession();
        document.getElementById('lockdown-overlay').classList.add('hidden');
    }
});

// ── 主题切换按钮 ────────────────────────────────────
document.getElementById('btn-theme').addEventListener('click', toggleTheme);

// ── storage 变更监听 ───────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.accounts || changes[DOMAIN_MATCH_MODES_KEY])) {
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
    if (changes.modelConfigs || changes.activeModelId) {
        loadModelConfigs();
    }
});

(async () => {
    applyTheme(getTheme());
    loadColumnWidths();
    await migrateToVault();
    await migrateToEncrypted().catch(e => console.warn('[Crypto] 迁移检查失败', e));
    initTableEvents();
    initColumnResizers();
    loadModelConfigs();
    loadAllAccounts();
})();
