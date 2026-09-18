/// <reference lib="webworker" />
import {
  initWasmEngine,
  wasmFillStatus,
  wasmSumMetricColumn,
  wasmMatchAscii,
  wasmColumnKind
} from '../wasm/engine.js';
import {
  BASE_SEARCH_FIELDS,
  buildBaseRecord,
  formatMetricDisplay,
  isNumericMetric,
  metricCellValue,
  metricTitle
} from '../shared/data-model.js';

let cached = {
  records: null,
  rowCount: 0,
  metricCount: 0,
  metricSums: null
};

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getExportValue(record, field, metricCount) {
  if (field in record) {
    return record[field];
  }
  if (field.charCodeAt(0) === 109) {
    const idx = Number(field.slice(1));
    if (Number.isInteger(idx) && idx >= 0 && idx < metricCount) {
      return metricCellValue(record._i, idx);
    }
  }
  return '';
}

function collectLeafFields(metricCount) {
  const base = [...BASE_SEARCH_FIELDS];
  // date already in BASE; keep stable export order
  const fields = [
    'status',
    'code',
    'name',
    'nameEn',
    'region',
    'dept',
    'owner',
    'city',
    'brand',
    'tag',
    'tagEn',
    'remark',
    'date'
  ];
  for (let i = 0; i < metricCount; i += 1) {
    fields.push(`m${i}`);
  }
  return fields;
}

function collectLeafTitles(metricCount) {
  const titles = [
    '状态',
    '编码',
    '名称',
    '英文名',
    '区域',
    '部门',
    '负责人',
    '城市',
    '品牌',
    '标签',
    'EN Tag',
    '备注',
    '日期'
  ];
  for (let i = 0; i < metricCount; i += 1) {
    titles.push(metricTitle(i));
  }
  return titles;
}

async function handleGenerate(payload) {
  const { rowCount, metricCount, aggMetricIndexes } = payload;
  const t0 = performance.now();
  await initWasmEngine();

  self.postMessage({ type: 'progress', text: 'WASM：填充状态索引…' });
  const statusIndexes = wasmFillStatus(rowCount);

  self.postMessage({ type: 'progress', text: 'Worker：构建中英混合行数据…' });
  const records = new Array(rowCount);
  const chunk = 8000;
  for (let start = 0; start < rowCount; start += chunk) {
    const end = Math.min(start + chunk, rowCount);
    for (let i = start; i < end; i += 1) {
      records[i] = buildBaseRecord(i, statusIndexes[i]);
    }
    self.postMessage({
      type: 'progress',
      text: `Worker：构建行数据 ${end.toLocaleString()} / ${rowCount.toLocaleString()}`
    });
  }

  self.postMessage({ type: 'progress', text: 'WASM：数值列合计…' });
  const metricSums = new Float64Array(metricCount);
  const aggIndexes = (aggMetricIndexes || []).filter((idx) => isNumericMetric(idx));
  const tSum0 = performance.now();
  for (let i = 0; i < aggIndexes.length; i += 1) {
    const col = aggIndexes[i];
    metricSums[col] = wasmSumMetricColumn(rowCount, col);
    if (i % 4 === 0) {
      self.postMessage({
        type: 'progress',
        text: `WASM：合计 ${i + 1}/${aggIndexes.length} 列`
      });
    }
  }
  const wasmAggMs = performance.now() - tSum0;
  const generateMs = performance.now() - t0;

  cached = { records, rowCount, metricCount, metricSums };

  self.postMessage({
    type: 'done',
    action: 'generate',
    records,
    metricSums,
    generateMs,
    wasmAggMs,
    numericAggCount: aggIndexes.length
  });
}

function handleSearch(payload) {
  const { keyword, maxResults = 3000 } = payload;
  const records = cached.records;
  if (!records) {
    self.postMessage({ type: 'error', message: '尚未生成数据，无法搜索' });
    return;
  }

  const t0 = performance.now();
  const kw = String(keyword || '').trim();
  if (!kw) {
    self.postMessage({
      type: 'done',
      action: 'search',
      results: [],
      searchMs: 0,
      truncated: false
    });
    return;
  }

  const results = [];
  const metricCount = cached.metricCount;
  const lowerKw = kw.toLowerCase();
  const isAsciiNeedle = /^[\x00-\x7F]+$/.test(kw);

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];

    for (let f = 0; f < BASE_SEARCH_FIELDS.length; f += 1) {
      const field = BASE_SEARCH_FIELDS[f];
      const raw = record[field];
      if (raw == null) {
        continue;
      }
      const text = String(raw);
      let hit = false;
      if (isAsciiNeedle && /^[\x00-\x7F]+$/.test(text)) {
        hit = wasmMatchAscii(text, kw);
      } else {
        hit = text.includes(kw) || text.toLowerCase().includes(lowerKw);
      }
      if (hit) {
        results.push({ rowIndex: i, field, value: text });
        break;
      }
    }

    if (results.length && results[results.length - 1].rowIndex === i) {
      if (results.length >= maxResults) {
        break;
      }
      continue;
    }

    // 仅扫文本类动态列，跳过纯数值列
    for (let m = 0; m < metricCount; m += 1) {
      if (wasmColumnKind(m) === 0) {
        continue;
      }
      const value = metricCellValue(i, m);
      const text = String(value);
      let hit = false;
      if (isAsciiNeedle && /^[\x00-\x7F]+$/.test(text)) {
        hit = wasmMatchAscii(text, kw);
      } else {
        hit = text.includes(kw) || text.toLowerCase().includes(lowerKw);
      }
      if (hit) {
        results.push({ rowIndex: i, field: `m${m}`, value: text });
        break;
      }
    }

    if (results.length >= maxResults) {
      break;
    }

    if (i % 20000 === 0) {
      self.postMessage({
        type: 'progress',
        text: `搜索中 ${i.toLocaleString()} / ${records.length.toLocaleString()}…`
      });
    }
  }

  self.postMessage({
    type: 'done',
    action: 'search',
    results,
    searchMs: performance.now() - t0,
    truncated: results.length >= maxResults
  });
}

async function handleExportCsv(payload) {
  const records = cached.records;
  if (!records) {
    self.postMessage({ type: 'error', message: '尚未生成数据，无法导出' });
    return;
  }

  const {
    exportAllData = false,
    rowIndexes = null,
    maxRows = 20000,
    includeAllMetricCols = false,
    metricColLimit = 80
  } = payload;

  const t0 = performance.now();
  const metricCount = cached.metricCount;
  let fields = collectLeafFields(metricCount);
  let titles = collectLeafTitles(metricCount);

  // 全量 15万×500 会生成超大文件；默认限制动态列数量，仍保留全部基础中英文字段
  if (!includeAllMetricCols) {
    const baseLen = 13;
    const keepMetrics = Math.min(metricCount, metricColLimit);
    fields = fields.slice(0, baseLen + keepMetrics);
    titles = titles.slice(0, baseLen + keepMetrics);
  }

  let indices;
  if (Array.isArray(rowIndexes) && rowIndexes.length) {
    indices = rowIndexes;
  } else if (exportAllData) {
    indices = null; // scan all
  } else {
    indices = Array.from({ length: Math.min(records.length, maxRows) }, (_, i) => i);
  }

  const total = indices ? indices.length : records.length;
  const chunks = [];
  chunks.push(`${titles.map(escapeCsv).join(',')}\n`);

  const writeRow = (record) => {
    const cols = new Array(fields.length);
    for (let c = 0; c < fields.length; c += 1) {
      const value = getExportValue(record, fields[c], metricCount);
      cols[c] = escapeCsv(formatMetricDisplay(value));
    }
    chunks.push(`${cols.join(',')}\n`);
  };

  if (indices) {
    for (let i = 0; i < indices.length; i += 1) {
      writeRow(records[indices[i]]);
      if (i % 5000 === 0) {
        self.postMessage({
          type: 'progress',
          text: `导出 CSV ${i.toLocaleString()} / ${total.toLocaleString()}`
        });
      }
    }
  } else {
    for (let i = 0; i < records.length; i += 1) {
      writeRow(records[i]);
      if (i % 5000 === 0) {
        self.postMessage({
          type: 'progress',
          text: `导出 CSV ${i.toLocaleString()} / ${total.toLocaleString()}`
        });
      }
    }
  }

  const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  const buffer = await blob.arrayBuffer();
  self.postMessage(
    {
      type: 'done',
      action: 'exportCsv',
      buffer,
      exportMs: performance.now() - t0,
      rowCount: total,
      colCount: fields.length
    },
    [buffer]
  );
}

async function handleExportExcel(payload) {
  const records = cached.records;
  if (!records) {
    self.postMessage({ type: 'error', message: '尚未生成数据，无法导出' });
    return;
  }

  // 动态导入，避免 Worker 启动过慢
  const ExcelJS = (await import('exceljs')).default;
  const {
    exportAllData = false,
    rowIndexes = null,
    maxRows = 5000,
    metricColLimit = 40
  } = payload;

  const t0 = performance.now();
  const metricCount = cached.metricCount;
  const baseLen = 13;
  const keepMetrics = Math.min(metricCount, metricColLimit);
  const fields = collectLeafFields(metricCount).slice(0, baseLen + keepMetrics);
  const titles = collectLeafTitles(metricCount).slice(0, baseLen + keepMetrics);

  let indices;
  if (Array.isArray(rowIndexes) && rowIndexes.length) {
    indices = rowIndexes;
  } else if (exportAllData) {
    indices = Array.from({ length: Math.min(records.length, maxRows) }, (_, i) => i);
  } else {
    indices = Array.from({ length: Math.min(records.length, Math.min(maxRows, 2000)) }, (_, i) => i);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('VTableExport', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  sheet.addRow(titles);

  for (let i = 0; i < indices.length; i += 1) {
    const record = records[indices[i]];
    const row = fields.map((field) => {
      const value = getExportValue(record, field, metricCount);
      return formatMetricDisplay(value);
    });
    sheet.addRow(row);
    if (i % 1000 === 0) {
      self.postMessage({
        type: 'progress',
        text: `导出 XLSX ${i.toLocaleString()} / ${indices.length.toLocaleString()}`
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  self.postMessage(
    {
      type: 'done',
      action: 'exportExcel',
      buffer: ab,
      exportMs: performance.now() - t0,
      rowCount: indices.length,
      colCount: fields.length
    },
    [ab]
  );
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const { type } = data;
  try {
    if (type === 'generate') {
      await handleGenerate(data);
      return;
    }
    if (type === 'search') {
      handleSearch(data);
      return;
    }
    if (type === 'exportCsv') {
      await handleExportCsv(data);
      return;
    }
    if (type === 'exportExcel') {
      await handleExportExcel(data);
      return;
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error?.message || String(error)
    });
  }
};
