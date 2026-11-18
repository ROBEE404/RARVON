export interface ResizePreset {
  label: string;
  width: number;
  height: number;
}

export const resolutionPresets: ResizePreset[] = [
  { label: '4K', width: 3840, height: 2160 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
];

export const socialPresets: ResizePreset[] = [
  { label: 'Instagram square', width: 1080, height: 1080 },
  { label: 'Instagram portrait', width: 1080, height: 1350 },
  { label: 'Instagram story/reel', width: 1080, height: 1920 },
  { label: 'X (Twitter) post', width: 1600, height: 900 },
  { label: 'Facebook cover', width: 820, height: 312 },
  { label: 'YouTube thumbnail', width: 1280, height: 720 },
];
