// 获取图像 Base64
function getBase64Image(imgElement) {
    return new Promise((resolve, reject) => {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = imgElement.width || imgElement.naturalWidth;
            canvas.height = imgElement.height || imgElement.naturalHeight;
            const ctx = canvas.getContext("getContext" in canvas ? "2d" : "webgl") || canvas.getContext("2d");
            ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
            const dataURL = canvas.toDataURL("image/png");
            resolve(dataURL);
        } catch (e) {
            // 如果图片有跨域问题，可能无法直接 drawImage
            console.warn("Canvas drawImage failed, trying fetch...", e);
            fetch(imgElement.src)
                .then(res => res.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                })
                .catch(reject);
        }
    });
}

// 寻找可能的验证码图片
function findCaptchaImage() {
    const images = Array.from(document.querySelectorAll('img'));
    
    // 按启发式规则查找
    const keywords = ['captcha', 'code', 'yzm', 'verify', 'vcode'];
    for (const img of images) {
        const src = (img.src || '').toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const id = (img.id || '').toLowerCase();
        const className = (img.className || '').toString().toLowerCase();

        if (keywords.some(k => src.includes(k) || alt.includes(k) || id.includes(k) || className.includes(k))) {
            return img;
        }
    }

    // 如果没找到符合关键词的，找一个点击后会刷新的图片，或者在密码框附近的图片
    const passwordInput = document.querySelector('input[type="password"]');
    if (passwordInput) {
        // 查找密码框之后的 img
        const allElements = Array.from(document.querySelectorAll('*'));
        const pwdIndex = allElements.indexOf(passwordInput);
        for (let i = pwdIndex + 1; i < allElements.length; i++) {
            if (allElements[i].tagName === 'IMG') {
                return allElements[i];
            }
        }
    }
    return null;
}

// 寻找输入框
function findInputs() {
    const passwordInput = document.querySelector('input[type="password"]');
    let usernameInput = null;
    let captchaInput = null;

    if (passwordInput) {
        // 往前找 text 或 email 输入框作为用户名
        const form = passwordInput.closest('form') || document.body;
        const textInputs = Array.from(form.querySelectorAll('input[type="text"], input[type="email"], input:not([type])'));
        
        for (const input of textInputs) {
            // 排除隐藏和只读
            if (input.type === 'hidden' || input.readOnly || input.disabled) continue;
            
            // 如果这个 text input 在 password 之前，很可能是用户名
            if (input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING) {
                usernameInput = input;
            } 
            // 如果在 password 之后，且长度较短，可能是验证码
            else if (passwordInput.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) {
                const idNameClass = (input.id + input.name + input.className).toLowerCase();
                if (idNameClass.includes('code') || idNameClass.includes('captcha') || idNameClass.includes('yzm') || input.maxLength <= 6) {
                    captchaInput = input;
                    break;
                }
            }
        }
        
        // 如果没有找到特定的验证码框，尝试再次寻找 password 之后的 text 框
        if (!captchaInput) {
             for (const input of textInputs) {
                 if (passwordInput.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) {
                     captchaInput = input;
                     break;
                 }
             }
        }
    }

    return { usernameInput, passwordInput, captchaInput };
}

// 模拟用户输入事件
function simulateInput(element, value) {
    if (!element) return;
    element.focus();
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        sendResponse({ success: true });
        return;
    }

    if (request.action === 'fillAccount') {
        handleFillAccount(request, sendResponse);
        return true;
    }

    if (request.action === 'switchAccount') {
        const { account } = request;
        chrome.storage.local.set({
            pendingAutoLogin: {
                domain: window.location.hostname, // Record the host
                account: account
            }
        }, () => {
            let clicked = findAndClickLogout();
            if (!clicked) {
                clearSessionAndReload();
            } else {
                // If it doesn't navigate within 2.5s after clicking logout, force clear
                setTimeout(() => {
                    clearSessionAndReload();
                }, 2500);
            }
        });
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'fillTestForm') {
        const result = fillTestForm();
        sendResponse({ success: true, filled: result.filled, skipped: result.skipped });
        return;
    }
});

function handleFillAccount(request, sendResponse) {
    const { account, autoLogin } = request;
    
    // 查找输入框
    const { usernameInput, passwordInput, captchaInput } = findInputs();
    
    if (usernameInput) simulateInput(usernameInput, account.username);
    if (passwordInput) simulateInput(passwordInput, account.password);

    // 查找验证码图片
    const captchaImage = findCaptchaImage();

    if (captchaImage && captchaInput) {
        // 获取验证码图片 Base64
        getBase64Image(captchaImage).then(base64 => {
            // 发送给 background 去识别
            chrome.runtime.sendMessage({ action: 'recognizeCaptcha', base64Image: base64 }, (response) => {
                if (response && response.success) {
                    console.log('Captcha recognized:', response.text);
                    simulateInput(captchaInput, response.text);
                    if (autoLogin) {
                        setTimeout(autoSubmit, 500);
                    }
                } else {
                    console.error('Captcha recognition failed:', response?.error);
                    alert('验证码识别失败: ' + (response?.error || '未知错误'));
                }
                // 所有操作完成后再通知 popup 结束 loading
                if (sendResponse) sendResponse({ success: true });
            });
        }).catch(e => {
            console.error('Failed to get captcha image base64:', e);
            alert('提取验证码图片失败');
            if (sendResponse) sendResponse({ success: false, error: e.message });
        });
    } else {
        // 没有验证码，直接尝试提交
        if (autoLogin) {
            setTimeout(autoSubmit, 500);
        }
        // 无验证码时直接结束。如果有验证码则在回调里结束
        if (sendResponse) sendResponse({ success: true });
    }
}

function autoSubmit() {
    const loginKeywords = ['登录', 'login', 'sign in', 'signin', '提交', 'submit', '确定', '进入', '立即登录', '账号登录', 'log in'];

    // 优先找 type="submit"
    let submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');

    if (!submitBtn) {
        // 按文字包含关键词匹配，同时去除全部空白（兼容"登 录"等带空格的按钮）
        const candidates = Array.from(document.querySelectorAll('button, input[type="button"], a[href], div[role="button"], span[role="button"]'));
        for (const btn of candidates) {
            const rawText = (btn.innerText || btn.value || btn.textContent || '').toLowerCase();
            const text = rawText.replace(/\s+/g, ''); // 去除所有空白
            if (loginKeywords.some(k => text.includes(k.replace(/\s+/g, '')))) {
                submitBtn = btn;
                break;
            }
        }
    }


    if (submitBtn) {
        console.log('[AutoLogin] clicking submit btn:', submitBtn);
        submitBtn.click();
    } else {
        // 备用方案：在密码框模拟回车键
        console.log('[AutoLogin] 找不到登录按钮，尝试模拟回车');
        const pwdInput = document.querySelector('input[type="password"]');
        if (pwdInput) {
            pwdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            pwdInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            pwdInput.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
        // 再尝试 form.submit()
        const form = pwdInput?.closest('form');
        if (form) {
            try { form.submit(); } catch(e) { /* 部分页面禁用 submit */ }
        }
    }
}

// ── 切换账号相关 ─────────────────────────────────────────────
function clearSessionAndReload() {
    console.log('[AutoLogin] Clearing session data to force logout...');
    try { localStorage.clear(); } catch(e) {}
    try { sessionStorage.clear(); } catch(e) {}
    try {
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i];
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        }
    } catch(e) {}
    window.location.reload();
}

function findAndClickLogout() {
    const logoutKeywords = ['退出', '注销', '登出', '切换账号', 'logout', 'sign out', 'signout'];
    // 不严格过滤可见性，因为退出按钮可能在 hover 菜单中
    const candidates = Array.from(document.querySelectorAll('button, a[href], div[role="button"], span[role="button"], li'));
    for (const btn of candidates) {
        const text = (btn.innerText || btn.textContent || '').toLowerCase().replace(/\s+/g, '');
        if (logoutKeywords.some(k => text.includes(k.replace(/\s+/g, '')))) {
            console.log('[AutoLogin] clicking logout btn:', btn);
            try { btn.click(); } catch(e) {}
            return true;
        }
    }
    return false;
}

// 页面加载时检查是否有 pendingAutoLogin
chrome.storage.local.get(['pendingAutoLogin'], (res) => {
    if (res.pendingAutoLogin) {
        const pending = res.pendingAutoLogin;
        if (pending.domain === window.location.hostname) {
            console.log('[AutoLogin] Found pending auto-login for switch account', pending.account.username);
            chrome.storage.local.remove('pendingAutoLogin');
            // 延迟一小段时间等待页面渲染完毕
            setTimeout(() => {
                handleFillAccount({ account: pending.account, autoLogin: true });
            }, 1000);
        }
    }
});

// ── 测试表单填充 ─────────────────────────────────────────────
function fillTestForm() {
    let filled = 0;
    const skipped = [];
    const radioGroups = new Set();

    const fields = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
        ':not([type="reset"]):not([type="image"]),' +
        'textarea, select'
    )).filter(el => !el.disabled && !el.readOnly && isFieldVisible(el));

    fields.forEach(el => {
        const tag  = el.tagName.toLowerCase();
        const type = (el.type || '').toLowerCase();

        if (tag === 'textarea') {
            setFieldValue(el, '这是一段自动填充的测试文本内容，用于验证表单提交功能是否正常工作。');
            filled++; return;
        }

        if (tag === 'select') {
            const nonEmpty = Array.from(el.options).filter(o => o.value !== '');
            if (!nonEmpty.length) return;
            if (el.multiple) {
                Array.from(el.options).forEach(o => (o.selected = false));
                nonEmpty.slice(0, 2).forEach(o => (o.selected = true));
            } else {
                el.value = nonEmpty[Math.floor(Math.random() * nonEmpty.length)].value;
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled++; return;
        }

        switch (type) {
            case 'text': case 'search':
                setFieldValue(el, '测试内容_' + Math.random().toString(36).slice(2, 6));
                filled++; break;
            case 'email':
                setFieldValue(el, 'tester@example.com'); filled++; break;
            case 'tel':
                setFieldValue(el, '13800138000'); filled++; break;
            case 'url':
                setFieldValue(el, 'https://example.com'); filled++; break;
            case 'password':
                setFieldValue(el, 'Test@123456'); filled++; break;
            case 'number': {
                const lo = isFinite(parseFloat(el.min)) ? parseFloat(el.min) : 1;
                const hi = isFinite(parseFloat(el.max)) ? parseFloat(el.max) : 100;
                const step = parseFloat(el.step) || 1;
                const val = lo + Math.floor(Math.random() * ((hi - lo) / step + 1)) * step;
                setFieldValue(el, String(Math.min(val, hi))); filled++; break;
            }
            case 'date':
                setFieldValue(el, new Date().toISOString().split('T')[0]); filled++; break;
            case 'datetime-local':
                setFieldValue(el, new Date().toISOString().slice(0, 16)); filled++; break;
            case 'month':
                setFieldValue(el, new Date().toISOString().slice(0, 7)); filled++; break;
            case 'time':
                setFieldValue(el, '09:00'); filled++; break;
            case 'color':
                setFieldValue(el, '#1a73e8'); filled++; break;
            case 'range': {
                const rMin = parseFloat(el.min) || 0;
                const rMax = parseFloat(el.max) || 100;
                setFieldValue(el, String(Math.round((rMin + rMax) / 2))); filled++; break;
            }
            case 'radio': {
                const name = el.name;
                if (!name || radioGroups.has(name)) break;
                radioGroups.add(name);
                const group = Array.from(
                    document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]')
                ).filter(isFieldVisible);
                if (group.length) {
                    group[0].checked = true;
                    group[0].dispatchEvent(new Event('change', { bubbles: true }));
                    filled++;
                }
                break;
            }
            case 'checkbox':
                if (!el.checked) {
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    filled++;
                }
                break;
            case 'file':
                skipped.push('file'); break;
            default:
                if (type) skipped.push(type);
        }
    });

    return { filled, skipped };
}

function isFieldVisible(el) {
    if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
}

// 兼容 React/Vue/Angular 双向绑定的 value setter
function setFieldValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) {
        desc.set.call(el, value);
    } else {
        el.value = value;
    }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}
