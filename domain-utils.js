var DOMAIN_MATCH_MODES_KEY = 'domainMatchModes';
var DOMAIN_MATCH_MODE_ORIGIN = 'origin';
var DOMAIN_MATCH_MODE_FIRST_PATH = 'firstPath';

function pkNormalizeUrlInput(input) {
    const raw = String(input || '').trim().split('#')[0].split('?')[0];
    if (!raw) return '';
    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
        const pathname = url.pathname.replace(/\/+$/, '') || '/';
        return `${url.origin}${pathname === '/' ? '' : pathname}`;
    } catch (e) {
        return raw.replace(/\/+$/, '');
    }
}

function pkParseUrl(input) {
    const normalized = pkNormalizeUrlInput(input);
    try {
        return new URL(/^https?:\/\//i.test(normalized) ? normalized : `http://${normalized}`);
    } catch (e) {
        return null;
    }
}

function pkGetOrigin(input) {
    return pkParseUrl(input)?.origin || '';
}

function pkGetFirstPathKey(input) {
    const url = pkParseUrl(input);
    if (!url) return pkNormalizeUrlInput(input);
    const firstSegment = url.pathname.split('/').filter(Boolean)[0];
    return firstSegment ? `${url.origin}/${firstSegment}` : url.origin;
}

function pkGetMatchModeForUrl(input, modes) {
    const origin = pkGetOrigin(input);
    return modes?.[origin] === DOMAIN_MATCH_MODE_FIRST_PATH
        ? DOMAIN_MATCH_MODE_FIRST_PATH
        : DOMAIN_MATCH_MODE_ORIGIN;
}

function pkGetDomainKey(input, modes) {
    const mode = pkGetMatchModeForUrl(input, modes);
    return mode === DOMAIN_MATCH_MODE_FIRST_PATH
        ? pkGetFirstPathKey(input)
        : (pkGetOrigin(input) || pkNormalizeUrlInput(input));
}

function pkDomainMatches(pattern, actualUrl, modes) {
    if (!pattern || !actualUrl) return false;

    const patternText = String(pattern).trim();
    const actualText = String(actualUrl).trim();
    if (patternText === actualText) return true;

    if (patternText.includes('*')) {
        const regexStr = '^' + patternText
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*') + '$';
        try {
            if (new RegExp(regexStr).test(actualText)) return true;
        } catch (e) {}
    }

    const patternUrl = pkParseUrl(patternText);
    const actual = pkParseUrl(actualText);
    if (patternUrl && actual && patternUrl.origin === actual.origin) {
        const mode = modes?.[actual.origin] || modes?.[patternUrl.origin] || DOMAIN_MATCH_MODE_ORIGIN;
        if (mode === DOMAIN_MATCH_MODE_FIRST_PATH) {
            return pkGetFirstPathKey(patternText) === pkGetFirstPathKey(actualText);
        }
        return true;
    }

    if (!/^https?:\/\//i.test(patternText) && actual) {
        const hostPath = `${actual.host}${actual.pathname}`;
        return actual.host === patternText
            || actual.host.endsWith(`.${patternText}`)
            || hostPath.startsWith(patternText);
    }

    return pkNormalizeUrlInput(actualText).startsWith(pkNormalizeUrlInput(patternText));
}
