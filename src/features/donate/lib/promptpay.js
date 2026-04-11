// PromptPay QR payload generator following EMVCo QR spec
// Reference: https://www.bot.or.th/Thai/PaymentSystems/StandardPS/Documents/ThaiQRCode_Payment_Standard.pdf

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag, value) {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0066')) return digits;
  if (digits.startsWith('66')) return '0066' + digits.slice(2);
  if (digits.startsWith('0')) return '0066' + digits.slice(1);
  return '0066' + digits;
}

/**
 * Generate a PromptPay QR payload string.
 * @param {Object} opts
 * @param {'phone'|'national_id'} opts.receiverType
 * @param {string} opts.receiverValue
 * @param {number|null} opts.amount  null = open amount
 * @returns {string}
 */
export function generatePromptPayPayload({ receiverType, receiverValue, amount }) {
  let target = receiverValue.replace(/[-\s]/g, '');

  let accountSubtag;
  if (receiverType === 'phone') {
    target = normalizePhone(target).padStart(13, '0');
    accountSubtag = '01';
  } else {
    // national_id: 13 digits, no transformation
    target = target.replace(/\D/g, '').padStart(13, '0');
    accountSubtag = '02';
  }

  const merchantAccountInfo =
    tlv('00', 'A000000677010111') +
    tlv(accountSubtag, target);

  const hasAmount = amount != null && amount > 0;

  let payload =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') +
    tlv('29', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '764') +
    (hasAmount ? tlv('54', amount.toFixed(2)) : '') +
    tlv('58', 'TH') +
    tlv('59', 'PROMPTPAY') +
    tlv('60', 'BANGKOK') +
    '6304';

  return payload + crc16(payload);
}
