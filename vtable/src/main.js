import './style.css';
import * as VTable from '@visactor/vtable';
import { SearchComponent } from '@visactor/vtable-search';
import DataWorker from './worker/data-worker.js?worker';
import {
  BASE_SEARCH_FIELDS,
  formatMetricDisplay,
  isNumericMetric,
  metricCellValue,
  metricTitle
} from './shared/data-model.js';

const ROW_COUNT = 150_000;
const LEAF_COLUMN_COUNT = 500;
const BASE_COL_COUNT = 13;
const { AggregationType } = VTable.TYPES;

const THEME_MAP = {
  DEFAULT: VTable.themes.DEFAULT,
  ARCO: VTable.themes.ARCO,
  DARK: VTable.themes.DARK,
  BRIGHT: VTable.themes.BRIGHT,
  SIMPLIFY: VTable.themes.SIMPLIFY
};

const $ = (id) => document.getElementById(id);

const loadingEl = $('loading');
const loadingText = $('loadingText');
const metaLabel = $('metaLabel');
const statusText = $('statusText');
const tableContainer = $('tableContainer');
const timingGenEl = $('timingGen');
const timingRenderEl = $('timingRender');
const timingTotalEl = $('timingTotal');

let tableInstance = null;
let searchComponent = null;
let metricSums = null;
let aggMetricIndexSet = new Set();
let dataWorker = null;
let workerRequestId = 0;
let pendingWorker = null;
let searchHits = [];
let searchCursor = -1;
let leafFieldOrder = [];

function setStatus(text) {
  statusText.textContent = text;
}

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingEl.classList.remove('hidden');
}

function formatMs(ms) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms.toFixed(0)} ms`;
}

function updateTimings({ generateMs, renderMs, totalMs }) {
  if (generateMs != null) {
    timingGenEl.textContent = formatMs(generateMs);
  }
  if (renderMs != null) {
    timingRenderEl.textContent = formatMs(renderMs);
  }
  if (totalMs != null) {
    timingTotalEl.textContent = formatMs(totalMs);
  }
}

function ensureWorker() {
  if (dataWorker) {
    return dataWorker;
  }
  dataWorker = new DataWorker();
  dataWorker.onmessage = (event) => {
    const msg = event.data;
    if (msg?.type === 'progress') {
      setStatus(msg.text);
      if (!loadingEl.classList.contains('hidden')) {
        loadingText.textContent = msg.text;
      }
      return;
    }
    if (!pendingWorker) {
      return;
    }
    const { resolve, reject } = pendingWorker;
    pendingWorker = null;
    if (msg?.type === 'error') {
      reject(new Error(msg.message || 'Worker error'));
      return;
    }
    resolve(msg);
  };
  dataWorker.onerror = (error) => {
    if (pendingWorker) {
      pendingWorker.reject(error);
      pendingWorker = null;
    }
  };
  return dataWorker;
}

function callWorker(payload) {
  ensureWorker();
  return new Promise((resolve, reject) => {
    if (pendingWorker) {
      reject(new Error('已有任务进行中，请稍候'));
      return;
    }
    pendingWorker = { resolve, reject, id: ++workerRequestId };
    dataWorker.postMessage(payload);
  });
}

function wrapRecordWithMetrics(base) {
  const rowIndex = base._i;
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      if (typeof prop === 'string' && prop.charCodeAt(0) === 109) {
        const n = Number(prop.slice(1));
        if (Number.isInteger(n)) {
          return metricCellValue(rowIndex, n);
        }
      }
      return undefined;
    },
    has(target, prop) {
      if (prop in target) {
        return true;
      }
      if (typeof prop === 'string' && prop.charCodeAt(0) === 109) {
        const n = Number(prop.slice(1));
        return Number.isInteger(n);
      }
      return false;
    }
  });
}

function isAggCell(args) {
  return typeof args.table.isAggregation === 'function' && args.table.isAggregation(args.col, args.row);
}

function getRecordFast(args) {
  return args.table.getCellOriginRecord(args.col, args.row);
}

function rowStatusBgColor(args) {
  if (isAggCell(args)) {
    return '#0f766e';
  }
  return getRecordFast(args)?._bg ?? null;
}

function statusCellStyle(args) {
  if (isAggCell(args)) {
    return {
      bgColor: '#0f766e',
      color: '#ecfeff',
      fontWeight: '700',
      textAlign: 'center'
    };
  }
  const record = getRecordFast(args);
  return {
    bgColor: record?._bg ?? '#e2e8f0',
    color: record?._fg ?? '#334155',
    fontWeight: '600',
    textAlign: 'center'
  };
}

function bodyCellStyle(args) {
  if (isAggCell(args)) {
    return {
      bgColor: '#0f766e',
      color: '#ecfeff',
      fontWeight: '600',
      textAlign: 'right'
    };
  }
  return {
    bgColor: rowStatusBgColor(args),
    textAlign: 'right'
  };
}

function textBodyStyle(args) {
  if (isAggCell(args)) {
    return {
      bgColor: '#0f766e',
      color: '#ecfeff',
      fontWeight: '600'
    };
  }
  return {
    bgColor: rowStatusBgColor(args)
  };
}

function collectAggMetricIndexes(metricLeafCount) {
  const indexes = [];
  for (let i = 0; i < metricLeafCount; i += 1) {
    if (!isNumericMetric(i)) {
      continue;
    }
    if (i < 12 || i % 11 === 0) {
      indexes.push(i);
    }
  }
  return indexes;
}

function buildColumns(metricLeafCount) {
  const baseColumns = [
    {
      field: 'status',
      title: '状态',
      width: 88,
      sort: true,
      style: statusCellStyle,
      aggregation: {
        aggregationType: AggregationType.COUNT,
        showOnTop: false,
        formatFun: (value) => `合计 ${Number(value).toLocaleString()} 行`
      }
    },
    { field: 'code', title: '编码', width: 120, sort: true, style: textBodyStyle },
    { field: 'name', title: '名称', width: 130, sort: true, style: textBodyStyle },
    { field: 'nameEn', title: '英文名', width: 130, sort: true, style: textBodyStyle },
    { field: 'region', title: '区域', width: 80, sort: true, style: textBodyStyle },
    { field: 'dept', title: '部门', width: 80, sort: true, style: textBodyStyle },
    { field: 'owner', title: '负责人', width: 90, sort: true, style: textBodyStyle },
    { field: 'city', title: '城市', width: 80, sort: true, style: textBodyStyle },
    { field: 'brand', title: '品牌', width: 100, sort: true, style: textBodyStyle },
    { field: 'tag', title: '标签', width: 90, sort: true, style: textBodyStyle },
    { field: 'tagEn', title: 'EN Tag', width: 110, sort: true, style: textBodyStyle },
    { field: 'remark', title: '备注', width: 180, sort: true, style: textBodyStyle },
    { field: 'date', title: '日期', width: 110, sort: true, style: textBodyStyle }
  ];

  leafFieldOrder = baseColumns.map((col) => col.field);

  const groupCount = 10;
  const subPerGroup = 5;
  const leafPerSub = Math.ceil(metricLeafCount / (groupCount * subPerGroup));
  const metricGroups = [];
  let metricIndex = 0;

  for (let g = 0; g < groupCount && metricIndex < metricLeafCount; g += 1) {
    const subgroups = [];
    for (let s = 0; s < subPerGroup && metricIndex < metricLeafCount; s += 1) {
      const leaves = [];
      for (let l = 0; l < leafPerSub && metricIndex < metricLeafCount; l += 1) {
        const field = `m${metricIndex}`;
        const currentMetricIndex = metricIndex;
        const numeric = isNumericMetric(currentMetricIndex);
        const enableAgg = numeric && aggMetricIndexSet.has(currentMetricIndex);
        leafFieldOrder.push(field);
        leaves.push({
          field,
          title: metricTitle(metricIndex),
          width: numeric ? 96 : 120,
          sort: true,
          style: numeric ? bodyCellStyle : textBodyStyle,
          fieldFormat: (record) => formatMetricDisplay(record?.[field]),
          aggregation: enableAgg
            ? {
                aggregationType: AggregationType.CUSTOM,
                showOnTop: false,
                aggregationFun: () => metricSums?.[currentMetricIndex] ?? 0,
                formatFun: (value) =>
                  typeof value === 'number'
                    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : value
              }
            : undefined
        });
        metricIndex += 1;
      }
      subgroups.push({
        title: `子组 ${String.fromCharCode(65 + s)}`,
        columns: leaves
      });
    }
    metricGroups.push({
      title: `业务域 ${g + 1}`,
      columns: subgroups
    });
  }

  return [
    {
      title: '基础信息',
      columns: baseColumns
    },
    ...metricGroups
  ];
}

function countLeafColumns(columns) {
  let count = 0;
  const walk = (cols) => {
    cols.forEach((col) => {
      if (col.columns?.length) {
        walk(col.columns);
      } else {
        count += 1;
      }
    });
  };
  walk(columns);
  return count;
}

function getTableViewSize() {
  const width = Math.floor(Math.min(tableContainer.clientWidth, window.innerWidth));
  const height = Math.floor(Math.min(tableContainer.clientHeight, window.innerHeight));
  return {
    width: Math.max(width, 1),
    height: Math.max(height, 1)
  };
}

function createTable(records, columns) {
  const { width: canvasWidth, height: canvasHeight } = getTableViewSize();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  const option = {
    records,
    columns,
    canvasWidth,
    canvasHeight,
    pixelRatio,
    widthMode: 'standard',
    autoFillWidth: false,
    autoWrapText: false,
    defaultColWidth: 96,
    heightMode: 'standard',
    autoFillHeight: false,
    defaultRowHeight: 32,
    defaultHeaderRowHeight: 36,
    frozenColCount: 1,
    bottomFrozenRowCount: 1,
    columnResizeMode: 'all',
    dragHeaderMode: 'column',
    overscrollBehavior: 'none',
    maxCharactersNumber: 32,
    animationAppear: false,
    theme: THEME_MAP.ARCO,
    rowSeriesNumber: {
      title: '序号',
      width: 72,
      headerStyle: {
        textAlign: 'center'
      },
      style: (args) => ({
        textAlign: 'center',
        bgColor: isAggCell(args) ? '#0f766e' : rowStatusBgColor(args),
        color: isAggCell(args) ? '#ecfeff' : undefined
      })
    },
    hover: {
      highlightMode: 'row'
    },
    select: {
      highlightMode: 'row'
    },
    keyboardOptions: {
      copySelected: true
    },
    tooltip: {
      isShowOverflowTextTooltip: true
    },
    resize: {
      disableDblclickAutoResizeColWidth: true
    },
    eventOptions: {
      contextmenuReturnAllSelectedCells: false
    }
  };

  tableInstance = new VTable.ListTable(tableContainer, option);
  // 仅用于高亮跳转；真正检索在 Worker 中完成，避免主线程扫 15万×500
  searchComponent = new SearchComponent({
    table: tableInstance,
    autoJump: false,
    skipHeader: true,
    fieldsToSearch: BASE_SEARCH_FIELDS,
    highlightCellStyle: {
      bgColor: 'rgba(56, 189, 248, 0.35)'
    },
    focusHighlightCellStyle: {
      bgColor: 'rgba(45, 212, 191, 0.55)'
    }
  });

  return tableInstance;
}

function waitForTableReady(table) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    const afterRender = VTable.ListTable.EVENT_TYPE?.AFTER_RENDER || 'after_render';
    const initialized = VTable.ListTable.EVENT_TYPE?.INITIALIZED || 'initialized';
    table.on(initialized, finish);
    table.on(afterRender, finish);
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  });
}

function fieldToCol(field) {
  const seriesOffset = tableInstance.leftRowSeriesNumberCount || 1;
  const idx = leafFieldOrder.indexOf(field);
  if (idx < 0) {
    return seriesOffset;
  }
  return seriesOffset + idx;
}

function recordIndexToBodyRow(recordIndex) {
  // 无数据源下标换表格 body 行号（考虑表头行）
  const headerLevels = tableInstance.columnHeaderLevelCount || 0;
  return headerLevels + recordIndex;
}

function jumpToSearchHit(hit) {
  if (!hit || !tableInstance) {
    return;
  }
  const col = fieldToCol(hit.field);
  const row =
    typeof tableInstance.getBodyRowIndexByRecordIndex === 'function'
      ? tableInstance.getBodyRowIndexByRecordIndex(hit.rowIndex) + (tableInstance.columnHeaderLevelCount || 0)
      : recordIndexToBodyRow(hit.rowIndex);
  try {
    tableInstance.scrollToCell?.({ col, row });
    tableInstance.selectCell?.(col, row);
  } catch (error) {
    console.warn(error);
  }
}

function updateSearchMeta() {
  const total = searchHits.length;
  const index = total > 0 ? searchCursor + 1 : 0;
  $('searchMeta').textContent = total ? `${index}/${total}` : '';
  $('searchPrevBtn').disabled = total === 0;
  $('searchNextBtn').disabled = total === 0;
  $('searchClearBtn').disabled = total === 0;
}

function downloadArrayBuffer(buffer, fileName, mime) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function bindToolbar() {
  $('searchBtn').addEventListener('click', async () => {
    const keyword = $('searchInput').value.trim();
    if (!keyword) {
      searchComponent?.clear();
      searchHits = [];
      searchCursor = -1;
      updateSearchMeta();
      setStatus('请输入中文/英文关键词（Worker 检索基础字段 + 文本列）');
      return;
    }
    setStatus(`Worker 搜索「${keyword}」…`);
    try {
      const result = await callWorker({
        type: 'search',
        keyword,
        maxResults: 3000
      });
      searchHits = result.results || [];
      searchCursor = searchHits.length ? 0 : -1;
      updateSearchMeta();
      if (searchHits.length) {
        jumpToSearchHit(searchHits[0]);
      } else {
        searchComponent?.clear();
      }
      const tip = result.truncated ? '（已截断前 3000 条）' : '';
      setStatus(
        `搜索完成：命中 ${searchHits.length} 行${tip}，耗时 ${formatMs(result.searchMs || 0)}`
      );
    } catch (error) {
      console.error(error);
      setStatus(`搜索失败：${error.message || error}`);
    }
  });

  $('searchInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      $('searchBtn').click();
    }
  });

  $('searchPrevBtn').addEventListener('click', () => {
    if (!searchHits.length) {
      return;
    }
    searchCursor = (searchCursor - 1 + searchHits.length) % searchHits.length;
    updateSearchMeta();
    jumpToSearchHit(searchHits[searchCursor]);
  });

  $('searchNextBtn').addEventListener('click', () => {
    if (!searchHits.length) {
      return;
    }
    searchCursor = (searchCursor + 1) % searchHits.length;
    updateSearchMeta();
    jumpToSearchHit(searchHits[searchCursor]);
  });

  $('searchClearBtn').addEventListener('click', () => {
    searchComponent?.clear();
    searchHits = [];
    searchCursor = -1;
    updateSearchMeta();
    setStatus('已清除搜索结果');
  });

  $('exportCsvBtn').addEventListener('click', async () => {
    const full = window.confirm(
      '导出 CSV：\n确定 = 导出全部行（动态列默认前 80 列，含全部中英文字段）\n取消 = 导出前 2 万行预览'
    );
    setStatus(full ? 'Worker 导出全量 CSV…' : 'Worker 导出预览 CSV…');
    try {
      const result = await callWorker({
        type: 'exportCsv',
        exportAllData: full,
        maxRows: 20000,
        metricColLimit: 80,
        includeAllMetricCols: false
      });
      downloadArrayBuffer(result.buffer, 'vtable-demo.csv', 'text/csv;charset=utf-8;');
      setStatus(
        `CSV 完成：${result.rowCount.toLocaleString()} 行 × ${result.colCount} 列，耗时 ${formatMs(result.exportMs)}`
      );
    } catch (error) {
      console.error(error);
      setStatus(`CSV 导出失败：${error.message || error}`);
    }
  });

  $('exportXlsxBtn').addEventListener('click', async () => {
    const full = window.confirm(
      '导出 XLSX（Worker + ExcelJS）：\n确定 = 最多 5000 行 × (基础字段+40动态列)\n取消 = 最多 2000 行预览\n（15万×500 全量 Excel 不适合浏览器内存）'
    );
    setStatus(full ? 'Worker 导出 XLSX…' : 'Worker 导出预览 XLSX…');
    try {
      const result = await callWorker({
        type: 'exportExcel',
        exportAllData: full,
        maxRows: full ? 5000 : 2000,
        metricColLimit: 40
      });
      downloadArrayBuffer(
        result.buffer,
        'vtable-demo.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      setStatus(
        `XLSX 完成：${result.rowCount.toLocaleString()} 行 × ${result.colCount} 列，耗时 ${formatMs(result.exportMs)}`
      );
    } catch (error) {
      console.error(error);
      setStatus(`XLSX 导出失败：${error.message || error}`);
    }
  });

  $('themeSelect').addEventListener('change', (event) => {
    const key = event.target.value;
    const theme = THEME_MAP[key];
    if (!theme || !tableInstance) {
      return;
    }
    document.body.dataset.theme = key;
    tableInstance.updateTheme(theme);
    setStatus(`已切换主题：${key}`);
  });
}

async function bootstrap() {
  bindToolbar();
  document.body.dataset.theme = 'ARCO';
  showLoading('启动 Worker + WASM 生成中英混合数据…');
  updateTimings({ generateMs: 0, renderMs: 0, totalMs: 0 });

  const totalStarted = performance.now();
  const metricLeafCount = LEAF_COLUMN_COUNT - BASE_COL_COUNT;
  const aggMetricIndexes = collectAggMetricIndexes(metricLeafCount);
  aggMetricIndexSet = new Set(aggMetricIndexes);

  const genResult = await callWorker({
    type: 'generate',
    rowCount: ROW_COUNT,
    metricCount: metricLeafCount,
    aggMetricIndexes
  });

  metricSums = genResult.metricSums;
  loadingText.textContent = '主线程：挂载完整列数据模型（数值/中文/英文混合）…';
  const baseRecords = genResult.records;
  const records = new Array(baseRecords.length);
  for (let i = 0; i < baseRecords.length; i += 1) {
    records[i] = wrapRecordWithMetrics(baseRecords[i]);
  }

  updateTimings({ generateMs: genResult.generateMs });
  loadingText.textContent = '正在渲染 VTable…';
  await new Promise((resolve) => setTimeout(resolve, 20));

  const renderStarted = performance.now();
  const columns = buildColumns(metricLeafCount);
  const leafCount = countLeafColumns(columns);
  createTable(records, columns);
  await waitForTableReady(tableInstance);
  const renderMs = performance.now() - renderStarted;
  const totalMs = performance.now() - totalStarted;

  updateTimings({ generateMs: genResult.generateMs, renderMs, totalMs });
  metaLabel.textContent = `${ROW_COUNT.toLocaleString()} 行 · ${leafCount} 列 · 数值合计列 ${genResult.numericAggCount || 0}`;
  hideLoading();
  setStatus('就绪：含中文/英文/混编码列；搜索与导出在 Worker，英文匹配走 WASM');

  let lastViewSize = { width: 0, height: 0 };
  const syncTableSize = () => {
    const next = getTableViewSize();
    if (next.width === lastViewSize.width && next.height === lastViewSize.height) {
      return;
    }
    lastViewSize = next;
    tableInstance?.resize(next.width, next.height);
  };
  requestAnimationFrame(syncTableSize);
  new ResizeObserver(syncTableSize).observe(tableContainer);
  window.addEventListener('resize', syncTableSize);
}

bootstrap().catch((error) => {
  console.error(error);
  loadingText.textContent = `初始化失败：${error.message || error}`;
  setStatus('初始化失败，请查看控制台');
});
