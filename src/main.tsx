import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { clearAllAppCache } from "./utils/batchCache";

const APP_CACHE_EPOCH_KEY = "frameforge_cache_epoch";
const CURRENT_CACHE_EPOCH = "2026-11-24-clean-v1";

async function bootstrap() {
  try {
    if (localStorage.getItem(APP_CACHE_EPOCH_KEY) !== CURRENT_CACHE_EPOCH) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sceneroll_")) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      await clearAllAppCache().catch(() => undefined);
      localStorage.setItem(APP_CACHE_EPOCH_KEY, CURRENT_CACHE_EPOCH);
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
