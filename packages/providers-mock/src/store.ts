import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Tiny JSON-file registry used by the mock providers to simulate host state. */
export class JsonStore<T> {
  constructor(
    private readonly file: string,
    private readonly initial: T,
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as T;
    } catch {
      return structuredClone(this.initial);
    }
  }

  async write(data: T): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(data, null, 2), 'utf8');
  }

  async update(fn: (data: T) => T | void): Promise<T> {
    const data = await this.read();
    const next = fn(data) ?? data;
    await this.write(next);
    return next;
  }
}
