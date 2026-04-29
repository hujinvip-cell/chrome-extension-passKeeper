/**
 * auth.js — 系统级身份验证模块
 *
 * 使用 WebAuthn API 触发 Touch ID / Windows Hello / 系统密码验证。
 * 不支持平台验证器时降级为主密码验证。
 */

const AUTH_CREDENTIAL_KEY = '_webauthnCredential';
const AUTH_MASTER_PW_KEY  = '_authMasterPwHash';

// ── 内部 storage 工具 ────────────────────────────────────────

function _storageGet(keys) {
    return new Promise(resolve =>
        chrome.storage.local.get(keys, resolve)
    );
}

function _storageSet(data) {
    return new Promise(resolve =>
        chrome.storage.local.set(data, resolve)
    );
}

// ── 平台支持检测 ─────────────────────────────────────────────

/**
 * 检查是否支持平台验证器（Touch ID / Windows Hello）。
 * @returns {Promise<boolean>}
 */
async function isPlatformAuthAvailable() {
    if (typeof PublicKeyCredential === 'undefined') return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

// ── WebAuthn 注册 ────────────────────────────────────────────

/**
 * 注册平台凭据。调用后会弹出系统生物识别对话框。
 * @returns {Promise<boolean>} 是否注册成功
 */
async function registerCredential() {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId    = crypto.getRandomValues(new Uint8Array(16));

    const options = {
        publicKey: {
            challenge,
            rp: {
                name: 'PassKeeper Extension',
                // 不设 id，默认为扩展 origin
            },
            user: {
                id: userId,
                name: 'extension-user',
                displayName: '扩展用户'
            },
            pubKeyCredParams: [
                { alg: -7,   type: 'public-key' },  // ES256
                { alg: -257, type: 'public-key' },  // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',   // 仅平台验证器
                userVerification: 'required',
                residentKey: 'preferred'
            },
            timeout: 60000
        }
    };

    try {
        const credential = await navigator.credentials.create(options);

        // 持久化凭据 ID（用于后续 get 时指定 allowCredentials）
        const credData = {
            id: credential.id,
            rawId: Array.from(new Uint8Array(credential.rawId)),
            type: credential.type
        };
        await _storageSet({ [AUTH_CREDENTIAL_KEY]: credData });
        console.log('[Auth] 平台凭据注册成功');
        return true;
    } catch (e) {
        console.error('[Auth] 凭据注册失败:', e);
        return false;
    }
}

// ── WebAuthn 验证 ────────────────────────────────────────────

/**
 * 通过 WebAuthn 验证身份。调用后弹出 Touch ID / Windows Hello。
 * @returns {Promise<boolean>} 验证是否通过
 */
async function verifyWithWebAuthn() {
    const stored = await _storageGet([AUTH_CREDENTIAL_KEY]);
    const cred = stored[AUTH_CREDENTIAL_KEY];
    if (!cred) return false;

    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const options = {
        publicKey: {
            challenge,
            allowCredentials: [{
                id: new Uint8Array(cred.rawId),
                type: 'public-key',
                transports: ['internal']
            }],
            userVerification: 'required',
            timeout: 60000
        }
    };

    try {
        await navigator.credentials.get(options);
        console.log('[Auth] WebAuthn 验证通过');
        return true;
    } catch (e) {
        console.warn('[Auth] WebAuthn 验证失败/取消:', e.name);
        return false;
    }
}

// ── 主密码（降级方案）─────────────────────────────────────────

/**
 * 设置主密码（hash 后存储）。
 * @param {string} password
 * @returns {Promise<void>}
 */
async function setMasterPassword(password) {
    const hash = await hashPassword(password);
    await _storageSet({ [AUTH_MASTER_PW_KEY]: hash });
    console.log('[Auth] 主密码已设置');
}

/**
 * 验证主密码是否正确。
 * @param {string} password
 * @returns {Promise<boolean>}
 */
async function verifyMasterPassword(password) {
    const stored = await _storageGet([AUTH_MASTER_PW_KEY]);
    const storedHash = stored[AUTH_MASTER_PW_KEY];
    if (!storedHash) return false;
    const inputHash = await hashPassword(password);
    return inputHash === storedHash;
}

/**
 * 检查是否已设置主密码。
 * @returns {Promise<boolean>}
 */
async function hasMasterPassword() {
    const stored = await _storageGet([AUTH_MASTER_PW_KEY]);
    return !!stored[AUTH_MASTER_PW_KEY];
}

/**
 * SHA-256 hash 密码（加盐）。
 * @param {string} password
 * @returns {Promise<string>} hex 编码的 hash
 */
async function hashPassword(password) {
    const salt = 'PassKeeper_v1_salt';
    const data = new TextEncoder().encode(salt + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── 统一验证入口 ─────────────────────────────────────────────

/**
 * 检查是否已注册过凭据（WebAuthn 或主密码）。
 * @returns {Promise<{webauthn: boolean, masterPw: boolean}>}
 */
async function hasRegisteredAuth() {
    const stored = await _storageGet([AUTH_CREDENTIAL_KEY, AUTH_MASTER_PW_KEY]);
    return {
        webauthn: !!stored[AUTH_CREDENTIAL_KEY],
        masterPw: !!stored[AUTH_MASTER_PW_KEY]
    };
}

/**
 * 获取当前认证状态描述，用于 UI 显示。
 * @returns {Promise<'webauthn'|'master_password'|'none'>}
 */
async function getAuthMode() {
    const auth = await hasRegisteredAuth();
    if (auth.webauthn) return 'webauthn';
    if (auth.masterPw) return 'master_password';
    return 'none';
}

/**
 * 统一验证入口：优先 WebAuthn，降级主密码。
 * 返回 null 表示未设置任何验证方式（需引导设置）。
 *
 * @param {function} showMasterPwDialog  显示主密码输入对话框的回调函数，
 *                                        应返回 Promise<string|null>（null=用户取消）
 * @returns {Promise<boolean|null>}  true=验证通过, false=验证失败/取消, null=未设置验证
 */
async function verifyIdentity(showMasterPwDialog) {
    const auth = await hasRegisteredAuth();

    // 优先 WebAuthn
    if (auth.webauthn) {
        return await verifyWithWebAuthn();
    }

    // 降级：主密码
    if (auth.masterPw && typeof showMasterPwDialog === 'function') {
        const pw = await showMasterPwDialog();
        if (pw === null) return false; // 用户取消
        return await verifyMasterPassword(pw);
    }

    // 未设置任何验证方式
    return null;
}
