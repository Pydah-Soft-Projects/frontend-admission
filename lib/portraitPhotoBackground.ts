import type { Segmentation } from '@tensorflow-models/body-segmentation';

export type PortraitBackgroundMode = 'white' | 'blur' | 'none';

/** Segment at this max side length — faster, still sharp enough for passport thumbnails. */
const MAX_SEGMENT_SIDE = 384;

const MEDIAPIPE_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';

let segmenterPromise: Promise<import('@tensorflow-models/body-segmentation').BodySegmenter> | null =
  null;

async function getPortraitSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const bodySegmentation = await import('@tensorflow-models/body-segmentation');
      try {
        return await bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          {
            runtime: 'mediapipe',
            solutionPath: MEDIAPIPE_CDN,
            modelType: 'general',
          }
        );
      } catch {
        const tf = await import('@tensorflow/tfjs-core');
        await import('@tensorflow/tfjs-backend-webgl');
        await tf.setBackend('webgl');
        await tf.ready();
        return bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          { runtime: 'tfjs', modelType: 'general' }
        );
      }
    })();
  }
  return segmenterPromise;
}

/** Warm the model while the camera dialog is open so capture feels faster. */
export function preloadPortraitSegmenter(): void {
  void getPortraitSegmenter();
}

function downscaleForSegmentation(source: HTMLCanvasElement): HTMLCanvasElement {
  const maxSide = Math.max(source.width, source.height);
  if (maxSide <= MAX_SEGMENT_SIDE) return source;

  const scale = MAX_SEGMENT_SIDE / maxSide;
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, w, h);
  return small;
}

function upscaleCanvas(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (source.width === width && source.height === height) return source;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return out;
}

/**
 * Keep the person and fill the rest with white — same mask semantics as
 * drawBokehEffect (destination-in), not drawMask which overlays black on the person.
 */
async function compositePersonOnWhite(
  sourceCanvas: HTMLCanvasElement,
  segmentations: Segmentation[],
  bodySegmentation: typeof import('@tensorflow-models/body-segmentation')
): Promise<HTMLCanvasElement> {
  const personMask = await bodySegmentation.toBinaryMask(
    segmentations,
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 0, g: 0, b: 0, a: 0 },
    false,
    0.5
  );
  if (!personMask) return sourceCanvas;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const output = document.createElement('canvas');
  output.width = w;
  output.height = h;
  const ctx = output.getContext('2d');
  if (!ctx) return sourceCanvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const cutout = document.createElement('canvas');
  cutout.width = w;
  cutout.height = h;
  const cutoutCtx = cutout.getContext('2d');
  if (!cutoutCtx) return sourceCanvas;
  cutoutCtx.drawImage(sourceCanvas, 0, 0, w, h);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) return sourceCanvas;
  maskCtx.putImageData(personMask, 0, 0);

  cutoutCtx.globalCompositeOperation = 'destination-in';
  cutoutCtx.drawImage(maskCanvas, 0, 0, w, h);
  cutoutCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(cutout, 0, 0);
  return output;
}

/**
 * Replace or blur the background behind a person in a square portrait crop.
 */
export async function processPortraitBackground(
  sourceCanvas: HTMLCanvasElement,
  mode: PortraitBackgroundMode,
  flipHorizontal = false
): Promise<HTMLCanvasElement> {
  if (mode === 'none') return sourceCanvas;

  const bodySegmentation = await import('@tensorflow-models/body-segmentation');
  const segmenter = await getPortraitSegmenter();

  const fullW = sourceCanvas.width;
  const fullH = sourceCanvas.height;
  const segmentInput = downscaleForSegmentation(sourceCanvas);
  const segmentations = await segmenter.segmentPeople(segmentInput);

  if (!segmentations.length) {
    return sourceCanvas;
  }

  if (mode === 'white') {
    const composited = await compositePersonOnWhite(segmentInput, segmentations, bodySegmentation);
    return upscaleCanvas(composited, fullW, fullH);
  }

  const output = document.createElement('canvas');
  output.width = segmentInput.width;
  output.height = segmentInput.height;
  await bodySegmentation.drawBokehEffect(
    output,
    segmentInput,
    segmentations,
    0.5,
    16,
    3,
    flipHorizontal
  );
  return upscaleCanvas(output, fullW, fullH);
}

export function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  quality = 0.92
): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(
          new File([blob], `camera-${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
        );
      },
      'image/jpeg',
      quality
    );
  });
}
