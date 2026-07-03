import 'server-only';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import { loadLayersModel, type LayersModel } from '@tensorflow/tfjs-layers';

// nsfwjs MobileNetV2 output classes, in the model's fixed order.
const CLASSES = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'] as const;
type Cls = (typeof CLASSES)[number];
export type NsfwScores = Record<Cls, number>;

const MODEL_DIR = path.join(process.cwd(), 'public', 'models', 'nsfw');

// Tunable thresholds (env-overridable). porn = Porn + Hentai (hardcore),
// sexy = suggestive. Explicit → immediate strict ban; review → reject + hold.
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(+v) ? +v : d);
export const NSFW_T = {
  ban: num(process.env.NSFW_BAN_THRESHOLD, 0.6), // hardcore ≥ this → ban
  review: num(process.env.NSFW_REVIEW_THRESHOLD, 0.35), // hardcore ≥ this → reject
  sexy: num(process.env.NSFW_SEXY_THRESHOLD, 0.78), // suggestive ≥ this → reject
};

/** Image moderation is on unless explicitly disabled or the model is missing. */
export function imageModerationEnabled(): boolean {
  if ((process.env.IMAGE_MODERATION || '').toLowerCase() === 'off') return false;
  return fs.existsSync(path.join(MODEL_DIR, 'model.json'));
}

/** Read the tfjs LayersModel straight from the bundled files (no network). */
function fileHandler(dir: string): tf.io.IOHandler {
  return {
    load: async () => {
      const mj = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
      const specs: tf.io.WeightsManifestEntry[] = [];
      const bufs: Buffer[] = [];
      for (const g of mj.weightsManifest) {
        for (const w of g.weights) specs.push(w);
        for (const p of g.paths) bufs.push(fs.readFileSync(path.join(dir, p)));
      }
      const c = Buffer.concat(bufs);
      return {
        modelTopology: mj.modelTopology,
        weightSpecs: specs,
        weightData: c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength),
      };
    },
  };
}

let modelPromise: Promise<LayersModel> | null = null;
async function getModel(): Promise<LayersModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const m = await loadLayersModel(fileHandler(MODEL_DIR));
      // warm up so the first real upload isn't slow
      const warm = tf.zeros([1, 224, 224, 3]);
      const out = m.predict(warm) as tf.Tensor;
      await out.data();
      tf.dispose([warm, out]);
      return m;
    })().catch((e) => {
      modelPromise = null; // allow retry on next call
      throw e;
    });
  }
  return modelPromise;
}

/** Run the classifier on raw image bytes. Returns per-class probabilities. */
export async function classifyImage(buf: Buffer): Promise<NsfwScores> {
  const model = await getModel();
  const { data } = await sharp(buf).removeAlpha().resize(224, 224, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const f = new Float32Array(224 * 224 * 3);
  for (let i = 0; i < f.length; i++) f[i] = data[i] / 255;
  const input = tf.tensor4d(f, [1, 224, 224, 3]);
  const out = model.predict(input) as tf.Tensor;
  const probs = await out.data();
  tf.dispose([input, out]);
  const r = {} as NsfwScores;
  CLASSES.forEach((c, i) => (r[c] = probs[i] || 0));
  return r;
}

export type ImageVerdict = {
  ok: boolean; // true when the model ran
  explicit: boolean; // hardcore → strict immediate ban
  review: boolean; // borderline → reject + hold, no ban
  hardcore: number; // Porn + Hentai
  sexy: number;
  scores?: NsfwScores;
};

/**
 * Classify one image and turn scores into a moderation verdict.
 * Fails SAFE: if the model can't run, returns ok:false with no block, so a
 * transient error never prevents legitimate members from publishing.
 */
export async function checkImageBuffer(buf: Buffer): Promise<ImageVerdict> {
  if (!imageModerationEnabled()) return { ok: false, explicit: false, review: false, hardcore: 0, sexy: 0 };
  try {
    const s = await classifyImage(buf);
    const hardcore = s.Porn + s.Hentai;
    const explicit = hardcore >= NSFW_T.ban;
    const review = !explicit && (hardcore >= NSFW_T.review || s.Sexy >= NSFW_T.sexy);
    return { ok: true, explicit, review, hardcore, sexy: s.Sexy, scores: s };
  } catch {
    return { ok: false, explicit: false, review: false, hardcore: 0, sexy: 0 };
  }
}

/**
 * Scan a set of images. Returns the strictest outcome:
 *   explicit → at least one hardcore image (ban).
 *   review   → at least one borderline image (reject, hold).
 */
export async function scanImages(bufs: Buffer[]): Promise<ImageVerdict> {
  let worst: ImageVerdict = { ok: false, explicit: false, review: false, hardcore: 0, sexy: 0 };
  for (const b of bufs) {
    const v = await checkImageBuffer(b);
    if (v.ok) worst = { ...worst, ok: true };
    if (v.explicit) return v; // strictest — stop early
    if (v.review && !worst.review) worst = v;
  }
  return worst;
}
