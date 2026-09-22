'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, ZoomOut, RotateCw, RefreshCw, Check, X, Sparkles, Image as ImageIcon } from 'lucide-react';
import { JoiningPhotoGuidelinesOverlay } from '@/components/joining/JoiningPhotoGuidelinesOverlay';
import { verifyPortraitGuidelines } from '@/lib/portraitPhotoBackground';

type Props = {
  /** Raw File selected by user via upload/gallery */
  file: File | null;
  /** Modal open state */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Callback when 1:1 HD cropped image is ready */
  onCropComplete: (croppedFile: File) => void;
  /** Label for title e.g. "Student photo" */
  label?: string;
};

/**
 * Interactive 1:1 Ratio Crop & Head/Shoulder Guideline Modal.
 * Ensures uploaded photos strictly maintain a 1:1 square aspect ratio and HD resolution,
 * while giving real-time head and shoulder placement guidelines.
 */
export function JoiningImageCropModal({
  file,
  open,
  onClose,
  onCropComplete,
  label = 'Student photo',
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  // Pan, Zoom, Rotate state
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isValidGuideline, setIsValidGuideline] = useState<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load File to Data URL when file changes
  useEffect(() => {
    if (!file) {
      setImageSrc(null);
      setImageSize(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      setImageSrc(src);
      // Reset transformations
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setErr(null);
    };
    reader.readAsDataURL(file);
  }, [file]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  // Drag handling
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    offsetStartRef.current = { ...offset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: offsetStartRef.current.x + dx,
      y: offsetStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag support for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0]!;
    setIsDragging(true);
    dragStartRef.current = { x: touch.clientX, y: touch.clientY };
    offsetStartRef.current = { ...offset };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0]!;
    const dx = touch.clientX - dragStartRef.current.x;
    const dy = touch.clientY - dragStartRef.current.y;
    setOffset({
      x: offsetStartRef.current.x + dx,
      y: offsetStartRef.current.y + dy,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  // Live real-time dynamic guideline check loop on cropper transform
  useEffect(() => {
    if (!open || !imageSrc || !file) {
      setIsValidGuideline(null);
      return;
    }

    let active = true;
    const checkCropTransform = async () => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Preview load error'));
          img.src = imageSrc;
        });

        const targetSide = 256;
        const canvas = document.createElement('canvas');
        canvas.width = targetSide;
        canvas.height = targetSide;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetSide, targetSide);

        ctx.save();
        ctx.translate(targetSide / 2, targetSide / 2);
        ctx.rotate((rotation * Math.PI) / 180);

        const viewportSize = containerRef.current?.getBoundingClientRect().width || 320;
        const scaleFactor = targetSide / viewportSize;

        ctx.translate(offset.x * scaleFactor, offset.y * scaleFactor);
        ctx.scale(zoom, zoom);

        const isRotated = rotation === 90 || rotation === 270;
        const imgW = isRotated ? img.naturalHeight : img.naturalWidth;
        const imgH = isRotated ? img.naturalWidth : img.naturalHeight;

        const coverScale = Math.max(targetSide / imgW, targetSide / imgH);
        const drawWidth = img.naturalWidth * coverScale;
        const drawHeight = img.naturalHeight * coverScale;

        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();

        const check = await verifyPortraitGuidelines(canvas);
        if (active) {
          setIsValidGuideline(check.isValid);
          setErr(check.reason);
        }
      } catch {
        /* ignore preview check errors */
      }
    };

    const timer = window.setTimeout(() => {
      void checkCropTransform();
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, imageSrc, file, zoom, rotation, offset.x, offset.y]);

  // Process 1:1 HD Canvas Crop Export
  const handleApplyCrop = useCallback(async () => {
    if (!imageSrc || !file || processing) return;
    setProcessing(true);
    setErr(null);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for cropping'));
        img.src = imageSrc;
      });

      // Target high resolution: minimum 800x800, up to 1200x1200 for maximum clarity
      const naturalSide = Math.max(img.naturalWidth, img.naturalHeight);
      const targetSide = Math.min(1200, Math.max(800, naturalSide));

      const canvas = document.createElement('canvas');
      canvas.width = targetSide;
      canvas.height = targetSide;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas context unavailable');
      }

      // Smooth render settings for HD output
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Background fill white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetSide, targetSide);

      ctx.save();
      // Move context to center of canvas
      ctx.translate(targetSide / 2, targetSide / 2);

      // Apply rotation
      ctx.rotate((rotation * Math.PI) / 180);

      // Compute display viewport size scaling factor
      const viewportSize = containerRef.current?.getBoundingClientRect().width || 320;
      const scaleFactor = targetSide / viewportSize;

      // Apply offset and zoom
      ctx.translate(offset.x * scaleFactor, offset.y * scaleFactor);
      ctx.scale(zoom, zoom);

      // Calculate initial cover image size on target canvas
      const isRotated = rotation === 90 || rotation === 270;
      const imgW = isRotated ? img.naturalHeight : img.naturalWidth;
      const imgH = isRotated ? img.naturalWidth : img.naturalHeight;

      const coverScale = Math.max(targetSide / imgW, targetSide / imgH);
      const drawWidth = img.naturalWidth * coverScale;
      const drawHeight = img.naturalHeight * coverScale;

      ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();

      // Verify Head & Shoulder guidelines before accepting photo
      const check = await verifyPortraitGuidelines(canvas);
      if (!check.isValid) {
        setIsValidGuideline(false);
        setErr(check.reason);
        setProcessing(false);
        return; // DO NOT accept click if guidelines are not matched!
      }

      setIsValidGuideline(true);

      // Export to Blob / File
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setErr('Failed to export cropped image');
            setProcessing(false);
            return;
          }
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          const croppedFile = new File([blob], `${baseName}_1x1_hd.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          onCropComplete(croppedFile);
          setProcessing(false);
          onClose();
        },
        'image/jpeg',
        0.93 // HD JPEG Compression Quality
      );
    } catch (e) {
      setErr('Error generating cropped photo. Please try again.');
      setProcessing(false);
    }
  }, [file, imageSrc, offset.x, offset.y, onClose, onCropComplete, processing, rotation, zoom]);

  if (!mounted || !open || !file) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="1:1 Photo Crop and Guidelines Modal"
    >
      <div className="relative my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Adjust {label} (1:1 Ratio)</h3>
              <p className="text-[11px] text-slate-400">Position head & shoulders inside the visual guidelines</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Guideline Banner */}
        <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900 px-4 py-2 text-xs border-b border-blue-500/20 text-blue-200 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium text-[11px]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Maintain Head & Shoulder alignment inside guidelines
          </span>
          <span className="text-[10px] font-mono bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-400/30">
            800×800 HD
          </span>
        </div>

        {/* Viewport Area */}
        <div className="relative flex flex-col items-center justify-center bg-slate-950 p-4 sm:p-6 select-none">
          <div
            ref={containerRef}
            className="relative h-64 w-64 sm:h-72 sm:w-72 overflow-hidden rounded-xl border-2 border-blue-500/50 shadow-2xl cursor-grab active:cursor-grabbing bg-slate-900"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Image Canvas Viewport */}
            {imageSrc ? (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                }}
              >
                {/* eslint-disable-next-html-element-suppress */}
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  onLoad={handleImageLoad}
                  className="max-h-full max-w-full object-cover pointer-events-none"
                  style={{ minWidth: '100%', minHeight: '100%' }}
                />
              </div>
            ) : null}

            {/* Visual Guidelines Overlay */}
            <JoiningPhotoGuidelinesOverlay
              instructionText={err || 'Center face in oval & shoulders in lower guide'}
              showHdBadge={true}
              variant="cropper"
              isValidGuideline={isValidGuideline}
            />
          </div>

          <p className="mt-2 text-center text-[10px] text-slate-400">
            Drag to pan image • Use controls below to zoom or rotate
          </p>
        </div>

        {/* Controls Toolbar */}
        <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/90 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Zoom Slider */}
            <div className="flex flex-1 items-center gap-2">
              <ZoomOut className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-blue-500"
                aria-label="Zoom level"
              />
              <ZoomIn className="h-4 w-4 text-slate-400 shrink-0" />
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleRotate}
                title="Rotate 90°"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Rotate</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                title="Reset crop"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          </div>

          {err ? <p className="text-center text-xs text-amber-400">{err}</p> : null}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApplyCrop()}
            disabled={processing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition disabled:opacity-60"
          >
            {processing ? (
              <>Processing 1:1 HD...</>
            ) : (
              <>
                <Check className="h-4 w-4" /> Apply Photo (1:1 HD)
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
