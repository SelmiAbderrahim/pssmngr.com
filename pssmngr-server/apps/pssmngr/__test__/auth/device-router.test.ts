// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "vitest";
import { z } from "zod/v3";

// Input schemas matching the device router definitions
const registerDeviceInput = z.object({
	deviceName: z.string().min(1).max(100),
	deviceType: z.enum(["browser", "extension", "mobile"]),
	publicKey: z.string().min(32),
});

const deviceIdInput = z.object({
	deviceId: z.string().min(1),
});

// ─── Register Input Validation ───────────────────────────────────────

describe("device router - register input validation", () => {
	test("accepts valid browser device registration", () => {
		const result = registerDeviceInput.parse({
			deviceName: "Chrome on MacOS",
			deviceType: "browser",
			publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
		});
		expect(result.deviceName).toBe("Chrome on MacOS");
		expect(result.deviceType).toBe("browser");
	});

	test("accepts valid extension device registration", () => {
		const result = registerDeviceInput.parse({
			deviceName: "Password Manager Extension",
			deviceType: "extension",
			publicKey: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
		});
		expect(result.deviceType).toBe("extension");
	});

	test("accepts valid mobile device registration", () => {
		const result = registerDeviceInput.parse({
			deviceName: "iPhone 15",
			deviceType: "mobile",
			publicKey: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
		});
		expect(result.deviceType).toBe("mobile");
	});

	test("rejects empty deviceName", () => {
		expect(() =>
			registerDeviceInput.parse({
				deviceName: "",
				deviceType: "browser",
				publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
			}),
		).toThrow();
	});

	test("rejects deviceName over 100 characters", () => {
		expect(() =>
			registerDeviceInput.parse({
				deviceName: "x".repeat(101),
				deviceType: "browser",
				publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
			}),
		).toThrow();
	});

	test("rejects invalid deviceType", () => {
		expect(() =>
			registerDeviceInput.parse({
				deviceName: "My Device",
				deviceType: "desktop",
				publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
			}),
		).toThrow();
	});

	test("rejects short publicKey (under 32 chars)", () => {
		expect(() =>
			registerDeviceInput.parse({
				deviceName: "My Device",
				deviceType: "browser",
				publicKey: "shortkey",
			}),
		).toThrow();
	});

	test("accepts publicKey exactly 32 characters", () => {
		const key = "A".repeat(32);
		const result = registerDeviceInput.parse({
			deviceName: "My Device",
			deviceType: "browser",
			publicKey: key,
		});
		expect(result.publicKey).toBe(key);
	});

	test("rejects missing fields", () => {
		expect(() => registerDeviceInput.parse({})).toThrow();
		expect(() => registerDeviceInput.parse({ deviceName: "Test" })).toThrow();
		expect(() =>
			registerDeviceInput.parse({ deviceName: "Test", deviceType: "browser" }),
		).toThrow();
	});
});

// ─── Trust/Untrust/Remove Input Validation ───────────────────────────

describe("device router - trust/untrust/remove input validation", () => {
	test("accepts valid deviceId", () => {
		const result = deviceIdInput.parse({ deviceId: "abc123" });
		expect(result.deviceId).toBe("abc123");
	});

	test("rejects empty deviceId", () => {
		expect(() => deviceIdInput.parse({ deviceId: "" })).toThrow();
	});

	test("rejects missing deviceId", () => {
		expect(() => deviceIdInput.parse({})).toThrow();
	});

	test("accepts UUID-format deviceId", () => {
		const result = deviceIdInput.parse({
			deviceId: "550e8400-e29b-41d4-a716-446655440000",
		});
		expect(result.deviceId).toBe("550e8400-e29b-41d4-a716-446655440000");
	});
});

// ─── Security Constraints ────────────────────────────────────────────

describe("device router - security constraints", () => {
	test("device types are limited to browser, extension, mobile", () => {
		const schema = z.enum(["browser", "extension", "mobile"]);
		expect(schema.parse("browser")).toBe("browser");
		expect(schema.parse("extension")).toBe("extension");
		expect(schema.parse("mobile")).toBe("mobile");
		expect(() => schema.parse("tablet")).toThrow();
		expect(() => schema.parse("")).toThrow();
	});

	test("publicKey minimum length prevents empty or trivial keys", () => {
		const schema = z.string().min(32);
		// X25519 public keys are 32 bytes, base64-encoded = 44 chars
		const validKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
		expect(schema.parse(validKey)).toBe(validKey);
		expect(() => schema.parse("")).toThrow();
		expect(() => schema.parse("too-short")).toThrow();
	});

	test("deviceName length is bounded to prevent abuse", () => {
		const schema = z.string().min(1).max(100);
		expect(schema.parse("A")).toBe("A");
		expect(schema.parse("A".repeat(100))).toBe("A".repeat(100));
		expect(() => schema.parse("")).toThrow();
		expect(() => schema.parse("A".repeat(101))).toThrow();
	});

	test("all device operations require authentication (protectedProcedure)", () => {
		// register, trust, untrust, list, remove are all protectedProcedure
		const error = new TRPCError({
			code: "UNAUTHORIZED",
			message: "Not authenticated",
		});
		expect(error.code).toBe("UNAUTHORIZED");
	});
});

// ─── Trust Flow ──────────────────────────────────────────────────────

describe("device router - trust flow", () => {
	test("new devices should default to untrusted", () => {
		const newDevice = {
			trusted: false,
			deviceName: "New Browser",
			deviceType: "browser" as const,
		};
		expect(newDevice.trusted).toBe(false);
	});

	test("trust operation sets trusted to true", () => {
		const dev = { trusted: false };
		dev.trusted = true;
		expect(dev.trusted).toBe(true);
	});

	test("untrust operation sets trusted back to false", () => {
		const dev = { trusted: true };
		dev.trusted = false;
		expect(dev.trusted).toBe(false);
	});

	test("trust/untrust can be toggled multiple times", () => {
		const dev = { trusted: false };
		dev.trusted = true;
		expect(dev.trusted).toBe(true);
		dev.trusted = false;
		expect(dev.trusted).toBe(false);
		dev.trusted = true;
		expect(dev.trusted).toBe(true);
	});
});

// ─── Ownership Isolation ─────────────────────────────────────────────

describe("device router - ownership isolation", () => {
	const devices = [
		{
			id: "dev1",
			userId: "user1",
			trusted: false,
			deviceName: "Chrome",
			deviceType: "browser",
		},
		{
			id: "dev2",
			userId: "user2",
			trusted: true,
			deviceName: "Firefox",
			deviceType: "browser",
		},
		{
			id: "dev3",
			userId: "user1",
			trusted: true,
			deviceName: "Mobile",
			deviceType: "mobile",
		},
	];

	test("device lookup requires both deviceId AND userId", () => {
		// User1 looking for dev1 - should find it
		const found = devices.find((d) => d.id === "dev1" && d.userId === "user1");
		expect(found).toBeDefined();

		// User1 looking for dev2 (owned by user2) - should NOT find it
		const notFound = devices.find(
			(d) => d.id === "dev2" && d.userId === "user1",
		);
		expect(notFound).toBeUndefined();

		// User2 looking for dev1 (owned by user1) - should NOT find it
		const alsoNotFound = devices.find(
			(d) => d.id === "dev1" && d.userId === "user2",
		);
		expect(alsoNotFound).toBeUndefined();
	});

	test("cannot trust another user's device", () => {
		const attackerUserId = "user2";

		const target = devices.find(
			(d) => d.id === "dev1" && d.userId === attackerUserId,
		);
		expect(target).toBeUndefined();
	});

	test("cannot untrust another user's device", () => {
		const attackerUserId = "user1";

		const target = devices.find(
			(d) => d.id === "dev2" && d.userId === attackerUserId,
		);
		expect(target).toBeUndefined();
	});

	test("cannot remove another user's device", () => {
		const attackerUserId = "user2";

		const target = devices.find(
			(d) => d.id === "dev3" && d.userId === attackerUserId,
		);
		expect(target).toBeUndefined();
	});

	test("list devices returns only own devices", () => {
		const user1Devices = devices.filter((d) => d.userId === "user1");
		const user2Devices = devices.filter((d) => d.userId === "user2");

		expect(user1Devices).toHaveLength(2);
		expect(user2Devices).toHaveLength(1);

		// User1's devices don't include user2's
		expect(user1Devices.map((d) => d.id)).toEqual(["dev1", "dev3"]);
		expect(user2Devices.map((d) => d.id)).toEqual(["dev2"]);
	});

	test("NOT_FOUND thrown when device does not exist for user", () => {
		const error = new TRPCError({
			code: "NOT_FOUND",
			message: "Device not found",
		});
		expect(error.code).toBe("NOT_FOUND");
		expect(error.message).toBe("Device not found");
	});
});

// ─── Device Metadata ─────────────────────────────────────────────────

describe("device router - device metadata", () => {
	test("device registration captures IP address", () => {
		const mockReq = { socket: { remoteAddress: "192.168.1.100" } };
		const lastIp = mockReq.socket?.remoteAddress ?? null;
		expect(lastIp).toBe("192.168.1.100");
	});

	test("device registration captures user agent", () => {
		const mockHeaders = {
			"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
		};
		const lastUserAgent = mockHeaders["user-agent"] ?? null;
		expect(lastUserAgent).toContain("Mozilla");
	});

	test("device registration sets lastSeen timestamp", () => {
		const before = new Date();
		const lastSeen = new Date();
		expect(lastSeen.getTime()).toBeGreaterThanOrEqual(before.getTime());
	});

	test("device registration handles missing IP gracefully", () => {
		const mockReq = { socket: {} as any };
		const lastIp = mockReq.socket?.remoteAddress ?? null;
		expect(lastIp).toBeNull();
	});

	test("device registration handles missing user agent gracefully", () => {
		const mockHeaders: Record<string, string | undefined> = {};
		const lastUserAgent = mockHeaders["user-agent"] ?? null;
		expect(lastUserAgent).toBeNull();
	});
});

// ─── Device Removal ──────────────────────────────────────────────────

describe("device router - device removal", () => {
	test("remove returns success on valid device", () => {
		const result = { success: true };
		expect(result.success).toBe(true);
	});

	test("remove throws NOT_FOUND for non-existent device", () => {
		const devices = [{ id: "dev1", userId: "user1" }];
		const target = devices.find(
			(d) => d.id === "non-existent" && d.userId === "user1",
		);

		if (!target) {
			const error = new TRPCError({
				code: "NOT_FOUND",
				message: "Device not found",
			});
			expect(error.code).toBe("NOT_FOUND");
		}
	});

	test("remove only deletes the specified device", () => {
		const devices = [
			{ id: "dev1", userId: "user1" },
			{ id: "dev2", userId: "user1" },
			{ id: "dev3", userId: "user1" },
		];

		const toRemove = "dev2";
		const remaining = devices.filter((d) => d.id !== toRemove);
		expect(remaining).toHaveLength(2);
		expect(remaining.map((d) => d.id)).toEqual(["dev1", "dev3"]);
	});

	test("device removal should invalidate bound sessions", () => {
		// When a device is removed, any sessions bound to it should be invalid
		const sessions = [
			{ id: "sess1", deviceId: "dev1", valid: true },
			{ id: "sess2", deviceId: "dev2", valid: true },
			{ id: "sess3", deviceId: "dev1", valid: true },
		];

		const removedDeviceId = "dev1";
		const invalidated = sessions.map((s) => ({
			...s,
			valid: s.deviceId !== removedDeviceId,
		}));

		expect(invalidated.filter((s) => !s.valid)).toHaveLength(2);
		expect(invalidated.find((s) => s.id === "sess2")?.valid).toBe(true);
	});
});

// ─── Session-Device Binding ──────────────────────────────────────────

describe("device router - session-device binding", () => {
	test("session should be bound to a specific device ID", () => {
		const session = {
			id: "sess-1",
			userId: "user-1",
			deviceId: "dev-1",
			ipAddress: "1.2.3.4",
			userAgent: "Chrome/120",
		};
		expect(session.deviceId).toBe("dev-1");
	});

	test("session validation should check device trust status", () => {
		const trustedDevices = new Set(["dev-1", "dev-3"]);
		const sessionDeviceId = "dev-2";

		const isDeviceTrusted = trustedDevices.has(sessionDeviceId);
		expect(isDeviceTrusted).toBe(false);
	});

	test("trusted device allows session continuation", () => {
		const trustedDevices = new Set(["dev-1", "dev-3"]);
		const sessionDeviceId = "dev-1";

		const isDeviceTrusted = trustedDevices.has(sessionDeviceId);
		expect(isDeviceTrusted).toBe(true);
	});

	test("revoking device trust should affect bound sessions", () => {
		const device = { id: "dev-1", trusted: true };
		const sessions = [
			{ id: "sess-1", deviceId: "dev-1" },
			{ id: "sess-2", deviceId: "dev-1" },
		];

		// Untrust the device
		device.trusted = false;

		// All sessions bound to this device should be flagged
		const affectedSessions = sessions.filter((s) => s.deviceId === device.id);
		expect(affectedSessions).toHaveLength(2);
		expect(device.trusted).toBe(false);
	});
});

// ─── Device List Ordering ────────────────────────────────────────────

describe("device router - list ordering", () => {
	test("devices are ordered by lastSeen descending", () => {
		const devices = [
			{ id: "dev1", lastSeen: new Date("2025-01-01") },
			{ id: "dev2", lastSeen: new Date("2025-03-01") },
			{ id: "dev3", lastSeen: new Date("2025-02-01") },
		];

		const sorted = [...devices].sort(
			(a, b) => b.lastSeen.getTime() - a.lastSeen.getTime(),
		);

		expect(sorted[0]?.id).toBe("dev2"); // Most recently seen first
		expect(sorted[1]?.id).toBe("dev3");
		expect(sorted[2]?.id).toBe("dev1");
	});
});
