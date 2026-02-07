'use client';

import dynamic from 'next/dynamic';

const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((m) => m.DotLottieReact),
  { ssr: false }
);

const LOTTIE_URL =
  'https://lottie.host/7ba3d633-f3b3-44b8-be05-b0543d171450/Gy1h1Z4rfG.lottie';

export function LoginLottie({ className }: { className?: string }) {
  return (
    <div className={className}>
      <DotLottieReact
        src={LOTTIE_URL}
        loop
        autoplay
        className="h-full w-full"
      />
    </div>
  );
}
