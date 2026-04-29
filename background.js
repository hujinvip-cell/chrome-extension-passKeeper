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
    const keyPreview = (cfg.apiKey || '').slice(0, 8) + '...';
    console.log(`[AutoLogin][Gemini] model=${model}, key=${keyPreview}, mimeType=${mimeType}, base64Len=${base64Data?.length}`);
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
    console.log('[AutoLogin][Gemini] full response:', JSON.stringify(data));
    const candidate = data.candidates?.[0];
    if (!candidate) {
        console.warn('[AutoLogin][Gemini] no candidates, promptFeedback:', JSON.stringify(data.promptFeedback));
        return '';
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('[AutoLogin][Gemini] finishReason:', candidate.finishReason, 'safetyRatings:', JSON.stringify(candidate.safetyRatings));
    }
    const text = (candidate.content?.parts?.[0]?.text || '').trim();
    console.log('[AutoLogin][Gemini] extracted text:', JSON.stringify(text));
    return text;
}

// ── OpenAI-compatible API ─────────────────────────────────────
async function callOpenAI(cfg, base64Data, mimeType) {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
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

                console.log('[AutoLogin] raw model output:', JSON.stringify(raw));
                const text = postProcess(raw);
                console.log('[AutoLogin] captcha result:', text);
                sendResponse({ success: true, text });

            } catch (error) {
                console.error('[AutoLogin] API request failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        });

        return true; // 异步 sendResponse
    }
});
