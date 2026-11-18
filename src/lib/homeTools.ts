/** The tools shown per category on the home page (the rest are behind "+N more"). */
export const HOME_TOP_TOOLS: Record<string, string[]> = {
  pdf: ['editor', 'merge', 'compress', 'to-text'],
  image: ['remove-background', 'to-text', 'compress', 'convert'],
  video: ['editor', 'compress', 'trim', 'convert'],
  audio: ['convert', 'compress', 'trim', 'extract'],
  developer: ['json-formatter', 'base64', 'hash', 'jwt-decoder'],
  text: ['word-counter', 'case-converter', 'text-cleaner', 'dedupe'],
  utilities: ['unzip', 'archive', 'qr', 'password'],
};

/** First four tools shown on the home Convert and Compress cards ("category/slug"). */
export const HOME_TOP_COLLECTION: Record<'convert' | 'compress', string[]> = {
  convert: ['image/convert', 'pdf/to-images', 'video/convert', 'audio/convert'],
  compress: ['pdf/compress', 'image/compress', 'video/compress', 'audio/compress'],
};

/** Categories left off the home grid to keep it to two rows; they're on the All tools page. */
export const HOME_HIDDEN_CATEGORIES: string[] = ['developer', 'utilities'];
