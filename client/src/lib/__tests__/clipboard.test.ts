// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * Tests for the sensitive-clipboard helper (Round 4, fix #31).
 *
 * Verifies that copySensitiveText writes the secret, schedules a
 * module-level 30s auto-wipe that survives component unmount,
 * reschedules on repeated copies, skips the wipe when the user has
 * since copied something else, and swallows wipe-time errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copySensitiveText, CLIPBOARD_CLEAR_MS } from "../clipboard";

const writeText = vi.fn<(text: string) => Promise<void>>();
const readText = vi.fn<() => Promise<string>>();

function mockClipboard(api: Record<string, unknown>) {
  Object.defineProperty(navigator, "clipboard", {
    value: api,
    configurable: true,
    writable: true,
  });
}

/** Number of wipe calls (writeText("")) recorded so far. */
function wipeCalls(): number {
  return writeText.mock.calls.filter(([text]) => text === "").length;
}

describe("copySensitiveText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset().mockResolvedValue(undefined);
    readText.mockReset();
    mockClipboard({ writeText, readText });
  });

  afterEach(() => {
    // Drop any pending module-level wipe timer so it can't leak into
    // the next test. (The module clears stale ids on the next copy.)
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("copies the text to the clipboard", async () => {
    await copySensitiveText("s3cret");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("s3cret");
  });

  it("exports a 30s clear delay", () => {
    expect(CLIPBOARD_CLEAR_MS).toBe(30_000);
  });

  it("wipes the clipboard after CLIPBOARD_CLEAR_MS", async () => {
    readText.mockResolvedValue("s3cret");
    await copySensitiveText("s3cret");

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 1);
    expect(wipeCalls()).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(wipeCalls()).toBe(1);
    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("reschedules on a second copy: old timer canceled, single wipe at the end", async () => {
    readText.mockImplementation(async () => "second");

    await copySensitiveText("first");
    await vi.advanceTimersByTimeAsync(15_000);
    await copySensitiveText("second");

    // 30s after the FIRST copy — old timer must have been canceled.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(wipeCalls()).toBe(0);

    // 30s after the SECOND copy — exactly one wipe fires.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(wipeCalls()).toBe(1);

    // Nothing else pending afterwards.
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS * 2);
    expect(wipeCalls()).toBe(1);
  });

  it("swallows errors thrown by the deferred wipe", async () => {
    readText.mockResolvedValue("s3cret");
    await copySensitiveText("s3cret");

    // Simulate "document is not focused" at wipe time.
    writeText.mockRejectedValue(new DOMException("Document is not focused."));

    await expect(
      vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS),
    ).resolves.not.toThrow();
    expect(wipeCalls()).toBe(1); // attempted, error ignored
  });

  it("skips the wipe when the user has since copied something else", async () => {
    readText.mockResolvedValue("unrelated user content");
    await copySensitiveText("s3cret");

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(readText).toHaveBeenCalledTimes(1);
    expect(wipeCalls()).toBe(0);
  });

  it("still wipes when the clipboard cannot be read", async () => {
    readText.mockRejectedValue(new DOMException("Read permission denied."));
    await copySensitiveText("s3cret");

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(wipeCalls()).toBe(1);
  });

  it("wipes unconditionally when readText is unavailable", async () => {
    mockClipboard({ writeText }); // e.g. Firefox: no readText
    await copySensitiveText("s3cret");

    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
    expect(wipeCalls()).toBe(1);
  });

  it("propagates initial write failures and schedules no wipe", async () => {
    writeText.mockRejectedValueOnce(new DOMException("Write denied."));

    await expect(copySensitiveText("s3cret")).rejects.toThrow();

    writeText.mockClear();
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS * 2);
    expect(writeText).not.toHaveBeenCalled();
  });
});
