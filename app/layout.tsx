import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Lead Tracker",
  description: "Track your leads and opportunities",
  icons: {
    icon: "/Lead Tracker.png",
    apple: "/Lead Tracker.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

import PwaInstallPrompt from "@/components/PwaInstallPrompt";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <PwaInstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
