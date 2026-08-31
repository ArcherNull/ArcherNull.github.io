import {
  compact,
  extractCnDates,
  extractCnDatesFromLines,
  formatCnDate,
  pickAfterLabel,
  pickMultiLineAfterLabel,
} from "./utils.js";

/** 统一社会信用代码（允许 OCR 把 S/O/I/Z/V 误入） */
const CREDIT_CODE_STRICT_RE =
  /9[0-9A-HJ-NPQRTUWXY]\d{6}[0-9A-HJ-NPQRTUWXY]{10}/i;
const CREDIT_CODE_LOOSE_RE = /9[0-9A-Z]{17}/i;

export function findCreditCode(lines, full) {
  const pickFrom = (text) => {
    const c = compact(text).toUpperCase();
    return (
      (c.match(CREDIT_CODE_STRICT_RE) || c.match(CREDIT_CODE_LOOSE_RE) || [])[0] ||
      ""
    );
  };

  for (const line of lines) {
    const hit = pickFrom(line);
    if (hit) return hit.toUpperCase();
  }

  const fromLabel = pickAfterLabel(lines, ["统一社会信用代码", "注册号"], {
    maxLen: 32,
  });
  const codeFromLabel = pickFrom(fromLabel);
  if (codeFromLabel) return codeFromLabel.toUpperCase();

  const m = pickFrom(full);
  return m ? m.toUpperCase() : "";
}

function cleanCompanyName(name) {
  let n = compact(name);
  n = n
    .replace(/^(名称|企业名称)/, "")
    .replace(/(商事主体类型|类型|法定代表人|成立日期|住所).*$/, "")
    .replace(/SCJDGL.*$/i, "")
    .replace(/副本.*$/, "")
    .replace(/营业执照.*$/, "");
  // 截到常见主体后缀
  const m = n.match(
    /^([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,40}?(?:有限责任公司|股份有限公司|有限公司|集团有限公司|分公司|公司|厂|中心|部|社|店))/
  );
  if (m) return m[1];
  if (/有限|公司|厂|中心/.test(n) && n.length >= 4 && n.length <= 40) return n;
  return n.length <= 40 ? n : "";
}

export function findCompanyName(lines, full) {
  let name = pickAfterLabel(lines, ["企业名称", "名称"], { maxLen: 60 });
  name = cleanCompanyName(name);
  if (name && /[\u4e00-\u9fa5]{2,}/.test(name)) return name;

  // 全文兜底：名称xxx有限公司
  const c = compact(full);
  const m = c.match(
    /名称([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,40}?(?:有限责任公司|股份有限公司|有限公司|公司))/
  );
  return m ? cleanCompanyName(m[1]) : "";
}

function cleanCompanyType(type) {
  let t = compact(type);
  t = t
    .replace(/^(商事主体类型|公司类型|企业类型|类型)/, "")
    .replace(/(法定代表人|成立日期|住所|登记机关).*$/, "")
    .replace(/SCJDGL.*$/i, "");
  // 常见类型
  const m = t.match(
    /((?:有限责任公司|股份有限公司|合伙企业|个人独资企业|个体工商户)(?:[（(][^）)]{0,30}[）)])?)/
  );
  return m ? m[1] : t.slice(0, 40);
}

export function findCompanyType(lines, full) {
  let type = pickAfterLabel(
    lines,
    ["商事主体类型", "公司类型", "企业类型", "类型"],
    { maxLen: 60 }
  );
  type = cleanCompanyType(type);
  if (type && /公司|企业|个体|合伙/.test(type)) return type;

  const c = compact(full);
  const m = c.match(
    /(?:商事主体类型|公司类型|企业类型|类型)((?:有限责任公司|股份有限公司|合伙企业|个人独资企业)(?:[（(][^）)]{0,30}[）)])?)/
  );
  return m ? m[1] : "";
}

export function findLegalPerson(lines) {
  let person = pickAfterLabel(lines, ["法定代表人", "经营者", "投资人", "负责人"], {
    maxLen: 20,
  });
  person = compact(person)
    .replace(/^(法定代表人|经营者|投资人|负责人)/, "")
    .replace(/(成立日期|住所|登记机关|类型).*$/, "")
    .replace(/[\d年月日].*$/, "")
    .replace(/[（(].*$/, "");
  const m = person.match(/^[\u4e00-\u9fa5·]{2,6}/);
  return m ? m[0] : person.slice(0, 6);
}

export function findEstablishDate(lines, full) {
  for (let i = 0; i < lines.length; i++) {
    if (!/成立日期|注册日期/.test(compact(lines[i]))) continue;
    const nearby = [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean);
    const dates = extractCnDatesFromLines(nearby);
    if (dates.length) return dates[0];
  }

  const fromLabel = pickAfterLabel(lines, ["成立日期", "注册日期"], { maxLen: 30 });
  const m = compact(fromLabel)
    .replace(/(\d{1,2})白/g, "$1日")
    .match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return formatCnDate(m[1], m[2], m[3]);

  // 排除说明/留存段落后再取日期
  const main = stripNoticeSection(full);
  const dates = extractCnDates(main);
  return dates[0] || "";
}

export function findAddress(lines) {
  let address = pickMultiLineAfterLabel(lines, ["住所", "经营场所", "营业场所"], {
    maxLen: 120,
    maxExtraLines: 3,
    stopLabels: [
      "登记机关",
      "营业期限",
      "经营范围",
      "注册资本",
      "重要提示",
      "成立日期",
      "法定代表人",
      "说明",
    ],
  });
  address = compact(address)
    .replace(/^(住所|经营场所|营业场所)/, "")
    .replace(/(登记机关|营业期限|经营范围|注册资本|重要提示|说明).*$/, "")
    .replace(/SCJDGL.*$/i, "")
    .replace(/^[1-3][.、．].*$/, "");
  // 去掉尾部噪声短英文字母
  address = address.replace(/[A-Za-z]{3,}$/g, "");
  return address;
}

/** 注册资本 / 出资额 */
export function findRegisteredCapital(lines, full) {
  let capital = pickAfterLabel(lines, ["注册资本", "出资额"], { maxLen: 40 });
  capital = compact(capital)
    .replace(/^(注册资本|出资额)/, "")
    .replace(/(实缴资本|成立日期|住所|经营范围|登记机关|类型|法定代表人).*$/, "");

  // 常见形态：人民币100万元整 / 100万元 / 壹佰万元整
  const m = capital.match(
    /((?:人民币)?[\d.,]+(?:万)?元(?:整)?|(?:人民币)?[零壹贰叁肆伍陆柒捌玖拾佰仟万亿两]+元(?:整)?)/
  );
  if (m) return m[1];

  if (capital && /(元|万)/.test(capital) && capital.length <= 40) return capital;

  const c = compact(full);
  const fm = c.match(
    /(?:注册资本|出资额)[:：]?((?:人民币)?[\d.,]+(?:万)?元(?:整)?|(?:人民币)?[零壹贰叁肆伍陆柒捌玖拾佰仟万亿两]+元(?:整)?)/
  );
  return fm ? fm[1] : "";
}

/** 经营范围（多行，避开重要提示里的说明文字） */
export function findBusinessScope(lines) {
  // 若「经营范围」仅出现在重要提示说明中，不要误抽
  const scopeIdx = lines.findIndex((l) => {
    const c = compact(l);
    return (
      /经营范围/.test(c) &&
      !/经营范围由章程|经营范围中属于|经营范围和许可|经营范围以|总营范围|经营范国/.test(c)
    );
  });
  if (scopeIdx < 0) return "";

  let scope = pickMultiLineAfterLabel(lines, ["经营范围"], {
    maxLen: 500,
    maxExtraLines: 12,
    stopLabels: [
      "登记机关",
      "营业期限",
      "注册资本",
      "实缴资本",
      "重要提示",
      "成立日期",
      "法定代表人",
      "住所",
      "说明",
    ],
  });
  scope = compact(scope)
    .replace(/^经营范围/, "")
    .replace(/(登记机关|营业期限|重要提示|说明|国家企业信用).*$/, "");

  // 过滤误抽到的提示文案
  if (/由章程确定|应当经批准|年度报告|信息公示/.test(scope) && scope.length < 80) {
    return "";
  }
  return scope;
}

/** 去掉「说明 / 重要提示」之后的文本，避免误抽留存打印日期等 */
export function stripNoticeSection(full) {
  const c = compact(full);
  const cut = c.search(/重要提示|说明[:：]|本营业执照于|数字签名/);
  if (cut > 0) return c.slice(0, cut);
  return c;
}

/**
 * 登记机关：优先标签；否则印章关键词；再按信用代码区划兜底。
 */
export function findRegistrationAuthority(lines, full, creditCode) {
  const sealRe =
    /([\u4e00-\u9fa5]{2,20}(?:市场监督管理局|工商行政管理局|行政审批局|市场监管局))/;

  let authority = pickAfterLabel(lines, ["登记机关"], { maxLen: 40 });
  authority = compact(authority)
    .replace(/^登记机关/, "")
    .replace(/\d{4}年.*$/, "")
    .replace(/(说明|国家企业|监制|数字签名).*$/, "");

  if (authority) {
    const m = authority.match(sealRe);
    if (m) return m[1];
    if (/(局|厅|委员会|中心)$/.test(authority) && authority.length <= 30) {
      return authority;
    }
  }

  for (const line of lines) {
    const c = compact(line).replace(/^登记机关/, "");
    if (/重要提示|国家企业信用|监制|扫一扫|数字签名|仅供/.test(c)) continue;
    const m = c.match(sealRe);
    if (m && m[1].length <= 30) return m[1];
  }

  const cfull = compact(full).replace(/登记机关/g, "");
  const seal = cfull.match(sealRe);
  if (seal) return seal[1];

  return authorityFromCreditCode(creditCode) || "";
}

/** 信用代码第 3–8 位为行政区划码 */
function authorityFromCreditCode(creditCode) {
  if (!creditCode || creditCode.length < 8) return "";
  const area = creditCode.slice(2, 8);
  const map = {
    440300: "深圳市市场监督管理局",
    440303: "深圳市市场监督管理局",
    440304: "深圳市市场监督管理局",
    440305: "深圳市市场监督管理局",
    440306: "深圳市市场监督管理局",
    440307: "深圳市市场监督管理局",
    440308: "深圳市市场监督管理局",
    440400: "珠海市市场监督管理局",
    440401: "珠海市市场监督管理局",
    440402: "珠海市市场监督管理局",
    440403: "珠海市市场监督管理局",
    440404: "珠海市市场监督管理局",
  };
  // 横琴等新区历史印章多为「工商行政管理局」，无法从 OCR 还原时用市级兜底
  return map[area] || "";
}

/**
 * 登记日期：登记机关附近最后那个日期；也识别「登记日期」标签。
 * 忽略「留存/打印」句中的日期；可取说明段落后的独立日期行。
 */
export function findRegistrationDate(lines, full, establishDate) {
  // 显式「登记日期」标签
  for (let i = 0; i < lines.length; i++) {
    if (!/登记日期/.test(compact(lines[i]))) continue;
    const nearby = [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean);
    const dates = extractCnDatesFromLines(nearby);
    if (dates.length) return dates[0];
  }
  const fromLabel = pickAfterLabel(lines, ["登记日期"], { maxLen: 30 });
  const lm = compact(fromLabel)
    .replace(/(\d{1,2})白/g, "$1日")
    .match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (lm) return formatCnDate(lm[1], lm[2], lm[3]);

  const isRetainLine = (line) =>
    /本营业执照于|留存|打印|数字签名/.test(compact(line));

  // 登记机关附近（允许跨过说明标题看后续独立日期）
  for (let i = 0; i < lines.length; i++) {
    const c = compact(lines[i]);
    if (!/登记机关|核准日期|发证日期|登记日期/.test(c)) continue;

    const nearby = [];
    for (let j = i; j < Math.min(lines.length, i + 8); j++) {
      if (isRetainLine(lines[j])) continue;
      nearby.push(lines[j]);
    }
    if (i > 0) nearby.unshift(lines[i - 1]);
    const dates = extractCnDatesFromLines(nearby).filter(
      (d) => !isRetainContextDate(d, lines)
    );
    if (dates.length) {
      const prefer = pickBetterRegistrationDate(dates, establishDate);
      if (prefer) return prefer;
    }
  }

  // 独立日期行（整行几乎只有一个日期）
  const standalone = [];
  for (const line of lines) {
    if (isRetainLine(line)) continue;
    const dates = extractCnDates(line);
    const c = compact(line).replace(/(\d{1,2})白/g, "$1日");
    if (dates.length === 1 && /^[\d年月日\s]+$/.test(c) && c.length <= 16) {
      standalone.push(dates[0]);
    }
  }
  if (standalone.length) {
    const last = standalone[standalone.length - 1];
    if (last !== establishDate || standalone.length === 1) {
      const other = [...standalone].reverse().find((d) => d !== establishDate);
      return other || last;
    }
  }

  // 全文日期（排除留存句）
  const usableLines = lines.filter((l) => !isRetainLine(l));
  const allDates = extractCnDatesFromLines(usableLines);
  if (!allDates.length) return establishDate || "";

  const others = establishDate
    ? allDates.filter((d) => d !== establishDate)
    : allDates;
  if (others.length) return others[others.length - 1];
  return establishDate || allDates[allDates.length - 1] || "";
}

function isRetainContextDate(date, lines) {
  const joined = lines.join("");
  // 「本营业执照于2026年07月07日…留存」中的日期
  return new RegExp(`于${compact(date)}`).test(compact(joined));
}

function pickBetterRegistrationDate(dates, establishDate) {
  if (!dates.length) return "";
  if (!establishDate) return dates[dates.length - 1];

  for (const d of dates) {
    if (d === establishDate) return d;
  }

  // OCR 把 12月 识成 2月：同年同日、月份不同时优先成立日期
  const em = establishDate.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (em) {
    for (const d of dates) {
      const dm = d.match(/(\d{4})年(\d{2})月(\d{2})日/);
      if (dm && dm[1] === em[1] && dm[3] === em[3] && dm[2] !== em[2]) {
        return establishDate;
      }
    }
  }

  return dates.find((d) => d !== establishDate) || dates[dates.length - 1];
}
