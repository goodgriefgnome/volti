// Puts MediaPipe's WASM (the SIMD build only) and the face model into public/mediapipe/, so they
// are served next to the app and included in the offline copy. The model is downloaded once into
// node_modules/.cache/volti/, and checked against its SHA-256.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dest = 'public/mediapipe';
const wasm = 'node_modules/@mediapipe/tasks-vision/wasm';
const cache = 'node_modules/.cache/volti/face_landmarker.task';
const model = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const sha256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) copyFileSync(`${wasm}/${f}`, `${dest}/${f}`);

if (!existsSync(cache)) {
  mkdirSync('node_modules/.cache/volti', { recursive: true });
  const res = await fetch(model);
  if (!res.ok) {
    console.error(`Could not download the face model: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  writeFileSync(cache, Buffer.from(await res.arrayBuffer()));
}
if (digest(cache) !== sha256) {
  rmSync(cache, { force: true });
  console.error(`The face model's SHA-256 is not ${sha256}: deleted the download.`);
  process.exit(1);
}
copyFileSync(cache, `${dest}/face_landmarker.task`);
