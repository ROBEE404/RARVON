import { tr } from './i18n';
/**
 * Plays a video file (muted, off-screen) and captures its audio track live
 * via captureStream(), recording the result. This works across arbitrary
 * video containers because it reuses the browser's own video decoder
 * instead of trying to demux the container ourselves — the trade-off is
 * that it runs in real time (about as long as the video itself).
 */
export function extractAudioFromVideo(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    document.body.appendChild(video);

    function cleanup() {
      video.pause();
      URL.revokeObjectURL(video.src);
      video.remove();
    }

    video.onerror = () => {
      cleanup();
      reject(new Error(tr("Could not read this video file.")));
    };

    video.onloadedmetadata = async () => {
      try {
        // @ts-expect-error captureStream is not yet in the standard lib.dom types
        const stream: MediaStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) {
          cleanup();
          reject(new Error(tr("This video doesn’t have an audio track.")));
          return;
        }
        const audioOnlyStream = new MediaStream(audioTracks);

        const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
        const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t));
        if (!mimeType) {
          cleanup();
          reject(new Error(tr("This browser doesn’t support recording audio tracks.")));
          return;
        }

        const recorder = new MediaRecorder(audioOnlyStream, { mimeType });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = () => {
          cleanup();
          reject(new Error(tr("Recording the audio track failed.")));
        };
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: mimeType }));
        };

        video.ontimeupdate = () => {
          if (video.duration) onProgress?.(video.currentTime / video.duration);
        };
        video.onended = () => recorder.stop();

        recorder.start();
        await video.play();
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(tr("Could not extract audio from this video.")));
      }
    };
  });
}
