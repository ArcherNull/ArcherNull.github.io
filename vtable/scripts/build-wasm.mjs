import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import wabtFactory from 'wabt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watPath = path.resolve(__dirname, '../src/wasm/engine.wat');
const wasmPath = path.resolve(__dirname, '../src/wasm/engine.wasm');

const wabt = await wabtFactory();
const wat = fs.readFileSync(watPath, 'utf8');
const module = wabt.parseWat(watPath, wat);
module.resolveNames();
module.validate();
const { buffer } = module.toBinary({ log: false });
fs.writeFileSync(wasmPath, Buffer.from(buffer));
console.log(`WASM built: ${wasmPath} (${buffer.byteLength} bytes)`);
