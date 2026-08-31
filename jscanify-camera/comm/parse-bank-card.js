/**
 * 从 OCR 文本解析银行卡信息
 * @param {string[]|string} texts
 */

const BANK_BIN_MAP = [
  { prefix: "621483", name: "招商银行" },
  { prefix: "622588", name: "招商银行" },
  { prefix: "622576", name: "招商银行" },
  { prefix: "622580", name: "招商银行" },
  { prefix: "621700", name: "中国建设银行" },
  { prefix: "622700", name: "中国建设银行" },
  { prefix: "436742", name: "中国建设银行" },
  { prefix: "622202", name: "中国工商银行" },
  { prefix: "621226", name: "中国工商银行" },
  { prefix: "955880", name: "中国工商银行" },
  { prefix: "621785", name: "中国银行" },
  { prefix: "621660", name: "中国银行" },
  { prefix: "621661", name: "中国银行" },
  { prefix: "622848", name: "中国农业银行" },
  { prefix: "622845", name: "中国农业银行" },
  { prefix: "621282", name: "中国农业银行" },
  { prefix: "622262", name: "交通银行" },
  { prefix: "621002", name: "交通银行" },
  { prefix: "622155", name: "上海银行" },
  { prefix: "622609", name: "招商银行" },
  { prefix: "622188", name: "邮储银行" },
  { prefix: "621799", name: "邮储银行" },
  { prefix: "622568", name: "广发银行" },
  { prefix: "622666", name: "中国光大银行" },
  { prefix: "622622", name: "中国民生银行" },
  { prefix: "621486", name: "招商银行" },
  { prefix: "623058", name: "平安银行" },
  { prefix: "622298", name: "平安银行" },
  { prefix: "622516", name: "浦发银行" },
  { prefix: "621792", name: "浦发银行" },
  { prefix: "622630", name: "华夏银行" },
  { prefix: "622636", name: "华夏银行" },
  { prefix: "621483", name: "招商银行" },
  { prefix: "628366", name: "中国建设银行" },
];

const BANK_NAME_KEYWORDS = [
  "中国工商银行",
  "工商银行",
  "中国建设银行",
  "建设银行",
  "中国农业银行",
  "农业银行",
  "中国银行",
  "交通银行",
  "招商银行",
  "邮储银行",
  "邮政储蓄银行",
  "中国邮政储蓄银行",
  "浦发银行",
  "浦东发展银行",
  "民生银行",
  "兴业银行",
  "中信银行",
  "光大银行",
  "华夏银行",
  "平安银行",
  "广发银行",
  "北京银行",
  "上海银行",
  "江苏银行",
  "宁波银行",
];

function normalizeLines(texts) {
  const raw = Array.isArray(texts) ? texts.join("\n") : String(texts || "");
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function formatCardNumber(digits) {
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function luhnCheck(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function findCardNumber(lines) {
  const candidates = [];

  for (const line of lines) {
    const digits = onlyDigits(line);
    if (digits.length >= 13 && digits.length <= 19) {
      candidates.push(digits);
    }
    // 行内可能混有文字
    const matches = line.match(/(?:\d[ -]*){13,19}/g) || [];
    for (const m of matches) {
      const d = onlyDigits(m);
      if (d.length >= 13 && d.length <= 19) candidates.push(d);
    }
  }

  // 合并多行断裂卡号
  const joined = onlyDigits(lines.join(""));
  if (joined.length >= 13 && joined.length <= 19) candidates.push(joined);

  // 优先 Luhn 通过、长度 16/19
  const uniq = [...new Set(candidates)];
  uniq.sort((a, b) => {
    const score = (d) =>
      (luhnCheck(d) ? 10 : 0) +
      (d.length === 16 || d.length === 19 ? 5 : 0) +
      d.length;
    return score(b) - score(a);
  });
  return uniq[0] || "";
}

function bankFromBin(cardNumber) {
  if (!cardNumber) return "";
  const sorted = [...BANK_BIN_MAP].sort(
    (a, b) => b.prefix.length - a.prefix.length
  );
  for (const item of sorted) {
    if (cardNumber.startsWith(item.prefix)) return item.name;
  }
  return "";
}

function bankFromText(full) {
  for (const name of BANK_NAME_KEYWORDS) {
    if (full.includes(name)) {
      if (name === "工商银行") return "中国工商银行";
      if (name === "建设银行") return "中国建设银行";
      if (name === "农业银行") return "中国农业银行";
      if (name === "邮政储蓄银行" || name === "中国邮政储蓄银行") {
        return "邮储银行";
      }
      if (name === "浦东发展银行") return "浦发银行";
      return name;
    }
  }
  return "";
}

/**
 * @returns {{
 *   isBankCard: boolean,
 *   message: string,
 *   bank: string,
 *   account: string,
 *   accountRaw: string
 * }}
 */
export function parseBankCard(texts) {
  const lines = normalizeLines(texts);
  const full = lines.join("\n");
  const accountRaw = findCardNumber(lines);
  const bank = bankFromText(full) || bankFromBin(accountRaw);

  const isBankCard = !!accountRaw || !!bank;

  if (!isBankCard) {
    return {
      isBankCard: false,
      message: "未识别为银行卡，请上传清晰的银行卡正面照片",
      bank: "—",
      account: "—",
      accountRaw: "",
    };
  }

  return {
    isBankCard: true,
    message: accountRaw ? "" : "已识别到银行信息，但卡号不完整",
    bank: bank || "未知银行",
    account: accountRaw ? formatCardNumber(accountRaw) : "—",
    accountRaw,
  };
}
