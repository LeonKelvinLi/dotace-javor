import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
export function localBucket(directory) {
  const file = (key) => {
    if (
      !/^[a-zA-Z0-9/_.-]+$/.test(key) ||
      key.startsWith("/") ||
      key.split("/").includes("..")
    )
      throw new Error("Invalid object key");
    return path.join(directory, "objects", key);
  };
  return {
    async put(key, bytes) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temp = target + "." + crypto.randomUUID() + ".tmp";
      await writeFile(temp, new Uint8Array(bytes), { mode: 0o600 });
      await rename(temp, target);
    },
    async get(key) {
      try {
        const bytes = await readFile(file(key));
        return { body: bytes, size: bytes.length };
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      await unlink(file(key)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
  };
}
export function managedBucket(client, name) {
  return {
    async put(key, bytes, options = {}) {
      const { error } = await client.storage
        .from(name)
        .upload(key, bytes, {
          contentType:
            options.httpMetadata?.contentType || "application/octet-stream",
          upsert: false,
        });
      if (error) throw new Error("Object upload failed");
    },
    async get(key) {
      const { data, error } = await client.storage.from(name).download(key);
      if (error) {
        if (String(error.statusCode) === "404") return null;
        throw new Error("Object read failed");
      }
      return { body: data.stream(), size: data.size };
    },
    async delete(key) {
      const { error } = await client.storage.from(name).remove([key]);
      if (error) throw new Error("Object removal failed");
    },
  };
}
