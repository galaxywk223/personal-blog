export function loginAttempt(attempts, ip, now = Date.now()) {
	const current = attempts.get(ip);
	if (!current || now - current.at >= 60_000) return { count: 0, at: now };
	return current;
}
