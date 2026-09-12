import { existsSync } from 'node:fs';
import { Store } from '../src/store.js';
import { seedOffice } from '../src/seed-office.js';

const publicPath = 'data/office-demo.sqlite';
const restrictedPath = 'data/office-restricted-demo.sqlite';
if (existsSync(publicPath) || existsSync(restrictedPath)) throw new Error('Office database already exists. No data overwritten. Inspect existing files instead.');
const publicStore = await Store.open(publicPath);
const restrictedStore = await Store.open(restrictedPath);
try {
  console.log(JSON.stringify({ ...seedOffice(publicStore, restrictedStore), synthetic: true, publicPath, restrictedPath, warning: 'Demo only. No real medical data. Restricted records have no HTTP or agent access.' }));
} finally { publicStore.close(); restrictedStore.close(); }
