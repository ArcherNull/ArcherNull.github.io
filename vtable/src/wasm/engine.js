import engineUrl from './engine.wasm?url';

let wasmExports = null;
let memory = null;

export async function initWasmEngine() {
  if (wasmExports) {
    return wasmExports;
  }
  const response = await fetch(engineUrl);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  wasmExports = instance.exports;
  memory = wasmExports.memory;
  return wasmExports;
}

export function getWasmMemory() {
  return memory;
}

export function wasmMetric(row, col) {
  return wasmExports.metric(row, col);
}

export function wasmSeedInt(row, col) {
  return wasmExports.seedInt(row, col);
}

export function wasmDictIndex(row, col, mod) {
  return wasmExports.dictIndex(row, col, mod);
}

export function wasmColumnKind(col) {
  return wasmExports.columnKind(col);
}

export function wasmSumMetricColumn(rows, col) {
  return wasmExports.sumMetricColumn(rows, col);
}

export function wasmSumAllMetrics(rows, metricCols) {
  ensureMemory(metricCols * 8 + 64);
  const outPtr = 0;
  wasmExports.sumAllMetrics(rows, metricCols, outPtr);
  return new Float64Array(memory.buffer.slice(outPtr, outPtr + metricCols * 8));
}

export function wasmFillStatus(rows) {
  ensureMemory(rows + 64);
  const outPtr = 0;
  wasmExports.fillStatus(rows, outPtr);
  return new Uint8Array(memory.buffer.slice(outPtr, outPtr + rows));
}

/** ASCII / 英文快速匹配（中文仍走 JS includes） */
export function wasmMatchAscii(haystack, needle) {
  if (!needle) {
    return true;
  }
  const enc = new TextEncoder();
  const hay = enc.encode(String(haystack));
  const ned = enc.encode(String(needle));
  const total = hay.length + ned.length + 32;
  ensureMemory(total);
  const hayPtr = 0;
  const nedPtr = (hay.length + 15) & ~15;
  new Uint8Array(memory.buffer, hayPtr, hay.length).set(hay);
  new Uint8Array(memory.buffer, nedPtr, ned.length).set(ned);
  return wasmExports.matchAscii(hayPtr, hay.length, nedPtr, ned.length) === 1;
}

function ensureMemory(bytesNeeded) {
  const pagesNeeded = Math.ceil(bytesNeeded / 65536) + 1;
  const currentPages = memory.buffer.byteLength / 65536;
  if (pagesNeeded > currentPages) {
    memory.grow(pagesNeeded - currentPages);
  }
}
