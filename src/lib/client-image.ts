export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))),
      "image/jpeg",
      quality,
    );
  });
}

function draw(source: CanvasImageSource, width: number, height: number, maxSize: number) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser.");
  ctx.fillStyle = "#ffffff"; // transparent PNGs get a clean white backdrop
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Downscales and re-encodes a photo in the browser before upload.
 * Uploads get faster, and re-encoding strips EXIF metadata such as GPS location.
 */
export async function prepareImage(file: Blob, maxSize = 1280, quality = 0.9): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = draw(bitmap, bitmap.width, bitmap.height, maxSize);
    return { blob: await toJpeg(canvas, quality), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

/** Grabs the current camera frame (un-mirrored, like a normal photo). */
export async function captureFrame(video: HTMLVideoElement, maxSize = 1280): Promise<PreparedImage> {
  const canvas = draw(video, video.videoWidth, video.videoHeight, maxSize);
  return { blob: await toJpeg(canvas, 0.92), width: canvas.width, height: canvas.height };
}

const RATIOS: [string, number][] = [
  ["1:1", 1],
  ["3:4", 3 / 4],
  ["4:3", 4 / 3],
  ["9:16", 9 / 16],
  ["16:9", 16 / 9],
];

/** Nearest aspect ratio supported by the image model, so the try-on keeps the photo's framing. */
export function closestAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  return RATIOS.reduce((best, current) =>
    Math.abs(Math.log(current[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? current : best,
  )[0];
}
