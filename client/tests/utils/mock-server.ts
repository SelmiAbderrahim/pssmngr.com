// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { setupServer } from "msw/node";
import { authHandlers } from "../__mocks__/api/handlers";

/** Shared MSW server for client unit tests. Individual tests add scoped handlers. */
export const server = setupServer(...authHandlers);
