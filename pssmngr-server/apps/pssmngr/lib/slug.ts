// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import slug from "slugify";

export const slugify = (text: string | undefined) => {
	if (!text) {
		return "";
	}

	const cleanedText = text.trim().replace(/[^a-zA-Z0-9\s]/g, "") || "service";

	return slug(cleanedText, {
		lower: true,
		trim: true,
		strict: true,
	});
};
