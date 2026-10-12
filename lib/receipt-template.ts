export type ReceiptItem = { description: string; quantity: number; unitPrice: number };
export type ReceiptDetails = {
  receiptNo: string; issueDate: string; paidDate: string;
  buyerName: string; buyerAddress?: string; buyerTaxId?: string;
  plate?: string; province?: string; items: ReceiptItem[];
  paymentMethod: 'cash' | 'transfer'; paymentReference?: string;
  verifiedByOwner: boolean; verifiedJobId: string;
};

const xml = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;');
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const small = (v: string | undefined, length: number) => xml((v || '-').trim().slice(0, length));

/** Render only from a job/payment that a server-side owner action has verified.
 * This helper is a visual template; callers must enforce authorization and unique receipt issuance.
 * Non-VAT receipt, NOT a Thai Revenue Department e-Tax/e-Receipt.
 */
export function createReceiptSvg(r: ReceiptDetails): string {
  if (!r.verifiedByOwner || !r.verifiedJobId?.trim()) throw new Error('PAYMENT_NOT_VERIFIED');
  if (!r.receiptNo?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(r.paidDate)) throw new Error('RECEIPT_ID_OR_DATE_INVALID');
  if (!r.items.length || r.items.length > 6 || r.items.some(item => !item.description.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0)) throw new Error('RECEIPT_ITEMS_INVALID');
  const total = r.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!Number.isSafeInteger(total) || total < 1) throw new Error('RECEIPT_TOTAL_INVALID');
  const body = r.items.map((item, i) => {
    const y = 650 + i * 67;
    return `<line x1="70" y1="${y + 22}" x2="1010" y2="${y + 22}" stroke="#e3e7e1"/><text x="95" y="${y}" font-size="24" fill="#242424">${i + 1}</text><text x="145" y="${y}" font-size="24" fill="#242424">${small(item.description, 42)}</text><text x="710" y="${y}" font-size="24" text-anchor="end">${item.quantity}</text><text x="855" y="${y}" font-size="24" text-anchor="end">${money(item.unitPrice)}</text><text x="987" y="${y}" font-size="24" text-anchor="end">${money(item.quantity * item.unitPrice)}</text>`;
  }).join('');
  const summaryY = Math.max(730, 650 + r.items.length * 67 + 50);
  const payY = summaryY + 130;
  const stampY = payY + 155;
  const height = stampY + 115;
  const payment = r.paymentMethod === 'cash' ? 'เงินสด (Cash)' : 'โอนผ่านธนาคาร (Bank transfer)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 ${height}" width="1080" height="${height}">
  <rect width="1080" height="${height}" fill="#ffffff"/>
  <g font-family="Noto Sans Thai,Tahoma,Arial,sans-serif">
  <rect x="65" y="62" width="94" height="94" rx="17" fill="#c5a24b"/><text x="112" y="122" font-family="Arial,sans-serif" font-size="40" font-weight="bold" text-anchor="middle" fill="white">BJ</text>
  <text x="179" y="103" font-family="Arial,sans-serif" font-size="36" font-weight="bold">BJ PRO GROUP CO., LTD.</text>
  <text x="179" y="143" font-size="29" font-weight="600">บริษัท บีเจ โปร กรุ๊ป จำกัด</text>
  <text x="70" y="203" font-size="22">เลขที่ 36/99 หมู่ที่ 7 ตำบลบางเมือง อำเภอเมืองสมุทรปราการ</text>
  <text x="70" y="238" font-size="22">จังหวัดสมุทรปราการ 10260</text>
  <text x="70" y="273" font-size="22">เลขประจำตัวผู้เสียภาษี 0115566011607</text>
  <text x="70" y="308" font-size="22">โทร. 0993595395</text>
  <text x="1010" y="91" text-anchor="end" font-size="42" font-weight="700" fill="#075d2a">ใบเสร็จรับเงิน</text>
  <text x="1010" y="129" text-anchor="end" font-family="Arial,sans-serif" letter-spacing="4" font-size="23" fill="#075d2a">RECEIPT</text>
  <text x="615" y="213" font-size="23" fill="#075d2a">เลขที่</text><text x="790" y="213" font-size="23">${small(r.receiptNo, 45)}</text>
  <text x="615" y="255" font-size="23" fill="#075d2a">วันที่ออก</text><text x="790" y="255" font-size="23">${small(r.issueDate, 10)}</text>
  <text x="615" y="297" font-size="23" fill="#075d2a">วันที่รับเงิน</text><text x="790" y="297" font-size="23">${small(r.paidDate, 10)}</text>
  <line x1="70" y1="338" x2="1010" y2="338" stroke="#bfd8c8" stroke-width="2"/>
  <rect x="70" y="363" width="940" height="175" rx="14" fill="#f5faf6" stroke="#d5e4d8"/>
  <text x="95" y="403" font-size="27" font-weight="700" fill="#075d2a">ลูกค้า</text>
  <text x="95" y="440" font-size="24">${small(r.buyerName, 48)}</text>
  <text x="95" y="474" font-size="21">${small(r.buyerAddress, 85)}</text>
  <text x="95" y="506" font-size="21">เลขผู้เสียภาษี: ${small(r.buyerTaxId, 20)}</text>
  <text x="615" y="507" font-size="21">ทะเบียน: ${small(r.plate, 16)} ${small(r.province, 18)}</text>
  <rect x="70" y="563" width="940" height="57" fill="#075d2a"/>
  <text x="95" y="601" font-size="23" fill="#ffffff">#</text><text x="145" y="601" font-size="23" fill="#ffffff">รายละเอียดบริการ</text>
  <text x="710" y="601" font-size="23" text-anchor="end" fill="#ffffff">จำนวน</text>
  <text x="855" y="601" font-size="23" text-anchor="end" fill="#ffffff">ราคา</text>
  <text x="987" y="601" font-size="23" text-anchor="end" fill="#ffffff">มูลค่า</text>
  ${body}
  <line x1="70" y1="${summaryY - 33}" x2="1010" y2="${summaryY - 33}" stroke="#9cb7a4"/>
  <text x="710" y="${summaryY + 16}" font-size="26" font-weight="700" fill="#075d2a">จำนวนเงินรวมทั้งสิ้น</text>
  <text x="987" y="${summaryY + 16}" font-size="33" font-weight="700" text-anchor="end" fill="#075d2a">${money(total)} บาท</text>
  <text x="95" y="${payY}" font-size="23" fill="#075d2a">ช่องทางชำระเงิน</text>
  <text x="340" y="${payY}" font-size="24">${payment}</text>
  <text x="95" y="${payY + 43}" font-size="21">${r.paymentReference ? `เลขอ้างอิง: ${small(r.paymentReference, 65)}` : 'ยืนยันการรับชำระเงินแล้ว'}</text>
  <line x1="70" y1="${stampY - 50}" x2="1010" y2="${stampY - 50}" stroke="#cbd7cc"/>
  <text x="95" y="${stampY}" font-size="22" fill="#5a605c">บริษัท บีเจ โปร กรุ๊ป จำกัด</text>
  <text x="1010" y="${stampY}" text-anchor="end" font-size="20" fill="#727a74">ไม่ใช่ใบกำกับภาษี</text>
  </g></svg>`;
}

/** Mobile-browser conversion for sharing an authorized receipt as PNG. */
export async function receiptSvgToPng(svg: string): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('BROWSER_ONLY');
  await document.fonts?.ready;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const picture = new Image();
    await new Promise<void>((resolve, reject) => { picture.onload = () => resolve(); picture.onerror = () => reject(new Error('RECEIPT_IMAGE_LOAD_FAILED')); picture.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = picture.naturalWidth * 2; canvas.height = picture.naturalHeight * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.setTransform(2, 0, 0, 2, 0, 0);
    context.drawImage(picture, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG_EXPORT_FAILED')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
