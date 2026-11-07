// MediaPipe's Face Landmarker: loading the library and the model (once, served from mediapipe/
// next to the app) and reading one video frame's blendshape scores and head angles.

import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { poseOf } from './_pose';
import type { FaceFrame } from './gestures';

/** The landmarker being made or made, kept for the session. */
let made: Promise<FaceLandmarker> | undefined;

async function make(): Promise<FaceLandmarker> {
  // A chunk of its own: the app doesn't load MediaPipe until the camera, or the warm-up, needs it.
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const base = new URL(`${import.meta.env.BASE_URL}mediapipe`, location.href).href;
  const fileset = await FilesetResolver.forVisionTasks(base);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

/**
 * The landmarker, made on first use and kept for the session: the model and WASM from mediapipe/
 * next to the app; GPU, else CPU. A failed attempt isn't kept: the next call tries again.
 */
export function landmarker(): Promise<FaceLandmarker> {
  made ??= make().catch((e) => {
    made = undefined;
    throw e;
  });
  return made;
}

/** One frame's scores, or null when no face is in it. */
export function detect(l: FaceLandmarker, video: HTMLVideoElement, now: number): FaceFrame | null {
  const r = l.detectForVideo(video, now);
  const categories = r.faceBlendshapes?.[0]?.categories;
  if (!categories) return null;
  const scores: Record<string, number> = {};
  for (const c of categories) scores[c.categoryName] = c.score;
  const m = r.facialTransformationMatrixes?.[0];
  return { scores, ...(m ? poseOf(m) : { yaw: 0, pitch: 0 }) };
}
