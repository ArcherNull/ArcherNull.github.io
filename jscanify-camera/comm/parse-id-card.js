/**
 * 从 OCR 文本块解析身份证正反面信息
 * @param {string[]|string} texts
 */

function normalizeLines(texts) {
  const raw = Array.isArray(texts) ? texts.join("\n") : String(texts || "");
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function joinText(lines) {
  return lines.join("\n");
}

function pickAfterLabel(lines, labels, { maxLen = 40 } = {}) {
  const labelSet = labels.map((l) => l.replace(/\s/g, ""));
  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].replace(/\s/g, "");
    for (const label of labelSet) {
      if (compact.includes(label)) {
        let value = compact.split(label).slice(1).join(label).replace(/^[:：]/, "");
        if (!value && lines[i + 1]) {
          value = lines[i + 1].replace(/\s/g, "");
        }
        if (value) return value.slice(0, maxLen);
      }
    }
  }
  return "";
}

function findIdNumber(text) {
  const m = text.replace(/\s/g, "").match(/\d{17}[\dXx]/);
  return m ? m[0].toUpperCase() : "";
}

function birthFromId(id) {
  if (!/^\d{17}[\dX]$/.test(id)) return "";
  const y = id.slice(6, 10);
  const m = id.slice(10, 12);
  const d = id.slice(12, 14);
  return `${y}年${m}月${d}日`;
}

function genderFromId(id) {
  if (!/^\d{17}[\dX]$/.test(id)) return "";
  return Number(id[16]) % 2 === 1 ? "男" : "女";
}

function detectSide(text) {
  const t = text.replace(/\s/g, "");
  const frontScore =
    (t.includes("姓名") ? 2 : 0) +
    (t.includes("性别") ? 1 : 0) +
    (t.includes("民族") ? 1 : 0) +
    (t.includes("出生") ? 1 : 0) +
    (t.includes("住址") ? 2 : 0) +
    (t.includes("公民身份号码") || t.includes("身份号码") ? 3 : 0) +
    (/\d{17}[\dXx]/.test(t) ? 3 : 0);

  const backScore =
    (t.includes("签发机关") ? 3 : 0) +
    (t.includes("有效期限") || t.includes("有效期") ? 3 : 0) +
    (t.includes("中华人民共和国") ? 1 : 0) +
    (t.includes("居民身份证") ? 1 : 0);

  if (frontScore >= 4 && frontScore >= backScore) return "front";
  if (backScore >= 3 && backScore > frontScore) return "back";
  if (frontScore >= 3) return "front";
  if (backScore >= 2) return "back";
  return null;
}

function parseFront(lines, full) {
  const idNumber = findIdNumber(full);
  let name = pickAfterLabel(lines, ["姓名"]);
  // 去掉可能粘连的“性别”
  name = name.replace(/性别.*$/, "").replace(/男|女/, "").slice(0, 20);

  let gender = pickAfterLabel(lines, ["性别"], { maxLen: 2 });
  if (!/^[男女]$/.test(gender)) {
    const g = full.match(/性别[:：\s]*([男女])/);
    gender = g ? g[1] : genderFromId(idNumber);
  }

  let nation = pickAfterLabel(lines, ["民族"], { maxLen: 10 });
  nation = nation.replace(/出生.*$/, "").replace(/^[男女]/, "");
  if (nation && !nation.endsWith("族") && nation.length <= 3) {
    nation = `${nation}族`;
  }

  let birth = pickAfterLabel(lines, ["出生"], { maxLen: 20 });
  const birthMatch = full.replace(/\s/g, "").match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (birthMatch) {
    birth = `${birthMatch[1]}年${birthMatch[2].padStart(2, "0")}月${birthMatch[3].padStart(2, "0")}日`;
  } else if (!birth) {
    birth = birthFromId(idNumber);
  }

  let address = pickAfterLabel(lines, ["住址", "地址"], { maxLen: 80 });
  // 住址常跨多行：从住址行后收集，直到身份号码
  const addrIdx = lines.findIndex((l) => /住\s*址|地\s*址/.test(l));
  if (addrIdx >= 0) {
    const parts = [];
    const first = lines[addrIdx].replace(/住\s*址|地\s*址/, "").replace(/^[:：]/, "").trim();
    if (first && !/公民身份|身份号码|\d{17}/.test(first)) parts.push(first);
    for (let i = addrIdx + 1; i < lines.length; i++) {
      if (/公民身份|身份号码|\d{17}[\dXx]/.test(lines[i])) break;
      if (/姓名|性别|民族|出生/.test(lines[i])) continue;
      parts.push(lines[i]);
    }
    if (parts.length) address = parts.join("").replace(/\s/g, "");
  }
  address = address.replace(/公民身份号码.*$/, "").replace(/\d{17}[\dXx].*$/, "");

  return {
    name: name || "—",
    gender: gender || "—",
    nation: nation || "—",
    birth: birth || "—",
    address: address || "—",
    idNumber: idNumber || "—",
  };
}

function parseBack(lines, full) {
  let authority = pickAfterLabel(lines, ["签发机关"], { maxLen: 40 });
  authority = authority.replace(/有效期限.*$/, "").replace(/有效期.*$/, "");

  let validPeriod = pickAfterLabel(lines, ["有效期限", "有效期"], { maxLen: 40 });
  const periodMatch = full
    .replace(/\s/g, "")
    .match(/(\d{4}[.\-/年]\d{1,2}[.\-/月]\d{1,2}日?)\s*[-—至到~]\s*(\d{4}[.\-/年]\d{1,2}[.\-/月]\d{1,2}日?|长期)/);
  if (periodMatch) {
    const fmt = (s) =>
      s
        .replace(/年|月/g, ".")
        .replace(/日/g, "")
        .replace(/-/g, ".")
        .replace(/\//g, ".");
    validPeriod = periodMatch[2] === "长期"
      ? `${fmt(periodMatch[1])}-长期`
      : `${fmt(periodMatch[1])}-${fmt(periodMatch[2])}`;
  }

  // 兜底：找两个日期
  if (!validPeriod || validPeriod === "有效期限") {
    const dates = full.match(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g);
    if (dates && dates.length >= 2) {
      validPeriod = `${dates[0].replace(/-/g, ".")}-${dates[1].replace(/-/g, ".")}`;
    } else if (/长期/.test(full) && dates?.[0]) {
      validPeriod = `${dates[0].replace(/-/g, ".")}-长期`;
    }
  }

  return {
    authority: authority || "—",
    validPeriod: validPeriod || "—",
  };
}

/**
 * @returns {{
 *   isIdCard: boolean,
 *   side: 'front'|'back'|null,
 *   sideLabel: string,
 *   message: string,
 *   front: object|null,
 *   back: object|null
 * }}
 */
export function parseIdCard(texts) {
  const lines = normalizeLines(texts);
  const full = joinText(lines);
  const side = detectSide(full);
  const hasIdNumber = !!findIdNumber(full);
  const isIdCard = !!side || hasIdNumber;

  if (!isIdCard) {
    return {
      isIdCard: false,
      side: null,
      sideLabel: "",
      message: "未识别为身份证，请上传清晰的身份证正反面照片",
      front: null,
      back: null,
    };
  }

  if (side === "front" || (!side && hasIdNumber)) {
    return {
      isIdCard: true,
      side: "front",
      sideLabel: "身份证正面",
      message: "",
      front: parseFront(lines, full),
      back: null,
    };
  }

  return {
    isIdCard: true,
    side: "back",
    sideLabel: "身份证背面",
    message: "",
    front: null,
    back: parseBack(lines, full),
  };
}
