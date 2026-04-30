/**
 * crypto.js — AES-GCM 加密工具模块（双模安全架构）
 *
 * 支持普通模式（明文密钥落盘）与高防模式（密钥包裹+内存隔离）。
 */

const CRYPTO_KEY_STORAGE = '_masterKeyRaw';
const WRAPPED_KEY_STORAGE = '_wrappedMasterKey';
const SESSION_KEY_STORAGE = '_sessionMasterKey';

// ── 内部：读写 storage ─────────────────────────────────────────
function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(data) {
    return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

function sessionGet(keys) {
    // 兼容可能不支持 storage.session 的极旧浏览器
    if (!chrome.storage.session) return Promise.resolve({});
    return new Promise(resolve => chrome.storage.session.get(keys, resolve));
}

function sessionSet(data) {
    if (!chrome.storage.session) return Promise.resolve();
    return new Promise(resolve => chrome.storage.session.set(data, resolve));
}

function sessionRemove(keys) {
    if (!chrome.storage.session) return Promise.resolve();
    return new Promise(resolve => chrome.storage.session.remove(keys, resolve));
}

// 检查是否开启了高防模式
async function isAntiSnoopMode() {
    const res = await storageGet(['antiSnoopMode']);
    return !!res.antiSnoopMode;
}

// 检查是否已解锁（内存中是否存在密钥或处于旧版未真正加密状态）
async function isVaultUnlocked() {
    const isHighSec = await isAntiSnoopMode();
    if (!isHighSec) return true;
    
    const sessionData = await sessionGet([SESSION_KEY_STORAGE]);
    if (sessionData[SESSION_KEY_STORAGE]) return true;
    
    // 兼容旧版：开了高防但没有包裹密钥，说明只是旧版的标记，实际上密钥是明文的
    const stored = await storageGet([WRAPPED_KEY_STORAGE, CRYPTO_KEY_STORAGE]);
    if (!stored[WRAPPED_KEY_STORAGE] && stored[CRYPTO_KEY_STORAGE]) {
        return true;
    }
    
    return false;
}

// ── 密钥包裹 (Key Wrapping) 逻辑 ─────────────────────────────────

// 派生 KEK (Key Encryption Key)
async function deriveKEK(password, saltBase64) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    const salt = saltBase64 ? base64ToBuffer(saltBase64) : enc.encode('PK_DEFAULT_SALT_123');
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// 使用主密码加密真实主密钥 (DEK)
async function wrapMasterKey(dekKey, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKEK(password, bufferToBase64(salt));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const rawDek = await crypto.subtle.exportKey('raw', dekKey);
    const wrappedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawDek);
    
    return {
        wrapped: bufferToBase64(wrappedBuffer),
        iv: bufferToBase64(iv),
        salt: bufferToBase64(salt)
    };
}

// 使用主密码解密真实主密钥 (DEK)
async function unwrapMasterKey(wrappedObj, password) {
    const kek = await deriveKEK(password, wrappedObj.salt);
    const iv = base64ToBuffer(wrappedObj.iv);
    const wrappedBuffer = base64ToBuffer(wrappedObj.wrapped);
    
    try {
        const rawDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, wrappedBuffer);
        return crypto.subtle.importKey(
            'raw', rawDek, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        );
    } catch (e) {
        throw new Error('WRONG_PASSWORD');
    }
}

// ── 模式切换 ──────────────────────────────────────────────────

/**
 * 开启高防模式（密钥包裹）
 */
async function enableHighSecurity(password) {
    // 1. 获取当前明文 DEK
    let dek;
    const stored = await storageGet([CRYPTO_KEY_STORAGE]);
    if (stored[CRYPTO_KEY_STORAGE]) {
        const rawBytes = base64ToBuffer(stored[CRYPTO_KEY_STORAGE]);
        dek = await crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    } else {
        dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    }
    
    // 2. 包裹
    const wrappedObj = await wrapMasterKey(dek, password);
    
    // 3. 存储包裹密钥，删掉明文密钥，开启模式
    await storageSet({ 
        [WRAPPED_KEY_STORAGE]: wrappedObj,
        antiSnoopMode: true
    });
    
    // 4. 将明文放入 session
    const rawDek = await crypto.subtle.exportKey('raw', dek);
    await sessionSet({ [SESSION_KEY_STORAGE]: bufferToBase64(rawDek) });
    
    // 5. 物理删除明文存储
    await new Promise(resolve => chrome.storage.local.remove([CRYPTO_KEY_STORAGE], resolve));
}

/**
 * 关闭高防模式（退回便捷模式）
 */
async function disableHighSecurity(password) {
    let rawDek;
    
    // 尝试从内存中直接获取（如果已经解锁）
    const sessionData = await sessionGet([SESSION_KEY_STORAGE]);
    if (sessionData[SESSION_KEY_STORAGE]) {
        rawDek = base64ToBuffer(sessionData[SESSION_KEY_STORAGE]);
    } else {
        const stored = await storageGet([WRAPPED_KEY_STORAGE, CRYPTO_KEY_STORAGE]);
        
        if (!stored[WRAPPED_KEY_STORAGE]) {
            // 兼容旧版：开了高防但其实是旧版的假高防，直接关闭模式即可
            if (stored[CRYPTO_KEY_STORAGE]) {
                await storageSet({ antiSnoopMode: false });
                return;
            } else {
                throw new Error('CORRUPT: 找不到包裹密钥');
            }
        }
        
        // 如果有包裹密钥，则必须提供密码来解包
        if (!password) throw new Error('LOCKED');
        
        const dek = await unwrapMasterKey(stored[WRAPPED_KEY_STORAGE], password);
        rawDek = await crypto.subtle.exportKey('raw', dek);
    }
    
    // 2. 存明明文，关闭模式
    await storageSet({ 
        [CRYPTO_KEY_STORAGE]: bufferToBase64(rawDek),
        antiSnoopMode: false
    });
    
    // 3. 清除包裹密钥和 Session
    await new Promise(resolve => chrome.storage.local.remove([WRAPPED_KEY_STORAGE], resolve));
    await sessionRemove([SESSION_KEY_STORAGE]);
}

// ── 核心获取密钥逻辑 ──────────────────────────────────────────

/**
 * 获取主密钥
 * @param {string} [password] 可选主密码（用于冷启动解锁）
 */
async function getOrCreateMasterKey(password) {
    const isHighSec = await isAntiSnoopMode();
    
    if (isHighSec) {
        // 高防模式
        const sessionData = await sessionGet([SESSION_KEY_STORAGE]);
        if (sessionData[SESSION_KEY_STORAGE]) {
            // 已解锁，在内存中
            const rawBytes = base64ToBuffer(sessionData[SESSION_KEY_STORAGE]);
            return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        }
        
        // 内存中没有
        if (!password) {
            throw new Error('LOCKED');
        }
        
        const stored = await storageGet([WRAPPED_KEY_STORAGE]);
        if (!stored[WRAPPED_KEY_STORAGE]) {
            // 数据损坏或处于旧版本迁移状态：有高防开关但没有包裹密钥
            // 降级尝试查找旧版本的明文密钥
            const local = await storageGet([CRYPTO_KEY_STORAGE]);
            if (local[CRYPTO_KEY_STORAGE]) {
                const rawBytes = base64ToBuffer(local[CRYPTO_KEY_STORAGE]);
                return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
            }
            throw new Error('CORRUPT: 高防模式下未找到任何密钥');
        }
        
        // 尝试使用密码解锁
        const dek = await unwrapMasterKey(stored[WRAPPED_KEY_STORAGE], password);
        
        // 解锁成功，存入 session 内存
        const rawDek = await crypto.subtle.exportKey('raw', dek);
        await sessionSet({ [SESSION_KEY_STORAGE]: bufferToBase64(rawDek) });
        
        return dek;
    } else {
        // 普通模式
        const stored = await storageGet([CRYPTO_KEY_STORAGE]);
        if (stored[CRYPTO_KEY_STORAGE]) {
            const rawBytes = base64ToBuffer(stored[CRYPTO_KEY_STORAGE]);
            return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        }
        
        // 首次生成
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const rawBytes = await crypto.subtle.exportKey('raw', key);
        await storageSet({ [CRYPTO_KEY_STORAGE]: bufferToBase64(rawBytes) });
        return key;
    }
}

/**
 * 紧急自锁：销毁内存中的密钥
 */
async function destroySessionKey() {
    await sessionRemove([SESSION_KEY_STORAGE]);
}

// ── 加密 / 解密 ───────────────────────────────────────────────

async function encryptPassword(plaintext, password) {
    const key = await getOrCreateMasterKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, encoded
    );

    return {
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(cipherBuffer)
    };
}

async function decryptPassword(encrypted, password) {
    if (!encrypted || !encrypted.iv || !encrypted.ciphertext) {
        throw new Error('无效的加密数据');
    }
    const key = await getOrCreateMasterKey(password);
    const iv = base64ToBuffer(encrypted.iv);
    const cipherBuffer = base64ToBuffer(encrypted.ciphertext);

    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, key, cipherBuffer
    );

    return new TextDecoder().decode(plainBuffer);
}

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

// ── 数据迁移 ────────────────────────────────────────────────
async function migrateToEncrypted() {
    const stored = await storageGet(['vault']);
    const vault = stored.vault || [];
    let migrated = 0;

    for (let i = 0; i < vault.length; i++) {
        const acc = vault[i];
        if (typeof acc.password === 'string' && !isEncrypted(acc.password)) {
            try {
                // 如果当前被锁，这里会抛出 LOCKED，忽略，留到解锁后
                acc.password = await encryptPassword(acc.password);
                migrated++;
            } catch (e) {
                if (e.message === 'LOCKED') break; // 被锁就不迁移了
            }
        }
    }

    if (migrated > 0) {
        await storageSet({ vault });
        console.log(`[Crypto] 已从 vault 迁移 ${migrated} 个明文密码为加密格式`);
    }

    return migrated;
}
