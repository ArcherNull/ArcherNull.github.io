import { DASH, HEADER_LABELS } from "./constants.js";
import {
  compact,
  isMoneyLike,
  isRateLike,
  isQtyLike,
  isNumericToken,
  stripMoney,
  isIntegerNum,
  isTwoDecimalNum,
  isLongDecimalNum,
  isValidAmountTaxPair,
  pickAmountAndTax,
  isChineseMoney,
  UNIT_WORDS,
  normalizeUnit,
  trySplitGluedQtyPrice,
} from "./utils.js";

function isCompleteItem(item) {
  if (!item || !item.name || item.name === DASH) return false;
  if (!item.amount || item.amount === DASH) return false;

  const amt = Number(stripMoney(item.amount));
  // 折扣/折让行：负金额 + 税率即可（常无数量/单价）
  if (Number.isFinite(amt) && amt < 0) {
    return !!(item.taxRate && item.taxRate !== DASH);
  }

  return !!(
    item.quantity &&
    item.quantity !== DASH &&
    item.unitPrice &&
    item.unitPrice !== DASH
  );
}

/** 用已有字段互推：数量、单价、金额三者缺一可补 */
function fillRequiredItemFields(item) {
  if (!item || !item.name || item.name === DASH) return item;

  let qty = item.quantity !== DASH ? item.quantity : "";
  let price = item.unitPrice !== DASH ? item.unitPrice : "";
  let amount = item.amount !== DASH ? item.amount : "";

  const q = qty !== "" && Number.isFinite(Number(qty)) ? Number(qty) : null;
  const p = price !== "" && Number.isFinite(Number(price)) ? Number(price) : null;
  const a = amount !== "" && Number.isFinite(Number(amount)) ? Number(amount) : null;

  // 单价疑似粘连数量：1 + 94.265 → 194.265
  if (p != null && a != null && (q == null || q === 0)) {
    const split = trySplitGluedQtyPrice(price, amount);
    if (split) {
      qty = split.quantity;
      price = split.unitPrice;
    }
  } else if (p != null && a != null && q != null && Math.abs(q * p - Math.abs(a)) > 0.05) {
    const split = trySplitGluedQtyPrice(price, amount);
    if (split && Math.abs(Number(split.quantity) * Number(split.unitPrice) - Math.abs(a)) <= 0.05) {
      qty = split.quantity;
      price = split.unitPrice;
    }
  }

  const q2 = qty !== "" && Number.isFinite(Number(qty)) ? Number(qty) : null;
  const p2 = price !== "" && Number.isFinite(Number(price)) ? Number(price) : null;
  const a2 = amount !== "" && Number.isFinite(Number(amount)) ? Number(amount) : null;

  if (q2 != null && p2 != null && a2 == null) {
    amount = (q2 * p2).toFixed(2);
  } else if (q2 != null && a2 != null && p2 == null && q2 !== 0) {
    price = String(a2 / q2);
  } else if (p2 != null && a2 != null && q2 == null && p2 !== 0) {
    const raw = a2 / p2;
    qty =
      Math.abs(raw - Math.round(raw)) < 0.01
        ? String(Math.round(raw))
        : raw.toFixed(4).replace(/\.?0+$/, "");
  }

  // 清理名称中误并入的大写金额
  let name = item.name;
  const cnIdx = name.search(/[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整正]{3,}/);
  if (cnIdx >= 0) name = name.slice(0, cnIdx).trim() || name;

  return {
    ...item,
    name,
    unit: normalizeUnit(item.unit) || item.unit || DASH,
    quantity: qty || DASH,
    unitPrice: price || DASH,
    amount: amount || DASH,
  };
}

function isItemHeaderLabel(text) {
  const c = compact(text);
  if (!c) return false;
  // 整段都是表头词，或短标签本身；「数」「量」常被拆开
  if (
    /^(项目名称|规格型号|单位|数量|数|量|单价|金额|税率\/?征收率|税率|征收率|税额)$/.test(
      c
    )
  ) {
    return true;
  }
  return (
    c.length <= 8 &&
    /^(项目名称|规格型号|单位|数量|数|量|单价|金额|税率|征收率|税额)$/.test(c)
  );
}

/** 是否为合计标签（含 OCR 拆成「合」「计」） */
function isHeJiLabel(text) {
  const t = compact(text);
  return t === "合计" || /^合\s*计$/.test(t) || t === "合" || t === "计";
}

function isHeJiPair(lines, idx) {
  const a = compact(lines[idx] || "");
  const b = compact(lines[idx + 1] || "");
  return (a === "合" && b === "计") || a === "合计" || /^合\s*计$/.test(a);
}

/**
 * 项目列表区间：从「项目名称」起，到「合计」止（不含合计行本身）。
 */
export function findItemListBounds(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/项目名称/.test(compact(lines[i]))) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let headerEnd = start;
  for (let j = start; j < Math.min(start + 16, lines.length); j++) {
    const t = compact(lines[j]);
    if (
      isItemHeaderLabel(lines[j]) ||
      /项目名称|规格型号|单位|数量|单价|金额|税率|征收率|税额/.test(t)
    ) {
      // 若已进入数据行（含 *类别* 或公司外的长项目名），停止扩展表头
      if (
        j > start &&
        !isItemHeaderLabel(lines[j]) &&
        (/^\*/.test(t) || (t.length > 10 && !/税率|征收率/.test(t)))
      ) {
        break;
      }
      headerEnd = j;
      continue;
    }
    if (headerEnd > start) break;
  }

  let totalIdx = -1;
  for (let i = headerEnd + 1; i < lines.length; i++) {
    const c = compact(lines[i]);
    if (/价税合计/.test(c) || isChineseMoney(c)) break;
    if (isHeJiPair(lines, i)) {
      totalIdx = i;
      break;
    }
    if (/合计/.test(c) && !/价税合计/.test(c)) {
      totalIdx = i;
      break;
    }
  }

  // 没有「合计」时，退到「价税合计」或大写金额前
  let end = totalIdx;
  if (end < 0) {
    end = lines.findIndex(
      (l, idx) =>
        idx > headerEnd &&
        (/价税合计/.test(compact(l)) || isChineseMoney(l))
    );
    if (end < 0) end = lines.length;
  }

  return { start, headerEnd, totalIdx, end };
}

export function parseItemsFromBlocks(items, lines, bounds) {
  const dataStart = bounds.headerEnd + 1;
  // 含合计行本身，便于从表格几何中抽出合计金额/税额
  const dataEnd =
    bounds.totalIdx >= 0
      ? Math.min(bounds.totalIdx + 6, lines.length)
      : bounds.end;
  if (dataStart >= dataEnd) return { items: [], totalAmount: "", totalTax: "" };

  const slice = items.slice(dataStart, dataEnd);
  if (!slice.length) return { items: [], totalAmount: "", totalTax: "" };

  // 去掉可能残留的表头碎片
  const dataSlice = slice.filter((s) => !isItemHeaderLabel(s.text));
  if (!dataSlice.length) return { items: [], totalAmount: "", totalTax: "" };

  const withBox = dataSlice.filter(
    (s) => s.box && Number.isFinite(s.box.y0) && Number.isFinite(s.box.x0)
  );
  const parsed =
    withBox.length === dataSlice.length && dataSlice.length > 0
      ? parseItemsByGeometry(dataSlice)
      : parseItemsBySequence(dataSlice.map((s) => s.text));

  // 必填：项目名称、数量、单价、金额 —— 缺一不可
  return {
    items: parsed.items.map(fillRequiredItemFields).filter(isCompleteItem),
    totalAmount: parsed.totalAmount || "",
    totalTax: parsed.totalTax || "",
  };
}

/**
 * 按 Y 坐标把 OCR 块聚合成视觉行（同行内按 X 排序）。
 * 以每行首个块的 Y 为锚点，避免滑动平均把同行后半段拆到下一行。
 */
function groupVisualRows(slice) {
  const heights = slice.map((s) => Math.max(8, s.box.y1 - s.box.y0));
  const sortedH = [...heights].sort((a, b) => a - b);
  const medianH = sortedH[Math.floor(sortedH.length / 2)] || 14;
  const rowTol = Math.max(10, medianH * 0.7);

  const sorted = [...slice].sort((a, b) => {
    const ay = (a.box.y0 + a.box.y1) / 2;
    const by = (b.box.y0 + b.box.y1) / 2;
    if (Math.abs(ay - by) > rowTol) return ay - by;
    return a.box.x0 - b.box.x0;
  });

  const rows = [];
  let current = [];
  let rowAnchorY = null;

  for (const item of sorted) {
    const y = (item.box.y0 + item.box.y1) / 2;
    if (
      rowAnchorY != null &&
      Math.abs(y - rowAnchorY) > rowTol &&
      current.length
    ) {
      rows.push(current);
      current = [];
      rowAnchorY = null;
    }
    current.push(item);
    if (rowAnchorY == null) rowAnchorY = y;
  }
  if (current.length) rows.push(current);

  return rows.map((row) => [...row].sort((a, b) => a.box.x0 - b.box.x0));
}

function hasFieldValue(v) {
  return !!(v && v !== DASH);
}

function concatField(prev, next) {
  const a = hasFieldValue(prev) ? String(prev) : "";
  const b = hasFieldValue(next) ? String(next) : "";
  if (!a) return b || DASH;
  if (!b) return a;
  return a + b;
}

/**
 * 按列特征分配数值：
 * 数量=整数；单价常为多位小数；金额/税额=两位小数且满足大小关系。
 */
function assignItemNumbers(numbers, preset = {}) {
  let quantity = preset.quantity || "";
  let unitPrice = preset.unitPrice || "";
  let amount = preset.amount || "";
  let taxAmount = preset.taxAmount || "";
  const unused = [...numbers];

  // 数量：必须是整数
  if (quantity && !isIntegerNum(quantity)) {
    unused.unshift(quantity);
    quantity = "";
  }
  if (!quantity) {
    const idx = unused.findIndex(isIntegerNum);
    if (idx >= 0) quantity = unused.splice(idx, 1)[0];
  }

  // 单价：优先 >2 位小数
  if (!unitPrice) {
    const idx = unused.findIndex(isLongDecimalNum);
    if (idx >= 0) unitPrice = unused.splice(idx, 1)[0];
  }

  // 抽出两位小数作金额/税额
  const twoDec = [];
  for (let i = 0; i < unused.length; ) {
    if (isTwoDecimalNum(unused[i])) {
      twoDec.push(unused.splice(i, 1)[0]);
    } else {
      i++;
    }
  }

  if (!amount && !taxAmount) {
    const picked = pickAmountAndTax(twoDec);
    amount = picked.amount;
    taxAmount = picked.taxAmount;
    // 未用到的两位小数退回 unused（可能是单价恰好两位）
    for (const n of twoDec) {
      if (n !== amount && n !== taxAmount) unused.push(n);
    }
  } else if (!amount && taxAmount) {
    const cand = twoDec.find((n) => isValidAmountTaxPair(n, taxAmount));
    amount = cand || twoDec[0] || "";
    for (const n of twoDec) {
      if (n !== amount) unused.push(n);
    }
  } else if (amount && !taxAmount) {
    const cand = twoDec.find((n) => isValidAmountTaxPair(amount, n));
    taxAmount = cand || twoDec[0] || "";
    for (const n of twoDec) {
      if (n !== taxAmount) unused.push(n);
    }
  } else {
    // 两者已有：校验关系，不合理则尝试用两位小数纠正
    if (
      amount &&
      taxAmount &&
      !isValidAmountTaxPair(amount, taxAmount) &&
      twoDec.length >= 2
    ) {
      const picked = pickAmountAndTax(twoDec);
      if (picked.amount && picked.taxAmount) {
        amount = picked.amount;
        taxAmount = picked.taxAmount;
      }
    }
    for (const n of twoDec) {
      if (n !== amount && n !== taxAmount) unused.push(n);
    }
  }

  // 剩余：优先补单价，再兜底金额/税额
  if (!unitPrice && unused.length) {
    // 非整数优先给单价
    const idx = unused.findIndex((n) => !isIntegerNum(n));
    if (idx >= 0) unitPrice = unused.splice(idx, 1)[0];
    else if (!quantity) quantity = unused.shift();
    else unitPrice = unused.shift();
  }
  if (!amount && unused.length) {
    const idx = unused.findIndex(isTwoDecimalNum);
    amount = idx >= 0 ? unused.splice(idx, 1)[0] : unused.shift();
  }
  if (!taxAmount && unused.length) {
    const idx = unused.findIndex(isTwoDecimalNum);
    taxAmount = idx >= 0 ? unused.splice(idx, 1)[0] : unused.shift();
  }

  // 最终再校验金额/税额；若颠倒则交换
  if (
    amount &&
    taxAmount &&
    !isValidAmountTaxPair(amount, taxAmount) &&
    isValidAmountTaxPair(taxAmount, amount)
  ) {
    const tmp = amount;
    amount = taxAmount;
    taxAmount = tmp;
  }

  return { quantity, unitPrice, amount, taxAmount };
}

/** 项目名称仅为单字「合」或「计」的 OCR 碎片行，整行丢弃 */
function isOrphanHeJiFragment(name) {
  const t = compact(name);
  return t === "合" || t === "计";
}

/**
 * 合并换行项目行：
 * - 项目名称≠空 且 金额≠空 → 新项目开始
 * - 金额为空 → 名称/规格字符合并到上一项目
 * - 项目名称为空 → 结束当前项目合并
 * - 合计行单独抽出金额、税额（金额可能落在下一识别行）
 */
function mergeItemRows(partials) {
  const items = [];
  let current = null;
  let totalAmount = "";
  let totalTax = "";
  let pendingTotal = false;

  const flush = () => {
    if (current) {
      items.push(current);
      current = null;
    }
  };

  for (const row of partials) {
    if (!row) continue;

    // 丢弃名称仅为「合」或「计」的碎片行（不参与合并）
    if (!row.isTotal && isOrphanHeJiFragment(row.name)) {
      continue;
    }

    // 合计金额行可能与「合计」文案分行：仅有金额、无名称
    if (pendingTotal && !hasFieldValue(row.name) && !row.isTotal) {
      if (hasFieldValue(row.amount) && !totalAmount) {
        totalAmount = stripMoney(row.amount);
      }
      if (hasFieldValue(row.taxAmount) && !totalTax) {
        totalTax = stripMoney(row.taxAmount);
      }
      if (!totalAmount && hasFieldValue(row.quantity)) {
        totalAmount = stripMoney(row.quantity);
      }
      if (!totalTax && hasFieldValue(row.unitPrice)) {
        totalTax = stripMoney(row.unitPrice);
      }
      pendingTotal = false;
      continue;
    }

    if (row.isTotal) {
      flush();
      if (hasFieldValue(row.amount)) totalAmount = stripMoney(row.amount);
      if (hasFieldValue(row.taxAmount)) totalTax = stripMoney(row.taxAmount);
      pendingTotal = !totalAmount || !totalTax;
      continue;
    }

    // 价税合计 / 大写金额及之后不再并入项目
    if (
      hasFieldValue(row.name) &&
      (/价税合计|备注|开票人/.test(compact(row.name)) ||
        isChineseMoney(row.name))
    ) {
      flush();
      break;
    }

    const hasName = hasFieldValue(row.name);
    const hasAmount = hasFieldValue(row.amount);

    if (hasName && hasAmount) {
      flush();
      current = { ...row };
      pendingTotal = false;
      continue;
    }

    if (!hasName) {
      flush();
      continue;
    }

    // 名称非空、金额为空：换行续行，合并名称/规格
    if (current) {
      current.name = concatField(current.name, row.name);
      // 续行里的「规格」若实为中文品名碎片，并入名称
      if (
        hasFieldValue(row.spec) &&
        /[\u4e00-\u9fa5]/.test(String(row.spec)) &&
        !/^[A-Za-z0-9]/.test(compact(row.spec))
      ) {
        current.name = concatField(current.name, row.spec);
      } else if (hasFieldValue(row.spec)) {
        current.spec = concatField(current.spec, row.spec);
      }
      if (!hasFieldValue(current.unit) && hasFieldValue(row.unit)) {
        current.unit = row.unit;
      } else if (
        hasFieldValue(row.unit) &&
        hasFieldValue(current.unit) &&
        hasFieldValue(row.name) &&
        !hasFieldValue(row.amount)
      ) {
        // 续行末单位词实为品名一部分：…60g单 + 袋
        current.name = concatField(current.name, row.unit);
      }
      if (!hasFieldValue(current.taxRate) && hasFieldValue(row.taxRate)) {
        current.taxRate = row.taxRate;
      }
      if (!hasFieldValue(current.taxAmount) && hasFieldValue(row.taxAmount)) {
        current.taxAmount = row.taxAmount;
      }
      if (!hasFieldValue(current.quantity) && hasFieldValue(row.quantity)) {
        current.quantity = row.quantity;
      } else if (
        hasFieldValue(row.quantity) &&
        !hasFieldValue(row.amount) &&
        hasFieldValue(current.spec) &&
        /-$/.test(String(current.spec).trim())
      ) {
        // 规格被拆行：25PJ07U270-01- + 2
        current.spec = `${String(current.spec).trim()}${row.quantity}`;
      }
      if (!hasFieldValue(current.unitPrice) && hasFieldValue(row.unitPrice)) {
        current.unitPrice = row.unitPrice;
      }
    }
  }
  flush();

  return { items, totalAmount, totalTax };
}

function parseItemsByGeometry(slice) {
  const visualRows = groupVisualRows(slice);
  const partials = visualRows
    .map((row) => rowToItem(row.map((r) => r.text), { keepPartial: true }))
    .filter(Boolean);
  return mergeItemRows(partials);
}

function rowToItem(cells, { keepPartial = false } = {}) {
  const cleaned = cells.map((c) => c.trim()).filter(Boolean);
  if (!cleaned.length) return null;
  if (
    cleaned.every(
      (c) => isItemHeaderLabel(c) || HEADER_LABELS.test(compact(c))
    )
  ) {
    return null;
  }

  // 大写金额行不属于明细
  if (cleaned.some((c) => isChineseMoney(c))) {
    return null;
  }

  let name = "";
  let spec = "";
  let unit = "";
  let quantity = "";
  let unitPrice = "";
  let amount = "";
  let taxRate = "";
  let taxAmount = "";

  const rates = [];
  const texts = [];
  /** @type {string[]} 从左到右的数值（已去掉币种） */
  const numbers = [];

  for (const cell of cleaned) {
    if (isItemHeaderLabel(cell)) continue;
    if (isChineseMoney(cell)) continue;
    const c = compact(cell);

    // 标签粘连：数量1 / 单价41.3 / 金额41.31
    const labeledQty = c.match(/数量[:：]?(-?\d+)(?!\.\d)/);
    if (labeledQty) {
      quantity = labeledQty[1];
      continue;
    }
    const labeledPrice = c.match(/单价[:：]?(-?\d+(?:\.\d+)?)/);
    if (labeledPrice) {
      unitPrice = labeledPrice[1];
      continue;
    }
    const labeledAmt = c.match(/金额[:：]?(-?\d+(?:\.\d+)?)/);
    if (labeledAmt) {
      amount = labeledAmt[1];
      continue;
    }
    const labeledTax = c.match(/税额[:：]?(-?\d+(?:\.\d+)?)/);
    if (labeledTax) {
      taxAmount = labeledTax[1];
      continue;
    }
    const labeledRate = c.match(
      /(?:税率|征收率)[:：]?(\d+(?:\.\d+)?%|免税|不征税)/
    );
    if (labeledRate) {
      taxRate = labeledRate[1];
      continue;
    }

    // 规格与单位粘连：25PJ07U270-01- 双（仅空白分隔，保留规格尾缀 -）
    const specUnit = String(cell).match(
      /^(.*)\s+(袋|张|条|瓶|包|个|双|次|套|件|盒|支|部|台|辆|本|份|只|把|卷)$/
    );
    if (specUnit && /[A-Za-z0-9]/.test(specUnit[1]) && specUnit[1].trim().length >= 3) {
      const before = specUnit[1].trim();
      const chineseLen = (before.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (chineseLen <= Math.floor(before.length / 2)) {
        if (!spec) spec = before;
        if (!unit) unit = specUnit[2];
        continue;
      }
    }

    if (isRateLike(c)) {
      rates.push(c);
      continue;
    }

    if (isNumericToken(c) || isMoneyLike(c) || isQtyLike(c)) {
      numbers.push(stripMoney(c));
      continue;
    }

    // 纯单位词
    if (UNIT_WORDS.test(c)) {
      if (!unit) unit = normalizeUnit(c);
      continue;
    }

    texts.push(cell);
  }

  // 典型列：名称 规格 单位 …；长中文续行并入名称，勿当规格
  if (texts.length >= 1) name = texts[0];
  const rest = texts.slice(1);
  for (const t of rest) {
    const tc = compact(t);
    if (UNIT_WORDS.test(tc)) {
      if (!unit) unit = normalizeUnit(tc);
      continue;
    }
    // 名称换行续段（中文品名；短尾如「福）」需带括号，避免把规格「无」吃进名称）
    if (
      /[\u4e00-\u9fa5]/.test(t) &&
      !/^[A-Za-z0-9][A-Za-z0-9\-\/\*]*$/.test(tc) &&
      (t.length >= 3 || /[）)（(]/.test(t))
    ) {
      name = `${name}${t}`;
      continue;
    }
    if (!spec) {
      spec = t;
    } else if (!unit && t.length <= 2) {
      unit = t;
    } else {
      name = `${name}${t}`;
    }
  }

  // 项目名末尾粘了规格数字：*方便食品*白象走街串1（0 开头多为品名一部分如「0脂」）
  if (name && !spec && unit) {
    const peeled = compact(name).match(/^(\*[^*]+\*.*?)([1-9]\d{0,2})$/);
    if (peeled) {
      name = peeled[1];
      spec = peeled[2];
    }
  }

  // OCR 常把「合」「计」拆成两格
  if (!name && texts.some((t) => compact(t) === "合")) {
    const joined = compact(texts.join(""));
    if (joined === "合计") name = "合计";
  } else if (compact(texts.join("")) === "合计") {
    name = "合计";
    spec = "";
    unit = "";
  }

  const rowIsTotal =
    isHeJiLabel(name) ||
    (cleaned.some((c) => isHeJiLabel(c)) &&
      !cleaned.some((c) => /^\*/.test(compact(c))));

  // 合计行：金额、税额取两位小数，并满足大小关系
  if (rowIsTotal) {
    const moneyNums = numbers.filter(
      (n) => isTwoDecimalNum(n) || isMoneyLike(n) || /^-?\d+(\.\d+)?$/.test(n)
    );
    const twoDec = moneyNums.filter(isTwoDecimalNum);
    const pool = twoDec.length >= 1 ? twoDec : moneyNums;
    const picked = pickAmountAndTax(pool);
    return {
      isTotal: true,
      name: "合计",
      amount: picked.amount || DASH,
      taxAmount: picked.taxAmount || DASH,
    };
  }

  // 名称仅为单字「合」或「计」：整行丢弃
  if (isOrphanHeJiFragment(name)) {
    return null;
  }

  if (!taxRate && rates.length) taxRate = rates[0];

  // 规格数字与数量相邻：1 / 袋 / 12 / 8.325 → spec=1, qty=12
  if (
    !spec &&
    numbers.length >= 2 &&
    isIntegerNum(numbers[0]) &&
    isIntegerNum(numbers[1]) &&
    (numbers.some(isLongDecimalNum) ||
      numbers.filter(isTwoDecimalNum).length >= 2)
  ) {
    spec = numbers.shift();
  }

  ({ quantity, unitPrice, amount, taxAmount } = assignItemNumbers(numbers, {
    quantity,
    unitPrice,
    amount,
    taxAmount,
  }));

  // 单价粘连数量修正
  if (unitPrice && amount) {
    const split = trySplitGluedQtyPrice(unitPrice, amount);
    if (split) {
      // 仅当原数量缺失，或原数量*单价明显对不上金额时采用
      const q0 = quantity ? Number(quantity) : null;
      const p0 = Number(unitPrice);
      const a0 = Number(amount);
      if (
        q0 == null ||
        !Number.isFinite(q0 * p0) ||
        Math.abs(q0 * p0 - Math.abs(a0)) > 0.05
      ) {
        quantity = split.quantity;
        unitPrice = split.unitPrice;
      }
    }
  }

  const nameCompact = compact(name);

  if (name && /^(价税合计|备注|开票人)$/.test(nameCompact)) {
    return null;
  }
  if (name && isChineseMoney(name)) {
    return null;
  }

  // 无项目名、仅金额数字：合计金额/税额分行时的识别行
  if (!name && numbers.length >= 1 && keepPartial) {
    const picked = pickAmountAndTax(
      numbers.filter(isTwoDecimalNum).length
        ? numbers.filter(isTwoDecimalNum)
        : numbers
    );
    return {
      name: "",
      spec: DASH,
      unit: DASH,
      quantity: DASH,
      unitPrice: DASH,
      amount: picked.amount || DASH,
      taxRate: DASH,
      taxAmount: picked.taxAmount || DASH,
    };
  }

  if (!name && keepPartial && !quantity && !amount) {
    return {
      name: "",
      spec: spec || DASH,
      unit: unit || DASH,
      quantity: DASH,
      unitPrice: DASH,
      amount: DASH,
      taxRate: DASH,
      taxAmount: DASH,
    };
  }
  if (!name) return null;

  return {
    name,
    spec: spec || DASH,
    unit: normalizeUnit(unit) || unit || DASH,
    quantity: quantity || DASH,
    unitPrice: unitPrice || DASH,
    amount: amount || DASH,
    taxRate: taxRate || DASH,
    taxAmount: taxAmount || DASH,
  };
}

function parseItemsBySequence(dataLines) {
  const filtered = [];
  for (let i = 0; i < dataLines.length; i++) {
    const l = dataLines[i];
    const c = compact(l);
    if (!c) continue;
    // 大写金额视为明细区结束
    if (isChineseMoney(c)) {
      filtered.push(l);
      break;
    }
    // 合+计 拆行 → 合并为「合计」
    if (c === "合" && compact(dataLines[i + 1] || "") === "计") {
      filtered.push("合计");
      i += 1;
      continue;
    }
    // 保留合计 / 价税合计作为边界，勿当表头丢掉
    if (c === "合计" || /^合\s*计$/.test(c) || /价税合计/.test(c)) {
      filtered.push(l);
      if (/价税合计/.test(c)) break;
      continue;
    }
    // 单独的「合」「计」在无配对时仍保留，供后续识别
    if (c === "合" || c === "计") {
      filtered.push(l);
      continue;
    }
    if (isItemHeaderLabel(l) || HEADER_LABELS.test(c)) continue;
    filtered.push(l);
  }
  if (!filtered.length) return { items: [], totalAmount: "", totalTax: "" };

  // 先按「名称+金额」切出候选块，再对块内无金额的名称续行做字符合并
  const chunks = [];
  let buf = [];

  const flushBuf = () => {
    if (!buf.length) return;
    chunks.push(buf);
    buf = [];
  };

  for (const line of filtered) {
    const c = compact(line);
    if (/价税合计/.test(c) || isChineseMoney(c)) {
      flushBuf();
      break;
    }
    if (c === "合计" || /^合\s*计$/.test(c) || c === "合" || c === "计") {
      flushBuf();
      // 单独「合」「计」拼成合计块
      if (c === "合" || c === "计") {
        if (chunks.length && compact(chunks[chunks.length - 1][0]) === "合计") {
          continue;
        }
        // 连续合+计在过滤阶段已合并；此处兜底
        chunks.push(["合计"]);
      } else {
        chunks.push([line]);
      }
      continue;
    }

    const isStarName = /^\*[^*]+\*/.test(c);
    const looksLikeName =
      (isStarName || /[\u4e00-\u9fa5]/.test(c)) &&
      !isMoneyLike(c) &&
      !isRateLike(c) &&
      !isQtyLike(c) &&
      !isNumericToken(c) &&
      !isChineseMoney(c) &&
      !UNIT_WORDS.test(c) &&
      c.length >= 2;

    const bufHasNumbers = buf.some(
      (b) =>
        isMoneyLike(compact(b)) ||
        isQtyLike(compact(b)) ||
        isRateLike(compact(b)) ||
        isNumericToken(compact(b))
    );

    // 上一块已有数值后出现新名称：切段（后续若无金额则 merge 回上一项）
    if (buf.length && looksLikeName && bufHasNumbers) {
      flushBuf();
    } else if (buf.length && isStarName && !bufHasNumbers) {
      // 续行文案之后遇到新的 *类别*项目名
      flushBuf();
    }
    buf.push(line);
  }
  flushBuf();

  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const head = compact(chunk[0] || "");
    if (head === "合计" || /^合\s*计$/.test(head) || head === "合" || head === "计") {
      const moneyLines = [];
      let j = i + 1;
      while (j < chunks.length && chunks[j].length === 1) {
        const t = compact(chunks[j][0]);
        if (
          isMoneyLike(t) ||
          /^-?\d+\.\d{2}$/.test(t.replace(/[¥￥]/g, ""))
        ) {
          moneyLines.push(chunks[j][0]);
          j++;
        } else break;
      }
      const item = rowToItem(["合计", ...moneyLines], { keepPartial: true });
      if (item) partials.push(item);
      i = j - 1;
      continue;
    }

    const item = rowToItem(chunk, { keepPartial: true });
    if (item) partials.push(item);
  }

  return mergeItemRows(partials);
}
