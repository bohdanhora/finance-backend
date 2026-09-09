export type ParsedProductPrice = {
    price: number;
    currency?: string;
};

const CURRENCY_BY_SYMBOL: Record<string, string> = {
    '₴': 'UAH',
    грн: 'UAH',
    $: 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '₽': 'RUB',
    zł: 'PLN',
};

const PRICE_META_KEYS = [
    'product:price:amount',
    'og:price:amount',
    'product:sale_price:amount',
    'twitter:data1',
    'price',
];

const CURRENCY_META_KEYS = [
    'product:price:currency',
    'og:price:currency',
    'product:sale_price:currency',
    'priceCurrency',
];

const decodeEntities = (value: string) =>
    value
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

/**
 * Turns whatever a shop printed next to the product into a number. Both
 * "1 234,56" and "1,234.56" mean the same thing, so the last separator with
 * one or two digits behind it is the decimal one and every other one is noise.
 */
export const parseAmount = (raw: unknown): number | null => {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) && raw > 0 ? raw : null;
    }

    if (typeof raw !== 'string') return null;

    const digits = raw.replace(/[^\d.,]/g, '');
    if (!digits) return null;

    const decimalMatch = /[.,](\d{1,2})$/.exec(digits);
    const decimals = decimalMatch ? decimalMatch[1] : '';
    const whole = decimalMatch
        ? digits.slice(0, digits.length - decimals.length - 1)
        : digits;
    const normalized = `${whole.replace(/[^\d]/g, '')}${
        decimals ? `.${decimals}` : ''
    }`;
    const value = Number(normalized);

    return Number.isFinite(value) && value > 0 ? value : null;
};

const normalizeCurrency = (raw: unknown): string | undefined => {
    if (typeof raw !== 'string') return undefined;

    const code = raw.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) return code;

    const lowered = raw.toLowerCase();
    for (const [symbol, currency] of Object.entries(CURRENCY_BY_SYMBOL)) {
        if (lowered.includes(symbol.toLowerCase())) return currency;
    }

    return undefined;
};

const readAttributes = (tag: string): Record<string, string> => {
    const attributes: Record<string, string> = {};
    const pattern =
        /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(tag))) {
        const value = match[3] ?? match[4] ?? match[5] ?? '';
        attributes[match[1].toLowerCase()] = decodeEntities(value);
    }

    return attributes;
};

const readMetaTags = (html: string) => {
    const tags: Record<string, string>[] = [];
    const pattern = /<meta\b[^>]*>/gi;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        tags.push(readAttributes(match[0]));
    }

    return tags;
};

const fromMetaTags = (html: string): ParsedProductPrice | null => {
    const tags = readMetaTags(html);
    const named = (tag: Record<string, string>) =>
        tag.property || tag.name || tag.itemprop || '';

    const currency = CURRENCY_META_KEYS.reduce<string | undefined>(
        (found, key) =>
            found ??
            normalizeCurrency(
                tags.find(
                    (tag) => named(tag).toLowerCase() === key.toLowerCase(),
                )?.content,
            ),
        undefined,
    );

    for (const key of PRICE_META_KEYS) {
        const tag = tags.find(
            (item) => named(item).toLowerCase() === key.toLowerCase(),
        );
        const price = parseAmount(tag?.content);

        if (price !== null) {
            return {
                price,
                currency: currency ?? normalizeCurrency(tag?.content),
            };
        }
    }

    return null;
};

const collectJsonLdNodes = (html: string): unknown[] => {
    const nodes: unknown[] = [];
    const pattern =
        /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        try {
            nodes.push(JSON.parse(match[1].trim()));
        } catch {
            // Shops ship broken JSON-LD all the time, so skip it and keep looking.
        }
    }

    return nodes;
};

const flattenJsonLd = (node: unknown, depth = 0): Record<string, unknown>[] => {
    if (depth > 6 || !node) return [];

    if (Array.isArray(node)) {
        return node.flatMap((item) => flattenJsonLd(item, depth + 1));
    }

    if (typeof node !== 'object') return [];

    const record = node as Record<string, unknown>;
    const nested = ['@graph', 'offers', 'itemListElement', 'item', 'mainEntity']
        .filter((key) => key in record)
        .flatMap((key) => flattenJsonLd(record[key], depth + 1));

    return [record, ...nested];
};

const fromJsonLd = (html: string): ParsedProductPrice | null => {
    const nodes = collectJsonLdNodes(html).flatMap((node) =>
        flattenJsonLd(node),
    );

    for (const node of nodes) {
        const price =
            parseAmount(node.price) ??
            parseAmount(node.lowPrice) ??
            parseAmount(node.highPrice);

        if (price !== null) {
            return { price, currency: normalizeCurrency(node.priceCurrency) };
        }
    }

    return null;
};

const fromMicrodata = (html: string): ParsedProductPrice | null => {
    const currency = (() => {
        const pattern =
            /<[^>]*itemprop\s*=\s*["']priceCurrency["'][^>]*>/i.exec(html);
        return pattern
            ? normalizeCurrency(readAttributes(pattern[0]).content)
            : undefined;
    })();

    const pattern =
        /<([a-z0-9]+)\b([^>]*itemprop\s*=\s*["'](?:price|lowPrice)["'][^>]*)>([\s\S]{0,80}?)<\/\1>/gi;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        const attributes = readAttributes(`<${match[1]} ${match[2]}>`);
        const text = decodeEntities(match[3].replace(/<[^>]*>/g, ' '));
        const price =
            parseAmount(attributes.content) ??
            parseAmount(attributes.datetime ?? text);

        if (price !== null) {
            return { price, currency: currency ?? normalizeCurrency(text) };
        }
    }

    return null;
};

const PRICE_ATTRIBUTE = /(^|[\s"'_-])(price|cost)/i;
const CURRENCY_MARKER = /[₴$€£₽]|\b(uah|usd|eur|gbp|pln|грн)\b/i;

/**
 * Last resort for shops that publish no structured data: an element that calls
 * itself a price and prints a currency next to the number. Anything without a
 * currency next to it is ignored, because a bare number on a page is a guess.
 */
const fromPriceMarkup = (html: string): ParsedProductPrice | null => {
    const pattern =
        /<(span|p|div|b|strong|ins|bdi|h\d)\b([^>]*)>([\s\S]{0,120}?)<\/\1>/gi;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
        const attributes = readAttributes(`<${match[1]} ${match[2]}>`);
        const named = `${attributes.class ?? ''} ${attributes.id ?? ''} ${
            attributes['data-testid'] ?? ''
        }`;

        if (!PRICE_ATTRIBUTE.test(named)) continue;

        const text = decodeEntities(match[3].replace(/<[^>]*>/g, ' '));
        if (!CURRENCY_MARKER.test(text)) continue;

        const price = parseAmount(text);
        if (price !== null) return { price, currency: normalizeCurrency(text) };
    }

    return null;
};

/**
 * Reads the price a shop publishes for machines: JSON-LD first because it is
 * the most explicit, then the OpenGraph block, then microdata, and only then
 * the visible markup.
 */
export const parseProductPrice = (html: string): ParsedProductPrice | null =>
    fromJsonLd(html) ??
    fromMetaTags(html) ??
    fromMicrodata(html) ??
    fromPriceMarkup(html);

export const parsePageTitle = (html: string): string | undefined => {
    const ogTitle = readMetaTags(html).find((tag) =>
        ['og:title', 'twitter:title'].includes(
            (tag.property || tag.name || '').toLowerCase(),
        ),
    )?.content;

    const title =
        ogTitle ??
        decodeEntities(
            /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '',
        );

    const trimmed = title.replace(/\s+/g, ' ').trim();

    return trimmed ? trimmed.slice(0, 120) : undefined;
};
