importScripts('crypto.js', 'domain-utils.js');

const PENDING_SAVE_ACCOUNT_KEY = 'pendingSaveAccount';

async function getPendingSaveAccount() {
    if (chrome.storage.session) {
        const sessionRes = await storageGet(chrome.storage.session, [PENDING_SAVE_ACCOUNT_KEY]).catch(() => ({}));
        if (sessionRes[PENDING_SAVE_ACCOUNT_KEY]) return sessionRes[PENDING_SAVE_ACCOUNT_KEY];
    }

    const localRes = await storageGet(chrome.storage.local, [PENDING_SAVE_ACCOUNT_KEY]).catch(() => ({}));
    const pending = localRes[PENDING_SAVE_ACCOUNT_KEY] || null;
    if (!pending) return null;

    if (isEncrypted(pending.password)) {
        try {
            return {
                ...pending,
                password: await decryptPassword(pending.password)
            };
        } catch (err) {
            console.warn('[AutoSave] Failed to decrypt pending account:', err);
            await storageRemove(chrome.storage.local, PENDING_SAVE_ACCOUNT_KEY).catch(() => {});
            return null;
        }
    }

    return pending;
}

async function injectSavePromptIntoTopFrame(tabId, account) {
    if (!tabId || !account?.username || !account?.password) return;

    await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        args: [account],
        func: (pendingAccount) => {
            if (document.getElementById('passkeeper-save-prompt-root')) {
                return { shown: false, reason: 'exists' };
            }

            const bodyText = (document.body?.innerText || '').toLowerCase();
            const loggedIn = /\/js\d*\/main\.jsp/i.test(location.href)
                || ['收件箱', '写信', '未读邮件', 'inbox', 'compose', 'logout', 'sign out']
                    .some(k => bodyText.includes(k.toLowerCase()));
            if (!loggedIn) return { shown: false, reason: 'not_logged_in' };

            const root = document.createElement('div');
            root.id = 'passkeeper-save-prompt-root';
            root.style.cssText = [
                'position:fixed',
                'top:20px',
                'right:20px',
                'z-index:2147483647'
            ].join(';');

            const shadow = root.attachShadow({ mode: 'closed' });
            const style = document.createElement('style');
            style.textContent = `
                .prompt-container {
                    background: rgba(255, 255, 255, 0.92);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(15, 23, 42, 0.12);
                    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
                    border-radius: 14px;
                    padding: 16px 18px;
                    width: 310px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    color: #172033;
                }
                .header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; margin-bottom: 8px; }
                .content { font-size: 13px; color: #526078; line-height: 1.55; margin-bottom: 14px; }
                .username { font-weight: 700; color: #2563eb; }
                .actions { display: flex; justify-content: flex-end; gap: 8px; }
                button { border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
                .btn-ignore { background: #eef2f7; color: #526078; }
                .btn-save { background: #2563eb; color: white; font-weight: 650; }
            `;

            const container = document.createElement('div');
            container.className = 'prompt-container';
            container.innerHTML = `
                <div class="header"><span>🔐</span><span>PassKeeper</span></div>
                <div class="content">检测到新的账号登录信息，是否保存到密码库？<br>账号：<span class="username"></span></div>
                <div class="actions">
                    <button class="btn-ignore" id="btn-ignore">忽略</button>
                    <button class="btn-save" id="btn-save">保存</button>
                </div>
            `;
            container.querySelector('.username').textContent = pendingAccount.username;
            shadow.append(style, container);
            document.body.appendChild(root);

            const closePrompt = () => {
                root.remove();
                chrome.runtime.sendMessage({ action: 'discardPendingSaveAccount' });
            };

            shadow.getElementById('btn-ignore').addEventListener('click', closePrompt);
            shadow.getElementById('btn-save').addEventListener('click', () => {
                const btn = shadow.getElementById('btn-save');
                btn.textContent = '保存中...';
                btn.disabled = true;
                chrome.runtime.sendMessage({ action: 'saveAccount', account: pendingAccount }, (res) => {
                    if (res?.success) {
                        btn.textContent = '已保存';
                        setTimeout(closePrompt, 800);
                        return;
                    }
                    alert('保存失败: ' + (res?.error || '未知错误'));
                    btn.textContent = '保存';
                    btn.disabled = false;
                });
            });

            return { shown: true };
        }
    }).catch((err) => {
        console.debug('[AutoSave] inject prompt failed:', err?.message || err);
    });
}

async function maybeInjectPendingSavePrompt(tabId) {
    const pending = await getPendingSaveAccount();
    if (!pending || Date.now() - pending.timestamp > 5 * 60 * 1000) return;
    await injectSavePromptIntoTopFrame(tabId, pending);
}

function schedulePendingSaveChecks(tabId) {
    if (!tabId) return;
    [800, 1600, 3000, 6000, 10000].forEach(delay => {
        setTimeout(() => {
            maybeInjectPendingSavePrompt(tabId);
            chrome.tabs.sendMessage(tabId, { action: 'checkPendingSaveAccountNow' }, { frameId: 0 }, () => {
                // 页面跳转期间可能没有可接收的 content script，后续延迟检查会继续尝试。
                void chrome.runtime.lastError;
            });
        }, delay);
    });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        maybeInjectPendingSavePrompt(tabId);
    }
});


function storageSet(storageArea, data) {
    return new Promise((resolve, reject) => {
        storageArea.set(data, () => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve();
        });
    });
}

function storageGet(storageArea, keys) {
    return new Promise((resolve, reject) => {
        storageArea.get(keys, (res) => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(res);
        });
    });
}

function storageRemove(storageArea, keys) {
    return new Promise((resolve, reject) => {
        storageArea.remove(keys, () => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve();
        });
    });
}

// ── 验证码后处理：从模型输出中提取最终答案 ─────────────────────
function postProcess(text) {
    text = (text || '').trim();
    // 策略1: 文中含 "X op Y =?" → 直接计算
    const mathInline = text.match(
        /(\d+(?:\.\d+)?)\s*([+\-×÷\*\/])\s*(\d+(?:\.\d+)?)\s*[=＝]\s*[?？□]?/
    );
    if (mathInline) {
        const a = parseFloat(mathInline[1]);
        const op = mathInline[2].replace('×', '*').replace('÷', '/');
        const b = parseFloat(mathInline[3]);
        const ops = { '+': a + b, '-': a - b, '*': a * b, '/': b !== 0 ? a / b : 0 };
        const result = ops[op];
        if (result !== undefined && isFinite(result)) {
            return Number.isInteger(result) ? String(result) : result.toFixed(2).replace(/\.?0+$/, '');
        }
    }
    // 策略2: 末尾有 "= 数字"
    const afterEq = text.match(/[=＝]\s*([\d.]+)\s*$/);
    if (afterEq) return afterEq[1];
    // 策略3: 纯算式去掉 =? 后 eval
    const exprRaw = text.replace(/[=＝][?？□\s]*$/, '').trim();
    const expr = exprRaw.replace(/[×✕＊]/g, '*').replace(/[÷／]/g, '/');
    if (/^[\d\s+\-*\/().]+$/.test(expr)) {
        try { return String(eval(expr)); } catch (e) { /* ignore */ }
    }
    return text;
}

const PROMPT = `你是验证码识别助手，任务是识别图片中的验证码并给出最终填写答案。规则如下：
1. 若是字母/数字验证码：直接返回图片中显示的字符串，不要添加任何内容。
2. 若是数学运算验证码（含有 +、-、×、÷、* 、/ 等运算符和 =?、=□ 等）：必须计算出结果，只返回运算结果数字，绝对禁止返回原始算式或等式。
示例：图片内容"9-6=?"→输出"3"；图片内容"4×2=□"→输出"8"；图片内容"AB3C"→输出"AB3C"。
警告：若你返回的内容包含运算符（+ - * / × ÷）或等号，则视为回答错误。`;

// ── Ollama API ────────────────────────────────────────────────
async function callOllama(cfg, base64Data) {
    const baseUrl = (cfg.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: cfg.model,
            messages: [{ role: 'user', content: PROMPT, images: [base64Data] }],
            stream: false
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 403) throw new Error('Ollama 跨域限制 (403)，请设置 OLLAMA_ORIGINS="*" 后重启服务。');
        if (response.status === 404) throw new Error(`模型不存在 (404)，请检查模型名称: ${cfg.model}`);
        throw new Error(`Ollama API error: ${response.status} - ${err.error || ''}`);
    }
    const data = await response.json();
    return (data.message?.content || '').trim();
}

// ── Gemini API ────────────────────────────────────────────────
async function callGemini(cfg, base64Data, mimeType) {
    const model = cfg.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: PROMPT },
                    { inlineData: { mimeType: mimeType || 'image/png', data: base64Data } }
                ]
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 64 }
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.status} - ${err.error?.message || ''}`);
    }
    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) {
        console.warn('[AutoLogin][Gemini] no candidates');
        return '';
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('[AutoLogin][Gemini] finishReason:', candidate.finishReason);
    }
    return (candidate.content?.parts?.[0]?.text || '').trim();
}

// ── OpenAI-compatible API ─────────────────────────────────────
async function callOpenAI(cfg, base64Data, mimeType) {
    const baseUrl = (cfg.openaiUrl || cfg.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: cfg.model,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: PROMPT },
                    { type: 'image_url', image_url: { url: `data:${mimeType || 'image/png'};base64,${base64Data}` } }
                ]
            }],
            max_tokens: 32,
            temperature: 0
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${err.error?.message || ''}`);
    }
    const data = await response.json();
    return (data.choices?.[0]?.message?.content || '').trim();
}

// ── 消息监听 ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'recognizeCaptcha') {
        const { base64Image } = request;
        const mimeMatch = base64Image.match(/^data:(image\/[a-z]+);base64,/);
        const mimeType  = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

        chrome.storage.local.get(['modelConfigs', 'activeModelId', 'ollamaModel'], async (stored) => {
            // 读取激活模型配置（兼容旧版）
            let cfg;
            const configs = stored.modelConfigs || [];
            if (configs.length > 0) {
                cfg = configs.find(c => c.id === stored.activeModelId) || configs[0];
            } else {
                // 旧版兼容：只有 ollamaModel
                cfg = { type: 'ollama', model: stored.ollamaModel || 'qwen3-vl:8b', baseUrl: 'http://localhost:11434' };
            }

            try {
                let raw = '';
                if (cfg.type === 'gemini') {
                    raw = await callGemini(cfg, base64Data, mimeType);
                } else if (cfg.type === 'openai') {
                    raw = await callOpenAI(cfg, base64Data, mimeType);
                } else {
                    raw = await callOllama(cfg, base64Data);
                }

                const text = postProcess(raw);
                sendResponse({ success: true, text });

            } catch (error) {
                console.error('[AutoLogin] API request failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        });

        return true; // 异步 sendResponse
    }

    if (request.action === 'stagePendingSaveAccount') {
        const { account } = request;
        if (!account?.username || !account?.password || !account?.domain) {
            sendResponse({ success: false, error: 'INVALID_ACCOUNT' });
            return false;
        }

        (async () => {
            try {
                const tabUrl = sender?.tab?.url || '';
                const shouldUseTabUrl = /^https?:\/\//i.test(tabUrl);
                const previousPending = await getPendingSaveAccount();
                const shouldKeepSubmitted = !account.submitted
                    && previousPending?.submitted
                    && previousPending.username === account.username
                    && previousPending.password === account.password;
                const pending = {
                    username: account.username,
                    password: account.password,
                    domain: shouldUseTabUrl ? tabUrl : account.domain,
                    loginFrameDomain: shouldUseTabUrl && tabUrl !== account.domain ? account.domain : '',
                    submitted: !!account.submitted || shouldKeepSubmitted,
                    timestamp: account.timestamp || Date.now()
                };

                if (chrome.storage.session) {
                    await storageSet(chrome.storage.session, { [PENDING_SAVE_ACCOUNT_KEY]: pending }).catch((err) => {
                        console.debug('[AutoSave] Failed to write session pending account:', err?.message || err);
                    });
                }

                const localPending = {
                    ...pending,
                    password: isEncrypted(pending.password) ? pending.password : await encryptPassword(pending.password)
                };
                await storageSet(chrome.storage.local, { [PENDING_SAVE_ACCOUNT_KEY]: localPending });

                schedulePendingSaveChecks(sender?.tab?.id);

                sendResponse({ success: true });
            } catch (err) {
                console.error('[AutoSave] Failed to stage account:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'getPendingSaveAccount') {
        (async () => {
            try {
                sendResponse({ success: true, account: await getPendingSaveAccount() });
            } catch (err) {
                sendResponse({ success: false, error: err.message, account: null });
            }
        })();
        return true;
    }

    if (request.action === 'discardPendingSaveAccount') {
        (async () => {
            try {
                if (chrome.storage.session) {
                    await storageRemove(chrome.storage.session, PENDING_SAVE_ACCOUNT_KEY);
                }
                await storageRemove(chrome.storage.local, PENDING_SAVE_ACCOUNT_KEY);
                sendResponse({ success: true });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'isAccountAlreadySaved') {
        const { account } = request;
        if (!account?.username || !account?.password || !account?.domain) {
            sendResponse({ success: true, exists: false });
            return false;
        }

        chrome.storage.local.get(['vault', DOMAIN_MATCH_MODES_KEY], async (res) => {
            try {
                const vault = res.vault || [];
                const matchModes = res[DOMAIN_MATCH_MODES_KEY] || {};
                const domainKey = pkGetDomainKey(account.domain, matchModes);
                const matches = vault.filter(a =>
                    a.username === account.username
                    && (a.domains || []).some(d => pkDomainMatches(d, domainKey, matchModes))
                );

                for (const item of matches) {
                    const savedPassword = isEncrypted(item.password)
                        ? await decryptPassword(item.password)
                        : item.password;
                    if (savedPassword === account.password) {
                        sendResponse({ success: true, exists: true });
                        return;
                    }
                }
                sendResponse({ success: true, exists: false });
            } catch (err) {
                console.warn('[AutoSave] Failed to check existing account:', err);
                sendResponse({ success: false, exists: false, error: err.message });
            }
        });
        return true;
    }

    if (request.action === 'saveAccount') {
        const { account } = request;
        chrome.storage.local.get(['vault', DOMAIN_MATCH_MODES_KEY], async (res) => {
            const vault = res.vault || [];
            const matchModes = res[DOMAIN_MATCH_MODES_KEY] || {};
            
            // 域名匹配辅助函数
            const isMatch = (pattern, actualUrl) => {
                return pkDomainMatches(pattern, actualUrl, matchModes);
            };

            try {
                // 确保已导入 crypto.js 并拥有 encryptPassword 和 genId 
                // genId 不是 crypto.js 里的，需要自己生成
                const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
                const encPwd = account.password && !account.password.iv
                    ? await encryptPassword(account.password)
                    : account.password;
                const domainKey = pkGetDomainKey(account.domain, matchModes);
                
                // 检查是否已存在同域名下的同用户名账号 (支持通配符)
                const existingIndex = vault.findIndex(a => a.username === account.username && (a.domains || []).some(d => isMatch(d, domainKey)));
                if (existingIndex >= 0) {
                    vault[existingIndex].password = encPwd;
                } else {
                    vault.push({
                        id: genId(),
                        username: account.username,
                        password: encPwd,
                        remark: '自动保存',
                        domains: [domainKey]
                    });
                }
                
                await new Promise(resolve => chrome.storage.local.set({ vault }, resolve));
                if (chrome.storage.session) {
                    await storageRemove(chrome.storage.session, PENDING_SAVE_ACCOUNT_KEY);
                }
                await storageRemove(chrome.storage.local, PENDING_SAVE_ACCOUNT_KEY);
                sendResponse({ success: true });
            } catch (err) {
                console.error('[AutoSave] Failed to save account:', err);
                sendResponse({ success: false, error: err.message });
            }
        });
        return true; // 异步 sendResponse
    }
});
