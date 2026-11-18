import type { AudioCodec } from 'mediabunny';

/** The audio formats Rarvon can write (kept apart from the heavy audio engine). */
export type AudioTarget = 'opus' | 'aac' | 'mp3' | 'wav';

export interface AudioTargetInfo {
  value: AudioTarget;
  label: string;
  extension: string;
  mime: string;
  codec: AudioCodec;
  lossless?: boolean;
}

export const AUDIO_TARGETS: AudioTargetInfo[] = [
  { value: 'opus', label: 'Opus (.ogg) — small, modern', extension: 'ogg', mime: 'audio/ogg', codec: 'opus' },
  { value: 'aac', label: 'AAC (.m4a) — plays everywhere', extension: 'm4a', mime: 'audio/mp4', codec: 'aac' },
  { value: 'mp3', label: 'MP3 — the most compatible', extension: 'mp3', mime: 'audio/mpeg', codec: 'mp3' },
  { value: 'wav', label: 'WAV — lossless, large', extension: 'wav', mime: 'audio/wav', codec: 'pcm-s16', lossless: true },
];
