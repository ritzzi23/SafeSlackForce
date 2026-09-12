import initSqlJs, { type Database } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StreamUpdate } from '@safeslackforce/contracts';

export class Store {
  private constructor(private db: Database, private path: string) {}
  static async open(path: string) {
    const SQL = await initSqlJs();
    const store = new Store(new SQL.Database(path !== ':memory:' && existsSync(path) ? readFileSync(path) : undefined), path);
    store.db.run(`CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, incident TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_incident ON events(incident, seq);`);
    return store;
  }
  get<T>(id: string): T | undefined {
    const stmt = this.db.prepare('SELECT body FROM entities WHERE id = ?');
    try { stmt.bind([id]); return stmt.step() ? JSON.parse(String(stmt.get()[0])) as T : undefined; }
    finally { stmt.free(); }
  }
  list<T>(kind: string): T[] {
    const stmt = this.db.prepare('SELECT body FROM entities WHERE kind = ? ORDER BY rowid');
    try { stmt.bind([kind]); const rows: T[] = []; while (stmt.step()) rows.push(JSON.parse(String(stmt.get()[0]))); return rows; }
    finally { stmt.free(); }
  }
  put(id: string, kind: string, value: unknown) {
    this.db.run('INSERT INTO entities(id,kind,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', [id, kind, JSON.stringify(value)]);
  }
  transaction<T>(action: () => T): T {
    this.db.run('BEGIN');
    let result: T;
    try { result = action(); this.db.run('COMMIT'); } catch (e) { this.db.run('ROLLBACK'); throw e; }
    this.flush(); return result;
  }
  append(incident: string, build: (seq: number) => StreamUpdate) {
    this.db.run('INSERT INTO events(incident,body) VALUES(?,?)', [incident, '{}']);
    const seq = Number(this.db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    const event = build(seq);
    this.db.run('UPDATE events SET body=? WHERE seq=?', [JSON.stringify(event), seq]);
    return event;
  }
  events(incident: string, after: number): StreamUpdate[] {
    const stmt = this.db.prepare('SELECT body FROM events WHERE incident=? AND seq>? ORDER BY seq');
    try { stmt.bind([incident, after]); const events: StreamUpdate[] = []; while (stmt.step()) events.push(JSON.parse(String(stmt.get()[0]))); return events; }
    finally { stmt.free(); }
  }
  private flush() {
    if (this.path === ':memory:') return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.tmp`, this.db.export(), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
  }
  close() { this.flush(); this.db.close(); }
}
