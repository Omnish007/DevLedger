import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const buildDir = resolve(root, 'build');
const iconsDir = join(buildDir, 'icons');
const resourcesDir = resolve(root, 'resources');
const publicDir = resolve(root, 'src/renderer/public');

mkdirSync(iconsDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const desktopSvg = readFileSync(join(buildDir, 'icon.svg'), 'utf8');
const faviconSvg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');

const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none">
    <defs>
        <linearGradient id="m-bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1B2232" />
            <stop offset="100%" stop-color="#0B0E15" />
        </linearGradient>
        <radialGradient id="m-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(240 200) rotate(45) scale(760)">
            <stop offset="0%" stop-color="#4F7DF3" stop-opacity="0.26" />
            <stop offset="100%" stop-color="#4F7DF3" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="m-spine" x1="330" y1="262" x2="330" y2="762" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#6FA2FA" />
            <stop offset="100%" stop-color="#254EB8" />
        </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#m-bg)" />
    <rect width="1024" height="1024" fill="url(#m-glow)" />
    <path d="M368 262H686C716.928 262 742 287.072 742 318V706C742 736.928 716.928 762 686 762H368V262Z" fill="#F4F7FC" />
    <path d="M288 302C288 279.909 305.909 262 328 262H378V762H328C305.909 762 288 744.091 288 722V302Z" fill="url(#m-spine)" />
    <path d="M622 262H680V372L651 351L622 372V262Z" fill="#3B6EE8" />
    <path d="M446 420L530 490L446 560" stroke="#111622" stroke-width="42" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="558" y="540" width="102" height="40" rx="20" fill="#2F63E0" />
    <rect x="440" y="626" width="220" height="22" rx="11" fill="#B8C4D9" />
    <rect x="440" y="670" width="152" height="22" rx="11" fill="#CFD8E8" />
</svg>`.trim();

const appleTouchSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none">
    <defs>
        <linearGradient id="a-bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1B2232" />
            <stop offset="100%" stop-color="#0B0E15" />
        </linearGradient>
        <radialGradient id="a-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(240 180) rotate(45) scale(760)">
            <stop offset="0%" stop-color="#4F7DF3" stop-opacity="0.26" />
            <stop offset="100%" stop-color="#4F7DF3" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="a-spine" x1="296" y1="216" x2="296" y2="808" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#6FA2FA" />
            <stop offset="100%" stop-color="#254EB8" />
        </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#a-bg)" />
    <rect width="1024" height="1024" fill="url(#a-glow)" />
    <path d="M340 216H714C749.346 216 778 244.654 778 280V744C778 779.346 749.346 808 714 808H340V216Z" fill="#F4F7FC" />
    <path d="M246 264C246 237.49 267.49 216 294 216H352V808H294C267.49 808 246 786.51 246 760V264Z" fill="url(#a-spine)" />
    <path d="M640 216H708V346L674 322L640 346V216Z" fill="#3B6EE8" />
    <path d="M432 404L532 486L432 568" stroke="#111622" stroke-width="48" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="564" y="544" width="120" height="46" rx="23" fill="#2F63E0" />
    <rect x="424" y="646" width="260" height="24" rx="12" fill="#B8C4D9" />
    <rect x="424" y="698" width="180" height="24" rx="12" fill="#CFD8E8" />
</svg>`.trim();

async function renderSvgToPng(page, svgMarkup, size, outPath) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
        `<!doctype html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;width:${size}px;height:${size}px;">${svgMarkup}</body></html>`,
        { waitUntil: 'load' },
    );
    await page
        .locator('svg')
        .first()
        .evaluate((svg, targetSize) => {
            svg.setAttribute('width', String(targetSize));
            svg.setAttribute('height', String(targetSize));
            svg.style.display = 'block';
        }, size);
    await page.screenshot({ path: outPath, omitBackground: true });
}

const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu'],
});

try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();

    const desktopSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
    for (const size of desktopSizes) {
        const target = join(iconsDir, `${size}x${size}.png`);
        await renderSvgToPng(page, desktopSvg, size, target);
    }
    copyFileSync(join(iconsDir, '1024x1024.png'), join(buildDir, 'icon.png'));
    copyFileSync(join(iconsDir, '256x256.png'), join(resourcesDir, 'icon.png'));
    copyFileSync(join(iconsDir, '512x512.png'), join(resourcesDir, 'icon-512.png'));

    await renderSvgToPng(page, faviconSvg, 16, join(publicDir, 'favicon-16x16.png'));
    await renderSvgToPng(page, faviconSvg, 32, join(publicDir, 'favicon-32x32.png'));
    await renderSvgToPng(page, faviconSvg, 48, join(publicDir, '.tmp-favicon-48x48.png'));
    await renderSvgToPng(page, desktopSvg, 150, join(publicDir, 'mstile-150x150.png'));
    await renderSvgToPng(page, desktopSvg, 192, join(publicDir, 'android-chrome-192x192.png'));
    await renderSvgToPng(page, desktopSvg, 512, join(publicDir, 'android-chrome-512x512.png'));
    await renderSvgToPng(page, appleTouchSvg, 180, join(publicDir, 'apple-touch-icon.png'));
    await renderSvgToPng(page, maskableSvg, 512, join(publicDir, 'maskable-icon-512x512.png'));
} finally {
    await browser.close();
}

const pythonScript = `
import struct
from pathlib import Path
from PIL import Image

root = Path(${JSON.stringify(root)})
icons_dir = root / "build" / "icons"
public_dir = root / "src" / "renderer" / "public"

def save_ico(sources, output_path):
    entries = []
    for path in sources:
        with Image.open(path) as im:
            width, height = im.size
        entries.append((width, height, path.read_bytes()))
    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    dir_entries = bytearray()
    payload = bytearray()
    for width, height, data in entries:
        w_byte = 0 if width >= 256 else width
        h_byte = 0 if height >= 256 else height
        dir_entries.extend(
            struct.pack("<BBBBHHII", w_byte, h_byte, 0, 0, 1, 32, len(data), offset)
        )
        payload.extend(data)
        offset += len(data)
    output_path.write_bytes(header + bytes(dir_entries) + bytes(payload))

save_ico(
    [icons_dir / f"{s}x{s}.png" for s in (16, 24, 32, 48, 64, 128, 256)],
    root / "build" / "icon.ico",
)
save_ico(
    [
        public_dir / "favicon-16x16.png",
        public_dir / "favicon-32x32.png",
        public_dir / ".tmp-favicon-48x48.png",
    ],
    public_dir / "favicon.ico",
)

# Build Apple ICNS bundle with PNG-encoded icon chunks
icns_chunks = [
    (b"icp4", icons_dir / "16x16.png"),
    (b"icp5", icons_dir / "32x32.png"),
    (b"icp6", icons_dir / "64x64.png"),
    (b"ic07", icons_dir / "128x128.png"),
    (b"ic08", icons_dir / "256x256.png"),
    (b"ic09", icons_dir / "512x512.png"),
    (b"ic10", icons_dir / "1024x1024.png"),
]
body = bytearray()
for tag, png_path in icns_chunks:
    data = png_path.read_bytes()
    body.extend(tag)
    body.extend(struct.pack(">I", len(data) + 8))
    body.extend(data)
icns_bytes = b"icns" + struct.pack(">I", len(body) + 8) + bytes(body)
(root / "build" / "icon.icns").write_bytes(icns_bytes)
`;

execFileSync('python3', ['-c', pythonScript], { stdio: 'inherit' });
rmSync(join(publicDir, '.tmp-favicon-48x48.png'), { force: true });
writeFileSync(join(buildDir, '.gitkeep'), '');
rmSync(join(buildDir, '.gitkeep'), { force: true });
console.log('Generated desktop icons, favicons, ICO, ICNS, and web manifest assets.');
