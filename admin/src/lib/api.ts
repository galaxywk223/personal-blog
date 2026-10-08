/** Shared admin API client — wraps fetch with CSRF and error handling. */

let csrfToken = "";

export function setCsrf(token: string) {
	csrfToken = token;
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
	const headers: Record<string, string> = {
		...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
		...(options.headers as Record<string, string> | undefined),
	};
	if (csrfToken) headers["x-csrf-token"] = csrfToken;

	const res = await fetch(path, {
		credentials: "same-origin",
		...options,
		headers,
	});
	const payload = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new Error((payload as { error?: string }).error ?? `请求失败（${res.status}）`);
	return payload as T;
}

/** Poll a build until it reaches a terminal state. */
export async function waitForBuild(build: { id?: string; status?: string } | null) {
	if (!build?.id) return build;
	let record = build as { id: string; status: string; error?: string };
	const deadline = Date.now() + 120_000;
	while (record.status === "queued" || record.status === "running") {
		if (Date.now() >= deadline) throw new Error("构建等待超时");
		await new Promise((r) => setTimeout(r, 500));
		record = await api<typeof record>(`/api/admin/builds/${record.id}`);
	}
	if (record.status === "failed") throw new Error(record.error ?? "构建失败");
	return record;
}
