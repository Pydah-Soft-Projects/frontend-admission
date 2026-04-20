import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const pwaConfig = withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    importScripts: ["/custom-sw.js"], // Import the existing logic
  },
});

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ensure service worker is properly served
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      // {
      //   source: '/:path*',
      //   headers: [
      //     {
      //       key: 'Content-Security-Policy',
      //       value: "frame-ancestors 'self' https://pydah.edu.in https://*.pydah.edu.in https://admissions.pydah.edu.in https://*.wix.com https://*.wixsite.com https://*.filesusr.com https://*.wix-code.com https://*.wixapps.net;",
      //     },
      //   ],
      // },
    ];
  },
};

export default pwaConfig(nextConfig);
