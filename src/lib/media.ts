/** Shared media helpers — keep the format lists in one place so the gallery,
 *  viewer, upload button, and drag-drop filter all agree on what counts as
 *  an image vs. a video. */

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov"] as const;

export const ALL_MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

export function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

export function isMediaPath(path: string): boolean {
  const lower = path.toLowerCase();
  return ALL_MEDIA_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}
