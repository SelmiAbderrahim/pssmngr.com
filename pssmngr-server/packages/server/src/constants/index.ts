// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors

/** Official hosted-service mode. Self-hosted installations keep this false. */
export const IS_CLOUD = process.env.IS_CLOUD === "true";
