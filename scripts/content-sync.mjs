import {
	closePool,
	hasDatabase,
	loadSnapshot,
	writeGeneratedSnapshot,
} from "../lib/content-db.mjs";

try {
	const snapshot = await loadSnapshot({ allowLegacy: true });
	await writeGeneratedSnapshot(snapshot);
	console.log(
		`Content snapshot ready (${hasDatabase() ? "database" : "legacy bootstrap"} source, ${snapshot.entries.length} entries).`,
	);
} finally {
	await closePool();
}
