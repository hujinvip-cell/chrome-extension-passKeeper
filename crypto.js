/**
 * crypto.js — AES-GCM 加密工具模块
 *
 * 提供密码加解密能力，密钥自动生成并持久化到 chrome.storage.local。
 * 所有导出函数均为 async，需在支持 Web Crypto API 的环境中使用。
 */

const CRYPTO_KEY_STORAGE = '_masterKeyRaw';

// ── 内部：读写 storage ─────────────────────────────────────────
function storageGet(keys) {
    return new Promise(resolve =>
        chrome.storage.local.get(keys, resolve)
    );
}

function storageSet(data) {
    return new Promise(resolve =>
        chrome.storage.local.set(data, resolve)
    );
}

// ── 密钥管理 ──────────────────────────────────────────────────

/**
 * 获取或创建主密钥。首次调用时自动生成 AES-GCM 256 位密钥并持久化。
 * @returns {Promise<CryptoKey>}
 */
async function getOrCreateMasterKey() {
    const stored = await storageGet([CRYPTO_KEY_STORAGE]);
    const rawB64 = stored[CRYPTO_KEY_STORAGE];

    if (rawB64) {
        // 从已存储的 raw 导入
        const rawBytes = base64ToBuffer(rawB64);
        return crypto.subtle.importKey(
            'raw', rawBytes,
            { name: 'AES-GCM', length: 256 },
            true, ['encrypt', 'decrypt']
        );
    }

    // 首次生成
    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,   // extractable — 需要导出存储
        ['encrypt', 'decrypt']
    );

    const rawBytes = await crypto.subtle.exportKey('raw', key);
    await storageSet({ [CRYPTO_KEY_STORAGE]: bufferToBase64(rawBytes) });

    return key;
}

// ── 加密 / 解密 ───────────────────────────────────────────────

/**
 * 加密明文密码。
 * @param {string} plaintext
 * @returns {Promise<{iv: string, ciphertext: string}>} base64 编码的 IV 和密文
 */
async function encryptPassword(plaintext) {
    const key = await getOrCreateMasterKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const encoded = new TextEncoder().encode(plaintext);

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    return {
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(cipherBuffer)
    };
}

/**
 * 解密密码。
 * @param {object} encrypted  { iv: string, ciphertext: string }
 * @returns {Promise<string>} 明文密码
 */
async function decryptPassword(encrypted) {
    if (!encrypted || !encrypted.iv || !encrypted.ciphertext) {
        throw new Error('无效的加密数据');
    }
    const key = await getOrCreateMasterKey();
    const iv = base64ToBuffer(encrypted.iv);
    const cipherBuffer = base64ToBuffer(encrypted.ciphertext);

    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipherBuffer
    );

    return new TextDecoder().decode(plainBuffer);
}

/**
 * 判断一个密码值是否已加密（区分明文字符串和密文对象）。
 * @param {*} value
 * @returns {boolean}
 */
function isEncrypted(value) {
    return value !== null
        && typeof value === 'object'
        && typeof value.iv === 'string'
        && typeof value.ciphertext === 'string';
}

// ── Base64 工具 ───────────────────────────────────────────────

function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// ── 数据迁移：批量将明文密码加密 ─────────────────────────────

/**
 * 扫描所有账号，将明文密码迁移为加密格式。
 * 幂等操作：已加密的跳过。
 * @returns {Promise<number>} 迁移的账号数量
 */
async function migrateToEncrypted() {
    const stored = await storageGet(['vault']);
    const vault = stored.vault || [];
    let migrated = 0;

    for (let i = 0; i < vault.length; i++) {
        const acc = vault[i];
        if (typeof acc.password === 'string' && !isEncrypted(acc.password)) {
            // 明文 → 加密
            acc.password = await encryptPassword(acc.password);
            migrated++;
        }
    }

    if (migrated > 0) {
        await storageSet({ vault });
        console.log(`[Crypto] 已从 vault 迁移 ${migrated} 个明文密码为加密格式`);
    }

    return migrated;
}
