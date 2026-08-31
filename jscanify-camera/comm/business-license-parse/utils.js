export const DASH = "—";

export function compact(s) {
  return String(s || "").replace(/\s+/g, "");
}

/** 水印 / 噪声行 */
export function isNoiseLine(text) {
  const c = compact(text);
  if (!c) return true;
  if (/^sc\.?jdgl$/i.test(c)) return true;
  if (/^jdgi$/i.test(c)) return true;
  if (/^[a-z.]{1,8}$/i.test(c) && !/\d/.test(c)) return true;
  if (/^[★*·\-—.]+$/.test(c)) return true;
  return false;
}

/**
 * 合并 OCR 常把标签拆成单字的情况：名+称、类+型、住+所 等
 */
export function mergeSplitLabels(rawLines) {
  const lines = rawLines
    .map((t) => String(t || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out = [];
  const pairs = [
    ["名", "称"],
    ["类", "型"],
    ["住", "所"],
    ["重", "要"],
  ];

  for (let i = 0; i < lines.length; i++) {
    const cur = compact(lines[i]);
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    const nextC = compact(next);
    let merged = false;

    for (const [a, b] of pairs) {
      // 「名」+「称深圳…」→「名称深圳…」
      if (cur === a && nextC.startsWith(b)) {
        out.push(a + next);
        i += 1;
        merged = true;
        break;
      }
    }

    if (!merged) out.push(lines[i]);
  }

  // 合并「重要」+「提示」，并丢掉孤立的「重/要/提/示」碎片
  const out2 = [];
  for (let i = 0; i < out.length; i++) {
    const c = compact(out[i]);
    if (c === "重要" && i + 1 < out.length && /^提示/.test(compact(out[i + 1]))) {
      out2.push("重要提示");
      i += 1;
      continue;
    }
    if (c === "重" || c === "要" || c === "提" || c === "示") continue;
    out2.push(out[i]);
  }
  return out2;
}

export function normalizeLines(texts) {
  let items;
  if (Array.isArray(texts)) {
    items = texts.map((t) => {
      if (t && typeof t === "object" && "text" in t) {
        return {
          text: String(t.text || "")
            .replace(/\s+/g, " ")
            .trim(),
          box: t.box || null,
        };
      }
      return {
        text: String(t || "")
          .replace(/\s+/g, " ")
          .trim(),
        box: null,
      };
    });
  } else {
    items = String(texts || "")
      .split(/\r?\n/)
      .map((line) => ({
        text: line.replace(/\s+/g, " ").trim(),
        box: null,
      }));
  }

  items = items.filter((item) => item.text && !isNoiseLine(item.text));

  const withBox = items.filter(
    (i) => i.box && Number.isFinite(i.box.y0) && Number.isFinite(i.box.x0)
  );
  if (withBox.length === items.length && items.length > 1) {
    const heights = items.map((i) => Math.max(8, i.box.y1 - i.box.y0));
    const sortedH = [...heights].sort((a, b) => a - b);
    const medianH = sortedH[Math.floor(sortedH.length / 2)];
    const rowTol = Math.max(12, medianH * 0.6);
    items = [...items].sort((a, b) => {
      const ay = (a.box.y0 + a.box.y1) / 2;
      const by = (b.box.y0 + b.box.y1) / 2;
      if (Math.abs(ay - by) > rowTol) return ay - by;
      return a.box.x0 - b.box.x0;
    });
  }

  const mergedTexts = mergeSplitLabels(items.map((i) => i.text));
  // 合并后丢失 box，结构化字段以文本为主
  return mergedTexts.map((text) => ({ text, box: null }));
}

export function linesText(items) {
  return items.map((i) => i.text);
}

/** 是否为字段标签行（避免把下一字段标签当值） */
export function isFieldLabelLine(text) {
  const c = compact(text);
  if (!c) return false;
  return /^(统一社会信用代码|注册号|名称|企业名称|类型|商事主体类型|公司类型|企业类型|法定代表人|经营者|投资人|负责人|成立日期|注册日期|登记日期|住所|经营场所|营业场所|营业期限|经营范围|注册资本|出资额|实缴资本|登记机关|证照编号|重要提示|说明)$/.test(
    c
  );
}

function shouldStopCollect(text, labelSet, stopSet) {
  const c = compact(text);
  if (!c) return true;
  if (isFieldLabelLine(c)) return true;
  if (stopSet.some((s) => c.includes(s))) return true;
  if (labelSet.some((l) => c === l || c.startsWith(l))) return true;
  // 重要提示编号段落
  if (/^[123][.、．]/.test(c) || /^[123][.、．]/.test(text.trim())) return true;
  if (
    /重要提示|国家企业信用|市场监督|扫一扫|经营范围以|http|www\.gsxt|数字签名|仅供信|公示系统查验/i.test(
      c
    )
  ) {
    return true;
  }
  return false;
}

/**
 * 在标签后取值；支持同行、下一行。
 */
export function pickAfterLabel(lines, labels, { maxLen = 80, nextLine = true } = {}) {
  const labelSet = labels.map((l) => compact(l));
  // 长标签优先，避免「类型」误匹配「商事主体类型」前缀截断
  const sorted = [...labelSet].sort((a, b) => b.length - a.length);

  for (let i = 0; i < lines.length; i++) {
    const c = compact(lines[i]);
    for (const label of sorted) {
      if (!c.includes(label)) continue;
      let value = c.split(label).slice(1).join(label).replace(/^[:：]/, "");
      if (!value && nextLine && lines[i + 1]) {
        const next = compact(lines[i + 1]);
        if (!shouldStopCollect(next, labelSet, [])) {
          value = next;
        }
      }
      if (value) return value.slice(0, maxLen);
    }
  }
  return "";
}

/**
 * 多行字段（如住所）：从标签行起向后拼接，直到遇到下一字段或无关块。
 */
export function pickMultiLineAfterLabel(
  lines,
  labels,
  { maxLen = 120, maxExtraLines = 4, stopLabels = [] } = {}
) {
  const labelSet = labels.map((l) => compact(l));
  const stopSet = stopLabels.map((l) => compact(l));
  const sorted = [...labelSet].sort((a, b) => b.length - a.length);

  for (let i = 0; i < lines.length; i++) {
    const c = compact(lines[i]);
    for (const label of sorted) {
      if (!c.includes(label)) continue;
      const parts = [];
      const first = c.split(label).slice(1).join(label).replace(/^[:：]/, "");
      if (first && !shouldStopCollect(first, labelSet, stopSet)) {
        parts.push(first);
      }
      for (let j = i + 1; j < lines.length && parts.length < maxExtraLines; j++) {
        const raw = lines[j];
        const nc = compact(raw);
        if (shouldStopCollect(nc, labelSet, stopSet)) break;
        // 住所续行：括号办公区等可保留
        parts.push(nc);
      }
      if (parts.length) return parts.join("").slice(0, maxLen);
    }
  }
  return "";
}

export function formatCnDate(y, m, d) {
  if (!y) return "";
  const mm = String(m || "").padStart(2, "0");
  const dd = String(d || "").padStart(2, "0");
  return `${y}年${mm}月${dd}日`;
}

/**
 * 从文本中提取所有中文日期。
 * 兼容：日误识为白；跨行「2025年2月」+「09日」；「2021年02月03白」
 */
export function extractCnDates(text) {
  const c = compact(text)
    // 日误识
    .replace(/(\d{1,2})白/g, "$1日");
  const dates = [];
  const re = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
  let m;
  while ((m = re.exec(c))) {
    dates.push(formatCnDate(m[1], m[2], m[3]));
  }
  return dates;
}

/** 在多行中拼接邻近碎片后再抽日期（处理「2025年2月」「09日」拆行） */
export function extractCnDatesFromLines(lines) {
  const joined = compact(lines.join("")).replace(/(\d{1,2})白/g, "$1日");
  // 补全「年月」与「日」被拆开：2025年2月09日
  const fixed = joined.replace(/(\d{4}年\d{1,2}月)(\d{1,2}日)/g, "$1$2");
  return extractCnDates(fixed);
}
