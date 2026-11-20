import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement, les requêtes vers le serveur FastAPI (uvicorn server.app:app, port 8000)
// passent par le proxy de Vite : /files (fichiers du contrat), /runs (API), /ws (WebSocket).
const API = process.env.F1RL_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/files": API,
      "/runs": API,
      "/tracks": API,
      "/ws": { target: API.replace(/^http/, "ws"), ws: true },
    },
  },
  test: { environment: "node" },
});
