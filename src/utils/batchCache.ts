import type { ReferenceImage, SceneItem } from "../types/studio";
import type { ScriptWriterWorkspaceState } from "../types/scriptWriter";
import type { NarrationWorkspaceState } from "../types/narration";
import type { SceneBreakdownWorkspaceState } from "../types/sceneBreakdown";

const DB_NAME = "sceneroll_local_cache_v1";
const DB_VERSION = 5;
const STORE_NAME = "cached_scenes";
const REFERENCE_STORE_NAME = "reference_directory";
const SCRIPT_WRITER_STORE_NAME = "script_writer_state";
const NARRATION_STORE_NAME = "narration_state";
const SCENE_BREAKDOWN_STORE_NAME = "scene_breakdown_state";
const MASTER_REFERENCE_KEY = "master_stickman_character";
const SCRIPT_WORKSPACE_KEY = "workspace_v1";
const NARRATION_WORKSPACE_KEY = "narration_v1";
const SCENE_BREAKDOWN_WORKSPACE_KEY = "scene_breakdown_v1";

export interface CachedSceneRecord {
  sceneNumber: number;
  batchIndex: number;
  prompt: string;
  narration?: string;
  imageDataUrl: string;
  mimeType: string;
  compiledPrompt?: string;
  generatedAt: number;
}

interface StoredReferenceRecord extends ReferenceImage {
  key: string;
  updatedAt: number;
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "sceneNumber",
        });
        store.createIndex("by_batch", "batchIndex", { unique: false });
      }
      if (!db.objectStoreNames.contains(REFERENCE_STORE_NAME)) {
        db.createObjectStore(REFERENCE_STORE_NAME, {
          keyPath: "key",
        });
      }
      if (!db.objectStoreNames.contains(SCRIPT_WRITER_STORE_NAME)) {
        db.createObjectStore(SCRIPT_WRITER_STORE_NAME, {
          keyPath: "key",
        });
      }
      if (!db.objectStoreNames.contains(NARRATION_STORE_NAME)) {
        db.createObjectStore(NARRATION_STORE_NAME, {
          keyPath: "key",
        });
      }
      if (!db.objectStoreNames.contains(SCENE_BREAKDOWN_STORE_NAME)) {
        db.createObjectStore(SCENE_BREAKDOWN_STORE_NAME, {
          keyPath: "key",
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open local cache storage."));
  });
}

export async function saveReferenceDirectoryLocal(
  reference: ReferenceImage
): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REFERENCE_STORE_NAME, "readwrite");
    const store = tx.objectStore(REFERENCE_STORE_NAME);
    const record: StoredReferenceRecord = {
      ...reference,
      key: MASTER_REFERENCE_KEY,
      updatedAt: Date.now(),
    };
    store.put(record);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        tx.error ?? new Error("Failed to save reference directory locally.")
      );
    };
  });
}

export async function loadReferenceDirectoryLocal(): Promise<ReferenceImage | null> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REFERENCE_STORE_NAME, "readonly");
    const store = tx.objectStore(REFERENCE_STORE_NAME);
    const request = store.get(MASTER_REFERENCE_KEY);

    request.onsuccess = () => {
      const rec = request.result as StoredReferenceRecord | undefined;
      db.close();
      if (!rec) {
        resolve(null);
        return;
      }
      resolve({
        name: rec.name,
        characterName: rec.characterName,
        characterNotes: rec.characterNotes,
        data: rec.data,
        mimeType: rec.mimeType,
        previewUrl: rec.previewUrl,
      });
    };
    request.onerror = () => {
      db.close();
      reject(
        request.error ?? new Error("Failed to load local reference directory.")
      );
    };
  });
}

export async function clearReferenceDirectoryLocal(): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REFERENCE_STORE_NAME, "readwrite");
    const store = tx.objectStore(REFERENCE_STORE_NAME);
    store.delete(MASTER_REFERENCE_KEY);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        tx.error ?? new Error("Failed to clear local reference directory.")
      );
    };
  });
}

export async function saveBatchScenesToCache(
  batchIndex: number,
  startNumber: number,
  scenes: SceneItem[]
): Promise<number> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    let savedCount = 0;

    scenes.forEach((scene, offset) => {
      if (scene.status === "completed" && scene.imageDataUrl) {
        const record: CachedSceneRecord = {
          sceneNumber: startNumber + offset,
          batchIndex,
          prompt: scene.prompt,
          narration: scene.narration,
          imageDataUrl: scene.imageDataUrl,
          mimeType: scene.mimeType || "image/png",
          compiledPrompt: scene.compiledPrompt,
          generatedAt: scene.generatedAt || Date.now(),
        };
        store.put(record);
        savedCount += 1;
      }
    });

    tx.oncomplete = () => {
      db.close();
      resolve(savedCount);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to save batch to local cache."));
    };
  });
}

export async function loadBatchScenesFromCache(
  batchIndex: number
): Promise<CachedSceneRecord[]> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("by_batch");
    const request = index.getAll(IDBKeyRange.only(batchIndex));

    request.onsuccess = () => {
      const records = (request.result as CachedSceneRecord[]).sort(
        (a, b) => a.sceneNumber - b.sceneNumber
      );
      db.close();
      resolve(records);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("Failed to load cached batch."));
    };
  });
}

export async function loadAllCachedScenes(): Promise<CachedSceneRecord[]> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = (request.result as CachedSceneRecord[]).sort(
        (a, b) => a.sceneNumber - b.sceneNumber
      );
      db.close();
      resolve(records);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("Failed to load cached scenes."));
    };
  });
}

export async function loadSelectedBatchesFromCache(
  batchIndices: number[]
): Promise<CachedSceneRecord[]> {
  const all = await loadAllCachedScenes();
  const allowed = new Set(batchIndices);
  return all
    .filter((rec) => allowed.has(rec.batchIndex))
    .sort((a, b) => a.sceneNumber - b.sceneNumber);
}

export async function deleteBatchFromCache(batchIndex: number): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("by_batch");
    const request = index.openCursor(IDBKeyRange.only(batchIndex));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to clear batch from local cache."));
    };
  });
}

export async function removeBatchAndShiftCache(
  removedBatchIndex: number
): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as CachedSceneRecord;
      if (record.batchIndex === removedBatchIndex) {
        cursor.delete();
      } else if (record.batchIndex > removedBatchIndex) {
        cursor.update({
          ...record,
          batchIndex: record.batchIndex - 1,
        });
      }
      cursor.continue();
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to remove batch from local cache."));
    };
  });
}

export async function clearAllCachedBatches(): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to clear local cache."));
    };
  });
}

export async function clearAllAppCache(): Promise<void> {
  const db = await openCacheDb();
  const storeNames = [
    STORE_NAME,
    REFERENCE_STORE_NAME,
    SCRIPT_WRITER_STORE_NAME,
    NARRATION_STORE_NAME,
    SCENE_BREAKDOWN_STORE_NAME,
  ].filter((name) => db.objectStoreNames.contains(name));

  if (storeNames.length === 0) {
    db.close();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to clear all app cache."));
    };
  });
}

export async function saveScriptWriterState(
  state: ScriptWriterWorkspaceState
): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_WRITER_STORE_NAME, "readwrite");
    const store = tx.objectStore(SCRIPT_WRITER_STORE_NAME);
    store.put({
      key: SCRIPT_WORKSPACE_KEY,
      state,
      updatedAt: Date.now(),
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        tx.error ?? new Error("Failed to save Script Writer workspace locally.")
      );
    };
  });
}

export async function loadScriptWriterState(): Promise<ScriptWriterWorkspaceState | null> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCRIPT_WRITER_STORE_NAME, "readonly");
    const store = tx.objectStore(SCRIPT_WRITER_STORE_NAME);
    const request = store.get(SCRIPT_WORKSPACE_KEY);

    request.onsuccess = () => {
      const record = request.result as
        | { key: string; state?: ScriptWriterWorkspaceState }
        | undefined;
      db.close();
      resolve(record?.state ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(
        request.error ??
          new Error("Failed to load Script Writer workspace from local cache.")
      );
    };
  });
}

export async function saveNarrationState(
  state: NarrationWorkspaceState
): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NARRATION_STORE_NAME, "readwrite");
    const store = tx.objectStore(NARRATION_STORE_NAME);
    store.put({
      key: NARRATION_WORKSPACE_KEY,
      state,
      updatedAt: Date.now(),
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        tx.error ?? new Error("Failed to save Narration workspace locally.")
      );
    };
  });
}

export async function loadNarrationState(): Promise<NarrationWorkspaceState | null> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NARRATION_STORE_NAME, "readonly");
    const store = tx.objectStore(NARRATION_STORE_NAME);
    const request = store.get(NARRATION_WORKSPACE_KEY);

    request.onsuccess = () => {
      const record = request.result as
        | { key: string; state?: NarrationWorkspaceState }
        | undefined;
      db.close();
      resolve(record?.state ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(
        request.error ??
          new Error("Failed to load Narration workspace from local cache.")
      );
    };
  });
}

export async function saveSceneBreakdownState(
  state: SceneBreakdownWorkspaceState
): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCENE_BREAKDOWN_STORE_NAME, "readwrite");
    const store = tx.objectStore(SCENE_BREAKDOWN_STORE_NAME);
    store.put({
      key: SCENE_BREAKDOWN_WORKSPACE_KEY,
      state,
      updatedAt: Date.now(),
    });

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        tx.error ??
          new Error("Failed to save Scene Breakdown workspace locally.")
      );
    };
  });
}

export async function loadSceneBreakdownState(): Promise<SceneBreakdownWorkspaceState | null> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCENE_BREAKDOWN_STORE_NAME, "readonly");
    const store = tx.objectStore(SCENE_BREAKDOWN_STORE_NAME);
    const request = store.get(SCENE_BREAKDOWN_WORKSPACE_KEY);

    request.onsuccess = () => {
      const record = request.result as
        | { key: string; state?: SceneBreakdownWorkspaceState }
        | undefined;
      db.close();
      resolve(record?.state ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(
        request.error ??
          new Error(
            "Failed to load Scene Breakdown workspace from local cache."
          )
      );
    };
  });
}
