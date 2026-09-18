/** 中英文字典与单元格取值（主线程 / Worker 共用，保证渲染与导出一致） */

export const STATUS_LIST = ['正常', '预警', '异常', '停用'];
export const REGIONS = ['华东', '华南', '华北', '西南', '西北', '东北'];
export const DEPTS = ['销售', '仓储', '采购', '财务', '运营', '研发'];
export const CITIES = [
  '上海', '深圳', '杭州', '成都', '北京', '广州', '苏州', '武汉', '南京', '西安', '重庆', '天津'
];
export const OWNERS = [
  '张伟', '李娜', '王芳', '刘洋', '陈静', '杨帆', '赵敏', '黄磊', '周杰', '吴倩',
  '徐鹏', '孙悦', '马超', '朱婷', '胡军', '郭爽', '何畅', '高峰', '林雪', '罗斌'
];
export const BRANDS = [
  'Aurora', 'Nimbus', 'Vertex', 'Polaris', ' cons', 'Atlas', 'NovaTech', 'BluePeak', 'Silverline', 'Orbit'
];
export const TAGS = [
  '重点客户', '新品', '促销', '滞销', '核心SKU', 'VIP', '季节款', '清仓', '定制', '常规'
];
export const TAGS_EN = [
  'KeyAccount', 'NewArrival', 'Promotion', 'SlowMoving', 'CoreSKU', 'VIP', 'Seasonal', 'Clearance', 'Custom', 'Standard'
];
export const CN_LABELS = [
  '品质优良', '供应稳定', '渠道畅销', '库存充足', '交期紧张', '成本优化', '客户好评',
  '复购率高', '待盘点', '质检通过', '物流延期', '备货中', '已锁定', '可替换', '风险可控'
];
export const EN_PHRASES = [
  'In Stock', 'Backorder', 'Fast Ship', 'Quality OK', 'Need Review', 'High Demand',
  'Low Margin', 'Ready Bundle', 'Pilot Run', 'Stable Supply', 'Hold Order', 'Priority'
];
export const REMARKS = [
  '请优先保障华东仓发货', '客户要求加急包装', '英文说明书需随箱', '批次质检报告已归档',
  '可与替代料混发', '注意防潮标识', '渠道专供不可窜货', '活动价仅限本周',
  'Need bilingual packing list', 'Follow up with QA before ship'
];

export const STATUS_THEME = [
  { bgColor: '#d1fae5', color: '#065f46' },
  { bgColor: '#fef3c7', color: '#92400e' },
  { bgColor: '#fee2e2', color: '#991b1b' },
  { bgColor: '#e2e8f0', color: '#334155' }
];

export const BASE_SEARCH_FIELDS = [
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

/** 列类型：0 数值 / 1 中文 / 2 英文 / 3 中英混合编码 */
export function columnKind(metricIndex) {
  return metricIndex % 4;
}

export function isNumericMetric(metricIndex) {
  return columnKind(metricIndex) === 0;
}

export function seedInt(rowIndex, metricIndex) {
  return (rowIndex * 9301 + metricIndex * 49297 + 233) % 233280;
}

export function seededMetric(rowIndex, metricIndex) {
  const raw = seedInt(rowIndex, metricIndex);
  return Math.round((raw / 233280) * 100000) / 100;
}

export function dictPick(list, rowIndex, metricIndex) {
  return list[seedInt(rowIndex, metricIndex) % list.length];
}

export function metricCellValue(rowIndex, metricIndex) {
  const kind = columnKind(metricIndex);
  if (kind === 1) {
    return dictPick(CN_LABELS, rowIndex, metricIndex);
  }
  if (kind === 2) {
    return dictPick(EN_PHRASES, rowIndex, metricIndex);
  }
  if (kind === 3) {
    const city = dictPick(CITIES, rowIndex, metricIndex);
    const brand = dictPick(BRANDS, rowIndex, metricIndex + 1);
    const seq = (seedInt(rowIndex, metricIndex) % 900) + 100;
    return `${brand}-${city}-${seq}`;
  }
  return seededMetric(rowIndex, metricIndex);
}

export function metricTitle(metricIndex) {
  const kind = columnKind(metricIndex);
  if (kind === 1) return `中文描述${metricIndex + 1}`;
  if (kind === 2) return `EN Label ${metricIndex + 1}`;
  if (kind === 3) return `混编码${metricIndex + 1}`;
  return `指标${metricIndex + 1}`;
}

export function formatMetricDisplay(value) {
  return typeof value === 'number' ? value.toFixed(2) : value;
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function buildBaseRecord(i, statusIdx) {
  const theme = STATUS_THEME[statusIdx];
  const nameIdx = i % 5000;
  return {
    _i: i,
    id: i + 1,
    status: STATUS_LIST[statusIdx],
    code: `SKU-${String(i + 1).padStart(6, '0')}`,
    name: `智控模组-${(nameIdx % 200) + 1}号`,
    nameEn: `SmartModule-${String((nameIdx % 200) + 1).padStart(3, '0')}`,
    region: REGIONS[i % REGIONS.length],
    dept: DEPTS[i % DEPTS.length],
    owner: OWNERS[i % OWNERS.length],
    city: CITIES[i % CITIES.length],
    brand: BRANDS[i % BRANDS.length],
    tag: TAGS[i % TAGS.length],
    tagEn: TAGS_EN[i % TAGS_EN.length],
    remark: REMARKS[i % REMARKS.length],
    date: `2025-${pad2((i % 12) + 1)}-${pad2((i % 28) + 1)}`,
    _bg: theme.bgColor,
    _fg: theme.color
  };
}
