import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const localEnv = new URL("../../.env", import.meta.url);
const localConfig = existsSync(localEnv)
  ? parseEnv(readFileSync(localEnv, "utf8"))
  : {};
const origin =
  process.env.API_INTERNAL_URL ||
  localConfig.API_INTERNAL_URL ||
  "http://127.0.0.1:3333";
const url = new URL(origin);
if (
  !["http:", "https:"].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
) {
  throw new Error(
    "API_INTERNAL_URL deve ser uma origem HTTP válida sem credenciais.",
  );
}
/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${url.origin}/api/v1/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
