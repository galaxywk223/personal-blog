// One-off asset generator: turns the white-background K mark into a
// transparent, tightly cropped PNG set used by the blog and the admin UI.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = process.argv[2] || "C:/Users/wangk/Downloads/极简几何字母K科技标志.png";
const outDir = join(root, "public", "images", "branding");
const SOLID = 18;
const RAMP = 46;
const PAD = 12;

const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: CH } = info;
if (CH < 3) throw new Error("unexpected channel count: " + CH);

const delta = new Uint8Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += CH) {
	delta[i] = Math.max(255 - data[p], 255 - data[p + 1], 255 - data[p + 2]);
}

const exterior = new Uint8Array(W * H);
const stack = [];
const push = (x, y) => {
	const i = y * W + x;
	if (!exterior[i] && delta[i] <= RAMP) {
		exterior[i] = 1;
		stack.push(i);
	}
};
for (let x = 0; x < W; x++) {
	push(x, 0);
	push(x, H - 1);
}
for (let y = 0; y < H; y++) {
	push(0, y);
	push(W - 1, y);
}
while (stack.length) {
	const i = stack.pop();
	const x = i % W;
	const y = (i - x) / W;
	if (x > 0) push(x - 1, y);
	if (x < W - 1) push(x + 1, y);
	if (y > 0) push(x, y - 1);
	if (y < H - 1) push(x, y + 1);
}

const rgba = Buffer.alloc(W * H * 4);
let minX = W,
	minY = H,
	maxX = -1,
	maxY = -1;
for (let i = 0; i < W * H; i++) {
	const p = i * CH;
	const o = i * 4;
	let alpha = 255;
	if (exterior[i]) {
		const d = delta[i];
		alpha = d <= SOLID ? 0 : Math.round((255 * (d - SOLID)) / (RAMP - SOLID));
	}
	rgba[o] = data[p];
	rgba[o + 1] = data[p + 1];
	rgba[o + 2] = data[p + 2];
	rgba[o + 3] = alpha;
	if (alpha > 0) {
		const x = i % W;
		const y = (i - x) / W;
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
}
if (maxX < 0) throw new Error("no opaque pixels found");
const left = Math.max(0, minX - PAD);
const top = Math.max(0, minY - PAD);
const width = Math.min(W - left, maxX - minX + 1 + PAD * 2);
const height = Math.min(H - top, maxY - minY + 1 + PAD * 2);
console.log("bbox", { minX, minY, maxX, maxY, cropWidth: width, cropHeight: height });

const cropped = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
	.extract({ left, top, width, height })
	.png({ compressionLevel: 9, palette: false })
	.toBuffer();

await mkdir(outDir, { recursive: true });
await sharp(cropped)
	.resize(512, 512, { fit: "inside" })
	.png({ compressionLevel: 9 })
	.toFile(join(outDir, "k-logo.png"));
await sharp(cropped)
	.resize(192, 192, { fit: "inside" })
	.png({ compressionLevel: 9 })
	.toFile(join(outDir, "k-logo-192.png"));
await sharp(cropped)
	.resize(32, 32, { fit: "inside" })
	.png({ compressionLevel: 9 })
	.toFile(join(outDir, "k-logo-32.png"));

const icon128 = await sharp(cropped)
	.resize(128, 128, { fit: "inside" })
	.png({ compressionLevel: 9 })
	.toBuffer();
const svg =
	'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128"><image width="128" height="128" xlink:href="data:image/png;base64,' +
	icon128.toString("base64") +
	'" /></svg>';
await sharp(Buffer.from(svg)).toFile(join(root, "public", "favicon.svg"));
console.log("written", outDir);
