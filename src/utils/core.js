export function calculateBMI(weightKg, heightCm) {
  const w = parseFloat(weightKg);
  const h = parseFloat(heightCm) / 100;
  if (!(w > 0 && h > 0)) return { value: null, status: '' };
  const bmi = Number((w / (h * h)).toFixed(1));
  let status = 'وزن مثالي';
  if (bmi < 18.5) status = 'نحافة';
  else if (bmi >= 25 && bmi < 30) status = 'زيادة وزن';
  else if (bmi >= 30) status = 'سمنة';
  return { value: bmi, status };
}

export function calculateRemaining(totalFee, paidAmount) {
  const total = parseFloat(totalFee) || 0;
  const paid = parseFloat(paidAmount) || 0;
  return Number(Math.max(0, total - paid).toFixed(2));
}

export function hashSerial(serial) {
  const salt = 'SFC#2026@MO7EB!IP_LOCK';
  const text = salt + String(serial || '').trim().toUpperCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + 0x55;
    h2 = ((h2 << 5) - h2 + c) >>> 0;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
