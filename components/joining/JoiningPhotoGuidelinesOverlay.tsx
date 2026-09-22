'use client';

import React from 'react';

type Props = {
  /** Label for custom guidance message, default: "Align head in oval & shoulders in bottom zone" */
  instructionText?: string;
  /** Show 1:1 HD badge indicator at top */
  showHdBadge?: boolean;
  /** Custom overlay opacity/theme variant */
  variant?: 'camera' | 'cropper';
  /** Live guideline matching state */
  isValidGuideline?: boolean | null;
};

/**
 * Head and Shoulder Placement Guideline Overlay for 1:1 ratio photo capture & uploads.
 * Displays crisp head outline, eye-level indicator line, shoulder zone arches, and alignment status.
 */
export function JoiningPhotoGuidelinesOverlay({
  instructionText = 'Align head in oval & shoulders in lower zone',
  showHdBadge = true,
  variant = 'camera',
  isValidGuideline = null,
}: Props) {
  const isMatched = isValidGuideline === true;
  const isFailed = isValidGuideline === false;

  const strokeMain = isMatched
    ? 'rgba(52, 211, 153, 0.95)'
    : isFailed
    ? 'rgba(251, 146, 60, 0.95)'
    : 'rgba(255, 255, 255, 0.95)';

  const strokeGuide = isMatched
    ? 'rgba(16, 185, 129, 0.9)'
    : isFailed
    ? 'rgba(249, 115, 22, 0.85)'
    : 'rgba(59, 130, 246, 0.85)';

  const strokeSoft = isMatched
    ? 'rgba(167, 243, 208, 0.7)'
    : isFailed
    ? 'rgba(253, 186, 116, 0.7)'
    : 'rgba(255, 255, 255, 0.6)';

  const fillSubtle = isMatched
    ? 'rgba(16, 185, 129, 0.12)'
    : isFailed
    ? 'rgba(249, 115, 22, 0.08)'
    : 'rgba(59, 130, 246, 0.08)';

  // Helper for corner framing brackets
  const corner = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => (
    <path
      d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`}
      stroke={strokeMain}
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 select-none overflow-hidden transition-colors duration-300 ${
        isFailed
          ? 'ring-4 ring-inset ring-amber-500/60'
          : isMatched
          ? 'ring-4 ring-inset ring-emerald-400/70'
          : ''
      }`}
      aria-hidden
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="guideGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1:1 Outer Corner Brackets */}
        {corner(6, 16, 6, 6, 16, 6)}
        {corner(94, 16, 94, 6, 84, 6)}
        {corner(6, 84, 6, 94, 16, 94)}
        {corner(94, 84, 94, 94, 84, 94)}

        {/* Center Vertical Axis Line */}
        <line x1="50" y1="8" x2="50" y2="92" stroke={strokeSoft} strokeWidth="0.5" strokeDasharray="2 3" />

        {/* --- HEAD GUIDELINES --- */}
        {/* Head Alignment Oval */}
        <ellipse
          cx="50"
          cy="40"
          rx="20"
          ry="24"
          stroke={strokeMain}
          strokeWidth="1.8"
          strokeDasharray="4 3"
          filter="url(#guideGlow)"
        />

        {/* Eye Level Line */}
        <line
          x1="26"
          y1="37"
          x2="74"
          y2="37"
          stroke={strokeGuide}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <text
          x="75"
          y="36.5"
          fill={isMatched ? '#a7f3d0' : isFailed ? '#fdba74' : 'rgba(147, 197, 253, 0.95)'}
          fontSize="2.4"
          fontWeight="600"
          fontFamily="sans-serif"
        >
          EYE LEVEL
        </text>

        {/* Eye Position Reference Dots */}
        <circle cx="42" cy="37" r="1.3" fill={strokeSoft} />
        <circle cx="58" cy="37" r="1.3" fill={strokeSoft} />

        {/* Nose & Mouth Guide */}
        <path d="M 50 42 L 50 46" stroke={strokeSoft} strokeWidth="1" strokeLinecap="round" />
        <path d="M 46 49 Q 50 52 54 49" stroke={strokeSoft} strokeWidth="1" strokeLinecap="round" />

        {/* Neck Lines */}
        <path d="M 42 62 L 42 67" stroke={strokeSoft} strokeWidth="1.2" strokeDasharray="2 2" />
        <path d="M 58 62 L 58 67" stroke={strokeSoft} strokeWidth="1.2" strokeDasharray="2 2" />

        {/* --- SHOULDER GUIDELINES --- */}
        {/* Left & Right Shoulder Arches */}
        <path
          d="M 12 88 C 22 75, 34 68, 42 67 M 58 67 C 66 68, 78 75, 88 88"
          stroke={strokeGuide}
          strokeWidth="1.8"
          strokeDasharray="4 3"
          strokeLinecap="round"
          filter="url(#guideGlow)"
        />
        {/* Shoulder Zone Fill Hint */}
        <path
          d="M 12 94 C 22 79, 34 70, 42 67 L 58 67 C 66 70, 78 79, 88 94 L 88 98 L 12 98 Z"
          fill={fillSubtle}
        />
        <text
          x="50"
          y="83"
          textAnchor="middle"
          fill={isMatched ? '#a7f3d0' : isFailed ? '#fdba74' : 'rgba(147, 197, 253, 0.9)'}
          fontSize="2.6"
          fontWeight="600"
          fontFamily="sans-serif"
          letterSpacing="0.4"
        >
          SHOULDER PLACEMENT ZONE
        </text>
      </svg>

      {/* Top Badges */}
      {showHdBadge ? (
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 shadow-md backdrop-blur-md border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            1:1 HD Ratio
          </span>
          {isMatched ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 shadow-md backdrop-blur-md border border-emerald-500/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Guidelines Matched ✓
            </span>
          ) : isFailed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/90 px-2.5 py-1 text-[10px] font-semibold text-amber-300 shadow-md backdrop-blur-md border border-amber-500/50">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Adjust Position ⚠
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-medium text-blue-200 shadow-md backdrop-blur-md border border-blue-400/30">
              Guidelines Active
            </span>
          )}
        </div>
      ) : null}

      {/* Bottom Instruction Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-center pointer-events-none">
        <div
          className={`rounded-lg px-3.5 py-1.5 text-center shadow-lg backdrop-blur-md border transition-all duration-200 ${
            isMatched
              ? 'bg-emerald-950/90 border-emerald-400/60 text-emerald-100 scale-105'
              : isFailed
              ? 'bg-amber-950/90 border-amber-400/50 text-amber-100'
              : 'bg-slate-900/85 border-white/20 text-white'
          }`}
        >
          <p className="text-[11px] font-semibold tracking-wide drop-shadow-sm">
            {instructionText}
          </p>
        </div>
      </div>
    </div>
  );
}
