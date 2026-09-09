import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { parsePageTitle, parseProductPrice } from './product-price';

export type ProductPriceResult = {
    url: string;
    price: number | null;
    currency?: string;
    title?: string;
    checkedAt: string;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const BROWSER_HEADERS = {
    'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'uk,ru;q=0.9,en;q=0.8',
};

const isPrivateIPv4 = (address: string) => {
    const [a, b] = address.split('.').map(Number);

    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        a >= 224
    );
};

const isPrivateIPv6 = (address: string) => {
    const value = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);

    if (mapped) return isPrivateIPv4(mapped[1]);

    return (
        value === '::' ||
        value === '::1' ||
        value.startsWith('fc') ||
        value.startsWith('fd') ||
        value.startsWith('fe80')
    );
};

@Injectable()
export class ProductPriceService {
    private readonly logger = new Logger(ProductPriceService.name);
    private readonly cache = new Map<string, ProductPriceResult>();

    async getPrice(rawUrl: string): Promise<ProductPriceResult> {
        const url = this.parseUrl(rawUrl);
        const cached = this.cache.get(url.href);

        if (
            cached &&
            Date.now() - Date.parse(cached.checkedAt) < CACHE_TTL_MS
        ) {
            return cached;
        }

        await this.assertPublicHost(url.hostname);

        const html = await this.loadPage(url.href);
        const parsed = html ? parseProductPrice(html) : null;
        const result: ProductPriceResult = {
            url: url.href,
            price: parsed?.price ?? null,
            currency: parsed?.currency,
            title: html ? parsePageTitle(html) : undefined,
            checkedAt: new Date().toISOString(),
        };

        this.remember(url.href, result);

        return result;
    }

    private parseUrl(rawUrl: string) {
        let url: URL;

        try {
            url = new URL(rawUrl.trim());
        } catch {
            throw new BadRequestException('Invalid product link');
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new BadRequestException(
                'Only http and https links are supported',
            );
        }

        return url;
    }

    /** Keeps the fetcher pointed at the public internet and away from our own network. */
    private async assertPublicHost(hostname: string) {
        const literal = hostname.replace(/^\[|\]$/g, '');

        if (isIP(literal)) {
            if (isPrivateIPv4(literal) || isPrivateIPv6(literal)) {
                throw new BadRequestException('This link is not reachable');
            }
            return;
        }

        try {
            const addresses = await lookup(hostname, { all: true });
            const blocked = addresses.some(({ address, family }) =>
                family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address),
            );

            if (!addresses.length || blocked) {
                throw new BadRequestException('This link is not reachable');
            }
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new BadRequestException('This link is not reachable');
        }
    }

    private async loadPage(href: string): Promise<string | null> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(href, {
                headers: BROWSER_HEADERS,
                redirect: 'follow',
                signal: controller.signal,
            });

            if (!response.ok) return null;

            const type = response.headers.get('content-type') ?? '';
            if (type && !type.includes('html') && !type.includes('xml'))
                return null;

            return (await response.text()).slice(0, MAX_BODY_BYTES);
        } catch (error) {
            this.logger.warn(
                `Could not read the product page ${href}: ${String(error)}`,
            );
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    private remember(href: string, result: ProductPriceResult) {
        if (this.cache.size > 200) {
            this.cache.delete(this.cache.keys().next().value as string);
        }

        this.cache.set(href, result);
    }
}
