// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Emergency Access Auto-Grant Job
 *
 * Background job that checks pending emergency access requests every hour.
 * When `now >= expiresAt` and the request has not been denied, it
 * auto-grants access (status → "approved").
 *
 * The escrow blob is NOT set here — the owner's client must supply it
 * via the grantAccess endpoint. This job only transitions the status
 * so the owner's client knows it's time to release the escrow.
 *
 * @module @pssmngr/server/jobs/emergency/auto-grant
 */

import { and, eq, lte } from "drizzle-orm";
import { db } from "../../db";
import {
	emergencyAccessRequest,
	emergencyAuditLog,
	notifications,
	trustedContact,
} from "../../db/schema";
import { verifyTimestamp } from "../../utils/emergency-timelock";

export interface AutoGrantResult {
	success: boolean;
	requestsProcessed: number;
	requestsGranted: number;
	requestsSkipped: number;
	errors: Array<{ requestId: string; error: string }>;
}

/**
 * Process all pending emergency access requests whose timers have expired.
 */
export async function runAutoGrantCheck(): Promise<AutoGrantResult> {
	const result: AutoGrantResult = {
		success: true,
		requestsProcessed: 0,
		requestsGranted: 0,
		requestsSkipped: 0,
		errors: [],
	};

	try {
		const now = new Date();

		// Find all pending requests where the timer has expired
		const pendingExpired = await db.query.emergencyAccessRequest.findMany({
			where: and(
				eq(emergencyAccessRequest.status, "pending"),
				lte(emergencyAccessRequest.expiresAt, now),
			),
		});

		result.requestsProcessed = pendingExpired.length;

		for (const req of pendingExpired) {
			try {
				// Verify timestamp signature before auto-granting
				const signatureValid = verifyTimestamp(
					req.id,
					req.requestedAt,
					req.expiresAt,
					req.waitingPeriodDays,
					req.timestampSignature,
				);

				if (!signatureValid) {
					// Log signature failure and skip
					await db.insert(emergencyAuditLog).values({
						requestId: req.id,
						event: "signature_failed",
						actorId: null,
						metadata:
							"Auto-grant skipped: timestamp signature verification failed",
					});
					result.requestsSkipped++;
					result.errors.push({
						requestId: req.id,
						error: "Timestamp signature verification failed",
					});
					continue;
				}

				// Fetch pre-stored escrow from the trusted contact relationship
				const tc = await db.query.trustedContact.findFirst({
					where: eq(trustedContact.id, req.trustedContactId),
				});

				// Auto-grant: transition to approved, copy escrow if available
				await db
					.update(emergencyAccessRequest)
					.set({
						status: "approved",
						grantedAt: now,
						...(tc?.escrowBlob && {
							escrowBlob: tc.escrowBlob,
							escrowNonce: tc.escrowNonce,
							escrowAuthTag: tc.escrowAuthTag,
							ephemeralPublicKey: tc.ephemeralPublicKey,
							escrowSignature: tc.escrowSignature,
						}),
					})
					.where(eq(emergencyAccessRequest.id, req.id));

				// Audit log
				await db.insert(emergencyAuditLog).values({
					requestId: req.id,
					event: "request_auto_granted",
					actorId: null,
					metadata: `Auto-granted by background job at ${now.toISOString()}`,
				});

				// Notify both parties
				await db.insert(notifications).values([
					{
						userId: req.contactId,
						category: "security" as const,
						title: "Emergency access granted",
						message:
							"Your emergency access request has been automatically granted after the waiting period expired.",
					},
					{
						userId: req.ownerId,
						category: "security" as const,
						title: "Emergency access auto-granted",
						message:
							"An emergency access request was automatically granted after the waiting period expired without denial.",
					},
				]);

				result.requestsGranted++;
			} catch (error) {
				result.errors.push({
					requestId: req.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		if (result.errors.length > 0) {
			result.success = result.requestsGranted > 0;
		}
	} catch (error) {
		result.success = false;
		result.errors.push({
			requestId: "global",
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return result;
}
