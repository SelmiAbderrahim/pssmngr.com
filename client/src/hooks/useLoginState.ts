// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
import { useState, useEffect, useCallback } from "react";
import { getLogger } from "@/lib/logger";

const logger = getLogger();
const LOGIN_STATE_KEY = "pssmngr_login_state";
const STATE_EXPIRY_MINUTES = 20; // Match OTP expiry

interface LoginState {
  step: "signIn" | "verify";
  email?: string;
  timestamp: number;
}

export function useLoginState() {
  const [step, setStepInternal] = useState<"signIn" | { email: string }>("signIn");

  // Hydrate state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOGIN_STATE_KEY);
      if (stored) {
        const state: LoginState = JSON.parse(stored);
        const isExpired = Date.now() - state.timestamp > STATE_EXPIRY_MINUTES * 60 * 1000;

        if (!isExpired && state.step === "verify" && state.email) {
          logger.debug("Restored login state from storage", {
            function: "useLoginState.hydrate",
            email: state.email,
            age: Math.round((Date.now() - state.timestamp) / 1000) + "s",
          });
          setStepInternal({ email: state.email });
        } else {
          // Clear expired state
          if (isExpired) {
            logger.info("Login state expired, clearing", {
              function: "useLoginState.hydrate",
              age: Math.round((Date.now() - state.timestamp) / 60000) + "m",
            });
          }
          localStorage.removeItem(LOGIN_STATE_KEY);
        }
      }
    } catch (error) {
      logger.error("Failed to restore login state", {
        function: "useLoginState.hydrate",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      localStorage.removeItem(LOGIN_STATE_KEY);
    }
  }, []);

  // Listen for storage events to sync across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LOGIN_STATE_KEY) {
        if (e.newValue === null) {
          // State was cleared in another tab
          setStepInternal("signIn");
        } else {
          try {
            const state: LoginState = JSON.parse(e.newValue);
            const isExpired = Date.now() - state.timestamp > STATE_EXPIRY_MINUTES * 60 * 1000;

            if (!isExpired && state.step === "verify" && state.email) {
              setStepInternal({ email: state.email });
            } else {
              setStepInternal("signIn");
              localStorage.removeItem(LOGIN_STATE_KEY);
            }
          } catch (error) {
            logger.error("Failed to sync login state across tabs", {
              function: "useLoginState.storageSync",
              error: error instanceof Error ? error : new Error(String(error)),
            });
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const setStep = useCallback((newStep: "signIn" | { email: string }) => {
    setStepInternal(newStep);

    if (newStep === "signIn") {
      localStorage.removeItem(LOGIN_STATE_KEY);
      logger.debug("Cleared login state", { function: "useLoginState.setStep" });
    } else {
      const state: LoginState = {
        step: "verify",
        email: newStep.email,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(LOGIN_STATE_KEY, JSON.stringify(state));
        logger.debug("Saved login state", {
          function: "useLoginState.setStep",
          email: newStep.email,
        });
      } catch (error) {
        // Handle localStorage quota exceeded or disabled
        logger.error("Failed to save login state", {
          function: "useLoginState.setStep",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }, []);

  const clearState = useCallback(() => {
    localStorage.removeItem(LOGIN_STATE_KEY);
    setStepInternal("signIn");
    logger.debug("Login state cleared", { function: "useLoginState.clearState" });
  }, []);

  // Check for expiration periodically
  useEffect(() => {
    const checkExpiration = () => {
      const stored = localStorage.getItem(LOGIN_STATE_KEY);
      if (stored) {
        try {
          const state: LoginState = JSON.parse(stored);
          const isExpired = Date.now() - state.timestamp > STATE_EXPIRY_MINUTES * 60 * 1000;

          if (isExpired) {
            logger.info("Login state expired during session", {
              function: "useLoginState.checkExpiration",
            });
            clearState();
          }
        } catch (error) {
          // Ignore parse errors, will be handled elsewhere
        }
      }
    };

    // Check every minute
    const interval = setInterval(checkExpiration, 60000);
    return () => clearInterval(interval);
  }, [clearState]);

  return { step, setStep, clearState };
}