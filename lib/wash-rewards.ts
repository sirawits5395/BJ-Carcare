export type WashType = 'wash' | 'free_wash' | 'promo_sale' | 'membership_sale' | 'other' | 'unknown';
export type PaymentMethod = 'cash' | 'transfer' | 'none';
export interface StaffReply { type: WashType; amount: number | null; payment: PaymentMethod; text: string }

export function plateKey(s: string): string {
  return s.normalize('NFKC').replace(/[\s\-\u200B-\u200D.]/g, '').toLocaleUpperCase('th-TH');
}
export function provinceKey(s: string): string {
  return s.normalize('NFKC').replace(/[\s\-\u200B-\u200D.]/g, '').toLocaleLowerCase('th-TH');
}
export function parseStaffReply(input: string): StaffReply {
  const text = input.trim().replace(/\s+/g, ' ');
  const compact = text.replace(/\s/g, '').toLowerCase();
  const cash = /เงินสด|สด/.test(compact);
  const numbers = [...text.matchAll(/(?:^|[^\d])(\d{1,6})(?!\d)/g)].map(m => Number(m[1]));
  const amount = numbers.length === 1 && numbers[0] > 0 ? numbers[0] : null;
  const payment: PaymentMethod = amount === null ? 'none' : cash ? 'cash' : 'transfer';
  let type: WashType = 'unknown';
  if (/ฟรี|ใช้สิทธิ|ล้างฟรี/.test(compact)) type = 'free_wash';
  else if (/(vip|วีไอพี|member|เมมเบอร์|สมัครสมาชิก)/i.test(compact)) type = 'membership_sale';
  else if (/ติดฟิล์ม|เคลือบแก้ว|เคลือบเซรามิก|เมนเทอแนน|maintenance|ซักเบาะ|ซักพรม|ขัดไฟ|อบโอโซน|ห้องเครื่อง/.test(compact)) type = 'other';
  else if (/^(699|999|1999)(โอน|สด|เงินสด)?$/.test(compact) || /^(สด|เงินสด)(699|999|1999)$/.test(compact)) type = 'promo_sale';
  else if ((amount !== null && /^(?:สด|เงินสด|โอน)?\d+(?:สด|เงินสด|โอน)?$/.test(compact)) || /ล้าง|ดูดฝุ่น|แว็กซ์|wax/i.test(compact)) type = 'wash';
  return { type, amount, payment, text: text.slice(0, 500) };
}
export function eligibleForPoints(kind: WashType, includeFree: boolean): boolean {
  return kind === 'wash' || (includeFree && kind === 'free_wash');
}
