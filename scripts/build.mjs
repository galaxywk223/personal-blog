import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const suffix = randomBytes(5).toString("hex");
const stage = `.dist-stage-${suffix}`;
const backup = `.dist-backup-${suffix}`;

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: root,
			env: process.env,
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.on("error", reject);
		child.on("close", (code) =>
			code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
		);
	});
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const node = process.platform === "win32" ? "node.exe" : "node";
const pagefind = join(
	root,
	"node_modules",
	".bin",
	process.platform === "win32" ? "pagefind.cmd" : "pagefind",
);
let oldMoved = false;
try {
	await rm(join(root, stage), { recursive: true, force: true });
	await run(node, [join(root, "scripts", "content-sync.mjs")]);
	await run(npm, ["run", "build:astro", "--", "--outDir", stage]);
	await run(pagefind, ["--site", stage]);
	await stat(join(root, stage, "index.html"));
	try {
		await rename(join(root, "dist"), join(root, backup));
		oldMoved = true;
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	try {
		await rm(join(root, "dist"), { recursive: true, force: true });
		await cp(join(root, stage), join(root, "dist"), { recursive: true });
		await rm(join(root, stage), { recursive: true, force: true });
	} catch (error) {
		await rm(join(root, "dist"), { recursive: true, force: true });
		if (oldMoved) await cp(join(root, backup), join(root, "dist"), { recursive: true });
		throw error;
	}
	if (oldMoved) await rm(join(root, backup), { recursive: true, force: true });
} catch (error) {
	await rm(join(root, stage), { recursive: true, force: true });
	throw error;
}
