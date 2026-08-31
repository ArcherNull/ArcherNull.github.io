export function compact(s) {
  return String(s || "").replace(/\s+/g, "");
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

  items = items.filter((item) => item.text);

  // 按阅读顺序排序（先上后下、先左后右），避免检测框乱序导致字段错位
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

  return items;
}

export function linesText(items) {
  return items.map((i) => i.text);
}

export function pickAfterLabel(lines, labels, { maxLen = 80, nextLine = true } = {}) {
  const labelSet = labels.map((l) => compact(l));
  for (let i = 0; i < lines.length; i++) {
    const c = compact(lines[i]);
    for (const label of labelSet) {
      if (!c.includes(label)) continue;
      let value = c.split(label).slice(1).join(label).replace(/^[:：]/, "");
      if (!value && nextLine && lines[i + 1]) {
        const next = compact(lines[i + 1]);
        if (!labelSet.some((l) => next === l || next.startsWith(l))) {
          value = next;
        }
      }
      if (value) return value.slice(0, maxLen);
    }
  }
  return "";
}

export function isMoneyLike(s) {
  const c = compact(s);
  // 带币种符号，或带小数（单价/金额/税额）
  return /^[¥￥]-?\d+(\.\d+)?$/.test(c) || /^-?\d+\.\d+$/.test(c);
}

export function isRateLike(s) {
  const c = compact(s);
  return /^(\d+(\.\d+)?%|免税|不征税|\*{1,3}|—|-)$/.test(c);
}

export function isQtyLike(s) {
  const c = compact(s);
  // 纯整数优先视为数量（避免把 1 误判为金额）
  return /^-?\d+$/.test(c);
}

export function isNumericToken(s) {
  const c = compact(s).replace(/[¥￥,，]/g, "");
  return /^-?\d+(\.\d+)?$/.test(c);
}

export function stripMoney(s) {
  return compact(s).replace(/[¥￥,，]/g, "");
}

export function isIntegerNum(n) {
  return /^-?\d+$/.test(String(n));
}

export function isTwoDecimalNum(n) {
  return /^-?\d+\.\d{2}$/.test(String(n));
}

export function isLongDecimalNum(n) {
  return /^-?\d+\.\d{3,}$/.test(String(n));
}

/** 金额与税额：同号；金额>0 则金额>税额；金额<0 则金额<税额 */
export function isValidAmountTaxPair(amount, tax) {
  const a = Number(amount);
  const t = Number(tax);
  if (!Number.isFinite(a) || !Number.isFinite(t)) return false;
  if (a > 0) return t >= 0 && a > t;
  if (a < 0) return t <= 0 && a < t;
  return Math.abs(t) < 1e-9;
}

/**
 * 从候选两位小数中选出金额、税额（保持尽可能靠左的阅读顺序）。
 */
export function pickAmountAndTax(twoDecimals) {
  if (!twoDecimals.length) return { amount: "", taxAmount: "" };
  if (twoDecimals.length === 1) {
    return { amount: twoDecimals[0], taxAmount: "" };
  }
  // 优先相邻且满足金额/税额约束的对
  for (let i = 0; i < twoDecimals.length - 1; i++) {
    if (isValidAmountTaxPair(twoDecimals[i], twoDecimals[i + 1])) {
      return { amount: twoDecimals[i], taxAmount: twoDecimals[i + 1] };
    }
  }
  // 任意满足约束的对（金额取更靠左者）
  for (let i = 0; i < twoDecimals.length; i++) {
    for (let j = 0; j < twoDecimals.length; j++) {
      if (i === j) continue;
      if (isValidAmountTaxPair(twoDecimals[i], twoDecimals[j])) {
        return { amount: twoDecimals[i], taxAmount: twoDecimals[j] };
      }
    }
  }
  // 兜底：左金额、右税额
  return { amount: twoDecimals[0], taxAmount: twoDecimals[1] };
}

/** 价税合计大写金额 */
export function isChineseMoney(s) {
  const c = compact(s);
  return (
    c.length >= 3 &&
    /^[（(]?[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整正]+[）)]?$/.test(c)
  );
}

/** 常见计量单位（含 OCR 误识） */
export const UNIT_WORDS =
  /^(袋|张|条|瓶|包|个|双|次|套|件|盒|支|部|台|辆|本|份|只|把|卷|米|公斤|千克|吨|升|毫升|并瓶)$/;

export function normalizeUnit(u) {
  const c = compact(u);
  if (c === "并瓶") return "瓶";
  return c || "";
}

/**
 * 数量粘在单价前：如 OCR 把「1」+「94.265…」读成「194.265…」
 * 若剥掉前导整数后 qty*price ≈ amount，则拆开。
 */
export function trySplitGluedQtyPrice(numStr, amountStr) {
  const raw = String(numStr || "");
  const amount = Number(amountStr);
  if (!/^\d+\.\d{3,}$/.test(raw) || !Number.isFinite(amount) || amount === 0) {
    return null;
  }
  for (let len = 1; len <= 2; len++) {
    if (raw.length <= len + 2) continue;
    const qty = raw.slice(0, len);
    const price = raw.slice(len);
    if (!/^[1-9]\d*$/.test(qty)) continue;
    if (!/^\d+\.\d+$/.test(price)) continue;
    const q = Number(qty);
    const p = Number(price);
    if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0) continue;
    if (Math.abs(q * p - Math.abs(amount)) <= 0.05) {
      return { quantity: qty, unitPrice: price };
    }
  }
  return null;
}
