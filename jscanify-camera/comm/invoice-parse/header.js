import { compact, pickAfterLabel } from "./utils.js";

export function findInvoiceNumber(lines, full) {
  const labeled = pickAfterLabel(lines, ["发票号码"], { maxLen: 30 });
  if (/^\d{8,30}$/.test(labeled)) return labeled;

  const m = compact(full).match(/发票号码[:：]?(\d{8,30})/);
  if (m) return m[1];

  // 全电发票号码多为 20 位
  for (const line of lines) {
    const c = compact(line);
    const m20 = c.match(/(?:^|[^A-Za-z0-9])(\d{20})(?:[^A-Za-z0-9]|$)/);
    if (m20) return m20[1];
  }
  for (const line of lines) {
    const c = compact(line);
    const m = c.match(/(?:^|[^A-Za-z0-9])(\d{10,22})(?:[^A-Za-z0-9]|$)/);
    if (m && !/统一社会信用|纳税人识别|银行账号/.test(line)) {
      return m[1];
    }
  }
  return "";
}

export function findInvoiceDate(lines, full) {
  const labeled = pickAfterLabel(lines, ["开票日期"], { maxLen: 24 });
  const dateRe =
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日|(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/;

  const tryFormat = (s) => {
    const m = compact(s).match(dateRe);
    if (!m) return "";
    if (m[1]) {
      return `${m[1]}年${m[2].padStart(2, "0")}月${m[3].padStart(2, "0")}日`;
    }
    return `${m[4]}年${m[5].padStart(2, "0")}月${m[6].padStart(2, "0")}日`;
  };

  const fromLabel = tryFormat(labeled);
  if (fromLabel) return fromLabel;

  const fromFull = tryFormat(full);
  if (fromFull) return fromFull;

  return labeled || "";
}

/**
 * 印章/票头中的税务机关，如：国家税务总局江苏省税务局
 */
export function findTaxBureau(lines, full) {
  const bureauRe =
    /(国家税务总局)?[\u4e00-\u9fa5·]{2,20}税务局/;

  for (const line of lines) {
    const c = compact(line);
    if (!/税务局|税务总局/.test(c)) continue;
    if (/购买方|销售方|备注|项目名称/.test(c)) continue;
    const m = c.match(bureauRe);
    if (m) return m[0].slice(0, 40);
  }

  const mFull = compact(full).match(bureauRe);
  if (mFull) return mFull[0].slice(0, 40);
  return "";
}

/**
 * 开票人：备注之后常见「开票人：张三」
 */
export function findIssuer(lines, full) {
  for (const line of lines) {
    const c = compact(line);
    if (!/开票人/.test(c)) continue;
    let name = c.replace(/^.*?开票人[:：]?/, "").replace(/收款人.*$/, "").replace(/复核.*$/, "");
    // 去掉可能粘连的标签
    name = name.replace(/^(收款人|复核).*$/, "").trim();
    if (name && name.length <= 20 && !/备注|价税合计/.test(name)) {
      return name.slice(0, 20);
    }
  }

  const m = compact(full).match(/开票人[:：]?([\u4e00-\u9fa5·]{1,20})/);
  if (m) {
    const name = m[1].replace(/(收款人|复核).*$/, "");
    if (name) return name.slice(0, 20);
  }

  // 标签与姓名分行
  const idx = lines.findIndex((l) => compact(l) === "开票人" || /^开票人[:：]?$/.test(compact(l)));
  if (idx >= 0 && lines[idx + 1]) {
    const next = compact(lines[idx + 1]);
    if (/^[\u4e00-\u9fa5·]{1,20}$/.test(next) && !/收款人|复核|备注/.test(next)) {
      return next;
    }
  }
  return "";
}
