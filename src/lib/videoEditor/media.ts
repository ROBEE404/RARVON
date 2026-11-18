import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';
import type { MediaItem, MediaType } from './types';
import { uid } from './types';
import { tr } from '../i18n';

export const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv,.mov,image/*,audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus';
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

function kindOf(file: File): MediaType | null {
  const t = file.type;
  const n = file.name.toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/.test(n)) return 'image';
  if (t.startsWith('audio/') || /\.(mp3|m4a|wav|flac|ogg|opus|aac)$/.test(n)) return 'audio';
  if (t.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/.test(n)) return 'video';
  return null;
}

function thumbFrom(source: CanvasImageSource, w: number, h: number) {
  const tw = 160;
  const th = Math.max(1, Math.round((tw * h) / Math.max(1, w)));
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  c.getContext('2d')!.drawImage(source, 0, 0, tw, th);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Reads a dropped/picked file into a MediaItem (duration, size, thumbnail). Throws a readable message on failure. */
export async function probeMedia(file: File): Promise<MediaItem> {
  const type = kindOf(file);
  if (!type) throw new Error(tr("“{0}” isn't a video, picture or audio file.", { 0: file.name }));
  if (file.size > MAX_BYTES) throw new Error(tr("“{0}” is larger than 2 GB, too big to edit in the browser.", { 0: file.name }));
  const base = { id: uid(), name: file.name, type, mime: file.type || '', size: file.size };

  if (type === 'image') {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(tr("“{0}” couldn't be opened as a picture.", { 0: file.name }));
    const item: MediaItem = { ...base, duration: 0, width: bmp.width, height: bmp.height, hasAudio: false, thumb: thumbFrom(bmp, bmp.width, bmp.height) };
    bmp.close();
    return item;
  }

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  if (!(await input.canRead().catch(() => false))) {
    throw new Error(tr("This browser can't read “{0}”. MP4, MOV, WebM and MKV videos and MP3, M4A, WAV, FLAC and OGG audio work.", { 0: file.name }));
  }
  const [videoTrack, audioTrack, duration] = await Promise.all([
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
    input.computeDuration(),
  ]);

  if (type === 'audio' || !videoTrack) {
    if (!audioTrack) throw new Error(tr("“{0}” has no audio or video in it.", { 0: file.name }));
    return { ...base, type: 'audio', duration, width: 0, height: 0, hasAudio: true };
  }

  if (!(await videoTrack.canDecode().catch(() => false))) {
    throw new Error(tr("This browser can't decode the video in “{0}” (codec: {1}). Try converting it to MP4 first.", { 0: file.name, 1: videoTrack.codec ?? 'unknown' }));
  }
  const [width, height] = await Promise.all([videoTrack.getDisplayWidth(), videoTrack.getDisplayHeight()]);
  let thumb: string | undefined;
  try {
    const sink = new CanvasSink(videoTrack, { width: 160 });
    const first = await videoTrack.getFirstTimestamp();
    const frame = await sink.getCanvas(first + Math.min(1, duration / 3));
    if (frame) thumb = thumbFrom(frame.canvas as HTMLCanvasElement, frame.canvas.width, frame.canvas.height);
  } catch {
    /* no thumbnail */
  }
  return { ...base, type: 'video', duration, width, height, hasAudio: Boolean(audioTrack), thumb };
}
