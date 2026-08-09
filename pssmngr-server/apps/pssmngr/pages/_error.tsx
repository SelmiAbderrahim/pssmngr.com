// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Minimal error page.
 *
 * This app serves the API only (tRPC, better-auth, health); the user interface
 * is the separate client SPA. This page exists so Next.js has something to
 * render for a direct hit on a non-API path.
 */
import type { NextPageContext } from "next";

interface Props {
	statusCode: number;
}

function ErrorPage({ statusCode }: Props) {
	return (
		<div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
			<h1>{statusCode || "Error"}</h1>
			<p>{statusCode === 404 ? "Not found" : "An error occurred"}</p>
		</div>
	);
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
	const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
	return { statusCode };
};

export default ErrorPage;
