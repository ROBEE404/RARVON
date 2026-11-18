/** The languages text recognition offers (kept apart from the heavy OCR engine). */
export interface OcrLanguage {
  code: string;
  label: string;
  native: string;
  rtl?: boolean;
}

export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'ara', label: 'Arabic', native: 'العربية', rtl: true },
  { code: 'eng', label: 'English', native: 'English' },
  { code: 'fas', label: 'Persian', native: 'فارسی', rtl: true },
  { code: 'urd', label: 'Urdu', native: 'اردو', rtl: true },
  { code: 'kmr', label: 'Kurdish (Kurmanji, Latin)', native: 'Kurmancî' },
  { code: 'tur', label: 'Turkish', native: 'Türkçe' },
  { code: 'fra', label: 'French', native: 'Français' },
  { code: 'deu', label: 'German', native: 'Deutsch' },
  { code: 'spa', label: 'Spanish', native: 'Español' },
  { code: 'ita', label: 'Italian', native: 'Italiano' },
  { code: 'por', label: 'Portuguese', native: 'Português' },
  { code: 'rus', label: 'Russian', native: 'Русский' },
  { code: 'chi_sim', label: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'chi_tra', label: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'jpn', label: 'Japanese', native: '日本語' },
  { code: 'kor', label: 'Korean', native: '한국어' },
  { code: 'hin', label: 'Hindi', native: 'हिन्दी' },
];
