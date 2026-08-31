/**
 * 从 OCR 文本块解析电子发票（普通发票 / 专用发票等）
 * @param {string[]|string|{text:string,box?:object}[]} texts
 */

import { DASH } from "./constants.js";
import { compact, normalizeLines, linesText } from "./utils.js";
import { findInvoiceTitle } from "./title.js";
import {
  findInvoiceNumber,
  findInvoiceDate,
  findTaxBureau,
  findIssuer,
} from "./header.js";
import { findBuyerSeller } from "./parties.js";
import { findItemListBounds, parseItemsFromBlocks } from "./items.js";
import { findTotalAmounts, findPriceTaxTotal, findRemark } from "./totals.js";

/**
 * @returns {{
 *   isInvoice: boolean,
 *   message: string,
 *   title: string,
 *   invoiceNumber: string,
 *   invoiceDate: string,
 *   taxBureau: string,
 *   buyerName: string,
 *   buyerTaxId: string,
 *   sellerName: string,
 *   sellerTaxId: string,
 *   items: Array<{
 *     name: string,
 *     spec: string,
 *     unit: string,
 *     quantity: string,
 *     unitPrice: string,
 *     amount: string,
 *     taxRate: string,
 *     taxAmount: string
 *   }>,
 *   totalAmount: string,
 *   totalTaxAmount: string,
 *   priceTaxUpper: string,
 *   priceTaxLower: string,
 *   remark: string,
 *   issuer: string
 * }}
 */
export function parseInvoice(texts) {
  const items = normalizeLines(texts);
  const lines = linesText(items);
  const full = lines.join("\n");
  const cfull = compact(full);

  const title = findInvoiceTitle(items, lines, full);
  const invoiceNumber = findInvoiceNumber(lines, full);
  const invoiceDate = findInvoiceDate(lines, full);
  const taxBureau = findTaxBureau(lines, full);

  const { buyer, seller } = findBuyerSeller(items, lines);

  const itemBounds = findItemListBounds(lines);
  const parsedItems = itemBounds
    ? parseItemsFromBlocks(items, lines, itemBounds)
    : { items: [], totalAmount: "", totalTax: "" };
  const itemRows = parsedItems.items;

  const totalsFromLines = findTotalAmounts(
    lines,
    itemBounds ? itemBounds.totalIdx : -1
  );
  const totalAmountRaw =
    parsedItems.totalAmount || totalsFromLines.amount || "";
  const totalTaxRaw = parsedItems.totalTax || totalsFromLines.tax || "";
  const totalAmount = totalAmountRaw
    ? `¥${totalAmountRaw.replace(/^¥/, "")}`
    : "";
  const totalTaxAmount = totalTaxRaw
    ? `¥${totalTaxRaw.replace(/^¥/, "")}`
    : "";

  const {
    upper: priceTaxUpper,
    lower: priceTaxLower,
    sectionEndIdx: priceTaxSectionEndIdx,
  } = findPriceTaxTotal(lines, full);
  const remark = findRemark(lines, priceTaxSectionEndIdx);
  const issuer = findIssuer(lines, full);

  const score =
    (title ? 2 : 0) +
    (invoiceNumber ? 3 : 0) +
    (invoiceDate ? 1 : 0) +
    (taxBureau ? 1 : 0) +
    (buyer.name || buyer.taxId ? 2 : 0) +
    (seller.name || seller.taxId ? 2 : 0) +
    (itemRows.length ? 2 : 0) +
    (cfull.includes("价税合计") ? 2 : 0) +
    (cfull.includes("发票") ? 1 : 0);

  // 阈值放宽：只要能抽出关键字段就展示，避免 OCR 缺字时整页空白
  const isInvoice = score >= 3;

  return {
    isInvoice,
    message: isInvoice
      ? ""
      : "未识别为发票，请上传清晰的电子发票或增值税发票图片",
    title: title || DASH,
    invoiceNumber: invoiceNumber || DASH,
    invoiceDate: invoiceDate || DASH,
    taxBureau: taxBureau || DASH,
    buyerName: buyer.name || DASH,
    buyerTaxId: buyer.taxId || DASH,
    sellerName: seller.name || DASH,
    sellerTaxId: seller.taxId || DASH,
    items: itemRows,
    totalAmount: totalAmount || DASH,
    totalTaxAmount: totalTaxAmount || DASH,
    priceTaxUpper: priceTaxUpper || DASH,
    priceTaxLower: priceTaxLower || DASH,
    remark: remark || DASH,
    issuer: issuer || DASH,
  };
}
