// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Password Manager contributors
/**
 * QR Scanner Dialog
 *
 * Scan QR codes containing otpauth:// URIs for TOTP setup.
 * Uses native BarcodeDetector API for camera scanning with
 * manual URI entry and image upload as fallbacks.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Camera,
  Keyboard,
  ShieldCheck,
  AlertCircle,
  Upload,
} from "lucide-react";
import {
  parseOTPAuthToFields,
  type OTPAuthURI,
} from "@/services/totp-engine";

interface QRScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (parsed: OTPAuthURI) => void;
}

function hasBarcodeDetector(): boolean {
  return "BarcodeDetector" in window;
}

export function QRScannerDialog({
  open,
  onOpenChange,
  onResult,
}: QRScannerDialogProps) {
  const { t } = useTranslation(["common", "vault"]);
  const [tab, setTab] = useState<"scan" | "manual">("scan");
  const [manualURI, setManualURI] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleResult = useCallback(
    (uri: string) => {
      try {
        const parsed = parseOTPAuthToFields(uri.trim());
        setError(null);
        stopCamera();
        onResult(parsed);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("vault:qrScanner.invalidUri", "Invalid otpauth:// URI"),
        );
      }
    },
    [onResult, stopCamera],
  );

  const startCamera = useCallback(async () => {
    if (!hasBarcodeDetector()) {
      setError(
        t(
          "totp.noBarcodeDetector",
          "Camera scanning is not supported in this browser. Please enter the URI manually.",
        ),
      );
      return;
    }

    setError(null);
    setScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

       
      const detector = new (window as any).BarcodeDetector({
        formats: ["qr_code"],
      });

      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          for (const barcode of barcodes) {
            if (barcode.rawValue?.startsWith("otpauth://")) {
              handleResult(barcode.rawValue);
              return;
            }
          }
        } catch {
          // Detection can fail on some frames, continue
        }
        animFrameRef.current = requestAnimationFrame(scan);
      };

      animFrameRef.current = requestAnimationFrame(scan);
    } catch (err) {
      setScanning(false);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          t(
            "totp.cameraPermissionDenied",
            "Camera permission denied. Please allow camera access or enter the URI manually.",
          ),
        );
      } else {
        setError(
          t(
            "totp.cameraError",
            "Could not access camera. Please enter the URI manually.",
          ),
        );
      }
    }
  }, [handleResult, t]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);

      if (!hasBarcodeDetector()) {
        setError(
          t(
            "totp.noBarcodeDetector",
            "QR code detection is not supported in this browser. Please enter the URI manually.",
          ),
        );
        return;
      }

      try {
        const bitmap = await createImageBitmap(file);
         
        const detector = new (window as any).BarcodeDetector({
          formats: ["qr_code"],
        });
        const barcodes = await detector.detect(bitmap);
         
        const match = barcodes.find((b: any) =>
          b.rawValue?.startsWith("otpauth://"),
        );

        if (match) {
          handleResult(match.rawValue);
        } else {
          setError(
            t(
              "totp.noQRFound",
              "No valid otpauth:// QR code found in image.",
            ),
          );
        }
      } catch {
        setError(
          t("totp.imageReadError", "Could not read QR code from image."),
        );
      }

      e.target.value = "";
    },
    [handleResult, t],
  );

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setManualURI("");
      setError(null);
      setTab("scan");
    }
  }, [open, stopCamera]);

  // Stop camera when switching to manual tab
  useEffect(() => {
    if (tab !== "scan") stopCamera();
  }, [tab, stopCamera]);

  const handleManualSubmit = useCallback(() => {
    if (!manualURI.trim()) return;
    handleResult(manualURI);
  }, [manualURI, handleResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("totp.addAuthenticator", "Add Authenticator")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "totp.scanDescription",
              "Scan a QR code or enter an otpauth:// URI to add a TOTP account.",
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "scan" | "manual")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scan" className="gap-1.5">
              <Camera className="h-4 w-4" />
              {t("totp.scanQR", "Scan QR")}
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5">
              <Keyboard className="h-4 w-4" />
              {t("totp.enterManually", "Manual")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="flex flex-col gap-4 mt-4">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted">
              {scanning ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                  <Camera className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "totp.cameraPrompt",
                      "Point your camera at a QR code",
                    )}
                  </p>
                  <Button variant="outline" size="sm" onClick={startCamera}>
                    {t("totp.startCamera", "Start Camera")}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Label
                htmlFor="qr-file-upload"
                className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                <Upload className="h-4 w-4" />
                {t("totp.uploadImage", "Upload QR image")}
              </Label>
              <input
                id="qr-file-upload"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileUpload}
              />
            </div>
          </TabsContent>

          <TabsContent value="manual" className="flex flex-col gap-4 mt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="manual-uri">
                {t("totp.otpauthURI", "otpauth:// URI")}
              </Label>
              <Input
                id="manual-uri"
                value={manualURI}
                onChange={(e) => {
                  setManualURI(e.target.value);
                  setError(null);
                }}
                placeholder="otpauth://totp/Example:user@example.com?secret=..."
                autoComplete="off"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleManualSubmit();
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "totp.manualHint",
                  "Paste the full otpauth:// URI from your authenticator setup page.",
                )}
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          {tab === "manual" && (
            <Button
              onClick={handleManualSubmit}
              disabled={!manualURI.trim()}
            >
              {t("totp.addAccount", "Add Account")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
