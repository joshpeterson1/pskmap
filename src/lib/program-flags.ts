import { invoke } from "@tauri-apps/api/core";

/** Cached program prefix → ISO country code mapping from POTA API */
let programCache: Record<string, string> | null = null;
let fetchPromise: Promise<Record<string, string>> | null = null;

async function loadPrograms(): Promise<Record<string, string>> {
  if (programCache) return programCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = invoke<Record<string, string>>("get_pota_programs")
    .then((map) => {
      programCache = map;
      console.log(`[PSKmap] Program flags loaded: ${Object.keys(map).length} entries`);
      return map;
    })
    .catch((e) => {
      console.error("[PSKmap] Failed to load program flags:", e);
      return {};
    })
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
}

// Kick off the fetch immediately on import
loadPrograms();

/** Get flagcdn URL for a program prefix. Returns null if mapping not loaded yet or unknown prefix. */
export function getFlagUrl(reference: string | null): string | null {
  if (!reference || !programCache) return null;
  const idx = reference.indexOf("-");
  if (idx <= 0) return null;
  const prefix = reference.slice(0, idx);

  const iso = programCache[prefix];
  if (!iso) return null;
  return `https://flagcdn.com/w20/${iso}.png`;
}
