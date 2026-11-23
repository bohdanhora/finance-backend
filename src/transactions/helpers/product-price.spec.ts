import {
    parseAmount,
    parsePageTitle,
    parseProductImage,
    parseProductPrice,
} from './product-price';

describe('parseAmount', () => {
    it('reads plain numbers', () => {
        expect(parseAmount('1299')).toBe(1299);
        expect(parseAmount(1299.5)).toBe(1299.5);
    });

    it('reads both decimal separators', () => {
        expect(parseAmount('1 234,56')).toBe(1234.56);
        expect(parseAmount('1,234.56')).toBe(1234.56);
        expect(parseAmount('12 999 грн')).toBe(12999);
    });

    it('rejects anything that is not a positive amount', () => {
        expect(parseAmount('')).toBeNull();
        expect(parseAmount('free')).toBeNull();
        expect(parseAmount(0)).toBeNull();
        expect(parseAmount(null)).toBeNull();
    });
});

describe('parseProductPrice', () => {
    it('reads JSON-LD offers', () => {
        const html = `<html><head><script type="application/ld+json">
            {"@type":"Product","name":"Sony WH-1000XM5",
             "offers":{"@type":"Offer","price":"14999.00","priceCurrency":"UAH"}}
        </script></head></html>`;

        expect(parseProductPrice(html)).toEqual({
            price: 14999,
            currency: 'UAH',
        });
    });

    it('walks into a JSON-LD graph', () => {
        const html = `<script type="application/ld+json">
            {"@graph":[{"@type":"WebPage"},{"@type":"Product","offers":[{"price":249.99,"priceCurrency":"usd"}]}]}
        </script>`;

        expect(parseProductPrice(html)).toEqual({
            price: 249.99,
            currency: 'USD',
        });
    });

    it('falls back to the OpenGraph block', () => {
        const html = `<meta property="og:price:currency" content="EUR">
            <meta property="product:price:amount" content="1 099,90">`;

        expect(parseProductPrice(html)).toEqual({
            price: 1099.9,
            currency: 'EUR',
        });
    });

    it('falls back to microdata', () => {
        const html = `<div itemprop="offers">
            <meta itemprop="priceCurrency" content="UAH">
            <span itemprop="price" content="8499">8 499 ₴</span>
        </div>`;

        expect(parseProductPrice(html)).toEqual({
            price: 8499,
            currency: 'UAH',
        });
    });

    it('guesses the currency from the symbol when there is no code', () => {
        const html = `<span itemprop="price">2 450 грн</span>`;

        expect(parseProductPrice(html)).toEqual({
            price: 2450,
            currency: 'UAH',
        });
    });

    it('skips broken JSON-LD instead of failing', () => {
        const html = `<script type="application/ld+json">{ oops }</script>
            <meta property="product:price:amount" content="500">`;

        expect(parseProductPrice(html)?.price).toBe(500);
    });

    it('returns nothing for a page without a price', () => {
        expect(parseProductPrice('<html><body>Hello</body></html>')).toBeNull();
    });
});

describe('parsePageTitle', () => {
    it('prefers the OpenGraph title', () => {
        const html = `<title>Shop</title><meta property="og:title" content="Sony WH-1000XM5">`;

        expect(parsePageTitle(html)).toBe('Sony WH-1000XM5');
    });

    it('falls back to the document title', () => {
        expect(parsePageTitle('<title>  Sony  headphones </title>')).toBe(
            'Sony headphones',
        );
    });
});

describe('parseProductPrice visible markup fallback', () => {
    it('reads a price element when the shop ships no structured data', () => {
        const html = `<article><h1>A Light in the Attic</h1>
            <p class="price_color">£51.77</p></article>`;

        expect(parseProductPrice(html)).toEqual({
            price: 51.77,
            currency: 'GBP',
        });
    });

    it('ignores price-looking elements without a currency', () => {
        const html = `<span class="price-id">395460263</span>`;

        expect(parseProductPrice(html)).toBeNull();
    });

    it('ignores numbers outside a price element', () => {
        const html = `<div class="rating">4.8 of 5</div><span>1 299 грн saved</span>`;

        expect(parseProductPrice(html)).toBeNull();
    });
});

describe('parseProductImage', () => {
    const page = 'https://shop.example/item/1';

    it('prefers the OpenGraph image', () => {
        const html =
            '<meta property="og:image" content="https://cdn.shop.example/a.jpg"><meta name="twitter:image" content="https://cdn.shop.example/b.jpg">';
        expect(parseProductImage(html, page)).toBe(
            'https://cdn.shop.example/a.jpg',
        );
    });

    it('resolves relative links and upgrades http', () => {
        expect(
            parseProductImage(
                '<meta property="og:image" content="/img/a.png">',
                page,
            ),
        ).toBe('https://shop.example/img/a.png');
        expect(
            parseProductImage(
                '<meta property="og:image" content="http://cdn.example/a.png">',
                page,
            ),
        ).toBe('https://cdn.example/a.png');
    });

    it('falls back to the JSON-LD product image', () => {
        const html = `<script type="application/ld+json">${JSON.stringify({
            '@type': 'Product',
            image: [{ '@type': 'ImageObject', url: '//cdn.example/p.webp' }],
        })}</script>`;
        expect(parseProductImage(html, page)).toBe(
            'https://cdn.example/p.webp',
        );
    });

    it('returns nothing without an image', () => {
        expect(parseProductImage('<title>Item</title>', page)).toBeUndefined();
    });

    it('reads the main product photo when there is no meta image', () => {
        const html =
            '<img id="landingImage" src="https://m.media.example/s.jpg" data-old-hires="https://m.media.example/l.jpg">';
        expect(parseProductImage(html, page)).toBe(
            'https://m.media.example/l.jpg',
        );
    });
});
