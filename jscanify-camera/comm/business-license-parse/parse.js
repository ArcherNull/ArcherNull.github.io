/**
 * 从 OCR 文本块解析营业执照信息
 * @param {string[]|string|{text:string,box?:object}[]} texts
 */

import { DASH, compact, normalizeLines, linesText } from "./utils.js";
import {
  findCreditCode,
  findCompanyName,
  findCompanyType,
  findLegalPerson,
  findEstablishDate,
  findAddress,
  findRegisteredCapital,
  findBusinessScope,
  findRegistrationAuthority,
  findRegistrationDate,
} from "./fields.js";

function detectBusinessLicense(lines, full) {
  const c = compact(full);
  let score = 0;
  if (/营业执照/.test(c)) score += 4;
  if (/统一社会信用代码/.test(c)) score += 3;
  if (/9[0-9A-Z]{17}/i.test(c)) score += 3;
  if (/法定代表人|经营者/.test(c)) score += 2;
  if (/成立日期/.test(c)) score += 1;
  if (/住所|经营场所/.test(c)) score += 1;
  if (/商事主体类型|有限责任公司/.test(c)) score += 1;
  if (/副本|正本/.test(c)) score += 1;
  if (/增值税|发票号码|开票日期/.test(c) && !/营业执照/.test(c)) score -= 4;
  return score >= 4;
}

function emptyResult(message) {
  return {
    isBusinessLicense: false,
    message,
    creditCode: DASH,
    name: DASH,
    type: DASH,
    legalPerson: DASH,
    establishDate: DASH,
    address: DASH,
    registeredCapital: DASH,
    businessScope: DASH,
    registrationAuthority: DASH,
    registrationDate: DASH,
  };
}

/**
 * @returns {{
 *   isBusinessLicense: boolean,
 *   message: string,
 *   creditCode: string,
 *   name: string,
 *   type: string,
 *   legalPerson: string,
 *   establishDate: string,
 *   address: string,
 *   registeredCapital: string,
 *   businessScope: string,
 *   registrationAuthority: string,
 *   registrationDate: string
 * }}
 */
export function parseBusinessLicense(texts) {
  const items = normalizeLines(texts);
  const lines = linesText(items);
  const full = lines.join("\n");

  if (!lines.length) {
    return emptyResult("未识别到文本，请上传清晰的营业执照照片");
  }

  const isLicense = detectBusinessLicense(lines, full);
  const creditCode = findCreditCode(lines, full);
  const name = findCompanyName(lines, full);
  const type = findCompanyType(lines, full);
  const legalPerson = findLegalPerson(lines);
  const establishDate = findEstablishDate(lines, full);
  const address = findAddress(lines);
  const registeredCapital = findRegisteredCapital(lines, full);
  const businessScope = findBusinessScope(lines);
  const registrationAuthority = findRegistrationAuthority(
    lines,
    full,
    creditCode
  );
  const registrationDate = findRegistrationDate(lines, full, establishDate);

  const hasCore = !!(creditCode || (name && legalPerson) || (name && establishDate));

  if (!isLicense && !hasCore) {
    return emptyResult("未识别为营业执照，请上传清晰的营业执照正本/副本照片");
  }

  return {
    isBusinessLicense: true,
    message: "",
    creditCode: creditCode || DASH,
    name: name || DASH,
    type: type || DASH,
    legalPerson: legalPerson || DASH,
    establishDate: establishDate || DASH,
    address: address || DASH,
    registeredCapital: registeredCapital || DASH,
    businessScope: businessScope || DASH,
    registrationAuthority: registrationAuthority || DASH,
    registrationDate: registrationDate || DASH,
  };
}
