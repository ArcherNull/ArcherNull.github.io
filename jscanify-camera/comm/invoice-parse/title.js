import { TITLE_PATTERNS } from "./constants.js";
import { compact } from "./utils.js";

/** 标题匹配用：去空白并统一括号 */
function normalizeTitleText(s) {
  return compact(s).replace(/\(/g, "（").replace(/\)/g, "）");
}

/**
 * OCR 常把「电子发票」拆成「电子发」「电子发业」「电子发，」等。
 */
function repairTitleOcr(s) {
  let t = normalizeTitleText(s);
  if (!t) return "";
  // 电子发业 / 电子发， / 电子发. → 电子发票
  t = t.replace(/电子发业/g, "电子发票");
  t = t.replace(/电子发[，,、.。]/g, "电子发票");
  t = t.replace(/电子发(?!票)/g, "电子发票");
  // 「票（普通发票）」前缺「电子发」时，若上下文已有电子发票则不动
  return t;
}

function finalizeTitle(raw) {
  let t = repairTitleOcr(raw);
  if (!t) return "";
  // 有左括号无右括号时补全
  if (/（/.test(t) && !/）/.test(t)) t += "）";
  return t;
}

function isCompleteTitle(t) {
  if (!t) return false;
  // 拒绝「票（普通发票）」这类缺「电子发」的残片
  if (/^票[（(]/.test(t)) return false;
  if (/^发票[）)]$/.test(t)) return false;
  return (
    /电子发票/.test(t) ||
    /增值税电子/.test(t) ||
    /增值税[普通专用]发票/.test(t)
  );
}

function matchTitlePattern(text) {
  const c = repairTitleOcr(text);
  if (!c) return "";
  for (const re of TITLE_PATTERNS) {
    const m = c.match(re);
    if (m) {
      const hit = finalizeTitle(m[0]);
      if (isCompleteTitle(hit)) return hit;
    }
  }
  return "";
}

function hasNormalHint(c) {
  return (
    /普通发票/.test(c) ||
    /普通/.test(c) ||
    /以普/.test(c) ||
    /荣以普/.test(c) ||
    /普[SｓS]/.test(c) ||
    // 「以晋」多为印章/（普 的误识
    /以晋/.test(c) ||
    (/普/.test(c) && /发票|票[（(）)]/.test(c))
  );
}

function hasSpecialHint(c) {
  return /专用发票|增值税专用|专用/.test(c);
}

function hasElectronicHint(c) {
  return /电子发票|电子发/.test(c);
}

/**
 * OCR 常把标题拆成「电子发」+「发票）」+「以晋」等多块，按关键词拼回完整标题。
 */
function assembleTitleFromKeywords(joined) {
  const c = repairTitleOcr(joined);
  if (!c) return "";
  if (!/发票|票[（(）)]|电子发/.test(c)) return "";

  // 已是完整模式
  const direct = matchTitlePattern(c);
  if (direct) return direct;

  const electronic = hasElectronicHint(c);
  const hasVatElectronic = /增值税电子/.test(c);
  const isSpecial = hasSpecialHint(c);
  const isNormal = hasNormalHint(c);

  if (electronic) {
    if (isSpecial && !isNormal) return "电子发票（增值税专用发票）";
    if (isNormal || /票[（(）)]|发票[）)]/.test(c)) {
      // 残片「电子发」+「发票）」也按普通发票补全（全电票最常见）
      return "电子发票（普通发票）";
    }
    if (/电子发票/.test(c)) {
      const m = c.match(/电子发票/);
      return m ? m[0] : "";
    }
  }

  if (hasVatElectronic) {
    if (isSpecial) {
      const prefix = (c.match(/([\u4e00-\u9fa5]{0,8})增值税电子专用发票/) || [])[1] || "";
      return `${prefix}增值税电子专用发票`;
    }
    if (isNormal || /普通/.test(c)) {
      const prefix = (c.match(/([\u4e00-\u9fa5]{0,8})增值税电子普通发票/) || [])[1] || "";
      return prefix ? `${prefix}增值税电子普通发票` : "增值税电子普通发票";
    }
  }

  if (/增值税专用发票/.test(c) && !/电子/.test(c)) return "增值税专用发票";
  if (/增值税普通发票/.test(c) && !/电子/.test(c)) return "增值税普通发票";

  // 「票（普通发票）」等残片 + 前文曾出现电子发
  if (/票[（(]普通发票[）)]?/.test(c) || /普通发票/.test(c)) {
    return "电子发票（普通发票）";
  }

  return "";
}

function collectEarlyTitleLines(lines) {
  const early = [];
  for (const line of lines) {
    const t = compact(line);
    if (!t) continue;
    // 进入票面字段区则停止收集标题候选
    if (
      /发票号码|开票日期|购买方|销售方|项目名称|统一社会|纳税人识别|规格型号/.test(
        t
      ) &&
      !/电子发票|普通发票|专用发票|增值税电子|电子发/.test(t)
    ) {
      break;
    }
    if (/^\d{8,}$/.test(t)) continue;
    // 过滤明显噪声单字
    if (t.length <= 1 && !/发|票|普|专/.test(t)) continue;
    early.push(line);
    if (early.length >= 16) break;
  }
  return early;
}

function collectTopBandTitleText(items) {
  const withBox = (items || []).filter(
    (i) => i.box && Number.isFinite(i.box.y0) && Number.isFinite(i.box.x0)
  );
  if (withBox.length < 2) return "";

  const minY = Math.min(...withBox.map((i) => i.box.y0));
  const maxY = Math.max(...withBox.map((i) => i.box.y1));
  const pageH = Math.max(1, maxY - minY);
  const bandBottom = minY + pageH * 0.22;

  const top = withBox
    .filter((i) => {
      const c = compact(i.text);
      if (i.box.y0 > bandBottom) return false;
      if (/发票号码|开票日期|统一社会|纳税人识别/.test(c)) return false;
      return /发票|电子|普通|专用|增值税|税务|发业|以晋|以普/.test(c) || c.length <= 16;
    })
    .sort((a, b) => {
      const ay = (a.box.y0 + a.box.y1) / 2;
      const by = (b.box.y0 + b.box.y1) / 2;
      if (Math.abs(ay - by) > 12) return ay - by;
      return a.box.x0 - b.box.x0;
    });

  return top.map((i) => compact(i.text)).join("");
}

export function findInvoiceTitle(items, lines, full) {
  const candidates = [];
  const pushCand = (s) => {
    const t = repairTitleOcr(s);
    if (t && !candidates.includes(t)) candidates.push(t);
  };

  pushCand(full);

  const early = collectEarlyTitleLines(lines);
  pushCand(early.map((l) => compact(l)).join(""));

  // 连续短窗拼接，覆盖标题被拆成 2～6 块的情况
  for (let i = 0; i < early.length; i++) {
    for (let j = i + 1; j <= Math.min(i + 6, early.length); j++) {
      pushCand(early.slice(i, j).map((l) => compact(l)).join(""));
    }
  }

  const topBand = collectTopBandTitleText(items);
  if (topBand) pushCand(topBand);

  // 优先取能匹配完整模式、且更长的标题
  let best = "";
  for (const text of candidates) {
    const hit = matchTitlePattern(text);
    if (hit && hit.length > best.length) best = hit;
  }
  if (best) return best;

  // 关键词拼装（碎片齐全但模式未直接命中）
  for (const text of candidates) {
    const hit = assembleTitleFromKeywords(text);
    if (hit && isCompleteTitle(hit) && hit.length > best.length) best = hit;
  }
  if (best) return best;

  // 最后兜底：顶部含「发票」且不像号码/开票字段的短行
  for (const line of early) {
    const repaired = repairTitleOcr(line);
    if (
      isCompleteTitle(repaired) &&
      repaired.length >= 4 &&
      repaired.length <= 28 &&
      !/发票号码|开票日期|开票人|价税合计/.test(repaired)
    ) {
      return finalizeTitle(repaired);
    }
  }
  return "";
}
