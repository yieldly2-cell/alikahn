import { Platform } from "react-native";

async function doFetch(url: string, options: RequestInit): Promise<Response> {
  if (Platform.OS === "web") {
    return globalThis.fetch(url, options);
  }
  const { fetch: expoFetch } = await import("expo/fetch");
  return expoFetch(url, options);
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  retries: number = 1,
): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await doFetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Fetch failed after retries");
}
