'use client';

import dynamic from 'next/dynamic';

const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((m) => m.DotLottieReact),
  { ssr: false }
);

const LOTTIE_URL =
  'https://lottie.host/ec3df1b8-0da2-46f7-a7f0-37c05e5013ae/2NwoBicIt7.lottie';

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
