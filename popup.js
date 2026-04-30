// 内联 SVG 图标库（Lucide 风格线性）
const ICONS = {
    edit:      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    delete:    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    close:     `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    add:       `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    // 填充：输入框 + 文字光标，清晰表达"填写表单字段"
    fill:      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="6" y1="9" x2="6" y2="15"/></svg>`,
    // 填充并登录：符号表示登录动作
    loginFill: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
    // 一键切换账号：双向循环箭头
    switch:    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a8.1 8.1 0 0 1 14.5-3.5L22 11"/><path d="M22 11h-7v-7"/><path d="M20 13a8.1 8.1 0 0 1-14.5 3.5L2 13"/><path d="M2 13h7v7"/></svg>`,
};

document.addEventListener('DOMContentLoaded', async () => {
    // ── 应急自锁检测 ──────────────────────────────────────
    chrome.storage.local.get(['antiSnoopMode'], (res) => {
        if (res.antiSnoopMode) {
            setInterval(() => {
                const start = performance.now();
                debugger;
                if (performance.now() - start > 100) {
                    console.warn('[Security] DevTools detected in popup. Closing.');
                    if (chrome.storage.session) {
                        chrome.storage.session.remove(['_sessionMasterKey']);
                    }
                    window.close();
                }
            }, 1000);
        }
    });

    const actualDomainEl   = document.getElementById('actual-domain');
    const domainChipsEl    = document.getElementById('domain-chips');
    const inputNewDomain   = document.getElementById('input-new-domain');
    const accountListEl    = document.getElementById('account-list');
    const addFormContainer = document.getElementById('add-form');
    const toggleAddFormBtn = document.getElementById('toggle-add-form');
    const btnSave          = document.getElementById('btn-save');
    const btnCancel        = document.getElementById('btn-cancel');

    // 当前真实域名（浏览器地址栏）
    let actualDomain = '';
    // 编辑状态
    let editingId = null; // null = 新增，id = 编辑对应账号 ID

    function normalizeDomain(input) {
        return (input || '').trim();
    }

    function clearNode(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    function appendIconButton(button, iconSvg) {
        button.insertAdjacentHTML('afterbegin', iconSvg);
    }

    function setButtonIconAndMeta(button, iconSvg, id, action) {
        if (id !== undefined) button.dataset.id = id;
        if (action !== undefined) button.dataset.action = action;
        appendIconButton(button, iconSvg);
    }

    // 域名匹配辅助函数
    const isMatch = (pattern, actualUrl) => {
        if (!pattern || !actualUrl) return false;
        if (pattern === actualUrl) return true;
        if (pattern.includes('*')) {
            const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
            try { if (new RegExp(regexStr).test(actualUrl)) return true; } catch(e){}
        }
        if (!pattern.startsWith('http')) {
            try {
                const urlObj = new URL(actualUrl);
                if (urlObj.host === pattern || urlObj.host.endsWith('.' + pattern)) return true;
                const hostPath = urlObj.host + urlObj.pathname;
                if (hostPath.startsWith(pattern)) return true;
            } catch(e) {}
            if (actualUrl.includes(pattern)) return true;
        } else {
            if (actualUrl.startsWith(pattern)) return true;
        }
        return false;
    };

    // ── 工具函数 ───────────────────────────────────────────
    async function getVault() {
        return new Promise(resolve => chrome.storage.local.get(['vault'], r => resolve(r.vault || [])));
    }

    async function saveVault(vault) {
        return new Promise(resolve => chrome.storage.local.set({ vault }, resolve));
    }

    // 找到当前域名下的所有账号
    async function getAccountsForDomain(domain) {
        const vault = await getVault();
        return vault.filter(acc => (acc.domains || []).some(d => isMatch(d, domain)));
    }

    // 绑定域名：将新域名添加到所有目前包含目标域名的账号中
    async function linkDomain(newDomain, targetDomain) {
        const vault = await getVault();
        let changed = false;
        vault.forEach(acc => {
            if ((acc.domains || []).some(d => isMatch(d, targetDomain))) {
                if (!acc.domains.includes(newDomain)) {
                    acc.domains.push(newDomain);
                    changed = true;
                }
            }
        });
        if (changed) await saveVault(vault);
    }

    // 解除绑定：从所有目前显示在当前域名的账号中移除该域名
    async function unlinkDomain(domainToRemove) {
        const vault = await getVault();
        let changed = false;
        vault.forEach(acc => {
            if ((acc.domains || []).some(d => isMatch(d, actualDomain))) {
                acc.domains = (acc.domains || []).filter(d => d !== domainToRemove);
                changed = true;
            }
        });
        // 过滤掉没有任何域名的账号
        const finalVault = vault.filter(acc => (acc.domains || []).length > 0);
        await saveVault(finalVault);
    }

    // ── 初始化 ─────────────────────────────────────────────
    // 初始化：先执行存量明文密码迁移
    try {
        await migrateToEncrypted();
    } catch (e) {
        console.warn('[Crypto] 迁移检查失败，继续加载', e);
    }

    // 初始化
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
            try {
                const u = new URL(tab.url);
                actualDomain = u.origin + u.pathname;
            } catch(e) {
                actualDomain = tab.url.split('?')[0].split('#')[0];
            }
            actualDomainEl.textContent = actualDomain;
            renderDomainChips();
            loadAccounts();
        } else {
            actualDomainEl.textContent = '无法获取当前页面域名';
        }
    } catch (e) {
        console.error('获取域名异常', e);
        actualDomainEl.textContent = '获取域名异常';
    }

    // ── 渲染所有关联域名列表 ────────────────────────────────
    async function renderDomainChips() {
        const accounts = await getAccountsForDomain(actualDomain);
        const allDomains = new Set();
        accounts.forEach(acc => {
            (acc.domains || []).forEach(d => allDomains.add(d));
        });

        clearNode(domainChipsEl);

        if (allDomains.size === 0) {
            const empty = document.createElement('span');
            empty.className = 'chip-empty';
            empty.textContent = '暂无绑定域名，新增账号后将自动绑定当前网址';
            domainChipsEl.appendChild(empty);
            return;
        }

        allDomains.forEach(domain => {
            const row = document.createElement('div');
            row.className = 'domain-chip-row-item';
            const label = document.createElement('span');
            label.className = 'chip-label';
            label.title = '点击以编辑';
            label.textContent = domain;

            const editBtn = document.createElement('button');
            editBtn.className = 'chip-btn chip-edit-btn';
            editBtn.dataset.domain = domain;
            editBtn.title = '编辑';
            appendIconButton(editBtn, ICONS.edit);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'chip-btn chip-remove-btn';
            removeBtn.dataset.domain = domain;
            removeBtn.title = '删除';
            appendIconButton(removeBtn, ICONS.close);

            row.append(label, editBtn, removeBtn);
            domainChipsEl.appendChild(row);

            // 内联编辑：点击编辑按钮或域名文字
            const startEdit = () => {
                const label = row.querySelector('.chip-label');
                const input = document.createElement('input');
                input.className = 'chip-inline-input';
                input.value = domain;
                label.replaceWith(input);
                input.focus();
                input.select();

                const saveEdit = async () => {
                    const newVal = normalizeDomain(input.value);
                    if (newVal && newVal !== domain) {
                        await unlinkDomain(domain);
                        if (newVal !== actualDomain) {
                            await linkDomain(newVal, actualDomain);
                        }
                    }
                    renderDomainChips();
                };
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
                    if (e.key === 'Escape') renderDomainChips();
                });
                input.addEventListener('blur', saveEdit);
            };

            editBtn.addEventListener('click', startEdit);
            label.addEventListener('click', startEdit);

            // 删除
            removeBtn.addEventListener('click', async () => {
                if (!confirm(`确定移除共享域名 "${domain}" 吗？`)) return;
                await unlinkDomain(domain);
                renderDomainChips();
            });
        });
    }


    inputNewDomain.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const val = normalizeDomain(inputNewDomain.value);
        if (!val) { alert('请输入有效的域名或地址'); return; }
        if (val === actualDomain) {
            alert('不能将当前域名添加为共享域名'); return;
        }
        await linkDomain(val, actualDomain);
        inputNewDomain.value = '';
        renderDomainChips();
        loadAccounts(); // 重新加载，因为可能关联了新域名
    });


    async function loadAccounts() {
        if (!actualDomain) return;

        const accounts = await getAccountsForDomain(actualDomain);
        clearNode(accountListEl);

        if (accounts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            const icon = document.createElement('div');
            icon.className = 'empty-icon';
            icon.textContent = '🔐';
            const text = document.createElement('div');
            text.textContent = '暂无保存的账号';
            empty.append(icon, text);
            accountListEl.appendChild(empty);
            return;
        }

            accounts.forEach((acc) => {
                const item = document.createElement('div');
                item.className = 'account-item';
                const mainRow = document.createElement('div');
                mainRow.className = 'account-row-main';

                const username = document.createElement('span');
                username.className = 'account-username';
                username.textContent = acc.username;

                const actions = document.createElement('div');
                actions.className = 'account-actions';

                const actionDefs = [
                    ['btn-act btn-fill', '填充', ICONS.fill],
                    ['btn-act btn-login', '填充并登录', ICONS.loginFill],
                    ['btn-act btn-switch', '一键切换账号', ICONS.switch],
                    ['btn-edit', '编辑', ICONS.edit],
                    ['btn-delete', '删除', ICONS.delete]
                ];

                actionDefs.forEach(([className, title, iconSvg]) => {
                    const button = document.createElement('button');
                    button.className = className;
                    button.dataset.id = acc.id;
                    button.title = title;
                    appendIconButton(button, iconSvg);
                    actions.appendChild(button);
                });

                mainRow.append(username, actions);
                item.appendChild(mainRow);

                if (acc.remark) {
                    const remark = document.createElement('div');
                    remark.className = 'account-remark';
                    remark.textContent = acc.remark;
                    item.appendChild(remark);
                }
                accountListEl.appendChild(item);
            });

            // 绑定事件
            accountListEl.querySelectorAll('.btn-fill').forEach(btn =>
                btn.addEventListener('click', (e) => handleAction(e, false)));
            accountListEl.querySelectorAll('.btn-login').forEach(btn =>
                btn.addEventListener('click', (e) => handleAction(e, true)));
            accountListEl.querySelectorAll('.btn-switch').forEach(btn =>
                btn.addEventListener('click', handleSwitchAccount));
            accountListEl.querySelectorAll('.btn-edit').forEach(btn =>
                btn.addEventListener('click', handleEdit));
            accountListEl.querySelectorAll('.btn-delete').forEach(btn =>
                btn.addEventListener('click', handleDelete));
        }

    async function handleAction(e, autoLogin) {
        const btn = e.currentTarget;
        const id = btn.getAttribute('data-id');
        const accountItem = btn.closest('.account-item');

        if (accountItem) accountItem.classList.add('loading');
        const clickedBtn = btn;
        clickedBtn.disabled = true;

        const finish = () => {
            if (accountItem) accountItem.classList.remove('loading');
            clickedBtn.disabled = false;
        };

        const vault = await getVault();
        const account = vault.find(a => a.id === id);
        if (!account) { finish(); return; }

            // 解密密码后再发送给 content script
            let plainPassword = '';
            try {
                plainPassword = isEncrypted(account.password)
                    ? await decryptPassword(account.password)
                    : account.password;
            } catch (e) {
                if (e.message === 'LOCKED') {
                    finish();
                    if (confirm('🔒 堡垒已锁定，需验证主密码。是否立即前往管理面板解锁？')) {
                        chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
                    }
                    return;
                }
                console.error('[Crypto] 解密失败:', e);
                finish();
                alert('密码解密失败，请重新保存该账号。');
                return;
            }

            const accountForFill = {
                username: account.username,
                password: plainPassword,
                remark: account.remark
            };

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) { finish(); return; }

            const sendMessage = () => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'fillAccount',
                    account: accountForFill,
                    autoLogin
                }, () => {
                    finish();
                    if (chrome.runtime.lastError) {
                        alert('页面未完全加载或此页面不允许插件操作，请刷新页面后重试。');
                    }
                });
            };

            chrome.tabs.sendMessage(tab.id, { action: 'ping' }, () => {
                if (chrome.runtime.lastError) {
                    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
                        .then(() => setTimeout(sendMessage, 200))
                        .catch(() => { finish(); alert('尝试注入脚本失败，请手动刷新页面。'); });
                } else {
                    sendMessage();
                }
            });
    }

    async function handleSwitchAccount(e) {
        const btn = e.currentTarget;
        const id = btn.getAttribute('data-id');
        const accountItem = btn.closest('.account-item');

        if (accountItem) accountItem.classList.add('loading');
        btn.disabled = true;

        const finish = () => {
            if (accountItem) accountItem.classList.remove('loading');
            btn.disabled = false;
        };

        const vault = await getVault();
        const account = vault.find(a => a.id === id);
        if (!account) { finish(); return; }

            // 解密密码
            let plainPassword = '';
            try {
                plainPassword = isEncrypted(account.password)
                    ? await decryptPassword(account.password)
                    : account.password;
            } catch (err) {
                if (err.message === 'LOCKED') {
                    finish();
                    if (confirm('🔒 堡垒已锁定，需验证主密码。是否立即前往管理面板解锁？')) {
                        chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
                    }
                    return;
                }
                console.error('[Crypto] 解密失败:', err);
                finish();
                alert('密码解密失败，请重新保存该账号。');
                return;
            }

            const accountForFill = {
                username: account.username,
                password: plainPassword,
                remark: account.remark
            };

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) { finish(); return; }

            const sendMessage = () => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'switchAccount',
                    account: accountForFill
                }, () => {
                    finish();
                    if (chrome.runtime.lastError) {
                        alert('页面未完全加载或此页面不允许插件操作，请刷新页面后重试。');
                    }
                });
            };

            chrome.tabs.sendMessage(tab.id, { action: 'ping' }, () => {
                if (chrome.runtime.lastError) {
                    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
                        .then(() => setTimeout(sendMessage, 200))
                        .catch(() => { finish(); alert('尝试注入脚本失败，请手动刷新页面。'); });
                } else {
                    sendMessage();
                }
            });
    }

    async function handleEdit(e) {
        const id = e.currentTarget.getAttribute('data-id');
        const vault = await getVault();
        const acc = vault.find(a => a.id === id);
        if (!acc) return;

        editingId = id;
        document.getElementById('input-username').value = acc.username;
        const pwdInput = document.getElementById('input-password');
        pwdInput.value = '';
        pwdInput.placeholder = '不修改请留空';
        pwdInput.removeAttribute('required');
        document.getElementById('input-remark').value = acc.remark || '';
        btnSave.textContent = '更新账号';

        addFormContainer.classList.remove('hidden');
        toggleAddFormBtn.classList.add('hidden');
        document.getElementById('input-username').focus();
    }

    async function handleDelete(e) {
        if (!confirm('确定删除此账号吗？')) return;
        const id = e.currentTarget.getAttribute('data-id');
        const vault = await getVault();
        const newVault = vault.filter(a => a.id !== id);
        await saveVault(newVault);
        loadAccounts();
    }

    toggleAddFormBtn.addEventListener('click', () => {
        editingId = null;
        btnSave.textContent = '保存';
        addFormContainer.classList.toggle('hidden');
        toggleAddFormBtn.classList.toggle('hidden');
    });

    btnCancel.addEventListener('click', () => {
        editingId = null;
        btnSave.textContent = '保存';
        addFormContainer.classList.add('hidden');
        toggleAddFormBtn.classList.remove('hidden');
        document.getElementById('input-username').value = '';
        const pwdInput = document.getElementById('input-password');
        pwdInput.value = '';
        pwdInput.placeholder = '密码';
        pwdInput.setAttribute('required', '');
        document.getElementById('input-remark').value = '';
    });

    btnSave.addEventListener('click', async () => {
        const username = document.getElementById('input-username').value.trim();
        const passwordRaw = document.getElementById('input-password').value.trim();
        const remark   = document.getElementById('input-remark').value.trim();

        if (!username) { alert('请输入用户名'); return; }
        if (!editingId && !passwordRaw) { alert('请输入密码'); return; }
        if (!actualDomain) { alert('无法确定账号所属域名'); return; }

        const vault = await getVault();
        let encPwd;

        if (editingId) {
            const acc = vault.find(a => a.id === editingId);
            if (!acc) return;
            if (passwordRaw) {
                try { 
                    encPwd = await encryptPassword(passwordRaw); 
                } catch(e) { 
                    if (e.message === 'LOCKED') {
                        if (confirm('🔒 堡垒已锁定，需验证主密码。是否立即前往管理面板解锁？')) {
                            chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
                        }
                    } else {
                        alert('加密失败');
                    }
                    return; 
                }
            } else {
                encPwd = acc.password;
            }
            acc.username = username;
            acc.password = encPwd;
            acc.remark = remark;
        } else {
            try { 
                encPwd = await encryptPassword(passwordRaw); 
            } catch(e) { 
                if (e.message === 'LOCKED') {
                    if (confirm('🔒 堡垒已锁定，需验证主密码。是否立即前往管理面板解锁？')) {
                        chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
                    }
                } else {
                    alert('加密失败');
                }
                return; 
            }
            // 新增时自动关联当前域名
            vault.push({
                id: genId(),
                username,
                password: encPwd,
                remark,
                domains: [actualDomain]
            });
        }

        await saveVault(vault);
        btnCancel.click();
        loadAccounts();
    });

    // ── 一键填充测试数据 ───────────────────────────────────────
    const btnTestFill    = document.getElementById('btn-test-fill');
    const testFillResult = document.getElementById('test-fill-result');

    btnTestFill.addEventListener('click', async () => {
        btnTestFill.disabled = true;
        btnTestFill.textContent = '填充中…';
        testFillResult.className = 'test-fill-result hidden';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            btnTestFill.disabled = false;
            btnTestFill.textContent = '填充';
            return;
        }

        const doSend = () => {
            chrome.tabs.sendMessage(tab.id, { action: 'fillTestForm' }, (resp) => {
                btnTestFill.disabled = false;
                btnTestFill.textContent = '填充';
                if (chrome.runtime.lastError || !resp) {
                    testFillResult.textContent = '⚠️ 无法注入页面，请刷新后重试';
                    testFillResult.className = 'test-fill-result error';
                    return;
                }
                const skip = (resp.skipped || []).filter((v, i, a) => a.indexOf(v) === i);
                testFillResult.textContent = `✅ 已填充 ${resp.filled} 个字段` +
                    (skip.length ? `（跳过: ${skip.join(', ')}）` : '');
                testFillResult.className = 'test-fill-result';
            });
        };

        chrome.tabs.sendMessage(tab.id, { action: 'ping' }, () => {
            if (chrome.runtime.lastError) {
                chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
                    .then(() => setTimeout(doSend, 200))
                    .catch(() => {
                        btnTestFill.disabled = false;
                        btnTestFill.textContent = '填充';
                        testFillResult.textContent = '⚠️ 脚本注入失败，请手动刷新页面';
                        testFillResult.className = 'test-fill-result error';
                    });
            } else {
                doSend();
            }
        });
    });

    // ── 模型配置管理 ───────────────────────────────────────────
    const selectActiveModel = document.getElementById('select-active-model');
    const modelConfigList   = document.getElementById('model-config-list');
    const btnAddModelCfg    = document.getElementById('btn-add-model-cfg');
    const modelCfgForm      = document.getElementById('model-cfg-form');
    const mcfType           = document.getElementById('mcf-type');

    let modelConfigs   = [];   // 所有模型配置
    let activeModelId  = null; // 当前激活 id
    let editingModelId = null; // null = 新增，非 null = 编辑

    function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

    const TYPE_LABELS = { ollama: 'Ollama', gemini: 'Gemini', openai: 'OpenAI-compat' };

    // 迁移旧数据
    function migrateOldModel(stored) {
        if ((stored.modelConfigs || []).length > 0) return;
        const old = stored.ollamaModel;
        if (!old) return;
        const cfg = { id: genId(), name: '本地 Ollama', type: 'ollama',
            baseUrl: 'http://localhost:11434', model: old };
        chrome.storage.local.set({ modelConfigs: [cfg], activeModelId: cfg.id });
    }

    // 渲染下拉选择器
    function renderActiveSelect() {
        clearNode(selectActiveModel);
        if (!modelConfigs.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '— 未配置模型 —';
            selectActiveModel.appendChild(option);
            return;
        }

        modelConfigs.forEach((cfg) => {
            const option = document.createElement('option');
            option.value = cfg.id;
            option.selected = cfg.id === activeModelId;
            option.textContent = `${cfg.name} (${TYPE_LABELS[cfg.type] || cfg.type})`;
            selectActiveModel.appendChild(option);
        });
    }

    // 渲染模型列表
    function renderModelList() {
        clearNode(modelConfigList);
        modelConfigs.forEach(cfg => {
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
            setButtonIconAndMeta(editBtn, ICONS.edit, cfg.id, 'edit');

            const delBtn = document.createElement('button');
            delBtn.className = 'mcl-btn mcl-del';
            delBtn.title = '删除';
            setButtonIconAndMeta(delBtn, ICONS.delete, cfg.id, 'del');

            btns.append(editBtn, delBtn);
            row.append(info, btns);
            modelConfigList.appendChild(row);
        });

        modelConfigList.querySelectorAll('.mcl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id     = e.currentTarget.getAttribute('data-id');
                const action = e.currentTarget.getAttribute('data-action');
                if (action === 'edit') openModelForm(id);
                if (action === 'del')  deleteModelCfg(id);
            });
        });
    }

    // 加载模型配置
    function loadModelConfigs() {
        chrome.storage.local.get(['modelConfigs', 'activeModelId', 'ollamaModel'], (stored) => {
            migrateOldModel(stored);
            chrome.storage.local.get(['modelConfigs', 'activeModelId'], (s2) => {
                modelConfigs  = s2.modelConfigs  || [];
                activeModelId = s2.activeModelId || (modelConfigs[0]?.id ?? null);
                renderActiveSelect();
                renderModelList();
            });
        });
    }

    // 切换激活模型
    selectActiveModel.addEventListener('change', () => {
        activeModelId = selectActiveModel.value;
        chrome.storage.local.set({ activeModelId });
        renderModelList();
    });

    // 按类型显隐表单字段
    function updateFormFields(type) {
        document.querySelectorAll('.mcf-ollama').forEach(el =>
            el.classList.toggle('hidden', type !== 'ollama'));
        document.querySelectorAll('.mcf-api-key').forEach(el =>
            el.classList.toggle('hidden', type === 'ollama'));
        document.querySelectorAll('.mcf-openai').forEach(el =>
            el.classList.toggle('hidden', type !== 'openai'));
    }

    mcfType.addEventListener('change', () => updateFormFields(mcfType.value));

    // 打开新增/编辑表单
    function openModelForm(id) {
        editingModelId = id || null;
        const cfg = id ? modelConfigs.find(c => c.id === id) : null;
        document.getElementById('mcf-name').value     = cfg?.name     || '';
        document.getElementById('mcf-base-url').value = cfg?.baseUrl  || 'http://localhost:11434';
        document.getElementById('mcf-api-key').value  = cfg?.apiKey   || '';
        document.getElementById('mcf-openai-url').value = cfg?.openaiUrl || '';
        document.getElementById('mcf-model').value    = cfg?.model    || '';
        mcfType.value = cfg?.type || 'ollama';
        updateFormFields(mcfType.value);
        modelCfgForm.classList.remove('hidden');
        btnAddModelCfg.classList.add('hidden');
        document.getElementById('mcf-name').focus();
    }

    btnAddModelCfg.addEventListener('click', () => openModelForm(null));

    document.getElementById('mcf-cancel').addEventListener('click', () => {
        modelCfgForm.classList.add('hidden');
        btnAddModelCfg.classList.remove('hidden');
        editingModelId = null;
    });

    document.getElementById('mcf-save').addEventListener('click', () => {
        const name  = document.getElementById('mcf-name').value.trim();
        const type  = mcfType.value;
        const model = document.getElementById('mcf-model').value.trim();
        if (!name || !model) { alert('名称和模型名不能为空'); return; }

        const cfg = {
            id:        editingModelId || genId(),
            name, type, model,
            baseUrl:   document.getElementById('mcf-base-url').value.trim(),
            apiKey:    document.getElementById('mcf-api-key').value.trim(),
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
            modelCfgForm.classList.add('hidden');
            btnAddModelCfg.classList.remove('hidden');
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

    loadModelConfigs();

    // ── 打开账号管理后台 ─────────────────────────────────────
    document.getElementById('open-manager').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
    });
});
