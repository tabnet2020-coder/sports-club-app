import { calculateBMI, calculateRemaining, hashSerial } from '../src/utils/core.js';

describe('الوظائف الأساسية لتطبيق نادي اللياقة الذكي', () => {
  test('حساب مؤشر كتلة الجسم BMI وتصنيفه بدقة', () => {
    expect(calculateBMI(68, 165)).toEqual({ value: 25.0, status: 'زيادة وزن' });
    expect(calculateBMI(60, 170)).toEqual({ value: 20.8, status: 'وزن مثالي' });
    expect(calculateBMI(45, 170)).toEqual({ value: 15.6, status: 'نحافة' });
    expect(calculateBMI(95, 165)).toEqual({ value: 34.9, status: 'سمنة' });
    expect(calculateBMI(0, 170)).toEqual({ value: null, status: '' });
  });

  test('حساب المبلغ المتبقي من الاشتراك دون قيم سالبة', () => {
    expect(calculateRemaining(150, 100)).toBe(50);
    expect(calculateRemaining(150, 150)).toBe(0);
    expect(calculateRemaining(150, 200)).toBe(0);
  });

  test('تشفير سيريال التفعيل يعطي نفس الناتج بغض النظر عن حالة الأحرف والمسافات', () => {
    const h1 = hashSerial('SFC-UCED-WECU-3QLQ');
    const h2 = hashSerial('  sfc-uced-wecu-3qlq  ');
    expect(h1).toBe(h2);
    expect(h1).toBe('878135ffd0a6d9c9');
  });
});
