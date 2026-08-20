import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite carga WASM y archivos de datos propios: no debe pasar por el bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        source: "/geo/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
