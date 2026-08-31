import { compact, pickAmountAndTax, isChineseMoney } from "./utils.js";

export function findTotalAmounts(lines, totalIdx) {
  if (totalIdx < 0) return { amount: "", tax: "" };
  // 合计行后通常先出现金额合计，再税额合计
  const moneys = [];
  for (let i = totalIdx; i < Math.min(totalIdx + 8, lines.length); i++) {
    const c = compact(lines[i]);
    if (/价税合计|备注|开票人/.test(c)) break;
    const m = c.match(/[¥￥]?(-?\d+\.\d{2})/g);
    if (m) {
      for (const x of m) moneys.push(x.replace(/[¥￥]/, ""));
    }
  }
  const picked = pickAmountAndTax(moneys);
  return { amount: picked.amount || "", tax: picked.taxAmount || "" };
}

export function findPriceTaxTotal(lines, full) {
  let upper = "";
  let lower = "";
  let sectionEndIdx = -1;

  const upperIdx = lines.findIndex(
    (l) => /价税合计/.test(compact(l)) && /大写/.test(compact(l))
  );
  const priceTaxIdx = lines.findIndex((l) => /价税合计/.test(compact(l)));
  const lowerIdx = lines.findIndex((l) => /小写/.test(compact(l)));

  const cnMoneyRe =
    /[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整正]+/;

  if (upperIdx >= 0) {
    let v = compact(lines[upperIdx]).replace(/.*大写[)）]?/, "");
    v = v.replace(/^[:：ⓧ☒☆★]/, "");
    if (!cnMoneyRe.test(v) && lines[upperIdx + 1]) {
      v = compact(lines[upperIdx + 1]).replace(/^[:：ⓧ☒☆★]/, "");
      if (cnMoneyRe.test(v)) sectionEndIdx = Math.max(sectionEndIdx, upperIdx + 1);
    } else {
      sectionEndIdx = Math.max(sectionEndIdx, upperIdx);
    }
    const m = v.match(cnMoneyRe);
    if (m) upper = m[0];
    // OCR 常把大写金额放在「价税合计（大写）」上一行
    if (!upper && upperIdx > 0 && isChineseMoney(lines[upperIdx - 1])) {
      upper = compact(lines[upperIdx - 1]).match(cnMoneyRe)?.[0] || "";
      sectionEndIdx = Math.max(sectionEndIdx, upperIdx);
    }
  }

  if (!upper && priceTaxIdx >= 0 && priceTaxIdx > 0) {
    const prev = compact(lines[priceTaxIdx - 1] || "");
    if (cnMoneyRe.test(prev) && isChineseMoney(prev)) {
      upper = prev.match(cnMoneyRe)?.[0] || "";
      sectionEndIdx = Math.max(sectionEndIdx, priceTaxIdx);
    }
  }

  if (!upper) {
    const m = compact(full).match(
      /价税合计[（(]?大写[）)]?[:：]?[ⓧ☒☆★]?([零壹贰叁肆伍陆柒捌玖拾佰仟万亿元圆角分整正]+)/
    );
    if (m) upper = m[1];
  }

  if (lowerIdx >= 0) {
    const c = compact(lines[lowerIdx]);
    const m = c.match(/[¥￥]?(-?\d+\.\d{2})/);
    if (m) {
      lower = m[1];
      sectionEndIdx = Math.max(sectionEndIdx, lowerIdx);
    } else {
      const next = compact(lines[lowerIdx + 1] || "");
      const m2 = next.match(/[¥￥]?(-?\d+\.\d{2})/);
      if (m2) {
        lower = m2[1];
        sectionEndIdx = Math.max(sectionEndIdx, lowerIdx + 1);
      } else {
        sectionEndIdx = Math.max(sectionEndIdx, lowerIdx);
      }
    }
  }

  if (!lower) {
    const m = compact(full).match(/[（(]?小写[）)]?[:：]?[¥￥]?(-?\d+\.\d{2})/);
    if (m) lower = m[1];
  }

  if (sectionEndIdx < 0 && priceTaxIdx >= 0) {
    // 价税合计可能同行含大写小写，或随后 1～2 行
    sectionEndIdx = priceTaxIdx;
    for (let i = priceTaxIdx; i < Math.min(priceTaxIdx + 4, lines.length); i++) {
      const c = compact(lines[i]);
      if (/开票人|收款人|复核/.test(c)) break;
      if (/备注/.test(c) && c !== "备注" && !/价税合计|大写|小写/.test(c)) break;
      if (
        /大写|小写/.test(c) ||
        cnMoneyRe.test(c) ||
        /[¥￥]-?\d+\.\d{2}/.test(c) ||
        /价税合计/.test(c)
      ) {
        sectionEndIdx = i;
      }
    }
  }

  return {
    upper: upper || "",
    lower: lower ? `¥${lower.replace(/^¥/, "")}` : "",
    sectionEndIdx,
  };
}

/**
 * 价税合计（大写/小写）之后、到「开票人」之前的全部文案归入备注。
 * OCR 常把「备注」拆成单独的「备」「注」，需剔除。
 */
export function findRemark(lines, priceTaxSectionEndIdx = -1) {
  let start = -1;

  if (priceTaxSectionEndIdx >= 0) {
    start = priceTaxSectionEndIdx + 1;
  } else {
    // 兜底：找小写或价税合计后的下一行
    const lowerIdx = lines.findIndex((l) => /小写/.test(compact(l)));
    const priceTaxIdx = lines.findIndex((l) => /价税合计/.test(compact(l)));
    if (lowerIdx >= 0) start = lowerIdx + 1;
    else if (priceTaxIdx >= 0) start = priceTaxIdx + 1;
  }

  // 若显式有「备注」标签且更靠后/合适，从该标签起（含同行内容）
  const remarkLabelIdx = lines.findIndex((l) => {
    const c = compact(l);
    return c === "备注" || /^备注[:：]/.test(c);
  });
  if (remarkLabelIdx >= 0) {
    if (start < 0 || remarkLabelIdx >= start - 1) {
      start = remarkLabelIdx;
    }
  }

  if (start < 0 || start >= lines.length) return "";

  const parts = [];
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const c = compact(raw);

    // 开票人及之后不属于备注
    if (
      /^(开票人|收款人|复核)/.test(c) ||
      (/开票人|收款人|复核/.test(c) && c.length <= 20)
    ) {
      break;
    }
    // 跳过价税合计残留
    if (/价税合计/.test(c) || (/^[（(]?大写/.test(c) && /圆|角|分/.test(c))) {
      continue;
    }
    if (/^[（(]?小写[）)]?[:：]?[¥￥]?-?\d/.test(c)) continue;

    // 去掉单独识别出的「备」「注」「备注」标签字
    if (/^(备|注|备注)$/.test(c)) continue;

    let piece = raw;
    if (/^备注/.test(c)) {
      piece = raw.replace(/备\s*注/, "").replace(/^[:：]/, "").trim();
      if (!piece) continue;
    }
    // 行首残留的单字「备」「注」
    piece = piece
      .replace(/^[备注][:：\s]*/, "")
      .replace(/\s*[备注]\s*$/g, "")
      .trim();
    if (!piece || /^(备|注|备注)$/.test(compact(piece))) continue;

    parts.push(piece);
  }

  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/(?:^|\s)[备注](?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
