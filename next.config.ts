import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge sits exactly where the bottom navigation is in a phone-width
  // viewport, which makes the layout impossible to check honestly.
  devIndicators: false,
};

export default nextConfig;
