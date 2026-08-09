// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import Redis from "ioredis";

const getRedisConnectionOptions = () => {
	const redisUrl = process.env.REDIS_URL;
	if (redisUrl) {
		try {
			const url = new URL(redisUrl);
			return {
				host: url.hostname,
				port: Number.parseInt(url.port) || 6379,
				password: url.password || undefined,
			};
		} catch {
			// Fall through to default config
		}
	}
	return {
		host: process.env.REDIS_HOST || "pssmngr-redis",
		port: 6379,
	};
};

let cachedClient: Redis | null = null;

export function getRedisClient(): Redis {
	if (cachedClient && cachedClient.status === "ready") {
		return cachedClient;
	}
	const opts = getRedisConnectionOptions();
	cachedClient = new Redis({
		...opts,
		maxRetriesPerRequest: 3,
		lazyConnect: true,
	});
	return cachedClient;
}

export async function checkRedisHealth(): Promise<{
	connected: boolean;
	latencyMs: number;
	memoryUsedMb: number;
	memoryTotalMb: number;
	error?: string;
}> {
	const opts = getRedisConnectionOptions();
	const client = new Redis({
		...opts,
		maxRetriesPerRequest: 1,
		connectTimeout: 5000,
		commandTimeout: 5000,
		lazyConnect: true,
	});

	try {
		await client.connect();
		const start = Date.now();
		await client.ping();
		const latencyMs = Date.now() - start;

		let memoryUsedMb = 0;
		let memoryTotalMb = 0;
		try {
			const info = await client.info("memory");
			const usedMatch = info.match(/used_memory:(\d+)/);
			const maxMatch = info.match(/maxmemory:(\d+)/);
			const usedBytes = usedMatch?.[1];
			const maxBytes = maxMatch?.[1];
			memoryUsedMb = usedBytes
				? Math.round(Number.parseInt(usedBytes) / 1024 / 1024)
				: 0;
			memoryTotalMb =
				maxBytes && Number.parseInt(maxBytes) > 0
					? Math.round(Number.parseInt(maxBytes) / 1024 / 1024)
					: 0;
		} catch {
			// Memory info failed, but redis is connected
		}

		return { connected: true, latencyMs, memoryUsedMb, memoryTotalMb };
	} catch (error) {
		return {
			connected: false,
			latencyMs: 0,
			memoryUsedMb: 0,
			memoryTotalMb: 0,
			error: error instanceof Error ? error.message : "Redis not available",
		};
	} finally {
		try {
			client.disconnect();
		} catch {
			// Ignore disconnect errors
		}
	}
}
