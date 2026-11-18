import { describe, expect, it } from 'vitest';
import { cleanOcrText, OCR_LANGUAGES } from '../../src/lib/ocrEngine';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('cleanOcrText', () => {
  it('removes invisible bidi marks Tesseract adds around Latin words', () => {
    expect(cleanOcrText('يعمل \u200eRarvon\u200f على \u200eChrome\u200f')).toBe('يعمل Rarvon على Chrome');
  });
  it('collapses repeated spaces and excess blank lines, keeps paragraphs', () => {
    expect(cleanOcrText('a   b\r\n\n\n\n c  \n')).toBe('a b\n\nc');
  });
});

describe('OCR languages', () => {
  it('only advertises languages whose trained data is installed', () => {
    const root = join(import.meta.dirname, '../../node_modules/@tesseract.js-data');
    for (const l of OCR_LANGUAGES) {
      expect(existsSync(join(root, l.code, '4.0.0_best_int', `${l.code}.traineddata.gz`)), l.code).toBe(true);
    }
  });
  it('lists Arabic first and marks RTL scripts', () => {
    expect(OCR_LANGUAGES[0].code).toBe('ara');
    for (const code of ['ara', 'fas', 'urd']) expect(OCR_LANGUAGES.find((l) => l.code === code)?.rtl).toBe(true);
  });
});
