import { compact } from "./utils.js";

function isLikelyTaxId(s) {
  const c = compact(s).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[0-9A-Z]{15,20}$/.test(c)) return false;
  // 发票号码多为纯数字；信用代码通常含字母
  if (/^\d+$/.test(c)) return false;
  return /[A-Z]/.test(c);
}

function extractTaxIdFromText(text) {
  const c = compact(text).toUpperCase();
  const labeled = c.match(
    /(?:统一社会信用代码|纳税人识别号|社会信用代码|信用代码|识别号)[:：／/\-]*([0-9A-Z]{15,20})/
  );
  if (labeled && isLikelyTaxId(labeled[1])) return labeled[1];

  // 去掉杂质后再抓取
  const cleaned = c.replace(/[^0-9A-Z]/g, "");
  if (isLikelyTaxId(cleaned) && cleaned.length >= 15 && cleaned.length <= 20) {
    return cleaned;
  }

  const all = c.match(/[0-9A-Z]{15,20}/g) || [];
  for (const m of all) {
    if (isLikelyTaxId(m)) return m;
  }
  return "";
}

function isLikelyCompanyName(s) {
  const c = compact(s);
  if (!c || c.length < 4 || c.length > 80) return false;
  if (
    /发票|项目名称|规格型号|税率|征收率|价税合计|备注|开票人|开票日期|发票号码|购买方|销售方|统一社会|纳税人识别|信用代码|金额|数量|单价|税额|税务局|税务总局|国家税务/.test(
      c
    )
  ) {
    return false;
  }
  if (isLikelyTaxId(c) || /^[¥￥]?\d+(\.\d+)?%?$/.test(c)) return false;
  if (!/[\u4e00-\u9fa5]/.test(c)) return false;
  // 优先带组织后缀；否则要求足够长的中文
  if (
    /公司|企业|厂|店|中心|大学|学院|医院|银行|集团|事务所|合作社|工作室|委员会|合伙/.test(
      c
    )
  ) {
    return true;
  }
  return /[\u4e00-\u9fa5]{6,}/.test(c);
}

function extractNameFromText(text, nextText) {
  const raw = String(text || "").trim();
  const c = compact(raw);
  // 「名称：某某公司」；排除「项目名称」
  if (/名称/.test(c) && !/项目名称/.test(c)) {
    let name = c
      .replace(/^.*?名称[:：]?/, "")
      .replace(/统一社会信用.*$/, "")
      .replace(/纳税人识别.*$/, "")
      .replace(/信用代码.*$/, "");
    if (isLikelyCompanyName(name)) return name.slice(0, 60);
    const next = compact(nextText || "");
    if (isLikelyCompanyName(next)) return next.slice(0, 60);
  }
  return "";
}

function findTaxIdNear(lines, startIdx, endIdx) {
  for (let i = startIdx; i < endIdx; i++) {
    const c = compact(lines[i]);
    if (/统一社会信用|纳税人识别|信用代码|识别号/.test(c)) {
      const id = extractTaxIdFromText(lines[i]);
      if (id) return id;
      const nextId = extractTaxIdFromText(lines[i + 1] || "");
      if (nextId) return nextId;
    }
  }
  for (let i = startIdx; i < endIdx; i++) {
    const id = extractTaxIdFromText(lines[i]);
    if (id) return id;
  }
  return "";
}

function findPartyName(lines, startIdx, endIdx) {
  for (let i = startIdx; i < endIdx; i++) {
    const name = extractNameFromText(lines[i], lines[i + 1]);
    if (name) return name;
  }
  // 兜底：区间内像公司名的文本
  for (let i = startIdx; i < endIdx; i++) {
    const c = compact(lines[i]);
    if (/名称|统一社会|纳税人|购买方|销售方|税务局|税务总局/.test(c)) continue;
    if (isLikelyCompanyName(c)) return c.slice(0, 60);
  }
  return "";
}

function extractPartyFromTexts(texts) {
  const lines = texts.map((t) => String(t || "").trim()).filter(Boolean);
  return {
    name: findPartyName(lines, 0, lines.length),
    taxId: findTaxIdNear(lines, 0, lines.length),
  };
}

/**
 * 购销信息一般在「开票日期 / 税务局」下方、到「项目名称」上方的几行文案。
 * 注意：印章碎片里的「税务局」若出现在名称之后，不能再把起点往后推。
 */
function findAnchorItem(items, regionEnd) {
  let anchorIdx = -1;
  let taxBureauIdx = -1;
  for (let i = 0; i < regionEnd; i++) {
    const text = items[i].text;
    const c = compact(text);

    if (
      extractTaxIdFromText(text) ||
      (/名称/.test(c) && !/项目名称/.test(c)) ||
      (isLikelyCompanyName(c) && !/税务局|税务总局|国家税务/.test(c))
    ) {
      break;
    }

    if (/税务局|国家税务总局|税务总局/.test(c)) {
      taxBureauIdx = i;
      anchorIdx = i;
      continue;
    }
    if (/开票日期|发票号码/.test(c)) {
      anchorIdx = i;
      continue;
    }
    if (anchorIdx < 0 && /电子发票|普通发票|专用发票/.test(c)) {
      anchorIdx = i;
    }
  }
  // 优先以税务局为锚点（购销名称就在其下方）
  return taxBureauIdx >= 0 ? taxBureauIdx : anchorIdx;
}

function getPartyRegion(items) {
  const tableIdx = items.findIndex((it) =>
    /项目名称/.test(compact(it.text))
  );
  let regionEnd =
    tableIdx >= 0
      ? tableIdx
      : Math.min(items.length, Math.max(6, Math.ceil(items.length * 0.45)));

  const anchorIdx = findAnchorItem(items, regionEnd);
  const regionStart = Math.min(
    Math.max(anchorIdx + 1, 0),
    Math.max(regionEnd - 1, 0)
  );
  const region = items.slice(regionStart, regionEnd);

  if (!region.length && regionEnd > 0) {
    return items.slice(0, regionEnd);
  }
  return region;
}

function collectCompanyCandidates(regionItems) {
  const names = [];
  for (let i = 0; i < regionItems.length; i++) {
    const it = regionItems[i];
    const next = regionItems[i + 1]?.text || "";
    const fromLabel = extractNameFromText(it.text, next);
    if (fromLabel) {
      // 名称标签行：优先用下一行公司名的坐标（更贴近真实名称位置）
      const nextIsCompany =
        isLikelyCompanyName(compact(next)) &&
        !/名称|统一社会|纳税人/.test(compact(next));
      names.push({
        value: fromLabel,
        box: nextIsCompany ? regionItems[i + 1].box || it.box : it.box,
        idx: nextIsCompany ? i + 1 : i,
        fromLabel: true,
      });
      if (nextIsCompany) i += 1;
      continue;
    }
    const c = compact(it.text);
    if (
      isLikelyCompanyName(c) &&
      !/名称|统一社会|纳税人|购买方|销售方|税务局|税务总局|国家税务/.test(c)
    ) {
      names.push({ value: c.slice(0, 60), box: it.box, idx: i, fromLabel: false });
    }
  }
  const seen = new Set();
  return names.filter((x) => {
    if (seen.has(x.value)) return false;
    seen.add(x.value);
    return true;
  });
}

function collectTaxIdCandidates(regionItems) {
  const taxIds = [];
  for (let i = 0; i < regionItems.length; i++) {
    const it = regionItems[i];
    let id = extractTaxIdFromText(it.text);
    if (!id && /统一社会信用|纳税人识别|信用代码|识别号/.test(compact(it.text))) {
      id = extractTaxIdFromText(regionItems[i + 1]?.text || "");
      if (id) {
        taxIds.push({
          value: id,
          box: regionItems[i + 1]?.box || it.box,
          idx: i + 1,
        });
        continue;
      }
    }
    if (id) taxIds.push({ value: id, box: it.box, idx: i });
  }
  const seen = new Set();
  return taxIds.filter((x) => {
    if (seen.has(x.value)) return false;
    seen.add(x.value);
    return true;
  });
}

/**
 * 购买方名称 = 税务局下方识别出的公司名（左栏 / 第一个）；
 * 销售方名称 = 右栏 / 第二个。
 */
function extractPartiesByContent(regionItems) {
  const uniqNames = collectCompanyCandidates(regionItems);
  const uniqTaxIds = collectTaxIdCandidates(regionItems);

  const hasBoxes = [...uniqNames, ...uniqTaxIds].some(
    (x) => x.box && Number.isFinite(x.box.x0)
  );

  if (hasBoxes && (uniqNames.length >= 1 || uniqTaxIds.length >= 1)) {
    const allBoxed = regionItems.filter(
      (it) => it.box && Number.isFinite(it.box.x0)
    );
    const xs = allBoxed.map((it) => (it.box.x0 + it.box.x1) / 2);
    let midX = xs.length
      ? (Math.min(...xs) + Math.max(...xs)) / 2
      : 0;

    // 两个公司名时，直接用它们的中点分左右（最贴近「税务局下方左右两栏」）
    if (uniqNames.length >= 2) {
      const nameXs = uniqNames
        .filter((x) => x.box && Number.isFinite(x.box.x0))
        .map((x) => (x.box.x0 + x.box.x1) / 2)
        .sort((a, b) => a - b);
      if (nameXs.length >= 2) {
        midX = (nameXs[0] + nameXs[nameXs.length - 1]) / 2;
      }
    } else if (uniqTaxIds.length >= 2) {
      const taxXs = uniqTaxIds
        .filter((x) => x.box && Number.isFinite(x.box.x0))
        .map((x) => (x.box.x0 + x.box.x1) / 2)
        .sort((a, b) => a - b);
      if (taxXs.length >= 2) {
        midX = (taxXs[0] + taxXs[taxXs.length - 1]) / 2;
      }
    }

    const byX = (list) =>
      [...list]
        .filter((x) => x.box && Number.isFinite(x.box.x0))
        .sort((a, b) => (a.box.x0 + a.box.x1) / 2 - (b.box.x0 + b.box.x1) / 2);

    const namesSorted = byX(uniqNames);
    const taxSorted = byX(uniqTaxIds);

    const leftName =
      namesSorted.find((x) => (x.box.x0 + x.box.x1) / 2 <= midX)?.value ||
      namesSorted[0]?.value ||
      "";
    const rightName =
      namesSorted.find((x) => (x.box.x0 + x.box.x1) / 2 > midX)?.value ||
      namesSorted[1]?.value ||
      "";
    const leftTax =
      taxSorted.find((x) => (x.box.x0 + x.box.x1) / 2 <= midX)?.value ||
      taxSorted[0]?.value ||
      "";
    const rightTax =
      taxSorted.find((x) => (x.box.x0 + x.box.x1) / 2 > midX)?.value ||
      taxSorted[1]?.value ||
      "";

    // 仍用左右文本再抽一次，补全「名称：」同行粘连等情况
    const leftTexts = [];
    const rightTexts = [];
    for (const it of regionItems) {
      if (!it.box || !Number.isFinite(it.box.x0)) {
        leftTexts.push(it.text);
        continue;
      }
      const cx = (it.box.x0 + it.box.x1) / 2;
      if (cx <= midX) leftTexts.push(it.text);
      else rightTexts.push(it.text);
    }
    const left = extractPartyFromTexts(leftTexts);
    const right = extractPartyFromTexts(rightTexts);

    return {
      buyer: {
        // 明确：税务局下方左侧/第一个公司名 = 购买方
        name: leftName || left.name || "",
        taxId: leftTax || left.taxId || "",
      },
      seller: {
        name: rightName || right.name || "",
        taxId: rightTax || right.taxId || "",
      },
    };
  }

  // 无坐标：阅读序上，税务局后第一个公司名=购买方，第二个=销售方
  return {
    buyer: {
      name: uniqNames[0]?.value || "",
      taxId: uniqTaxIds[0]?.value || "",
    },
    seller: {
      name: uniqNames[1]?.value || "",
      taxId: uniqTaxIds[1]?.value || "",
    },
  };
}

function findPartySection(lines, keywords, otherKeywords) {
  const start = lines.findIndex((l) =>
    keywords.some((k) => compact(l).includes(compact(k)))
  );
  if (start < 0) return { name: "", taxId: "" };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const c = compact(lines[i]);
    if (otherKeywords.some((k) => c.includes(compact(k)))) {
      end = i;
      break;
    }
    if (/项目名称|规格型号|合\s*计|价税合计|备注/.test(c) && i > start + 1) {
      end = i;
      break;
    }
  }

  return {
    name: findPartyName(lines, start, end),
    taxId: findTaxIdNear(lines, start, end),
  };
}

/**
 * 购买方/销售方：以「税务局下方」识别文本为主（左=购买方，右=销售方）。
 * 竖排「购买方信息」标题仅作缺省补齐。
 */
export function findBuyerSeller(items, lines) {
  const regionItems = getPartyRegion(items);
  const contentResult = extractPartiesByContent(regionItems);

  const buyerIdx = items.findIndex((it) =>
    /购买方/.test(compact(it.text))
  );
  const sellerIdx = items.findIndex((it) =>
    /销售方/.test(compact(it.text))
  );

  const tableIdx = items.findIndex((it) =>
    /项目名称/.test(compact(it.text))
  );
  const regionEnd = tableIdx >= 0 ? tableIdx : items.length;

  const buyerBox = buyerIdx >= 0 ? items[buyerIdx].box : null;
  const sellerBox = sellerIdx >= 0 ? items[sellerIdx].box : null;
  const sideBySide =
    buyerBox &&
    sellerBox &&
    Number.isFinite(buyerBox.x0) &&
    Number.isFinite(sellerBox.x0) &&
    Math.abs(
      (buyerBox.y0 + buyerBox.y1) / 2 - (sellerBox.y0 + sellerBox.y1) / 2
    ) < 40;

  let headerResult = { buyer: { name: "", taxId: "" }, seller: { name: "", taxId: "" } };

  if (sideBySide) {
    const buyerCx = (buyerBox.x0 + buyerBox.x1) / 2;
    const sellerCx = (sellerBox.x0 + sellerBox.x1) / 2;
    const midX = (buyerCx + sellerCx) / 2;
    const regionStart = Math.min(buyerIdx, sellerIdx);
    const slice = items.slice(regionStart, regionEnd);
    const leftTexts = [];
    const rightTexts = [];
    for (const it of slice) {
      if (!it.box || !Number.isFinite(it.box.x0)) continue;
      const cx = (it.box.x0 + it.box.x1) / 2;
      if (cx < midX) leftTexts.push(it.text);
      else rightTexts.push(it.text);
    }
    const leftIsBuyer = buyerCx <= sellerCx;
    headerResult = {
      buyer: extractPartyFromTexts(leftIsBuyer ? leftTexts : rightTexts),
      seller: extractPartyFromTexts(leftIsBuyer ? rightTexts : leftTexts),
    };
  } else {
    headerResult = {
      buyer: findPartySection(
        lines,
        ["购买方信息", "购买方"],
        ["销售方信息", "销售方"]
      ),
      seller: findPartySection(
        lines,
        ["销售方信息", "销售方"],
        ["项目名称", "购买方信息", "购买方"]
      ),
    };
  }

  // 优先采用「税务局下方」内容路径，标题路径仅补缺
  const merge = (primary, fallback) => ({
    name: primary.name || fallback.name || "",
    taxId: primary.taxId || fallback.taxId || "",
  });

  return {
    buyer: merge(contentResult.buyer, headerResult.buyer),
    seller: merge(contentResult.seller, headerResult.seller),
  };
}
