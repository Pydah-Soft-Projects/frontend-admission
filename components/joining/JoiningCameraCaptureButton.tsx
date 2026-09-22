'use client';

import {
  canvasToJpegFile,
  preloadPortraitSegmenter,
  processPortraitBackground,
  verifyPortraitGuidelines,
  type PortraitBackgroundMode,
  type Segmentation,
} from '@/lib/portraitPhotoBackground';
import { SwitchCamera } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { JoiningPhotoGuidelinesOverlay } from '@/components/joining/JoiningPhotoGuidelinesOverlay';

export type JoiningCameraFacing = 'user' | 'environment';

const FACING_STORAGE_KEY = 'joining-registration-camera-facing';

function readStoredFacing(): JoiningCameraFacing | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.sessionStorage.getItem(FACING_STORAGE_KEY);
    return v === 'user' || v === 'environment' ? v : null;
  } catch {
    return null;
  }
}

function writeStoredFacing(face: JoiningCameraFacing) {
  try {
    window.sessionStorage.setItem(FACING_STORAGE_KEY, face);
  } catch {
    /* ignore quota / private mode */
  }
}

type CameraDeviceMap = Partial<Record<JoiningCameraFacing, string>>;

function classifyVideoDevice(label: string): JoiningCameraFacing | null {
  const l = label.toLowerCase();
  if (/front|user|selfie|facetime|true.?depth/i.test(l)) return 'user';
  if (/back|rear|environment|wide|telephoto/i.test(l)) return 'environment';
  return null;
}

/** Phones/tablets: facingMode is reliable; exact deviceId often fails when flipping cameras. */
function prefersFacingModeConstraints(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const touch = navigator.maxTouchPoints > 1;
  const ua = /android|ipad|iphone|ipod|mobile|tablet/i.test(navigator.userAgent);
  return coarse || touch || ua;
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}



function isCameraBusyError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('notreadable') ||
    msg.includes('could not start video') ||
    msg.includes('failed to load') ||
    msg.includes('video source') ||
    msg.includes('video frame') ||
    msg.includes('abort') ||
    msg.includes('in use')
  );
}

type Props = {
  /** Fallback when no saved preference exists (front = user, rear = environment). */
  facing?: JoiningCameraFacing;
  /** Allow switching front/rear while the capture dialog is open. Default true. */
  allowFacingSwitch?: boolean;
  /** Primary action styling (matches previous “Take photo” label). */
  buttonClassName: string;
  children: ReactNode;
  disabled?: boolean;
  /** Shown as the trigger control's accessible name. */
  'aria-label'?: string;
  /** JPEG from live camera after the user taps “Use photo”. */
  onCapture: (file: File) => void;
  /** Replace room background with white, or blur it. Default: white (passport-style). */
  portraitBackground?: PortraitBackgroundMode;
};

/**
 * Opens the device camera with **getUserMedia** — more reliable than
 * `<input type="file" capture>` which often shows only the gallery/file picker on Chrome/Android and desktop.
 */
export function JoiningCameraCaptureButton({
  facing = 'user',
  allowFacingSwitch = true,
  buttonClassName,
  children,
  disabled,
  'aria-label': ariaLabel,
  onCapture,
  portraitBackground = 'white',
}: Props) {
  const dialogTitleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [processingCapture, setProcessingCapture] = useState(false);
  const [activeFacing, setActiveFacing] = useState<JoiningCameraFacing>(facing);
  const [switchingFacing, setSwitchingFacing] = useState(false);
  const [isValidGuideline, setIsValidGuideline] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const deviceMapRef = useRef<CameraDeviceMap>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (portraitBackground !== 'none') {
      preloadPortraitSegmenter();
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, portraitBackground]);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        t.stop();
        try {
          stream.removeTrack(t);
        } catch {
          /* track may already be removed */
        }
      });
    }
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
      // Reset element state — helps Chrome/Android release the camera before re-open.
      try {
        v.load();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const attachStreamToVideo = useCallback(async (): Promise<boolean> => {
    const stream = streamRef.current;
    const el = videoRef.current;
    if (!stream || !el) return false;
    el.srcObject = stream;
    try {
      await el.play();
    } catch {
      /* autoplay policies — loadedmetadata may still fire */
    }
    if (el.videoWidth >= 2 && el.videoHeight >= 2) return true;
    return new Promise<boolean>((resolve) => {
      const done = () => {
        el.removeEventListener('loadedmetadata', done);
        el.removeEventListener('loadeddata', done);
        resolve(el.videoWidth >= 2 && el.videoHeight >= 2);
      };
      el.addEventListener('loadedmetadata', done);
      el.addEventListener('loadeddata', done);
      window.setTimeout(() => {
        el.removeEventListener('loadedmetadata', done);
        el.removeEventListener('loadeddata', done);
        resolve(el.videoWidth >= 2 && el.videoHeight >= 2);
      }, 4000);
    });
  }, []);

  useEffect(() => {
    if (!open || !streamRef.current) return;
    void attachStreamToVideo();
  }, [open, activeFacing, attachStreamToVideo]);

  const refreshDeviceMap = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices.filter((d) => d.kind === 'videoinput');
      const map: CameraDeviceMap = {};
      for (const d of videos) {
        const kind = classifyVideoDevice(d.label);
        if (kind && d.deviceId) map[kind] = d.deviceId;
      }
      if (!map.user && videos[0]?.deviceId) map.user = videos[0].deviceId;
      if (!map.environment && videos.length > 1) {
        map.environment = videos[videos.length - 1]?.deviceId;
      } else if (!map.environment && videos[0]?.deviceId) {
        map.environment = videos[0].deviceId;
      }
      deviceMapRef.current = map;
    } catch {
      /* keep previous map */
    }
  }, []);

  const constraintAttemptsForFacing = useCallback((face: JoiningCameraFacing): MediaTrackConstraints[] => {
    const size = { width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 } };
    const facingOnly =
      face === 'user'
        ? { facingMode: 'user' as const, ...size }
        : { facingMode: { ideal: 'environment' as const }, ...size };
    const facingMinimal =
      face === 'user' ? { facingMode: 'user' as const } : { facingMode: { ideal: 'environment' as const } };

    if (prefersFacingModeConstraints()) {
      return [facingOnly, facingMinimal];
    }

    const deviceId = deviceMapRef.current[face];
    if (deviceId) {
      return [
        { deviceId: { ideal: deviceId }, ...size },
        { deviceId: { exact: deviceId }, ...size },
        facingOnly,
        facingMinimal,
      ];
    }
    return [facingOnly, facingMinimal];
  }, []);

  const openCameraStream = useCallback(
    async (face: JoiningCameraFacing) => {
      if (typeof window === 'undefined') return false;
      if (!window.isSecureContext) {
        setErr('Camera needs a secure page (HTTPS). Use Upload to pick a file, or open this site over HTTPS.');
        return false;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('This browser does not support live camera. Use Upload to pick a photo.');
        return false;
      }

      stopStream();
      if (prefersFacingModeConstraints()) {
        await waitMs(250);
      }

      const attempts = constraintAttemptsForFacing(face);
      let lastErr: unknown = null;

      for (let i = 0; i < attempts.length; i++) {
        const constraints = attempts[i]!;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
          streamRef.current = stream;
          setActiveFacing(face);
          writeStoredFacing(face);
          const framesReady = await attachStreamToVideo();
          // Dialog video mounts only after setOpen(true) on first launch — skip frame check until then.
          if (!framesReady && videoRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            lastErr = new Error('Camera opened but video frames did not load. Try again or use Upload.');
            if (prefersFacingModeConstraints() && i < attempts.length - 1) {
              await waitMs(200);
              continue;
            }
            throw lastErr;
          }
          await refreshDeviceMap();
          return true;
        } catch (e: unknown) {
          lastErr = e;
          stopStream();
          const canRetry = i < attempts.length - 1 && (isCameraBusyError(e) || prefersFacingModeConstraints());
          if (canRetry) {
            await waitMs(isCameraBusyError(e) ? 350 : 150);
            continue;
          }
        }
      }

      throw lastErr ?? new Error('Could not open camera');
    },
    [attachStreamToVideo, constraintAttemptsForFacing, refreshDeviceMap, stopStream]
  );

  const resolveInitialFacing = useCallback((): JoiningCameraFacing => {
    return readStoredFacing() ?? facing;
  }, [facing]);

  const startCamera = useCallback(async () => {
    setIsValidGuideline(null);
    setErr(null);
    const initial = resolveInitialFacing();
    setActiveFacing(initial);
    try {
      const ok = await openCameraStream(initial);
      if (ok) {
        setIsValidGuideline(null);
        setErr(null);
        setOpen(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(
        msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')
          ? 'Camera permission was denied. Allow camera for this site or use Upload.'
          : isCameraBusyError(e)
            ? 'Camera is busy — wait a moment, try again, or use Upload.'
            : `Could not open camera (${msg}). Use Upload instead.`
      );
    }
  }, [openCameraStream, resolveInitialFacing]);

  const selectFacing = useCallback(
    async (next: JoiningCameraFacing) => {
      if (!allowFacingSwitch || !open || switchingFacing || next === activeFacing) return;
      setSwitchingFacing(true);
      setErr(null);
      try {
        await openCameraStream(next);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(
          isCameraBusyError(e)
            ? 'Could not switch camera — the previous camera may still be releasing. Wait a moment and try again, or use Upload.'
            : `Could not switch camera (${msg}). Try the other camera or use Upload.`
        );
      } finally {
        setSwitchingFacing(false);
      }
    },
    [activeFacing, allowFacingSwitch, open, openCameraStream, switchingFacing]
  );

  const toggleFacing = useCallback(async () => {
    const next: JoiningCameraFacing = activeFacing === 'user' ? 'environment' : 'user';
    await selectFacing(next);
  }, [activeFacing, selectFacing]);

  const close = useCallback(() => {
    stopStream();
    setProcessingCapture(false);
    setIsValidGuideline(null);
    setErr(null);
    setOpen(false);
  }, [stopStream]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open || !streamRef.current) return;
    const reattach = () => void attachStreamToVideo();
    window.addEventListener('orientationchange', reattach);
    const mq = window.matchMedia('(orientation: portrait)');
    const onOrientMq = () => void attachStreamToVideo();
    mq.addEventListener?.('change', onOrientMq);
    return () => {
      window.removeEventListener('orientationchange', reattach);
      mq.removeEventListener?.('change', onOrientMq);
    };
  }, [open, attachStreamToVideo, activeFacing]);

  // Always reset guideline match state to clean fresh state whenever camera opens or closes
  useEffect(() => {
    if (open) {
      setIsValidGuideline(null);
      setErr(null);
    }
  }, [open]);

  const confirmCaptureRef = useRef<(() => Promise<void>) | null>(null);

  // Live real-time dynamic guideline check loop with requestAnimationFrame & auto-capture hold
  useEffect(() => {
    if (!open) {
      setIsValidGuideline(null);
      return;
    }

    let active = true;
    let isChecking = false;
    let animId: number | null = null;
    let lastCheckTime = 0;
    let matchStartTime: number | null = null;
    let isAutoCapturing = false;

    const checkFrame = async (timestamp: number) => {
      if (!active) return;

      if (!isChecking && !processingCapture && !isAutoCapturing && timestamp - lastCheckTime >= 80) {
        lastCheckTime = timestamp;
        const video = videoRef.current;
        if (video && !video.paused && !video.ended && video.videoWidth >= 2 && video.videoHeight >= 2) {
          isChecking = true;
          try {
            const w = video.videoWidth;
            const h = video.videoHeight;
            const side = Math.min(w, h);
            const sx = Math.floor((w - side) / 2);
            const sy = Math.floor((h - side) / 2);

            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, sx, sy, side, side, 0, 0, 256, 256);
              const check = await verifyPortraitGuidelines(canvas);
              if (active) {
                setIsValidGuideline(check.isValid);
                setErr(check.reason);

                if (check.isValid) {
                  const now = Date.now();
                  if (matchStartTime === null) {
                    matchStartTime = now;
                  } else if (now - matchStartTime >= 350 && !isAutoCapturing && confirmCaptureRef.current) {
                    isAutoCapturing = true;
                    setErr('Perfect — Capturing...');
                    void confirmCaptureRef.current();
                  }
                } else {
                  matchStartTime = null;
                }
              }
            }
          } catch {
            /* ignore frame errors */
          } finally {
            isChecking = false;
          }
        }
      }

      if (active && !isAutoCapturing) {
        animId = window.requestAnimationFrame((ts) => void checkFrame(ts));
      }
    };

    animId = window.requestAnimationFrame((ts) => void checkFrame(ts));

    return () => {
      active = false;
      if (animId !== null) {
        window.cancelAnimationFrame(animId);
      }
    };
  }, [open, processingCapture]);

  const confirmCapture = useCallback(async () => {
    if (processingCapture) return;
    const video = videoRef.current;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) {
      setErr('Video is not ready yet. Wait for the preview, or switch camera again.');
      return;
    }

    setProcessingCapture(true);
    setErr(null);

    let canvas: HTMLCanvasElement | null = null;
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const side = Math.min(w, h);
      const sx = Math.floor((w - side) / 2);
      const sy = Math.floor((h - side) / 2);
      canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);

      // ALWAYS verify exact current frame on capture (NO STALE CACHING)
      const check = await verifyPortraitGuidelines(canvas);

      if (!check.isValid) {
        setIsValidGuideline(false);
        setErr(check.reason);
        setProcessingCapture(false);
        return; // Reject photo instantly if current frame does not match guidelines!
      }

      setIsValidGuideline(true);
      let outputCanvas = canvas;
      if (portraitBackground !== 'none') {
        outputCanvas = await processPortraitBackground(canvas, portraitBackground, false, check.segmentations);
      }
      const file = await canvasToJpegFile(outputCanvas);
      if (!file) {
        setErr('Could not save photo. Try again or use Upload.');
        return;
      }
      close();
      onCapture(file);
    } catch {
      const fallbackFile = canvas ? await canvasToJpegFile(canvas) : null;
      if (fallbackFile) {
        close();
        onCapture(fallbackFile);
        setErr('Background could not be cleaned — saved the original photo.');
      } else {
        setErr('Could not process photo. Try again or use Upload.');
      }
    } finally {
      setProcessingCapture(false);
    }
  }, [close, onCapture, portraitBackground, processingCapture]);

  useEffect(() => {
    confirmCaptureRef.current = confirmCapture;
  }, [confirmCapture]);

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-label={ariaLabel}
        onMouseEnter={() => preloadPortraitSegmenter()}
        onFocus={() => preloadPortraitSegmenter()}
        onClick={() => void startCamera()}
      >
        {children}
      </button>
      {err ? <p className="mt-1 text-center text-[10px] text-amber-700 dark:text-amber-300">{err}</p> : null}

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[240] box-border flex min-h-0 w-full items-center justify-center overflow-x-hidden overflow-y-auto overscroll-contain bg-black/75 sm:p-6"
              style={{
                minHeight: '100dvh',
                padding:
                  'max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right)) max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left))',
              }}
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) close();
              }}
              onTouchStart={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                className="relative my-auto flex w-full max-h-[min(100dvh-2rem,42rem)] max-w-[min(100%,28rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900 sm:max-w-lg"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 border-b border-slate-200 px-3 py-3 sm:px-4 dark:border-slate-700">
                  <h2 id={dialogTitleId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Take photo
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Choose <span className="font-medium">Front</span> or <span className="font-medium">Rear</span>, align your
                    face in the square guide, then tap <span className="font-medium">Use photo</span>. The room background is
                    automatically replaced with a plain white background.
                  </p>
                  {allowFacingSwitch ? (
                    <div
                      className="mt-3 inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-600 dark:bg-slate-800"
                      role="group"
                      aria-label="Camera selection"
                    >
                      <button
                        type="button"
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          activeFacing === 'user'
                            ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        }`}
                        aria-pressed={activeFacing === 'user'}
                        disabled={switchingFacing}
                        onClick={() => void selectFacing('user')}
                      >
                        Front camera
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          activeFacing === 'environment'
                            ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        }`}
                        aria-pressed={activeFacing === 'environment'}
                        disabled={switchingFacing}
                        onClick={() => void selectFacing('environment')}
                      >
                        Rear camera
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black p-2 sm:p-3">
                  <div className="relative mx-auto aspect-square w-full max-h-[min(48dvh,20rem)] max-w-[min(100%,20rem)] overflow-hidden rounded-lg sm:max-h-[min(56dvh,24rem)] sm:max-w-[min(100%,24rem)]">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <JoiningPhotoGuidelinesOverlay
                      instructionText={err || 'Align head in oval & shoulders in lower guide zone'}
                      showHdBadge={true}
                      variant="camera"
                      isValidGuideline={isValidGuideline}
                    />
                    {allowFacingSwitch ? (
                      <button
                        type="button"
                        className="absolute bottom-3 right-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/80 disabled:cursor-not-allowed disabled:opacity-50 sm:bottom-4 sm:right-4"
                      aria-label={
                        activeFacing === 'user' ? 'Switch to rear camera' : 'Switch to front camera'
                      }
                      title={activeFacing === 'user' ? 'Rear camera' : 'Front camera'}
                      disabled={switchingFacing}
                      onClick={() => void toggleFacing()}
                    >
                        <SwitchCamera className="h-5 w-5" aria-hidden />
                        <span className="sr-only">Flip camera</span>
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-3 py-3 sm:flex-row sm:justify-end sm:px-4 dark:border-slate-700">
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
                    disabled={processingCapture}
                    onClick={close}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    disabled={processingCapture}
                    onClick={() => void confirmCapture()}
                  >
                    {processingCapture ? 'Processing…' : 'Use photo'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
