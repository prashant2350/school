# VidyaDesk frontend (React + TypeScript + Vite)

Fully connected to the backend. See the top-level `README.md`.

- `npm install` then `npm run build` → `dist/` is served by the backend at http://127.0.0.1:8000
- `npm run dev` → hot-reload dev server on http://localhost:5173 (talks to http://127.0.0.1:8000/api/v1)
- Different server address: copy `.env.local.example` to `.env.local` and set `VITE_API_BASE_URL`, then rebuild.
