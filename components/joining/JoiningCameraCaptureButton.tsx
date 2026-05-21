'use client';

import { SwitchCamera } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
}: Props) {
  const dialogTitleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeFacing, setActiveFacing] = useState<JoiningCameraFacing>(facing);
  const [switchingFacing, setSwitchingFacing] = useState(false);
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
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const attachStreamToVideo = useCallback(() => {
    const stream = streamRef.current;
    const el = videoRef.current;
    if (!stream || !el) return;
    el.srcObject = stream;
    void el.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    attachStreamToVideo();
  }, [open, attachStreamToVideo]);

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

  const videoConstraintsForFacing = useCallback((face: JoiningCameraFacing): MediaTrackConstraints => {
    const deviceId = deviceMapRef.current[face];
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (deviceId) {
      return { deviceId: { exact: deviceId }, ...size };
    }
    return face === 'user'
      ? { facingMode: 'user', ...size }
      : { facingMode: { ideal: 'environment' }, ...size };
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

      const tryOpen = async (constraints: MediaTrackConstraints) => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
        stopStream();
        streamRef.current = stream;
        setActiveFacing(face);
        writeStoredFacing(face);
        attachStreamToVideo();
        await refreshDeviceMap();
        return true;
      };

      try {
        return await tryOpen(videoConstraintsForFacing(face));
      } catch (firstErr: unknown) {
        const fallback: MediaTrackConstraints =
          face === 'user'
            ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
        try {
          return await tryOpen(fallback);
        } catch {
          throw firstErr;
        }
      }
    },
    [attachStreamToVideo, refreshDeviceMap, stopStream, videoConstraintsForFacing]
  );

  const resolveInitialFacing = useCallback((): JoiningCameraFacing => {
    return readStoredFacing() ?? facing;
  }, [facing]);

  const startCamera = useCallback(async () => {
    setErr(null);
    const initial = resolveInitialFacing();
    setActiveFacing(initial);
    try {
      const ok = await openCameraStream(initial);
      if (ok) setOpen(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(
        msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')
          ? 'Camera permission was denied. Allow camera for this site or use Upload.'
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
        setErr(`Could not switch camera (${msg}). Try the other camera or use Upload.`);
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

  const confirmCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        close();
        onCapture(file);
      },
      'image/jpeg',
      0.92
    );
  }, [close, onCapture]);

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-label={ariaLabel}
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
                    Choose <span className="font-medium">Front</span> or <span className="font-medium">Rear</span>, position
                    in frame, then tap <span className="font-medium">Use photo</span>.
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
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="mx-auto aspect-video h-auto max-h-[min(48dvh,20rem)] w-full max-w-full rounded-lg object-contain sm:max-h-[min(56dvh,24rem)]"
                  />
                  {allowFacingSwitch ? (
                    <button
                      type="button"
                      className="absolute bottom-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/80 disabled:cursor-not-allowed disabled:opacity-50 sm:bottom-5 sm:right-5"
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
                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-3 py-3 sm:flex-row sm:justify-end sm:px-4 dark:border-slate-700">
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
                    onClick={close}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto"
                    onClick={confirmCapture}
                  >
                    Use photo
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
