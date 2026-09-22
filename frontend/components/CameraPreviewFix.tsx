"use client";

import { useEffect } from "react";

/**
 * Makes camera previews reliable across Chromium browsers. The chat page opens
 * the modal immediately after permission is granted, so this waits for its
 * video element, connects the stream, mutes it, and explicitly starts playback.
 */
export default function CameraPreviewFix() {
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) return;

    const originalGetUserMedia = media.getUserMedia.bind(media);
    let newestVideoStream: MediaStream | null = null;

    media.getUserMedia = async (constraints: MediaStreamConstraints) => {
      const stream = await originalGetUserMedia(constraints);
      if (constraints.video) newestVideoStream = stream;
      return stream;
    };

    const connectPreview = () => {
      const preview = document.querySelector<HTMLVideoElement>(".camera-modal video");
      if (!preview || !newestVideoStream || preview.srcObject === newestVideoStream) return;
      preview.muted = true;
      preview.autoplay = true;
      preview.playsInline = true;
      preview.srcObject = newestVideoStream;
      void preview.play().catch(() => {
        // The visible Capture button remains usable if the browser delays autoplay.
      });
    };

    const observer = new MutationObserver(connectPreview);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(connectPreview, 250);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      media.getUserMedia = originalGetUserMedia;
    };
  }, []);

  return null;
}
