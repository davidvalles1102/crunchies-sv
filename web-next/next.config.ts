import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin esto, el dev server rechaza el websocket de HMR para requests que
  // vienen de un origin distinto a localhost (ej. el tunel de Cloudflare) —
  // eso deja el bundle de Turbopack esperando la conexion y la pagina nunca
  // termina de hidratar (se ve el HTML pero los useEffect nunca corren).
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
