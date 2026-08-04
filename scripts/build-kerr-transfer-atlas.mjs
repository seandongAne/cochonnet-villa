#!/usr/bin/env node

/**
 * Build the fixed Observatory Kerr transfer atlas.
 *
 * This is an original numerical implementation of the separated Kerr null
 * geodesic equations.  It does not copy AART code or ship a rendered image:
 * every texel stores a physical ray transfer result which the browser can use
 * to sample the real photographic sky and shade a time-dependent disc.
 *
 * Units: G = c = M = 1.  The default atlas is fixed at a/M = 0.94 and an
 * observer inclination of 60 degrees.  See the generated metadata for the
 * exact coordinate, status and texture-channel conventions.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isMainThread,
  parentPort,
  Worker,
  workerData
} from "node:worker_threads";

export const KERR_ATLAS_VERSION = 1;
export const KERR_SPIN = 0.94;
export const KERR_OBSERVER_INCLINATION_DEGREES = 60;
export const KERR_OBSERVER_RADIUS = 1_000;
export const KERR_ATLAS_WIDTH = 384;
export const KERR_ATLAS_HEIGHT = 384;
export const KERR_ALPHA_EXTENT = 12;
export const KERR_BETA_EXTENT = 12;

export const KERR_RAY_STATUS = Object.freeze({
  escaped: 0,
  captured: 1,
  unresolved: 2,
  invalid: 3
});

const PI = Math.PI;
const TWO_PI = PI * 2;
const HALF_PI = PI * 0.5;
const DEFAULT_MAX_STEPS = 12_000;
const DEFAULT_MAX_MINO_TIME = 80;
const HORIZON_EPSILON = 2e-4;
const POTENTIAL_RELATIVE_TOLERANCE = 2e-7;
const MIN_STEP = 2e-8;
const MAX_STEP = 0.025;
const TARGET_POLAR_STEP = 0.004;
const TARGET_AZIMUTH_STEP = 0.008;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_OUTPUT_DIR = resolve(dirname(SCRIPT_PATH), "../public/data");

function finiteOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function wrapAngle(angle) {
  let wrapped = angle % TWO_PI;
  if (wrapped > PI) wrapped -= TWO_PI;
  if (wrapped <= -PI) wrapped += TWO_PI;
  return wrapped;
}

export function getKerrHorizonRadius(spin = KERR_SPIN) {
  return 1 + Math.sqrt(Math.max(0, 1 - spin * spin));
}

export function getProgradeKerrIscoRadius(spin = KERR_SPIN) {
  const a = clamp(spin, -0.999999, 0.999999);
  const z1 = 1
    + Math.cbrt(1 - a * a)
      * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  const direction = a >= 0 ? -1 : 1;
  return 3 + z2 + direction * Math.sqrt(
    Math.max(0, (3 - z1) * (3 + z1 + 2 * z2))
  );
}

/** Bardeen screen coordinates -> E-normalised Kerr constants of motion. */
export function getKerrRayConstants(alpha, beta, {
  spin = KERR_SPIN,
  inclination = KERR_OBSERVER_INCLINATION_DEGREES * PI / 180
} = {}) {
  const sinInclination = Math.sin(inclination);
  const cosInclination = Math.cos(inclination);
  const lambda = -alpha * sinInclination;
  const eta = beta * beta
    + (alpha * alpha - spin * spin) * cosInclination * cosInclination;
  return { lambda, eta };
}

function radialPotential(r, spin, lambda, eta) {
  const delta = r * r - 2 * r + spin * spin;
  const p = r * r + spin * spin - spin * lambda;
  const k = eta + (lambda - spin) * (lambda - spin);
  return p * p - delta * k;
}

function radialPotentialDerivative(r, spin, lambda, eta) {
  const p = r * r + spin * spin - spin * lambda;
  const k = eta + (lambda - spin) * (lambda - spin);
  return 4 * r * p - 2 * (r - 1) * k;
}

function polarPotential(theta, spin, lambda, eta) {
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const sinSquared = Math.max(1e-18, sinTheta * sinTheta);
  return eta
    + spin * spin * cosTheta * cosTheta
    - lambda * lambda * cosTheta * cosTheta / sinSquared;
}

function polarPotentialDerivative(theta, spin, lambda) {
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const safeSin = Math.max(1e-9, Math.abs(sinTheta));
  return -2 * spin * spin * sinTheta * cosTheta
    + 2 * lambda * lambda * cosTheta / (safeSin * safeSin * safeSin);
}

function derivatives(state, spin, lambda, eta) {
  const [r, radialVelocity, theta, polarVelocity] = state;
  const sinTheta = Math.sin(theta);
  const sinSquared = Math.max(1e-12, sinTheta * sinTheta);
  const delta = Math.max(1e-12, r * r - 2 * r + spin * spin);
  const p = r * r + spin * spin - spin * lambda;

  const azimuthVelocity = lambda / sinSquared + spin * (p / delta - 1);
  return [
    radialVelocity,
    0.5 * radialPotentialDerivative(r, spin, lambda, eta),
    polarVelocity,
    0.5 * polarPotentialDerivative(theta, spin, lambda),
    azimuthVelocity,
    spin * (lambda - spin * sinSquared)
      + (r * r + spin * spin) * p / delta,
    Math.sqrt(
      polarVelocity * polarVelocity
      + sinSquared * azimuthVelocity * azimuthVelocity
    )
  ];
}

function rk4Step(state, step, spin, lambda, eta) {
  const k1 = derivatives(state, spin, lambda, eta);
  const s2 = state.map((value, index) => value + k1[index] * step * 0.5);
  const k2 = derivatives(s2, spin, lambda, eta);
  const s3 = state.map((value, index) => value + k2[index] * step * 0.5);
  const k3 = derivatives(s3, spin, lambda, eta);
  const s4 = state.map((value, index) => value + k3[index] * step);
  const k4 = derivatives(s4, spin, lambda, eta);
  return state.map((value, index) => value + step * (
    k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]
  ) / 6);
}

function reflectPolarCoordinate(state) {
  // Boyer-Lindquist theta is singular at the spin axis.  Continue the same
  // physical curve through the pole by reflecting theta and rotating phi.
  while (state[2] < 0 || state[2] > PI) {
    if (state[2] < 0) {
      state[2] = -state[2];
      state[3] = -state[3];
      state[4] += PI;
    } else {
      state[2] = TWO_PI - state[2];
      state[3] = -state[3];
      state[4] += PI;
    }
  }
}

function projectSeparatedVelocities(state, spin, lambda, eta) {
  const radial = radialPotential(state[0], spin, lambda, eta);
  const polar = polarPotential(state[2], spin, lambda, eta);
  const radialScale = Math.max(1, Math.abs(state[1] * state[1]));
  const polarScale = Math.max(1, Math.abs(state[3] * state[3]));
  if (radial < -POTENTIAL_RELATIVE_TOLERANCE * radialScale
    || polar < -POTENTIAL_RELATIVE_TOLERANCE * polarScale) {
    return false;
  }
  const radialSign = state[1] < 0 ? -1 : 1;
  const polarSign = state[3] < 0 ? -1 : 1;
  state[1] = radialSign * Math.sqrt(Math.max(0, radial));
  state[3] = polarSign * Math.sqrt(Math.max(0, polar));
  return true;
}

function chooseStep(state, spin, lambda, eta) {
  const derivative = derivatives(state, spin, lambda, eta);
  const r = state[0];
  const targetRadialStep = clamp(r * 0.012, 0.015, 8);
  const radialStep = targetRadialStep / Math.max(1e-12, Math.abs(state[1]));
  const polarStep = TARGET_POLAR_STEP / Math.max(1e-12, Math.abs(state[3]));
  const azimuthStep = TARGET_AZIMUTH_STEP / Math.max(1e-12, Math.abs(derivative[4]));
  return clamp(Math.min(radialStep, polarStep, azimuthStep), MIN_STEP, MAX_STEP);
}

function interpolateCrossing(previous, current, plane = HALF_PI) {
  const previousDistance = previous[2] - plane;
  const currentDistance = current[2] - plane;
  const denominator = previousDistance - currentDistance;
  const amount = Math.abs(denominator) > 1e-12
    ? clamp(previousDistance / denominator, 0, 1)
    : 0;
  return previous.map((value, index) => value + (current[index] - value) * amount);
}

export function getCircularDiscRedshift(radius, lambda, spin = KERR_SPIN) {
  const isco = getProgradeKerrIscoRadius(spin);
  if (!Number.isFinite(radius) || radius < isco) return 0;
  const omega = 1 / (Math.pow(radius, 1.5) + spin);
  const gtt = -(1 - 2 / radius);
  const gtPhi = -2 * spin / radius;
  const gPhiPhi = radius * radius + spin * spin + 2 * spin * spin / radius;
  const normalizationSquared = -(
    gtt + 2 * omega * gtPhi + omega * omega * gPhiPhi
  );
  if (!(normalizationSquared > 0)) return 0;
  const uTime = 1 / Math.sqrt(normalizationSquared);
  const emittedEnergy = uTime * (1 - omega * lambda);
  const redshift = 1 / emittedEnergy;
  return Number.isFinite(redshift) && redshift > 0 ? redshift : 0;
}

function createDiscCrossing(state, lambda, spin, imageOrder) {
  const radius = Math.max(0, state[0]);
  return {
    radius,
    azimuth: wrapAngle(state[4]),
    redshift: getCircularDiscRedshift(radius, lambda, spin),
    coordinateTime: Math.max(0, finiteOr(state[5])),
    imageOrder
  };
}

function getAsymptoticSourceDirection(state, spin, lambda, eta) {
  // At the finite source sphere use the outward spatial tangent rather than
  // the endpoint position.  In the asymptotically flat region this removes
  // the O(b/r_source) chord offset; the remaining extrapolation error is the
  // gravitational O(M/r_source) tail recorded in metadata.
  const [r, radialVelocity, theta, polarVelocity, phi] = state;
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const azimuthVelocity = derivatives(state, spin, lambda, eta)[4];
  const radialBasis = [
    sinTheta * cosPhi,
    cosTheta,
    sinTheta * sinPhi
  ];
  const polarBasis = [
    cosTheta * cosPhi,
    -sinTheta,
    cosTheta * sinPhi
  ];
  const azimuthBasis = [-sinPhi, 0, cosPhi];
  const tangent = [0, 1, 2].map((index) => (
    radialBasis[index] * radialVelocity
    + polarBasis[index] * r * polarVelocity
    + azimuthBasis[index] * r * sinTheta * azimuthVelocity
  ));
  const length = Math.hypot(...tangent);
  if (!(length > 0) || !Number.isFinite(length)) return null;
  return tangent.map((component) => component / length);
}

/**
 * Trace one ray from the distant observer, backwards into the Kerr exterior.
 * The ODE uses Mino time and the exact separated potentials R(r), Theta(theta).
 */
export function traceKerrRay(alpha, beta, options = {}) {
  const spin = options.spin ?? KERR_SPIN;
  const inclination = options.inclination
    ?? KERR_OBSERVER_INCLINATION_DEGREES * PI / 180;
  const observerRadius = options.observerRadius ?? KERR_OBSERVER_RADIUS;
  const sourceRadius = options.sourceRadius ?? observerRadius;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxMinoTime = options.maxMinoTime ?? DEFAULT_MAX_MINO_TIME;
  const horizonRadius = getKerrHorizonRadius(spin);
  const { lambda, eta } = getKerrRayConstants(alpha, beta, {
    spin,
    inclination
  });
  const initialRadialPotential = radialPotential(
    observerRadius,
    spin,
    lambda,
    eta
  );
  const initialPolarPotential = polarPotential(
    inclination,
    spin,
    lambda,
    eta
  );

  if (!(initialRadialPotential >= 0) || !(initialPolarPotential >= -1e-8)) {
    return {
      status: KERR_RAY_STATUS.invalid,
      alpha,
      beta,
      lambda,
      eta,
      discCrossings: []
    };
  }

  // State: r, dr/dgamma, theta, dtheta/dgamma, phi, t, accumulated
  // central angle.  The final value gives a coordinate-branch-independent
  // background image order: a direct ray travels roughly pi, while every
  // additional lensed loop contributes roughly 2*pi.
  // beta-positive is defined as increasing Boyer-Lindquist theta in the atlas.
  let state = [
    observerRadius,
    -Math.sqrt(Math.max(0, initialRadialPotential)),
    inclination,
    beta < 0
      ? -Math.sqrt(Math.max(0, initialPolarPotential))
      : Math.sqrt(Math.max(0, initialPolarPotential)),
    0,
    0,
    0
  ];
  let minoTime = 0;
  let minimumRadius = observerRadius;
  let radialTurningPoints = 0;
  let previousRadialSign = -1;
  const discCrossings = [];

  for (let stepIndex = 0; stepIndex < maxSteps && minoTime < maxMinoTime; stepIndex += 1) {
    const previous = state;
    let step = chooseStep(state, spin, lambda, eta);
    let accepted = false;
    let candidate;

    // Near a turning point a finite RK step can enter the forbidden region.
    // Retry at half the Mino step instead of silently smearing the critical ray.
    for (let retry = 0; retry < 12; retry += 1) {
      candidate = rk4Step(state, step, spin, lambda, eta);
      reflectPolarCoordinate(candidate);
      if (candidate.every(Number.isFinite)
        && projectSeparatedVelocities(candidate, spin, lambda, eta)) {
        accepted = true;
        break;
      }
      step *= 0.5;
      if (step < MIN_STEP) break;
    }

    if (!accepted) {
      return {
        status: KERR_RAY_STATUS.unresolved,
        alpha,
        beta,
        lambda,
        eta,
        minimumRadius,
        discCrossings
      };
    }

    state = candidate;
    minoTime += step;
    minimumRadius = Math.min(minimumRadius, state[0]);

    const radialSign = state[1] < 0 ? -1 : 1;
    if (radialSign !== previousRadialSign) radialTurningPoints += 1;
    previousRadialSign = radialSign;

    const previousEquator = previous[2] - HALF_PI;
    const currentEquator = state[2] - HALF_PI;
    if (previousEquator === 0 || currentEquator === 0
      || previousEquator * currentEquator < 0) {
      const crossing = interpolateCrossing(previous, state);
      // Reject the observer endpoint and numerical horizon crossings.  Keep
      // only the first two physical lensing bands needed by v1.
      if (crossing[0] < observerRadius * 0.999
        && crossing[0] > horizonRadius + HORIZON_EPSILON
        && discCrossings.length < 2) {
        discCrossings.push(createDiscCrossing(
          crossing,
          lambda,
          spin,
          discCrossings.length
        ));
      }
    }

    if (state[0] <= horizonRadius + HORIZON_EPSILON) {
      return {
        status: KERR_RAY_STATUS.captured,
        alpha,
        beta,
        lambda,
        eta,
        minimumRadius,
        radialTurningPoints,
        minoTime,
        coordinateTime: state[5],
        discCrossings
      };
    }

    if (state[0] >= sourceRadius && state[1] > 0 && radialTurningPoints > 0) {
      const sourceDirection = getAsymptoticSourceDirection(
        state,
        spin,
        lambda,
        eta
      );
      if (!sourceDirection) {
        return {
          status: KERR_RAY_STATUS.unresolved,
          alpha,
          beta,
          lambda,
          eta,
          minimumRadius,
          radialTurningPoints,
          minoTime,
          coordinateTime: state[5],
          discCrossings
        };
      }
      const flatTravelTime = 2 * Math.sqrt(Math.max(
        0,
        observerRadius * observerRadius - alpha * alpha - beta * beta
      ));
      const coordinateTime = Math.max(0, state[5]);
      const timeDelay = Math.max(0, coordinateTime - flatTravelTime);
      const imageOrder = Math.max(0, Math.floor(state[6] / TWO_PI));
      return {
        status: KERR_RAY_STATUS.escaped,
        alpha,
        beta,
        lambda,
        eta,
        sourceDirection,
        minimumRadius,
        radialTurningPoints,
        minoTime,
        coordinateTime,
        timeDelay,
        winding: state[4] / TWO_PI,
        imageOrder,
        discCrossings
      };
    }
  }

  return {
    status: KERR_RAY_STATUS.unresolved,
    alpha,
    beta,
    lambda,
    eta,
    minimumRadius,
    radialTurningPoints,
    minoTime,
    coordinateTime: state[5],
    discCrossings
  };
}

function writeRayToArrays(ray, pixelIndex, sky, primary, secondary, path) {
  const skyOffset = pixelIndex * 4;
  const pathOffset = pixelIndex * 2;
  if (ray.status === KERR_RAY_STATUS.escaped && ray.sourceDirection) {
    sky[skyOffset] = ray.sourceDirection[0];
    sky[skyOffset + 1] = ray.sourceDirection[1];
    sky[skyOffset + 2] = ray.sourceDirection[2];
  }
  sky[skyOffset + 3] = ray.status;

  for (const [crossing, target] of [
    [ray.discCrossings?.[0], primary],
    [ray.discCrossings?.[1], secondary]
  ]) {
    if (!crossing) continue;
    target[skyOffset] = finiteOr(crossing.radius);
    target[skyOffset + 1] = finiteOr(crossing.azimuth);
    target[skyOffset + 2] = finiteOr(crossing.redshift);
    target[skyOffset + 3] = finiteOr(crossing.coordinateTime);
  }

  if (ray.status === KERR_RAY_STATUS.escaped) {
    path[pathOffset] = finiteOr(ray.timeDelay);
    path[pathOffset + 1] = finiteOr(ray.imageOrder);
  }
}

function traceRowRange(config, startRow, endRow) {
  const rowCount = endRow - startRow;
  const pixelCount = config.width * rowCount;
  const sky = new Float32Array(pixelCount * 4);
  const primary = new Float32Array(pixelCount * 4);
  const secondary = new Float32Array(pixelCount * 4);
  const path = new Float32Array(pixelCount * 2);
  const statusCounts = [0, 0, 0, 0];
  let primaryCount = 0;
  let secondaryCount = 0;
  let positiveRedshiftCount = 0;
  let maximumImageOrder = 0;
  let localPixel = 0;

  for (let y = startRow; y < endRow; y += 1) {
    const beta = config.betaMax
      + (config.betaMin - config.betaMax) * ((y + 0.5) / config.height);
    for (let x = 0; x < config.width; x += 1) {
      const alpha = config.alphaMin
        + (config.alphaMax - config.alphaMin) * ((x + 0.5) / config.width);
      const ray = traceKerrRay(alpha, beta, config);
      writeRayToArrays(ray, localPixel, sky, primary, secondary, path);
      statusCounts[ray.status] += 1;
      if (ray.discCrossings?.[0]) primaryCount += 1;
      if (ray.discCrossings?.[1]) secondaryCount += 1;
      if (ray.discCrossings?.some(({ redshift }) => redshift > 0)) {
        positiveRedshiftCount += 1;
      }
      maximumImageOrder = Math.max(maximumImageOrder, ray.imageOrder ?? 0);
      localPixel += 1;
    }
  }

  return {
    startRow,
    endRow,
    sky,
    primary,
    secondary,
    path,
    stats: {
      statusCounts,
      primaryCount,
      secondaryCount,
      positiveRedshiftCount,
      maximumImageOrder
    }
  };
}

async function traceAtlasParallel(config) {
  const workerCount = Math.max(1, Math.min(config.workers, config.height));
  if (workerCount === 1) return [traceRowRange(config, 0, config.height)];
  const ranges = Array.from({ length: workerCount }, (_, index) => {
    const startRow = Math.floor(index * config.height / workerCount);
    const endRow = Math.floor((index + 1) * config.height / workerCount);
    return { startRow, endRow };
  });
  return Promise.all(ranges.map(({ startRow, endRow }) => new Promise(
    (resolveWorker, rejectWorker) => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { task: "traceRows", config, startRow, endRow }
      });
      worker.once("message", (message) => {
        resolveWorker({
          ...message,
          sky: new Float32Array(message.sky),
          primary: new Float32Array(message.primary),
          secondary: new Float32Array(message.secondary),
          path: new Float32Array(message.path)
        });
      });
      worker.once("error", rejectWorker);
      worker.once("exit", (code) => {
        if (code !== 0) rejectWorker(new Error(`Kerr atlas worker exited ${code}`));
      });
    }
  )));
}

function mergeAtlasParts(parts, config) {
  const pixelCount = config.width * config.height;
  const sky = new Float32Array(pixelCount * 4);
  const primary = new Float32Array(pixelCount * 4);
  const secondary = new Float32Array(pixelCount * 4);
  const path = new Float32Array(pixelCount * 2);
  const stats = {
    statusCounts: [0, 0, 0, 0],
    primaryCount: 0,
    secondaryCount: 0,
    positiveRedshiftCount: 0,
    maximumImageOrder: 0
  };

  for (const part of parts.sort((left, right) => left.startRow - right.startRow)) {
    const pixelOffset = part.startRow * config.width;
    sky.set(part.sky, pixelOffset * 4);
    primary.set(part.primary, pixelOffset * 4);
    secondary.set(part.secondary, pixelOffset * 4);
    path.set(part.path, pixelOffset * 2);
    for (let index = 0; index < 4; index += 1) {
      stats.statusCounts[index] += part.stats.statusCounts[index];
    }
    stats.primaryCount += part.stats.primaryCount;
    stats.secondaryCount += part.stats.secondaryCount;
    stats.positiveRedshiftCount += part.stats.positiveRedshiftCount;
    stats.maximumImageOrder = Math.max(
      stats.maximumImageOrder,
      part.stats.maximumImageOrder
    );
  }
  return { sky, primary, secondary, path, stats };
}

function encodeFloatAtlas(data, width, height) {
  const headerBytes = 8;
  const output = Buffer.allocUnsafe(headerBytes + data.byteLength);
  output.writeUInt32LE(width, 0);
  output.writeUInt32LE(height, 4);
  // The header, the runtime decoder and the test suite all read the payload
  // explicitly little-endian, so write every float explicitly LE rather than
  // memcpying host-endian Float32Array bytes.  On little-endian hosts the
  // output is byte-identical (every payload value is finite, so the
  // float32 -> float64 -> float32 round trip is exact); on a big-endian host
  // this is the difference between a valid atlas and a file with a valid
  // header and a byte-swapped, corrupt payload.
  for (let index = 0; index < data.length; index += 1) {
    output.writeFloatLE(
      data[index],
      headerBytes + index * Float32Array.BYTES_PER_ELEMENT
    );
  }
  return output;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseIntegerFlag(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new RangeError(`Expected a positive integer, received ${value}`);
  }
  return number;
}

function parseNumberFlag(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RangeError(`Expected a finite number, received ${value}`);
  }
  return number;
}

function parseArguments(argv) {
  const flags = Object.fromEntries(argv.map((argument) => {
    const [key, ...rest] = argument.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }));
  const width = parseIntegerFlag(flags.width, KERR_ATLAS_WIDTH);
  const height = parseIntegerFlag(flags.height, KERR_ATLAS_HEIGHT);
  const workers = parseIntegerFlag(
    flags.workers,
    Math.max(1, Math.min(8, availableParallelism() - 1))
  );
  const alphaExtent = parseNumberFlag(flags["alpha-extent"], KERR_ALPHA_EXTENT);
  const betaExtent = parseNumberFlag(flags["beta-extent"], KERR_BETA_EXTENT);
  return {
    width,
    height,
    workers,
    spin: KERR_SPIN,
    inclination: KERR_OBSERVER_INCLINATION_DEGREES * PI / 180,
    observerRadius: KERR_OBSERVER_RADIUS,
    sourceRadius: KERR_OBSERVER_RADIUS,
    alphaMin: -Math.abs(alphaExtent),
    alphaMax: Math.abs(alphaExtent),
    betaMin: -Math.abs(betaExtent),
    betaMax: Math.abs(betaExtent),
    outputDir: resolve(String(flags.output ?? DEFAULT_OUTPUT_DIR)),
    maxSteps: parseIntegerFlag(flags["max-steps"], DEFAULT_MAX_STEPS),
    maxMinoTime: parseNumberFlag(flags["max-mino-time"], DEFAULT_MAX_MINO_TIME)
  };
}

export async function buildKerrTransferAtlas(options = {}) {
  const config = {
    width: options.width ?? KERR_ATLAS_WIDTH,
    height: options.height ?? KERR_ATLAS_HEIGHT,
    workers: options.workers
      ?? Math.max(1, Math.min(8, availableParallelism() - 1)),
    spin: options.spin ?? KERR_SPIN,
    inclination: options.inclination
      ?? KERR_OBSERVER_INCLINATION_DEGREES * PI / 180,
    observerRadius: options.observerRadius ?? KERR_OBSERVER_RADIUS,
    sourceRadius: options.sourceRadius ?? options.observerRadius ?? KERR_OBSERVER_RADIUS,
    alphaMin: options.alphaMin ?? -KERR_ALPHA_EXTENT,
    alphaMax: options.alphaMax ?? KERR_ALPHA_EXTENT,
    betaMin: options.betaMin ?? -KERR_BETA_EXTENT,
    betaMax: options.betaMax ?? KERR_BETA_EXTENT,
    outputDir: resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
    maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS,
    maxMinoTime: options.maxMinoTime ?? DEFAULT_MAX_MINO_TIME
  };
  if (Math.abs(config.spin - KERR_SPIN) > 1e-12
    || Math.abs(config.inclination * 180 / PI - KERR_OBSERVER_INCLINATION_DEGREES) > 1e-12) {
    throw new RangeError("Observatory Kerr atlas v1 is fixed at a/M=0.94 and i=60 degrees");
  }
  await mkdir(config.outputDir, { recursive: true });
  const parts = await traceAtlasParallel(config);
  const atlas = mergeAtlasParts(parts, config);
  const fileDefinitions = [
    {
      key: "sky",
      path: "observatory-kerr-sky-v1.bin",
      channels: 4,
      channelNames: ["sourceDirectionX", "sourceDirectionY", "sourceDirectionZ", "status"],
      data: atlas.sky
    },
    {
      key: "discPrimary",
      path: "observatory-kerr-disc-primary-v1.bin",
      channels: 4,
      channelNames: ["radiusM", "azimuthRadians", "redshiftG", "coordinateTimeM"],
      data: atlas.primary,
      imageOrder: 0
    },
    {
      key: "discSecondary",
      path: "observatory-kerr-disc-secondary-v1.bin",
      channels: 4,
      channelNames: ["radiusM", "azimuthRadians", "redshiftG", "coordinateTimeM"],
      data: atlas.secondary,
      imageOrder: 1
    },
    {
      key: "path",
      path: "observatory-kerr-path-v1.bin",
      channels: 2,
      channelNames: ["backgroundTimeDelayM", "backgroundImageOrder"],
      data: atlas.path
    }
  ];

  const writtenFiles = [];
  for (const definition of fileDefinitions) {
    const bytes = encodeFloatAtlas(definition.data, config.width, config.height);
    await writeFile(resolve(config.outputDir, definition.path), bytes);
    writtenFiles.push({
      key: definition.key,
      path: definition.path,
      width: config.width,
      height: config.height,
      channels: definition.channels,
      channelNames: definition.channelNames,
      ...(definition.imageOrder === undefined ? {} : { imageOrder: definition.imageOrder }),
      scalarType: "float32",
      byteLength: bytes.byteLength,
      sha256: sha256(bytes)
    });
  }

  const scriptBytes = await readFile(SCRIPT_PATH);
  const pixelCount = config.width * config.height;
  const metadata = {
    schema: "cochonnet-observatory-kerr-transfer-atlas",
    version: KERR_ATLAS_VERSION,
    description: "Offline physical Kerr null-geodesic transfer atlas. Runtime shading samples the real photographic sky and dynamic accretion disc through these maps; the atlas is not a baked black-hole image or an artistic warp.",
    fixedPhysicalParameters: {
      units: "G=c=M=1",
      dimensionlessSpin: config.spin,
      observerInclinationDegrees: config.inclination * 180 / PI,
      observerBoyerLindquistRadiusM: config.observerRadius,
      sourceSphereBoyerLindquistRadiusM: config.sourceRadius,
      outerHorizonRadiusM: getKerrHorizonRadius(config.spin),
      progradeIscoRadiusM: getProgradeKerrIscoRadius(config.spin)
    },
    imagePlane: {
      convention: "Bardeen screen coordinates at a distant observer; alpha increases left-to-right, beta-positive initializes increasing Boyer-Lindquist theta",
      alphaMinM: config.alphaMin,
      alphaMaxM: config.alphaMax,
      betaMinM: config.betaMin,
      betaMaxM: config.betaMax,
      texelCenters: true,
      rowOrder: "top-to-bottom; betaMax to betaMin",
      constantsOfMotion: {
        lambda: "-alpha*sin(thetaObserver)",
        eta: "beta^2 + (alpha^2-a^2)*cos(thetaObserver)^2"
      }
    },
    integration: {
      method: "adaptive classical RK4 in Mino parameter using the exact separated Kerr radial and polar potentials; second-order potential form crosses turning points without changing branch by hand",
      radialPotential: "R=[r^2+a^2-a*lambda]^2-Delta*[eta+(lambda-a)^2]",
      polarPotential: "Theta=eta+a^2*cos(theta)^2-lambda^2*cot(theta)^2",
      maxSteps: config.maxSteps,
      maxMinoTime: config.maxMinoTime,
      horizonEpsilonM: HORIZON_EPSILON,
      maximumStep: MAX_STEP,
      minimumStep: MIN_STEP,
      targetPolarStepRadians: TARGET_POLAR_STEP,
      targetAzimuthStepRadians: TARGET_AZIMUTH_STEP,
      note: "Finite r=1000M endpoints avoid infinity singularities. The Bardeen constants are their asymptotic values; residual endpoint error is O(M/r)=about 0.1%. Critical rays that fail the bounded convergence policy are marked unresolved, never silently replaced by an artistic approximation."
    },
    discModel: {
      crossings: "first two backward-ray intersections with theta=pi/2, in traversal order; a zero radius means no crossing",
      imageOrders: [0, 1],
      redshift: "g=1/[u^t*(1-Omega*lambda)] for prograde circular equatorial geodesics at r>=ISCO; g=0 below ISCO leaves enough r,lambda data for a future plunging-flow prescription",
      omega: "1/(r^(3/2)+a)",
      intensityInvariant: "runtime must apply I_nu/nu^3 invariance (g^3 for specific intensity)"
    },
    skyModel: {
      sourceDirectionFrame: "unit asymptotic outgoing tangent evaluated at the r=1000M source sphere; +Y is the Kerr spin axis, observer azimuth is zero",
      statusValues: KERR_RAY_STATUS,
      captureMask: "sky.status==1",
      unresolvedPolicy: "sky.status==2 must fall back to the bundled Schwarzschild/analytic renderer"
    },
    pathModel: {
      backgroundTimeDelay: "Boyer-Lindquist coordinate travel time minus the flat-space chord travel time, in M",
      backgroundImageOrder: "floor(accumulated central angular travel/(2*pi)); 0 is direct background, larger values include additional lensed loops"
    },
    binaryLayout: {
      endianness: "little",
      headerBytes: 8,
      header: ["uint32 width", "uint32 height"],
      payload: "row-major interleaved float32"
    },
    generator: {
      path: "scripts/build-kerr-transfer-atlas.mjs",
      sha256: sha256(scriptBytes),
      workersDoNotAffectResults: true,
      command: "node scripts/build-kerr-transfer-atlas.mjs"
    },
    references: [
      {
        title: "The Null Geodesics of the Kerr Exterior",
        authors: "Samuel E. Gralla and Alexandru Lupsasca",
        journal: "Physical Review D 101, 044032 (2020)",
        doi: "10.1103/PhysRevD.101.044032",
        arxiv: "https://arxiv.org/abs/1910.12881",
        role: "complete separated Kerr null-geodesic potentials and solution classification"
      },
      {
        title: "Adaptive Analytical Ray Tracing of Black Hole Photon Rings",
        authors: "Alejandro Cardenas-Avendano, Alexandru Lupsasca, and Hengrui Zhu",
        journal: "Physical Review D 107, 043030 (2023)",
        doi: "10.1103/PhysRevD.107.043030",
        arxiv: "https://arxiv.org/abs/2211.07469",
        code: "https://github.com/iAART/aart",
        role: "transfer-function/lensing-band architecture, image-order and time-delay conventions; no upstream source code copied"
      }
    ],
    licence: {
      spdx: "CC0-1.0",
      file: "observatory-kerr-transfer-atlas-LICENSE.txt",
      note: "The binary values are original generated numerical data. Equations and physical facts are cited above; no AART code or data is redistributed."
    },
    statistics: {
      pixelCount,
      escaped: atlas.stats.statusCounts[KERR_RAY_STATUS.escaped],
      captured: atlas.stats.statusCounts[KERR_RAY_STATUS.captured],
      unresolved: atlas.stats.statusCounts[KERR_RAY_STATUS.unresolved],
      invalid: atlas.stats.statusCounts[KERR_RAY_STATUS.invalid],
      primaryDiscIntersections: atlas.stats.primaryCount,
      secondaryDiscIntersections: atlas.stats.secondaryCount,
      raysWithPositiveCircularDiscRedshift: atlas.stats.positiveRedshiftCount,
      maximumBackgroundImageOrder: atlas.stats.maximumImageOrder
    },
    files: writtenFiles
  };
  const metadataPath = resolve(
    config.outputDir,
    "observatory-kerr-transfer-atlas-v1.meta.json"
  );
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return { config, atlas, metadata, metadataPath };
}

async function runCli() {
  const config = parseArguments(process.argv.slice(2));
  const startedAt = Date.now();
  const { metadata } = await buildKerrTransferAtlas(config);
  const elapsedSeconds = (Date.now() - startedAt) / 1_000;
  process.stdout.write(`${JSON.stringify({
    outputDir: config.outputDir,
    elapsedSeconds,
    statistics: metadata.statistics,
    files: metadata.files.map(({ path, byteLength, sha256: hash }) => ({
      path,
      byteLength,
      sha256: hash
    }))
  }, null, 2)}\n`);
}

if (!isMainThread && workerData?.task === "traceRows") {
  const result = traceRowRange(
    workerData.config,
    workerData.startRow,
    workerData.endRow
  );
  parentPort.postMessage({
    startRow: result.startRow,
    endRow: result.endRow,
    sky: result.sky.buffer,
    primary: result.primary.buffer,
    secondary: result.secondary.buffer,
    path: result.path.buffer,
    stats: result.stats
  }, [
    result.sky.buffer,
    result.primary.buffer,
    result.secondary.buffer,
    result.path.buffer
  ]);
} else if (isMainThread
  && process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
