import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Abstracts where uploaded files (hardware model photos/datasheets, site datasheets) live, so
// hardwareModels.ts/sites.ts/system.ts don't need to know whether they're on local disk (dev,
// Docker compose — persistent volume) or in a Supabase Storage bucket (Render free tier, which has
// no persistent disk). Selected once via STORAGE_DRIVER; local is the default so existing
// deployments are unaffected.
export interface UploadStorage {
  save(buffer: Buffer, dir: string, filename: string): Promise<void>;
  remove(dir: string, filename: string): Promise<void>;
  listAllFiles(): Promise<string[]>;
  readFile(relativePath: string): Promise<Buffer>;
  writeFile(relativePath: string, buffer: Buffer): Promise<void>;
  clearAll(): Promise<void>;
}

// The fixed set of top-level folders ever written by hardwareModels.ts/sites.ts. Kept as a flat
// list (no recursive walk needed) since nothing nests directories under them.
const KNOWN_DIRS = ["hardware-models", "hardware-model-datasheets", "site-datasheets"];

class LocalUploadStorage implements UploadStorage {
  private root = path.resolve(process.cwd(), "uploads");

  async save(buffer: Buffer, dir: string, filename: string) {
    const target = path.join(this.root, dir);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, filename), buffer);
  }

  async remove(dir: string, filename: string) {
    fs.rm(path.join(this.root, dir, filename), { force: true }, () => {});
  }

  async listAllFiles() {
    const files: string[] = [];
    for (const dir of KNOWN_DIRS) {
      const target = path.join(this.root, dir);
      if (!fs.existsSync(target)) continue;
      for (const entry of fs.readdirSync(target)) {
        files.push(`${dir}/${entry}`);
      }
    }
    return files;
  }

  async readFile(relativePath: string) {
    return fs.readFileSync(path.join(this.root, relativePath));
  }

  async writeFile(relativePath: string, buffer: Buffer) {
    const target = path.join(this.root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
  }

  async clearAll() {
    fs.mkdirSync(this.root, { recursive: true });
    for (const entry of fs.readdirSync(this.root)) {
      fs.rmSync(path.join(this.root, entry), { recursive: true, force: true });
    }
  }
}

class SupabaseUploadStorage implements UploadStorage {
  private client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  private bucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

  async save(buffer: Buffer, dir: string, filename: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(`${dir}/${filename}`, buffer, {
      upsert: true,
    });
    if (error) throw error;
  }

  async remove(dir: string, filename: string) {
    await this.client.storage.from(this.bucket).remove([`${dir}/${filename}`]);
  }

  async listAllFiles() {
    const files: string[] = [];
    for (const dir of KNOWN_DIRS) {
      const { data, error } = await this.client.storage.from(this.bucket).list(dir, { limit: 1000 });
      if (error) throw error;
      for (const entry of data ?? []) {
        files.push(`${dir}/${entry.name}`);
      }
    }
    return files;
  }

  async readFile(relativePath: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(relativePath);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async writeFile(relativePath: string, buffer: Buffer) {
    const { error } = await this.client.storage.from(this.bucket).upload(relativePath, buffer, { upsert: true });
    if (error) throw error;
  }

  async clearAll() {
    const paths = await this.listAllFiles();
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) throw error;
  }
}

export const uploadStorage: UploadStorage =
  process.env.STORAGE_DRIVER === "supabase" ? new SupabaseUploadStorage() : new LocalUploadStorage();
