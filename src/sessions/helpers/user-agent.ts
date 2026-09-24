export type DeviceType = 'desktop' | 'mobile' | 'tablet';

export type DeviceInfo = {
    browser: string;
    os: string;
    deviceType: DeviceType;
};

const BROWSERS: [RegExp, string][] = [
    [/EdgA?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/YaBrowser\/(\d+)/, 'Yandex Browser'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari\//, 'Safari'],
];

const detectBrowser = (userAgent: string) => {
    for (const [pattern, name] of BROWSERS) {
        const match = userAgent.match(pattern);
        if (match) {
            return `${name} ${match[1]}`;
        }
    }

    return 'Unknown browser';
};

const detectOs = (userAgent: string) => {
    if (/iPhone|iPad|iPod/.test(userAgent)) {
        const version = userAgent.match(/OS (\d+)[_\d]* like Mac OS X/);
        return version ? `iOS ${version[1]}` : 'iOS';
    }
    if (/Android/.test(userAgent)) {
        const version = userAgent.match(/Android (\d+)/);
        return version ? `Android ${version[1]}` : 'Android';
    }
    if (/Windows/.test(userAgent)) return 'Windows';
    if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
    if (/CrOS/.test(userAgent)) return 'ChromeOS';
    if (/Linux/.test(userAgent)) return 'Linux';

    return 'Unknown system';
};

const detectDeviceType = (userAgent: string): DeviceType => {
    if (/iPad|Tablet/.test(userAgent)) return 'tablet';
    if (/Android/.test(userAgent) && !/Mobile/.test(userAgent)) return 'tablet';
    if (/Mobi|iPhone|iPod/.test(userAgent)) return 'mobile';

    return 'desktop';
};

export const describeDevice = (userAgent = ''): DeviceInfo => ({
    browser: detectBrowser(userAgent),
    os: detectOs(userAgent),
    deviceType: detectDeviceType(userAgent),
});
