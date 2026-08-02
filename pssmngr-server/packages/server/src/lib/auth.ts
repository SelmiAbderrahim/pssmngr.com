// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import type { IncomingMessage } from "node:http";
import { passkey } from "@better-auth/passkey";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { localization } from "better-auth-localization";
import { GUARDED_AUTH_MUTATION_PATHS } from "./auth-guarded-paths";

/**
 * Map Accept-Language header to locale codes
 * Supported languages: en, ar, fr, de, es
 */
const LOCALE_MAP: Record<string, string> = {
	en: "en",
	ar: "ar",
	fr: "fr",
	de: "de",
	es: "es",
};

/**
 * Custom translations for better-auth error codes
 * Arabic, French, German, and English translations
 */
const AUTH_TRANSLATIONS = {
	en: {
		USER_NOT_FOUND: "User not found",
		FAILED_TO_CREATE_USER: "Failed to create user",
		FAILED_TO_UPDATE_USER: "Failed to update user",
		USER_ALREADY_EXISTS: "User already exists",
		USER_EMAIL_NOT_FOUND: "User email not found",
		USER_ALREADY_HAS_PASSWORD: "User already has a password",
		FAILED_TO_CREATE_SESSION: "Failed to create session",
		FAILED_TO_GET_SESSION: "Failed to get session",
		SESSION_EXPIRED: "Session has expired",
		INVALID_PASSWORD: "Invalid password",
		INVALID_EMAIL: "Invalid email",
		INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
		INVALID_TOKEN: "Invalid token",
		EMAIL_NOT_VERIFIED: "Email not verified",
		CREDENTIAL_ACCOUNT_NOT_FOUND: "Credential account not found",
		PASSWORD_TOO_SHORT: "Password is too short",
		PASSWORD_TOO_LONG: "Password is too long",
		SOCIAL_ACCOUNT_ALREADY_LINKED: "Social account already linked",
		PROVIDER_NOT_FOUND: "Provider not found",
		ID_TOKEN_NOT_SUPPORTED: "ID token not supported",
		FAILED_TO_GET_USER_INFO: "Failed to get user info",
		EMAIL_CAN_NOT_BE_UPDATED: "Email cannot be updated",
		FAILED_TO_UNLINK_LAST_ACCOUNT: "Cannot unlink last account",
		ACCOUNT_NOT_FOUND: "Account not found",
	},
	ar: {
		USER_NOT_FOUND: "المستخدم غير موجود",
		FAILED_TO_CREATE_USER: "فشل في إنشاء المستخدم",
		FAILED_TO_UPDATE_USER: "فشل في تحديث المستخدم",
		USER_ALREADY_EXISTS: "المستخدم موجود بالفعل",
		USER_EMAIL_NOT_FOUND: "البريد الإلكتروني للمستخدم غير موجود",
		USER_ALREADY_HAS_PASSWORD: "المستخدم لديه كلمة مرور بالفعل",
		FAILED_TO_CREATE_SESSION: "فشل في إنشاء الجلسة",
		FAILED_TO_GET_SESSION: "فشل في الحصول على الجلسة",
		SESSION_EXPIRED: "انتهت صلاحية الجلسة",
		INVALID_PASSWORD: "كلمة المرور غير صحيحة",
		INVALID_EMAIL: "البريد الإلكتروني غير صحيح",
		INVALID_EMAIL_OR_PASSWORD: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
		INVALID_TOKEN: "الرمز غير صالح",
		EMAIL_NOT_VERIFIED: "لم يتم التحقق من البريد الإلكتروني",
		CREDENTIAL_ACCOUNT_NOT_FOUND: "حساب الاعتماد غير موجود",
		PASSWORD_TOO_SHORT: "كلمة المرور قصيرة جداً",
		PASSWORD_TOO_LONG: "كلمة المرور طويلة جداً",
		SOCIAL_ACCOUNT_ALREADY_LINKED: "الحساب الاجتماعي مرتبط بالفعل",
		PROVIDER_NOT_FOUND: "المزود غير موجود",
		ID_TOKEN_NOT_SUPPORTED: "رمز الهوية غير مدعوم",
		FAILED_TO_GET_USER_INFO: "فشل في الحصول على معلومات المستخدم",
		EMAIL_CAN_NOT_BE_UPDATED: "لا يمكن تحديث البريد الإلكتروني",
		FAILED_TO_UNLINK_LAST_ACCOUNT: "لا يمكن إلغاء ربط الحساب الأخير",
		ACCOUNT_NOT_FOUND: "الحساب غير موجود",
	},
	fr: {
		USER_NOT_FOUND: "Utilisateur non trouvé",
		FAILED_TO_CREATE_USER: "Échec de la création de l'utilisateur",
		FAILED_TO_UPDATE_USER: "Échec de la mise à jour de l'utilisateur",
		USER_ALREADY_EXISTS: "L'utilisateur existe déjà",
		USER_EMAIL_NOT_FOUND: "Email de l'utilisateur non trouvé",
		USER_ALREADY_HAS_PASSWORD: "L'utilisateur a déjà un mot de passe",
		FAILED_TO_CREATE_SESSION: "Échec de la création de la session",
		FAILED_TO_GET_SESSION: "Échec de l'obtention de la session",
		SESSION_EXPIRED: "La session a expiré",
		INVALID_PASSWORD: "Mot de passe invalide",
		INVALID_EMAIL: "Email invalide",
		INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
		INVALID_TOKEN: "Jeton invalide",
		EMAIL_NOT_VERIFIED: "Email non vérifié",
		CREDENTIAL_ACCOUNT_NOT_FOUND: "Compte d'identification non trouvé",
		PASSWORD_TOO_SHORT: "Le mot de passe est trop court",
		PASSWORD_TOO_LONG: "Le mot de passe est trop long",
		SOCIAL_ACCOUNT_ALREADY_LINKED: "Compte social déjà lié",
		PROVIDER_NOT_FOUND: "Fournisseur non trouvé",
		ID_TOKEN_NOT_SUPPORTED: "Jeton d'identité non pris en charge",
		FAILED_TO_GET_USER_INFO:
			"Échec de l'obtention des informations utilisateur",
		EMAIL_CAN_NOT_BE_UPDATED: "L'email ne peut pas être mis à jour",
		FAILED_TO_UNLINK_LAST_ACCOUNT: "Impossible de délier le dernier compte",
		ACCOUNT_NOT_FOUND: "Compte non trouvé",
	},
	de: {
		USER_NOT_FOUND: "Benutzer nicht gefunden",
		FAILED_TO_CREATE_USER: "Benutzer konnte nicht erstellt werden",
		FAILED_TO_UPDATE_USER: "Benutzer konnte nicht aktualisiert werden",
		USER_ALREADY_EXISTS: "Benutzer existiert bereits",
		USER_EMAIL_NOT_FOUND: "Benutzer-E-Mail nicht gefunden",
		USER_ALREADY_HAS_PASSWORD: "Benutzer hat bereits ein Passwort",
		FAILED_TO_CREATE_SESSION: "Sitzung konnte nicht erstellt werden",
		FAILED_TO_GET_SESSION: "Sitzung konnte nicht abgerufen werden",
		SESSION_EXPIRED: "Sitzung ist abgelaufen",
		INVALID_PASSWORD: "Ungültiges Passwort",
		INVALID_EMAIL: "Ungültige E-Mail",
		INVALID_EMAIL_OR_PASSWORD: "Ungültige E-Mail oder Passwort",
		INVALID_TOKEN: "Ungültiger Token",
		EMAIL_NOT_VERIFIED: "E-Mail nicht verifiziert",
		CREDENTIAL_ACCOUNT_NOT_FOUND: "Anmeldekonto nicht gefunden",
		PASSWORD_TOO_SHORT: "Passwort ist zu kurz",
		PASSWORD_TOO_LONG: "Passwort ist zu lang",
		SOCIAL_ACCOUNT_ALREADY_LINKED: "Soziales Konto bereits verknüpft",
		PROVIDER_NOT_FOUND: "Anbieter nicht gefunden",
		ID_TOKEN_NOT_SUPPORTED: "ID-Token wird nicht unterstützt",
		FAILED_TO_GET_USER_INFO:
			"Benutzerinformationen konnten nicht abgerufen werden",
		EMAIL_CAN_NOT_BE_UPDATED: "E-Mail kann nicht aktualisiert werden",
		FAILED_TO_UNLINK_LAST_ACCOUNT: "Letztes Konto kann nicht getrennt werden",
		ACCOUNT_NOT_FOUND: "Konto nicht gefunden",
	},
	es: {
		USER_NOT_FOUND: "Usuario no encontrado",
		FAILED_TO_CREATE_USER: "Error al crear el usuario",
		FAILED_TO_UPDATE_USER: "Error al actualizar el usuario",
		USER_ALREADY_EXISTS: "El usuario ya existe",
		USER_EMAIL_NOT_FOUND: "Correo electrónico del usuario no encontrado",
		USER_ALREADY_HAS_PASSWORD: "El usuario ya tiene una contraseña",
		FAILED_TO_CREATE_SESSION: "Error al crear la sesión",
		FAILED_TO_GET_SESSION: "Error al obtener la sesión",
		SESSION_EXPIRED: "La sesión ha expirado",
		INVALID_PASSWORD: "Contraseña inválida",
		INVALID_EMAIL: "Correo electrónico inválido",
		INVALID_EMAIL_OR_PASSWORD: "Correo electrónico o contraseña inválidos",
		INVALID_TOKEN: "Token inválido",
		EMAIL_NOT_VERIFIED: "Correo electrónico no verificado",
		CREDENTIAL_ACCOUNT_NOT_FOUND: "Cuenta de credenciales no encontrada",
		PASSWORD_TOO_SHORT: "La contraseña es demasiado corta",
		PASSWORD_TOO_LONG: "La contraseña es demasiado larga",
		SOCIAL_ACCOUNT_ALREADY_LINKED: "La cuenta social ya está vinculada",
		PROVIDER_NOT_FOUND: "Proveedor no encontrado",
		ID_TOKEN_NOT_SUPPORTED: "Token de ID no compatible",
		FAILED_TO_GET_USER_INFO: "Error al obtener información del usuario",
		EMAIL_CAN_NOT_BE_UPDATED: "El correo electrónico no se puede actualizar",
		FAILED_TO_UNLINK_LAST_ACCOUNT: "No se puede desvincular la última cuenta",
		ACCOUNT_NOT_FOUND: "Cuenta no encontrada",
	},
};

import { and, desc, eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import {
	sendLocalizedInvitation,
	sendSimpleLocalizedEmail,
} from "../email/i18n-email-service";
import { validateSessionBinding } from "../middleware/session-pinning";

const REQUIRE_EMAIL_VERIFICATION = IS_CLOUD;

async function requireGuardedOrganizationMutation(): Promise<never> {
	throw new APIError("FORBIDDEN", {
		message: "Use the application organization API for this action.",
	});
}

const { handler, api } = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET,
	baseURL: process.env.SITE_URL,
	disabledPaths: [...GUARDED_AUTH_MUTATION_PATHS],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	appName: "Password Manager",
	advanced: {
		ipAddress: {
			// Record the trusted client IP set by our nginx (`X-Real-IP` =
			// $remote_addr) instead of better-auth's default leftmost
			// `X-Forwarded-For` entry, which is client/proxy-controllable.
			// Keeps session.ipAddress honest for session listing and audit.
			ipAddressHeaders: ["x-real-ip"],
		},
	},
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		},
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		},
	},
	account: {
		accountLinking: {
			// Link a Google/GitHub sign-in to an existing email/password account
			// with the same verified email, so the user keeps their org and vault.
			enabled: true,
			trustedProviders: ["google", "github"],
		},
	},
	logger: {
		disabled: process.env.NODE_ENV === "production",
	},
	rateLimit: {
		enabled: true,
	},
	async trustedOrigins() {
		const envOrigins = process.env.TRUSTED_ORIGINS
			? process.env.TRUSTED_ORIGINS.split(",").map((origin) => origin.trim())
			: [];
		return [
			...new Set([process.env.SITE_URL, ...envOrigins].filter(Boolean)),
		] as string[];
	},
	emailVerification: {
		sendOnSignUp: REQUIRE_EMAIL_VERIFICATION,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			if (REQUIRE_EMAIL_VERIFICATION) {
				// Send localized email verification
				await sendSimpleLocalizedEmail({
					to: user.email,
					userId: user.id,
					templateId: "emailVerification",
					actionUrl: url,
				});
			}
		},
	},
	emailAndPassword: {
		enabled: true,
		autoSignIn: !REQUIRE_EMAIL_VERIFICATION,
		requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
		password: {
			async hash(password) {
				return bcrypt.hashSync(password, 10);
			},
			async verify({ hash, password }) {
				return bcrypt.compareSync(password, hash);
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await db.transaction(async (tx) => {
						const [organization] = await tx
							.insert(schema.organization)
							.values({
								name: "My Organization",
								ownerId: user.id,
								createdAt: new Date(),
							})
							.returning();

						if (!organization) {
							throw new Error("Failed to create organization");
						}
						await tx.insert(schema.member).values({
							userId: user.id,
							organizationId: organization.id,
							role: "owner",
							createdAt: new Date(),
							isDefault: true,
						});
					});
				},
			},
		},
		session: {
			create: {
				before: async (session) => {
					// Find the default organization for this user
					// Priority: 1) isDefault=true, 2) most recently created
					const member = await db.query.member.findFirst({
						where: eq(schema.member.userId, session.userId),
						orderBy: [
							desc(schema.member.isDefault),
							desc(schema.member.createdAt),
						],
						with: {
							organization: true,
						},
					});

					return {
						data: {
							...session,
							activeOrganizationId: member?.organization.id,
						},
					};
				},
			},
		},
	},
	session: {
		expiresIn: 7 * 24 * 60 * 60, // 7 days — master password unlock is the real security gate
		updateAge: 60 * 60, // Extend session every 1 hour of activity
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // Cache cookie validation for 5 minutes
		},
	},
	user: {
		modelName: "user",
		additionalFields: {
			role: {
				type: "string",
				// required: true,
				input: false,
			},
			ownerId: {
				type: "string",
				// required: true,
				input: false,
			},
			allowImpersonation: {
				fieldName: "allowImpersonation",
				type: "boolean",
				defaultValue: false,
			},
			lastName: {
				type: "string",
				required: false,
				input: true,
				defaultValue: "",
			},
		},
	},
	plugins: [
		// Localization plugin - provides translated error messages for better-auth
		// Must be first in plugins array to intercept all error responses
		localization({
			defaultLocale: "en",
			fallbackLocale: "en",
			translations: AUTH_TRANSLATIONS,
			getLocale: async (request: Request) => {
				const acceptLanguage = request.headers.get("accept-language");
				if (!acceptLanguage) return "en";
				// Extract primary language from Accept-Language header
				// e.g., "ar,en;q=0.9" -> "ar", or "en-US,en;q=0.9" -> "en"
				const primaryLang = acceptLanguage
					.split(",")[0]
					?.split("-")[0]
					?.toLowerCase();
				return (LOCALE_MAP[primaryLang || "en"] || "en") as "en";
			},
		} as never),
		twoFactor(),
		passkey({
			rpID: process.env.PASSKEY_RP_ID || "localhost",
			rpName: process.env.PASSKEY_RP_NAME || "Password Manager",
			origin: process.env.PASSKEY_ORIGIN || null,
		}),
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
			organizationHooks: {
				beforeCreateInvitation: requireGuardedOrganizationMutation,
				beforeAcceptInvitation: requireGuardedOrganizationMutation,
				beforeUpdateOrganization: requireGuardedOrganizationMutation,
				beforeDeleteOrganization: requireGuardedOrganizationMutation,
				beforeRemoveMember: requireGuardedOrganizationMutation,
				beforeUpdateMemberRole: requireGuardedOrganizationMutation,
			},
			async sendInvitationEmail(data, _request) {
				if (IS_CLOUD) {
					const host = (
						process.env.SITE_URL ||
						process.env.BETTER_AUTH_URL ||
						(process.env.NODE_ENV === "development"
							? "http://localhost:42789"
							: "https://pssmngr.com")
					).replace(/\/$/, "");
					const inviteLink = `${host}/invitation?token=${data.id}`;

					await sendLocalizedInvitation({
						to: data.email,
						organization: data.organization.name,
						role: data.role,
						actionUrl: inviteLink,
					});
				}
			},
		}),
		...(IS_CLOUD
			? [
					admin({
						adminUserIds: [process.env.USER_ADMIN_ID as string],
					}),
				]
			: []),
	],
});

export const auth = {
	handler,
	api,
};

export const validateRequest = async (request: IncomingMessage) => {
	// Browser sessions are accepted only through HttpOnly cookies.
	const session = await api.getSession({
		headers: new Headers({ cookie: request.headers.cookie || "" }),
	});

	if (!session?.session || !session.user) {
		return { session: null, user: null };
	}

	// Session binding is DETECTION-ONLY (2026-07-07). Hard-revoking on
	// IP/UA drift locked legitimate users out: CGNAT/mobile IP rotation and
	// benign UA changes (browser auto-update, DevTools device emulation)
	// deleted fresh sessions on the first authenticated request after
	// sign-in. A cookie thief replays the victim's UA trivially, so the
	// equality check adds ~no theft protection; vault data stays protected
	// by zero-knowledge encryption and sensitive ops by 2FA step-up.
	// UA strings are not secret; never log the session token or cookie
	// material.
	const pinningError = validateSessionBinding(session.session, request);
	if (pinningError) {
		const currentUa = String(request.headers["user-agent"] || "");
		console.warn(
			`[auth] session binding drift (allowed): reason=${pinningError} userId=${session.user.id} sessionId=${session.session.id} storedUa=${JSON.stringify((session.session.userAgent ?? "").slice(0, 160))} currentUa=${JSON.stringify(currentUa.slice(0, 160))}`,
		);
	}

	if (session?.user) {
		const member = await db.query.member.findFirst({
			where: and(
				eq(schema.member.userId, session.user.id),
				eq(
					schema.member.organizationId,
					session.session.activeOrganizationId || "",
				),
			),
			with: {
				organization: true,
			},
		});

		session.user.role = member?.role || "member";
		if (member) {
			session.user.ownerId = member.organization.ownerId;
		} else {
			session.user.ownerId = session.user.id;
		}
	}

	return session;
};
