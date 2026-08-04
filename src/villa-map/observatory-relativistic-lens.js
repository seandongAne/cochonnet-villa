import * as THREE from "three";

import { OBSERVATORY_BLACK_HOLE_FLOW_PERIODS } from "./observatory-black-hole.js";

// Schwarzschild beam lookup and rendering core for the observatory.
//
// The lookup coordinate transforms and constant-time TraceRay procedure are
// adapted from Eric Bruneton's `black_hole_shader` (2020), BSD-3-Clause:
// https://github.com/ebruneton/black_hole_shader
// https://arxiv.org/abs/2010.08735
//
// The bundled binary tables are the unmodified outputs of Bruneton's
// preprocessing program. Their full licence and provenance are stored beside
// them in public/data/observatory-black-hole-lut-LICENSE.txt and
// public/data/observatory-black-hole-schwarzschild-lut-v1.meta.json.
//
// Copyright (c) 2020 Eric Bruneton
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors
//    may be used to endorse or promote products derived from this software
//    without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

export const OBSERVATORY_RELATIVISTIC_LENS_NAME =
  "mushroom-observatory-relativistic-lens";
export const OBSERVATORY_RELATIVISTIC_LENS_MATERIAL_NAME =
  "mushroom-observatory-relativistic-lens-material";
export const OBSERVATORY_RELATIVISTIC_LENS_STENCIL_REF = 7;
export const OBSERVATORY_RELATIVISTIC_LENS_RENDER_ORDER = -895;
export const OBSERVATORY_RELATIVISTIC_LENS_DEFAULT_QUALITY = "medium";
// The authored finite anchor is deliberately far enough away to preserve
// walking parallax. This optical mass calibration gives its Schwarzschild
// shadow a roughly 12-14 degree visual diameter at the loft-center bookmark,
// while the world anchor and all finite-distance cues remain unchanged.
export const OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE = 1.48;

export const OBSERVATORY_RELATIVISTIC_LENS_DEFLECTION_URL =
  "/data/observatory-black-hole-ray-deflection-v1.bin";
export const OBSERVATORY_RELATIVISTIC_LENS_INVERSE_RADIUS_URL =
  "/data/observatory-black-hole-ray-inverse-radius-v1.bin";
export const OBSERVATORY_RELATIVISTIC_LENS_META_URL =
  "/data/observatory-black-hole-schwarzschild-lut-v1.meta.json";

export const OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS = Object.freeze({
  deflection: Object.freeze({
    kind: "deflection",
    width: 512,
    height: 512,
    channels: 2,
    url: OBSERVATORY_RELATIVISTIC_LENS_DEFLECTION_URL
  }),
  inverseRadius: Object.freeze({
    kind: "inverse-radius",
    width: 64,
    height: 32,
    channels: 2,
    url: OBSERVATORY_RELATIVISTIC_LENS_INVERSE_RADIUS_URL
  })
});

export const OBSERVATORY_RELATIVISTIC_LENS_QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({
    id: "high",
    useLuts: true,
    // textureGrad already integrates the panorama footprint. One additional
    // pair along its major axis keeps the critical curve smooth without the
    // old five-sample prewarm spike.
    rayBundleTaps: 3,
    beamFilterStrength: 1,
    secondaryDisc: true
  }),
  medium: Object.freeze({
    id: "medium",
    useLuts: true,
    rayBundleTaps: 1,
    beamFilterStrength: 0.72,
    secondaryDisc: true
  }),
  low: Object.freeze({
    id: "low",
    useLuts: true,
    rayBundleTaps: 1,
    beamFilterStrength: 0.34,
    secondaryDisc: true
  }),
  minimum: Object.freeze({
    id: "minimum",
    useLuts: false,
    rayBundleTaps: 1,
    beamFilterStrength: 0,
    secondaryDisc: false
  })
});

const PREWARM_REVEAL = 0.01;
const REVEAL_EPSILON = 0.001;
const DEFAULT_BLACK_HOLE_RADIUS = 1.8;
const DEFAULT_DISC_INNER_RADIUS = 3.08;
const DEFAULT_DISC_OUTER_RADIUS = 7.6;
const DEFAULT_INFLUENCE_RADIUS = 0.52;

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const RELATIVISTIC_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform sampler2D uSkyTexture;
  uniform sampler2D uRayDeflectionTexture;
  uniform sampler2D uRayInverseRadiusTexture;
  uniform mat4 uCameraWorldMatrix;
  uniform mat4 uProjectionInverse;
  uniform mat3 uSkyRotation;
  uniform vec3 uCameraPosition;
  uniform vec3 uLensPosition;
  uniform vec3 uDiscNormal;
  uniform vec2 uDeflectionTextureSize;
  uniform vec2 uInverseRadiusTextureSize;
  uniform float uBlackHoleRadius;
  uniform float uDiscInnerRadius;
  uniform float uDiscOuterRadius;
  uniform float uDiscOpacity;
  uniform float uInfluenceRadius;
  uniform float uSkyBrightness;
  uniform float uReveal;
  uniform float uTime;
  uniform float uUseLuts;
  uniform float uSkyReady;
  uniform float uSecondaryDisc;
  uniform float uRayBundleTaps;
  uniform float uBeamFilterStrength;
  uniform float uHdrOutput;
  uniform float uOpticalScale;

  varying vec2 vUv;
  layout(location = 0) out vec4 observatoryFragColor;

  const float PI = 3.141592653589793;
  const float SCHWARZSCHILD_MU = 4.0 / 27.0;
  const float CRITICAL_IMPACT_PARAMETER = 2.598076211353316;
  // Shared gas-pattern cadence. These phases never rotate the event horizon,
  // disc normal or camera/lens frame; reduced motion freezes them simply by
  // freezing the existing shared uTime value.
  const float FLOW_INNER_PERIOD = ${OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.inner.toFixed(1)};
  const float FLOW_MIDDLE_PERIOD = ${OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.middle.toFixed(1)};
  const float FLOW_OUTER_PERIOD = ${OBSERVATORY_BLACK_HOLE_FLOW_PERIODS.outer.toFixed(1)};
  const float FLOW_HOTSPOT_MEAN = 0.196380615234375;

  struct RayTraceResult {
    float deflection;
    float u0;
    float phi0;
    float alpha0;
    float u1;
    float phi1;
    float alpha1;
  };

  float safeAcos(float value) {
    return acos(clamp(value, -1.0, 1.0));
  }

  float positiveMod(float value, float period) {
    return mod(mod(value, period) + period, period);
  }

  float textureCoordFromUnitRange(float value, float size) {
    return 0.5 / size + clamp(value, 0.0, 1.0) * (1.0 - 1.0 / size);
  }

  vec2 sampleLutBilinear(sampler2D lut, vec2 uv, vec2 size) {
#if OBSERVATORY_MANUAL_LUT_BILINEAR == 0
    // The normal WebGL2 path uses the GPU's native RG32F linear sampler. The
    // four-tap branch remains available as a compile-time fallback for GPUs
    // without OES_texture_float_linear, without taxing the common path.
    return texture(lut, clamp(uv, vec2(0.0), vec2(1.0))).rg;
#else
    // texelFetch makes LUT interpolation deterministic even when
    // OES_texture_float_linear is absent. Bruneton's coordinate transforms
    // move the critical discontinuity to the texture boundary, so bilinear
    // interpolation here is safe and removes 64x32 inverse-radius blockiness.
    vec2 texel = clamp(uv, vec2(0.0), vec2(1.0)) * size - 0.5;
    ivec2 lower = ivec2(clamp(floor(texel), vec2(0.0), size - 1.0));
    ivec2 upper = min(lower + ivec2(1), ivec2(size) - ivec2(1));
    vec2 weight = smoothstep(vec2(0.0), vec2(1.0), fract(texel));
    vec2 lowerLeft = texelFetch(lut, lower, 0).rg;
    vec2 lowerRight = texelFetch(lut, ivec2(upper.x, lower.y), 0).rg;
    vec2 upperLeft = texelFetch(lut, ivec2(lower.x, upper.y), 0).rg;
    vec2 upperRight = texelFetch(lut, upper, 0).rg;
    return mix(
      mix(lowerLeft, lowerRight, weight.x),
      mix(upperLeft, upperRight, weight.x),
      weight.y
    );
#endif
  }

  float rayDeflectionTextureU(float eSquare) {
    if (eSquare < SCHWARZSCHILD_MU) {
      float ratio = clamp(eSquare / SCHWARZSCHILD_MU, 0.0, 1.0 - 1e-7);
      return 0.5 - sqrt(max(-log(1.0 - ratio) / 50.0, 0.0));
    }
    float ratio = clamp(SCHWARZSCHILD_MU / max(eSquare, 1e-8), 0.0, 1.0 - 1e-7);
    return 0.5 + sqrt(max(-log(1.0 - ratio) / 50.0, 0.0));
  }

  float uApsisFromESquare(float eSquare) {
    float x = clamp((2.0 / SCHWARZSCHILD_MU) * eSquare - 1.0, -1.0, 1.0);
    return 1.0 / 3.0 + (2.0 / 3.0) * sin(asin(x) / 3.0);
  }

  float rayDeflectionTextureV(float eSquare, float inverseRadius) {
    if (eSquare > SCHWARZSCHILD_MU) {
      float x = inverseRadius < 2.0 / 3.0
        ? -sqrt(max(2.0 / 3.0 - inverseRadius, 0.0))
        : sqrt(max(inverseRadius - 2.0 / 3.0, 0.0));
      return (sqrt(2.0 / 3.0) + x)
        / (sqrt(2.0 / 3.0) + sqrt(1.0 / 3.0));
    }
    return 1.0 - sqrt(max(
      1.0 - inverseRadius / max(uApsisFromESquare(eSquare), 1e-6),
      0.0
    ));
  }

  vec2 lookupRayDeflection(float eSquare, float inverseRadius, out vec2 apsis) {
    float texU = textureCoordFromUnitRange(
      rayDeflectionTextureU(eSquare),
      uDeflectionTextureSize.x
    );
    float texV = textureCoordFromUnitRange(
      rayDeflectionTextureV(eSquare, inverseRadius),
      uDeflectionTextureSize.y
    );
    float apsisV = textureCoordFromUnitRange(1.0, uDeflectionTextureSize.y);
    apsis = sampleLutBilinear(
      uRayDeflectionTexture,
      vec2(texU, apsisV),
      uDeflectionTextureSize
    );
    return sampleLutBilinear(
      uRayDeflectionTexture,
      vec2(texU, texV),
      uDeflectionTextureSize
    );
  }

  float phiUpperBound(float eSquare) {
    return (1.0 + eSquare)
      / max(1.0 / 3.0 + 2.0 * eSquare * sqrt(eSquare), 1e-6);
  }

  vec2 lookupRayInverseRadius(float eSquare, float phi) {
    float texU = textureCoordFromUnitRange(
      1.0 / (1.0 + 6.0 * eSquare),
      uInverseRadiusTextureSize.x
    );
    float texV = textureCoordFromUnitRange(
      phi / max(phiUpperBound(eSquare), 1e-6),
      uInverseRadiusTextureSize.y
    );
    return sampleLutBilinear(
      uRayInverseRadiusTexture,
      vec2(texU, texV),
      uInverseRadiusTextureSize
    );
  }

  float filteredPulse(float edge0, float edge1, float value, float width) {
    width = max(width, 1e-6);
    float x0 = value - width * 0.5;
    float x1 = x0 + width;
    return max(0.0, (min(x1, edge1) - max(x0, edge0)) / width);
  }

  RayTraceResult analyticFallbackTrace(float pRadius, float delta) {
    RayTraceResult result;
    result.u0 = -1.0;
    result.u1 = -1.0;
    result.phi0 = 0.0;
    result.phi1 = 0.0;
    result.alpha0 = 0.0;
    result.alpha1 = 0.0;

    float observerU = 1.0 / max(pRadius, 1.001);
    float imageAngle = max(PI - delta, 0.0);
    float impact = pRadius * sin(imageAngle)
      / sqrt(max(1.0 - observerU, 1e-5));
    if (impact <= CRITICAL_IMPACT_PARAMETER) {
      result.deflection = -1.0;
      return result;
    }

    float weak = 2.0 / impact
      + 15.0 * PI / (16.0 * impact * impact);
    float epsilon = max(impact / CRITICAL_IMPACT_PARAMETER - 1.0, 1e-5);
    float strong = -log(epsilon) - 0.40023;
    float strongMix = 1.0 - smoothstep(0.08, 0.85, epsilon);
    result.deflection = max(mix(weak, strong, strongMix), 0.0);
    return result;
  }

  RayTraceResult traceSchwarzschildRay(
    float pRadius,
    float delta,
    float alpha
  ) {
    if (uUseLuts < 0.5) return analyticFallbackTrace(pRadius, delta);

    RayTraceResult result;
    result.u0 = -1.0;
    result.u1 = -1.0;
    result.phi0 = 0.0;
    result.phi1 = 0.0;
    result.alpha0 = 0.0;
    result.alpha1 = 0.0;

    float observerU = 1.0 / max(pRadius, 1.001);
    float tangent = tan(delta);
    float uDot = -observerU / (
      abs(tangent) < 1e-7 ? (tangent < 0.0 ? -1e-7 : 1e-7) : tangent
    );
    float eSquare = uDot * uDot
      + observerU * observerU * (1.0 - observerU);
    if (eSquare < SCHWARZSCHILD_MU && observerU > 2.0 / 3.0) {
      result.deflection = -1.0;
      return result;
    }

    vec2 deflectionApsis;
    vec2 deflection = lookupRayDeflection(
      eSquare,
      observerU,
      deflectionApsis
    );
    float rayDeflection = deflection.x;
    if (uDot > 0.0) {
      rayDeflection = eSquare < SCHWARZSCHILD_MU
        ? 2.0 * deflectionApsis.x - rayDeflection
        : -1.0;
    }
    result.deflection = rayDeflection;

    float directionSign = sign(uDot);
    float phi = deflection.x
      + (directionSign == 1.0 ? PI - delta : delta)
      + directionSign * alpha;
    float phiApsis = deflectionApsis.x + PI * 0.5;

    result.phi0 = positiveMod(phi, PI);
    vec2 inverse0 = lookupRayInverseRadius(eSquare, result.phi0);
    if (result.phi0 < phiApsis) {
      float side = directionSign * (inverse0.x - observerU);
      if (side > 1e-3 || (side > -1e-3 && alpha < delta)) {
        result.u0 = inverse0.x;
        result.phi0 = alpha + phi - result.phi0;
      }
    }

    phi = 2.0 * phiApsis - phi;
    result.phi1 = positiveMod(phi, PI);
    vec2 inverse1 = lookupRayInverseRadius(eSquare, result.phi1);
    if (
      eSquare < SCHWARZSCHILD_MU
      && directionSign == 1.0
      && result.phi1 < phiApsis
    ) {
      result.u1 = inverse1.x;
      result.phi1 = alpha + phi - result.phi1;
    }

    float width0 = min(
      fwidth(inverse0.x),
      fwidth(result.u0 == -1.0 ? result.u1 : result.u0)
    );
    float width1 = min(
      fwidth(inverse1.x),
      fwidth(result.u1 == -1.0 ? result.u0 : result.u1)
    );
    float innerU = 1.0 / max(uDiscInnerRadius, 1.001);
    float outerU = 1.0 / max(uDiscOuterRadius, uDiscInnerRadius + 0.001);
    result.alpha0 = filteredPulse(outerU, innerU, result.u0, width0);
    result.alpha1 = filteredPulse(outerU, innerU, result.u1, width1);

    if (
      directionSign == 1.0
      && abs(eSquare - SCHWARZSCHILD_MU)
        < min(fwidth(eSquare), SCHWARZSCHILD_MU)
    ) {
      float middleU = 2.0 / (uDiscInnerRadius + uDiscOuterRadius);
      if (result.alpha0 < 0.99) result.u0 = middleU;
      if (result.alpha1 < 0.99) result.u1 = middleU;
    }
    return result;
  }

  vec2 skyUv(vec3 direction) {
    vec3 ray = normalize(uSkyRotation * direction);
    float longitude = atan(ray.z, -ray.x) / (2.0 * PI);
    float latitude = asin(clamp(ray.y, -1.0, 1.0)) / (0.5 * PI);
    return vec2(fract(longitude), clamp(latitude, 0.0, 1.0));
  }

  vec2 seamSafeDerivative(vec2 derivative) {
    if (derivative.x > 0.5) derivative.x -= 1.0;
    if (derivative.x < -0.5) derivative.x += 1.0;
    return derivative;
  }

  vec3 filteredSky(vec3 direction) {
    vec2 uv = skyUv(direction);
    vec2 dx = seamSafeDerivative(dFdx(uv));
    vec2 dy = seamSafeDerivative(dFdy(uv));
    vec3 colour = textureGrad(uSkyTexture, uv, dx, dy).rgb;

    if (uRayBundleTaps > 1.5) {
      vec2 major = length(dx) >= length(dy) ? dx : dy;
      vec3 pair = textureGrad(
        uSkyTexture,
        vec2(fract(uv.x + major.x * 0.55), clamp(uv.y + major.y * 0.55, 0.0, 1.0)),
        dx,
        dy
      ).rgb + textureGrad(
        uSkyTexture,
        vec2(fract(uv.x - major.x * 0.55), clamp(uv.y - major.y * 0.55, 0.0, 1.0)),
        dx,
        dy
      ).rgb;
      colour = mix(colour, (colour * 2.0 + pair) * 0.25, uBeamFilterStrength);
    }
    if (uRayBundleTaps > 3.5) {
      vec2 minor = length(dx) < length(dy) ? dx : dy;
      vec3 pair = textureGrad(
        uSkyTexture,
        vec2(fract(uv.x + minor.x * 0.5), clamp(uv.y + minor.y * 0.5, 0.0, 1.0)),
        dx,
        dy
      ).rgb + textureGrad(
        uSkyTexture,
        vec2(fract(uv.x - minor.x * 0.5), clamp(uv.y - minor.y * 0.5, 0.0, 1.0)),
        dx,
        dy
      ).rgb;
      colour = mix(colour, (colour * 2.0 + pair) * 0.25, uBeamFilterStrength * 0.7);
    }
    float poleBlend = smoothstep(0.992, 0.9997, normalize(direction).y);
    colour = mix(colour, vec3(0.012, 0.018, 0.045), poleBlend * 0.78);
    return pow(max(colour, vec3(0.0)), vec3(1.06)) * uSkyBrightness;
  }

  float hashNoise(vec2 point) {
    vec3 value = fract(vec3(point.xyx) * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 curve = local * local * (3.0 - 2.0 * local);
    float a = hashNoise(cell);
    float b = hashNoise(cell + vec2(1.0, 0.0));
    float c = hashNoise(cell + vec2(0.0, 1.0));
    float d = hashNoise(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
  }

  float discFbm(vec2 point) {
    float result = valueNoise(point) * 0.54;
    point = mat2(0.80, -0.60, 0.60, 0.80) * point * 2.03 + 7.1;
    result += valueNoise(point) * 0.27;
    point = mat2(0.60, -0.80, 0.80, 0.60) * point * 2.01 - 3.7;
    result += valueNoise(point) * 0.19;
    return result;
  }

  vec3 blackBodyGold(float heat, float doppler) {
    // Brightness still receives the full relativistic boost below, while the
    // colour temperature rises more gently. This keeps a compact white-hot
    // approaching edge instead of turning an entire half-disc into a wedge.
    float temperature = clamp(heat * sqrt(doppler), 0.0, 1.45);
    vec3 ember = vec3(0.018, 0.0015, 0.0001);
    vec3 orange = vec3(1.18, 0.13, 0.002);
    vec3 gold = vec3(2.35, 0.78, 0.075);
    vec3 whiteHot = vec3(5.2, 4.45, 3.1);
    vec3 colour = mix(ember, orange, smoothstep(0.08, 0.46, temperature));
    colour = mix(colour, gold, smoothstep(0.34, 0.76, temperature));
    colour = mix(colour, whiteHot, smoothstep(0.9, 1.28, temperature));
    return colour;
  }

  vec4 shadeDisc(
    float inverseRadius,
    float phi,
    float intersectionAlpha,
    vec3 radialBasis,
    vec3 tangentBasis,
    vec3 apparentRadialDirection,
    vec3 lensDirection
  ) {
    if (inverseRadius <= 0.0 || intersectionAlpha <= 0.0) return vec4(0.0);
    float radius = 1.0 / inverseRadius;
    if (radius <= uDiscInnerRadius || radius >= uDiscOuterRadius) {
      return vec4(0.0);
    }

    vec3 discNormal = normalize(uDiscNormal);
    vec3 approachAxis = cross(discNormal, lensDirection);
    if (length(approachAxis) < 1e-6) {
      vec3 stableAxis = abs(lensDirection.y) < 0.92
        ? vec3(0.0, 1.0, 0.0)
        : vec3(1.0, 0.0, 0.0);
      approachAxis = cross(stableAxis, lensDirection);
    }
    approachAxis = normalize(approachAxis);
    vec3 discAxisY = normalize(cross(discNormal, approachAxis));
    vec3 pointDirection = normalize(
      radialBasis * cos(phi) + tangentBasis * sin(phi)
    );
    float opticalRadius = uBlackHoleRadius * uOpticalScale;

    float beta = clamp(sqrt(0.5 / max(radius - 1.0, 0.2)), 0.02, 0.68);
    float approach = dot(apparentRadialDirection, approachAxis);
    float specialRelativistic = sqrt(max(1.0 - beta * beta, 1e-4))
      / max(1.0 - beta * approach, 0.18);
    float observerU = opticalRadius
      / max(distance(uCameraPosition, uLensPosition), opticalRadius * 1.001);
    float gravitational = sqrt(max(
      (1.0 - inverseRadius) / max(1.0 - observerU, 1e-4),
      0.035
    ));
    float doppler = clamp(specialRelativistic * gravitational, 0.28, 2.1);

    const float profilePeakRadius = 49.0 / 12.0;
    float profilePeak = pow(
      max((1.0 - sqrt(3.0 / profilePeakRadius))
        / pow(profilePeakRadius, 3.0), 0.0),
      0.25
    );
    float temperatureProfile = pow(
      max((1.0 - sqrt(3.0 / radius)) / pow(radius, 3.0), 0.0),
      0.25
    ) / max(profilePeak, 1e-5);

    // Project Bruneton's physical disc intersection onto one stable pair of
    // world-space disc axes. This preserves primary/secondary image continuity
    // without using a ray-local polar texture whose basis flips across a ray
    // plane seam.
    vec2 gasPoint = vec2(
      dot(pointDirection, approachAxis),
      dot(pointDirection, discAxisY)
    ) * radius;
    float normalizedFlowRadius = clamp(
      (radius - uDiscInnerRadius)
        / max(uDiscOuterRadius - uDiscInnerRadius, 0.001),
      0.0,
      1.0
    );
    float orbitalPeriod = mix(
      FLOW_INNER_PERIOD,
      FLOW_MIDDLE_PERIOD,
      smoothstep(0.0, 0.5, normalizedFlowRadius)
    );
    orbitalPeriod = mix(
      orbitalPeriod,
      FLOW_OUTER_PERIOD,
      smoothstep(0.5, 1.0, normalizedFlowRadius)
    );
    float flowAngle = -uTime * (2.0 * PI / orbitalPeriod);
    float flowCos = cos(flowAngle);
    float flowSin = sin(flowAngle);
    gasPoint = mat2(flowCos, -flowSin, flowSin, flowCos) * gasPoint;
    float broadGas = discFbm(
      gasPoint * 0.58 + vec2(uTime * 0.006, -uTime * 0.003)
    );
    vec2 cheapWarp = vec2(broadGas - 0.5, 0.5 - broadGas) * 0.56;
    float fineGas = discFbm(
      (gasPoint + cheapWarp) * 1.36 - vec2(0.0, uTime * 0.011)
    );
    float filament = pow(1.0 - abs(fineGas * 2.0 - 1.0), 2.2);
    float flowPhase = atan(gasPoint.y, gasPoint.x);
    float longStream = sin(flowPhase * 2.0 - radius * 1.42);
    float filamentStream = sin(
      flowPhase * 5.0 - radius * 2.85 + (broadGas - 0.5) * 1.24
    );
    float hotspotShape = pow(
      0.5 + 0.5 * sin(
        flowPhase * 3.0 - radius * 1.16 + (fineGas - 0.5) * 0.96
      ),
      8.0
    );
    // Saturn-style ring banding shared with the Kerr path: static concentric
    // emissivity lanes (azimuth-free, so no ring pulsing) that the sheared
    // gas streaks visibly cross, making the rotation legible on the Low tier
    // too. Frequencies match the Kerr shader so tier switches keep one look.
    float ringBands =
        sin(radius * 14.0) * 0.45
      + sin(radius * 23.0 + 1.7) * 0.30
      + sin(radius * 41.0 + 4.2) * 0.25;
    float bandProfile = smoothstep(0.0, 0.35, normalizedFlowRadius);
    float ringStructure = 1.0 + ringBands * mix(0.10, 0.34, bandProfile);
    float streakA = sin(flowPhase * 9.0 - radius * 9.5);
    float streakB = sin(
      flowPhase * 17.0 - radius * 16.0 + (broadGas - 0.5) * 1.35
    );
    // Long gold streams and compact hot knots gain contrast around an exact
    // unit mean. The old FBM density remains the energy baseline, preventing
    // the enhanced motion from becoming a uniformly glowing annulus.
    float flowStructure = (1.0
      + longStream * 0.30
      + filamentStream * 0.14
      + streakA * 0.16
      + streakB * 0.10
      + (hotspotShape - FLOW_HOTSPOT_MEAN) * 0.58) * ringStructure;
    flowStructure = max(flowStructure, 0.0);
    float density = (0.18 + broadGas * 0.58 + filament * 0.28)
      * flowStructure;
    float radialFade = smoothstep(
      uDiscInnerRadius,
      uDiscInnerRadius * 1.11,
      radius
    ) * (1.0 - smoothstep(
      uDiscOuterRadius * 0.78,
      uDiscOuterRadius,
      radius
    ));
    float beaming = clamp(pow(doppler, 3.0), 0.12, 5.6);
    float solarCore = pow(clamp(temperatureProfile, 0.0, 1.0), 1.65);
    vec3 gasColour = blackBodyGold(temperatureProfile, doppler);
    // Match the Kerr path's white-blue tier: only strongly blueshifted
    // approaching inner gas crosses into it, so the receding side and the
    // outer lanes keep the black/gold narrative.
    vec3 blueWhite = vec3(1.9, 2.1, 2.5);
    gasColour = mix(
      gasColour,
      blueWhite * max(gasColour.r, 0.35),
      smoothstep(0.98, 1.42, temperatureProfile * doppler)
    );
    vec3 emitted = gasColour
      * density
      * radialFade
      * beaming
      * (1.38 + solarCore * 0.82);
    vec3 ldrMapped = vec3(1.0) - exp(-emitted * 0.72);
    // Half-float pass targets retain radiance above one for the solar inner
    // flow. RGBA8 retry targets request the locally compressed branch.
    vec3 hdrRadiance = emitted * 0.86 / (vec3(1.0) + emitted * 0.14);
    vec3 mapped = mix(ldrMapped, hdrRadiance, uHdrOutput);
    float alpha = intersectionAlpha
      * radialFade
      * density
      * uDiscOpacity;
    // An optically thick alpha on a nearly black, Doppler-receding sample
    // creates a broad dark leaf over the photographic sky. Keep absorption
    // subtle until the gas carries visible radiance; the bright primary and
    // secondary arcs remain opaque while dim gas no longer resembles a hole.
    float mappedLuminance = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
    float emissiveCoverage = smoothstep(0.025, 0.38, mappedLuminance);
    alpha *= emissiveCoverage;
    alpha = clamp(alpha, 0.0, 0.96);
    return vec4(mapped * alpha, alpha);
  }

  void main() {
    if (uSkyReady < 0.5 || uReveal <= 0.0) discard;

    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewPoint = uProjectionInverse * vec4(ndc, 1.0, 1.0);
    vec3 viewDirection = normalize(viewPoint.xyz / max(abs(viewPoint.w), 1e-6));
    vec3 rayDirection = normalize(
      mat3(uCameraWorldMatrix) * viewDirection
    );
    vec3 lensVector = uLensPosition - uCameraPosition;
    float cameraDistance = length(lensVector);
    if (cameraDistance <= uBlackHoleRadius * 1.001) discard;
    vec3 lensDirection = lensVector / cameraDistance;
    float imageAngle = safeAcos(dot(rayDirection, lensDirection));
    if (imageAngle >= uInfluenceRadius) discard;

    float influence = 1.0 - smoothstep(
      uInfluenceRadius * 0.78,
      uInfluenceRadius,
      imageAngle
    );
    vec3 radialDirection = rayDirection
      - lensDirection * dot(rayDirection, lensDirection);
    if (length(radialDirection) < 1e-6) {
      vec3 axis = abs(lensDirection.y) < 0.92
        ? vec3(0.0, 1.0, 0.0)
        : vec3(1.0, 0.0, 0.0);
      radialDirection = normalize(cross(axis, lensDirection));
    } else {
      radialDirection = normalize(radialDirection);
    }

    // Bruneton's delta is measured from the outward Schwarzschild radial
    // basis. A ray aimed at the horizon therefore has delta close to PI.
    float delta = PI - imageAngle;
    vec3 radialBasis = -lensDirection;
    vec3 rayPlaneNormal = cross(radialBasis, rayDirection);
    if (length(rayPlaneNormal) < 1e-6) {
      rayPlaneNormal = cross(radialBasis, radialDirection);
    }
    rayPlaneNormal = normalize(rayPlaneNormal);
    vec3 tangentBasis = normalize(cross(rayPlaneNormal, radialBasis));

    vec3 discNormal = normalize(uDiscNormal);
    vec3 discIntersectionAxis = cross(discNormal, rayPlaneNormal);
    float alpha = 0.0;
    if (length(discIntersectionAxis) > 1e-6) {
      discIntersectionAxis = normalize(discIntersectionAxis);
      if (dot(discIntersectionAxis, tangentBasis) < 0.0) {
        discIntersectionAxis = -discIntersectionAxis;
      }
      alpha = safeAcos(dot(radialBasis, discIntersectionAxis));
    }

    float opticalRadius = uBlackHoleRadius * uOpticalScale;
    float pRadius = cameraDistance / opticalRadius;
    float observerU = 1.0 / pRadius;
    float shadowAngle = asin(clamp(
      CRITICAL_IMPACT_PARAMETER * sqrt(max(1.0 - observerU, 0.0)) / pRadius,
      0.0,
      0.999
    ));
    float pixelAngle = max(fwidth(imageAngle), 1e-5);
    RayTraceResult trace = traceSchwarzschildRay(pRadius, delta, alpha);
    vec3 sceneColour = vec3(0.0);

    if (trace.deflection >= 0.0) {
      float sourceDelta = delta + trace.deflection;
      vec3 sourceDirection = normalize(
        radialBasis * cos(sourceDelta)
        + tangentBasis * sin(sourceDelta)
      );
      sceneColour = filteredSky(sourceDirection);

      float imageSolidAngle = length(cross(
        dFdx(rayDirection),
        dFdy(rayDirection)
      ));
      float sourceSolidAngle = length(cross(
        dFdx(sourceDirection),
        dFdy(sourceDirection)
      ));
      float magnification = clamp(
        imageSolidAngle / max(sourceSolidAngle, 1e-7),
        0.28,
        7.0
      );
      sceneColour *= mix(1.0, sqrt(magnification), 0.42);

    }

    if (uSecondaryDisc > 0.5) {
      vec4 secondary = shadeDisc(
        trace.u1,
        trace.phi1,
        trace.alpha1,
        radialBasis,
        tangentBasis,
        radialDirection,
        lensDirection
      );
      sceneColour = sceneColour * (1.0 - secondary.a) + secondary.rgb;
    }
    vec4 primary = shadeDisc(
      trace.u0,
      trace.phi0,
      trace.alpha0,
      radialBasis,
      tangentBasis,
      radialDirection,
      lensDirection
    );
    sceneColour = sceneColour * (1.0 - primary.a) + primary.rgb;

    // Captured rays can cross the foreground disc before reaching the event
    // horizon. Physically valid, that overlap reads as a triangular bite at
    // this stylised room scale. Preserve the requested, legible silhouette by
    // clipping all emission to a one-pixel-soft exterior of the shadow; the
    // photon-shell glint below is then the only light on its boundary.
    float eventHorizonMask = smoothstep(
      shadowAngle - pixelAngle * 0.45,
      shadowAngle + pixelAngle * 0.55,
      imageAngle
    );
    sceneColour *= eventHorizonMask;

    // The true Einstein ring comes from the multiply imaged background above.
    // A sub-pixel photon-shell glint keeps the critical curve readable when it
    // crosses a very dark patch of the photographic panorama.
    float criticalGlint = exp(
      -pow(abs(imageAngle - shadowAngle) / (pixelAngle * 1.12), 2.0)
    );
    vec3 approachAxis = cross(discNormal, lensDirection);
    if (length(approachAxis) < 1e-6) approachAxis = tangentBasis;
    approachAxis = normalize(approachAxis);
    float ringApproach = 0.5
      + 0.5 * dot(radialDirection, approachAxis);
    float glintGain = 0.035 + pow(ringApproach, 3.2) * 0.3;
    sceneColour += vec3(2.8, 1.5, 0.32)
      * criticalGlint
      * glintGain
      * smoothstep(0.16, 0.72, uReveal);

    float coverage = influence * clamp(uReveal, 0.0, 1.0);
    observatoryFragColor = vec4(sceneColour * coverage, coverage);
  }
`;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function asDataView(binary) {
  if (binary instanceof ArrayBuffer) return new DataView(binary);
  if (ArrayBuffer.isView(binary)) {
    return new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  throw new TypeError(
    "Observatory Schwarzschild LUT must be an ArrayBuffer or typed-array view"
  );
}

function lutSpecFromKind(kind) {
  const normalized = String(kind ?? "").toLowerCase();
  if (normalized === "deflection") {
    return OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS.deflection;
  }
  if (normalized === "inverse-radius" || normalized === "inverseradius") {
    return OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS.inverseRadius;
  }
  throw new RangeError(`Unknown observatory Schwarzschild LUT kind: ${kind}`);
}

function materialFrom(value) {
  if (value?.isMaterial) return value;
  return value?.material?.isMaterial ? value.material : null;
}

function copyVector3(target, value, fallback) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value)) {
    return target.set(
      finite(value[0], fallback.x),
      finite(value[1], fallback.y),
      finite(value[2], fallback.z)
    );
  }
  return target.set(
    finite(value?.x, fallback.x),
    finite(value?.y, fallback.y),
    finite(value?.z, fallback.z)
  );
}

function copyMatrix3(target, value) {
  if (value?.isMatrix3) return target.copy(value);
  if (value?.isMatrix4) return target.setFromMatrix4(value);
  if (Array.isArray(value) && value.length >= 9) return target.fromArray(value);
  return target.identity();
}

function hasCompleteLuts(luts) {
  return Boolean(
    luts?.deflection?.isTexture
    && luts?.inverseRadius?.isTexture
    && !luts?.disposed
  );
}

function needsManualLutBilinear(luts) {
  if (!hasCompleteLuts(luts)) return false;
  if (typeof luts.linear === "boolean") return !luts.linear;
  return luts.deflection.minFilter !== THREE.LinearFilter
    || luts.deflection.magFilter !== THREE.LinearFilter
    || luts.inverseRadius.minFilter !== THREE.LinearFilter
    || luts.inverseRadius.magFilter !== THREE.LinearFilter;
}

export function normalizeObservatoryRelativisticLensQuality(quality) {
  const normalized = typeof quality === "string" ? quality.toLowerCase() : "";
  return OBSERVATORY_RELATIVISTIC_LENS_QUALITY_PRESETS[normalized]?.id
    ?? OBSERVATORY_RELATIVISTIC_LENS_DEFAULT_QUALITY;
}

export function getObservatoryRelativisticLensQualityPreset(quality) {
  return OBSERVATORY_RELATIVISTIC_LENS_QUALITY_PRESETS[
    normalizeObservatoryRelativisticLensQuality(quality)
  ];
}

export function getObservatoryRelativisticLensSupport(rendererOrCapabilities) {
  const capabilities = rendererOrCapabilities?.capabilities
    ?? rendererOrCapabilities
    ?? {};
  const extensions = rendererOrCapabilities?.extensions;
  const webgl2 = capabilities.isWebGL2 === true;
  const floatLinear = webgl2 && (
    typeof extensions?.has !== "function"
    || extensions.has("OES_texture_float_linear")
  );
  return Object.freeze({
    webgl2,
    supported: webgl2,
    floatLinear,
    lutFilter: floatLinear ? "linear" : "nearest",
    fallback: webgl2 ? (floatLinear ? null : "nearest-lut") : "analytic"
  });
}

export function decodeObservatoryRelativisticLensLut(binary, kind) {
  const spec = lutSpecFromKind(kind);
  const view = asDataView(binary);
  const expectedFloats = 2 + spec.width * spec.height * spec.channels;
  const expectedBytes = expectedFloats * Float32Array.BYTES_PER_ELEMENT;
  if (view.byteLength !== expectedBytes) {
    throw new RangeError(
      `${spec.kind} LUT has ${view.byteLength} bytes; expected ${expectedBytes}`
    );
  }

  const width = view.getFloat32(0, true);
  const height = view.getFloat32(4, true);
  if (width !== spec.width || height !== spec.height) {
    throw new RangeError(
      `${spec.kind} LUT header is ${width}x${height}; expected ${spec.width}x${spec.height}`
    );
  }

  const data = new Float32Array(spec.width * spec.height * spec.channels);
  for (let index = 0; index < data.length; index += 1) {
    const value = view.getFloat32(
      (index + 2) * Float32Array.BYTES_PER_ELEMENT,
      true
    );
    if (!Number.isFinite(value)) {
      throw new RangeError(`${spec.kind} LUT contains a non-finite texel`);
    }
    data[index] = value;
  }
  return {
    kind: spec.kind,
    width: spec.width,
    height: spec.height,
    channels: spec.channels,
    data
  };
}

export function createObservatoryRelativisticLensLutTexture(
  decoded,
  { linear = true } = {}
) {
  const spec = lutSpecFromKind(decoded?.kind);
  if (
    decoded.width !== spec.width
    || decoded.height !== spec.height
    || decoded.channels !== spec.channels
    || !(decoded.data instanceof Float32Array)
    || decoded.data.length !== spec.width * spec.height * spec.channels
  ) {
    throw new TypeError(`Invalid decoded ${spec.kind} LUT`);
  }

  const texture = new THREE.DataTexture(
    decoded.data,
    decoded.width,
    decoded.height,
    THREE.RGFormat,
    THREE.FloatType
  );
  texture.name = `mushroom-observatory-${spec.kind}-lut`;
  texture.internalFormat = "RG32F";
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  texture.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.userData.observatoryLutKind = spec.kind;
  texture.userData.observatoryDisposed = false;
  texture.needsUpdate = true;
  return texture;
}

export function createObservatoryRelativisticLensLuts({
  deflection,
  inverseRadius,
  linear = true
} = {}) {
  const decodedDeflection = deflection?.data instanceof Float32Array
    ? deflection
    : decodeObservatoryRelativisticLensLut(deflection, "deflection");
  const decodedInverseRadius = inverseRadius?.data instanceof Float32Array
    ? inverseRadius
    : decodeObservatoryRelativisticLensLut(inverseRadius, "inverse-radius");
  return {
    deflection: createObservatoryRelativisticLensLutTexture(
      decodedDeflection,
      { linear }
    ),
    inverseRadius: createObservatoryRelativisticLensLutTexture(
      decodedInverseRadius,
      { linear }
    ),
    linear: Boolean(linear),
    disposed: false
  };
}

export async function loadObservatoryRelativisticLensLuts({
  fetchImpl = globalThis.fetch,
  deflectionUrl = OBSERVATORY_RELATIVISTIC_LENS_DEFLECTION_URL,
  inverseRadiusUrl = OBSERVATORY_RELATIVISTIC_LENS_INVERSE_RADIUS_URL,
  linear = true,
  signal
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required to load lens LUTs");
  }
  const [deflectionResponse, inverseRadiusResponse] = await Promise.all([
    fetchImpl(deflectionUrl, { signal }),
    fetchImpl(inverseRadiusUrl, { signal })
  ]);
  if (!deflectionResponse?.ok) {
    throw new Error(
      `Failed to load Schwarzschild deflection LUT (${deflectionResponse?.status ?? "network"})`
    );
  }
  if (!inverseRadiusResponse?.ok) {
    throw new Error(
      `Failed to load Schwarzschild inverse-radius LUT (${inverseRadiusResponse?.status ?? "network"})`
    );
  }
  const [deflection, inverseRadius] = await Promise.all([
    deflectionResponse.arrayBuffer(),
    inverseRadiusResponse.arrayBuffer()
  ]);
  return createObservatoryRelativisticLensLuts({
    deflection,
    inverseRadius,
    linear
  });
}

export function disposeObservatoryRelativisticLensLuts(luts) {
  if (!luts || luts.disposed) return false;
  for (const texture of [luts.deflection, luts.inverseRadius]) {
    if (!texture?.isTexture || texture.userData?.observatoryDisposed) continue;
    texture.dispose();
    texture.userData.observatoryDisposed = true;
  }
  luts.disposed = true;
  return true;
}

export function createObservatoryRelativisticLensMaterial({
  skyTexture = null,
  luts = null,
  quality = OBSERVATORY_RELATIVISTIC_LENS_DEFAULT_QUALITY,
  stencilRef = null,
  reveal = 0,
  hdrOutput = true,
  opticalScale = OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE,
  skyBrightness = 0.36,
  blackHoleRadius = DEFAULT_BLACK_HOLE_RADIUS,
  discInnerRadius = DEFAULT_DISC_INNER_RADIUS,
  discOuterRadius = DEFAULT_DISC_OUTER_RADIUS,
  discOpacity = 0.86,
  influenceRadius = DEFAULT_INFLUENCE_RADIUS
} = {}) {
  const preset = getObservatoryRelativisticLensQualityPreset(quality);
  const lutReady = hasCompleteLuts(luts);
  const useStencil = Number.isInteger(stencilRef);
  const material = new THREE.ShaderMaterial({
    defines: {
      OBSERVATORY_MANUAL_LUT_BILINEAR: needsManualLutBilinear(luts) ? 1 : 0
    },
    uniforms: {
      uSkyTexture: { value: skyTexture },
      uRayDeflectionTexture: { value: luts?.deflection ?? null },
      uRayInverseRadiusTexture: { value: luts?.inverseRadius ?? null },
      uCameraWorldMatrix: { value: new THREE.Matrix4() },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uSkyRotation: { value: new THREE.Matrix3() },
      uCameraPosition: { value: new THREE.Vector3() },
      uLensPosition: { value: new THREE.Vector3(0, 0, -42) },
      uDiscNormal: {
        value: new THREE.Vector3(0.18, 0.82, 0.54).normalize()
      },
      uDeflectionTextureSize: {
        value: new THREE.Vector2(
          OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS.deflection.width,
          OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS.deflection.height
        )
      },
      uInverseRadiusTextureSize: {
        value: new THREE.Vector2(
          OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS.inverseRadius.width,
          OBSERVATORY_RELATIVISTIC_LENS_LUT_SPECS.inverseRadius.height
        )
      },
      uBlackHoleRadius: {
        value: finitePositive(blackHoleRadius, DEFAULT_BLACK_HOLE_RADIUS)
      },
      uDiscInnerRadius: {
        value: finitePositive(discInnerRadius, DEFAULT_DISC_INNER_RADIUS)
      },
      uDiscOuterRadius: {
        value: finitePositive(discOuterRadius, DEFAULT_DISC_OUTER_RADIUS)
      },
      uDiscOpacity: {
        value: THREE.MathUtils.clamp(finite(discOpacity, 0.86), 0, 1)
      },
      uInfluenceRadius: {
        value: THREE.MathUtils.clamp(
          finite(influenceRadius, DEFAULT_INFLUENCE_RADIUS),
          0.08,
          1.2
        )
      },
      uSkyBrightness: {
        value: THREE.MathUtils.clamp(finite(skyBrightness, 0.36), 0, 4)
      },
      uReveal: {
        value: THREE.MathUtils.clamp(finite(reveal, 0), 0, 1)
      },
      uTime: { value: 0 },
      uUseLuts: { value: preset.useLuts && lutReady ? 1 : 0 },
      uSkyReady: { value: skyTexture?.isTexture ? 1 : 0 },
      uSecondaryDisc: {
        value: preset.useLuts && lutReady && preset.secondaryDisc ? 1 : 0
      },
      uRayBundleTaps: { value: preset.rayBundleTaps },
      uBeamFilterStrength: { value: preset.beamFilterStrength },
      uHdrOutput: { value: hdrOutput === false ? 0 : 1 },
      uOpticalScale: {
        value: THREE.MathUtils.clamp(
          finite(opticalScale, OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE),
          1,
          2
        )
      }
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: RELATIVISTIC_FRAGMENT_SHADER,
    glslVersion: THREE.GLSL3,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    // The normal integration renders this mesh into the transparent
    // black-hole FBO, whose main-scene composite owns stencil ref 7. A caller
    // drawing the mesh directly in the main scene can opt in with stencilRef.
    stencilWrite: useStencil,
    stencilRef: useStencil
      ? stencilRef
      : OBSERVATORY_RELATIVISTIC_LENS_STENCIL_REF,
    stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp
  });
  material.name = OBSERVATORY_RELATIVISTIC_LENS_MATERIAL_NAME;
  material.userData.observatoryDisposed = false;
  material.userData.requiresWebGL2 = true;
  material.userData.schwarzschildLuts = luts;
  material.userData.quality = preset.id;
  material.userData.fallback = preset.useLuts && !lutReady;
  material.userData.fallbackReason = material.userData.fallback
    ? "lut-unavailable"
    : null;
  return material;
}

export function createObservatoryRelativisticLens({
  visible = false,
  ownsLuts = false,
  lensPosition,
  discNormal,
  skyRotation,
  ...materialOptions
} = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -1, -1, 0,
    3, -1, 0,
    -1, 3, 0
  ], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 0,
    2, 0,
    0, 2
  ], 2));
  const material = createObservatoryRelativisticLensMaterial(materialOptions);
  const lens = new THREE.Mesh(geometry, material);
  lens.name = OBSERVATORY_RELATIVISTIC_LENS_NAME;
  lens.frustumCulled = false;
  lens.renderOrder = OBSERVATORY_RELATIVISTIC_LENS_RENDER_ORDER;
  lens.visible = Boolean(visible);

  if (lensPosition !== undefined) {
    copyVector3(
      material.uniforms.uLensPosition.value,
      lensPosition,
      material.uniforms.uLensPosition.value
    );
  }
  if (discNormal !== undefined) {
    copyVector3(
      material.uniforms.uDiscNormal.value,
      discNormal,
      material.uniforms.uDiscNormal.value
    ).normalize();
  }
  if (skyRotation !== undefined) {
    copyMatrix3(material.uniforms.uSkyRotation.value, skyRotation);
  }

  lens.userData.requestedVisible = Boolean(visible);
  lens.userData.quality = material.userData.quality;
  lens.userData.luts = material.userData.schwarzschildLuts;
  lens.userData.ownsLuts = Boolean(ownsLuts);
  lens.userData.fallback = material.userData.fallback;
  lens.userData.fallbackReason = material.userData.fallbackReason;
  lens.userData.reveal = material.uniforms.uReveal.value;
  lens.userData.timeSeconds = 0;
  lens.userData.disposed = false;
  lens.userData.prewarming = false;
  return lens;
}

export function setObservatoryRelativisticLensLuts(
  lensOrMaterial,
  luts,
  { ownsLuts } = {}
) {
  const material = materialFrom(lensOrMaterial);
  if (!material?.uniforms || material.userData?.observatoryDisposed) return false;
  const valid = hasCompleteLuts(luts);
  material.uniforms.uRayDeflectionTexture.value = valid
    ? luts.deflection
    : null;
  material.uniforms.uRayInverseRadiusTexture.value = valid
    ? luts.inverseRadius
    : null;
  const manualBilinear = valid && needsManualLutBilinear(luts) ? 1 : 0;
  if (material.defines.OBSERVATORY_MANUAL_LUT_BILINEAR !== manualBilinear) {
    material.defines.OBSERVATORY_MANUAL_LUT_BILINEAR = manualBilinear;
    material.needsUpdate = true;
  }
  material.userData.schwarzschildLuts = valid ? luts : null;
  material.userData.fallback = !valid;
  material.userData.fallbackReason = valid ? null : "lut-unavailable";

  if (lensOrMaterial?.isObject3D) {
    lensOrMaterial.userData.luts = valid ? luts : null;
    lensOrMaterial.userData.fallback = !valid;
    lensOrMaterial.userData.fallbackReason = valid ? null : "lut-unavailable";
    if (ownsLuts !== undefined) {
      lensOrMaterial.userData.ownsLuts = Boolean(ownsLuts);
    }
  }
  return valid;
}

export function setObservatoryRelativisticLensVisible(lens, visible) {
  if (!lens?.isObject3D || lens.userData.disposed) return false;
  lens.userData.requestedVisible = Boolean(visible);
  if (!lens.userData.requestedVisible) lens.visible = false;
  return true;
}

export function updateObservatoryRelativisticLens(
  lens,
  camera,
  {
    time,
    timeSeconds,
    reveal,
    quality,
    skyTexture,
    luts,
    lensPosition,
    discNormal,
    skyRotation,
    skyBrightness,
    blackHoleRadius,
    discInnerRadius,
    discOuterRadius,
    discOpacity,
    influenceRadius,
    hdrOutput,
    opticalScale,
    forceAnalytic = false
  } = {}
) {
  if (!lens?.isObject3D || lens.userData.disposed || !camera?.isCamera) {
    return false;
  }
  const material = materialFrom(lens);
  if (!material?.uniforms || material.userData.observatoryDisposed) return false;
  if (luts !== undefined) setObservatoryRelativisticLensLuts(lens, luts);

  const preset = getObservatoryRelativisticLensQualityPreset(
    quality ?? lens.userData.quality
  );
  const safeReveal = THREE.MathUtils.clamp(
    finite(reveal, lens.userData.reveal),
    0,
    1
  );
  const safeTime = finite(
    timeSeconds,
    finite(time, lens.userData.timeSeconds)
  );
  const activeLuts = material.userData.schwarzschildLuts;
  const lutReady = hasCompleteLuts(activeLuts);
  const useLuts = preset.useLuts && lutReady && !forceAnalytic;

  if (skyTexture !== undefined) {
    material.uniforms.uSkyTexture.value = skyTexture;
  }
  const activeSkyTexture = material.uniforms.uSkyTexture.value;
  material.uniforms.uSkyReady.value = activeSkyTexture?.isTexture ? 1 : 0;
  material.uniforms.uUseLuts.value = useLuts ? 1 : 0;
  material.uniforms.uSecondaryDisc.value =
    useLuts && preset.secondaryDisc ? 1 : 0;
  material.uniforms.uRayBundleTaps.value = preset.rayBundleTaps;
  material.uniforms.uBeamFilterStrength.value = preset.beamFilterStrength;
  material.uniforms.uReveal.value = safeReveal;
  material.uniforms.uTime.value = safeTime;

  camera.updateWorldMatrix(true, false);
  material.uniforms.uCameraWorldMatrix.value.copy(camera.matrixWorld);
  material.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
  camera.getWorldPosition(material.uniforms.uCameraPosition.value);

  if (lensPosition !== undefined) {
    copyVector3(
      material.uniforms.uLensPosition.value,
      lensPosition,
      material.uniforms.uLensPosition.value
    );
  }
  if (discNormal !== undefined) {
    copyVector3(
      material.uniforms.uDiscNormal.value,
      discNormal,
      material.uniforms.uDiscNormal.value
    ).normalize();
  }
  if (skyRotation !== undefined) {
    copyMatrix3(material.uniforms.uSkyRotation.value, skyRotation);
  }
  if (skyBrightness !== undefined) {
    material.uniforms.uSkyBrightness.value = THREE.MathUtils.clamp(
      finite(skyBrightness, 0.36),
      0,
      4
    );
  }
  if (blackHoleRadius !== undefined) {
    material.uniforms.uBlackHoleRadius.value = finitePositive(
      blackHoleRadius,
      DEFAULT_BLACK_HOLE_RADIUS
    );
  }
  if (discInnerRadius !== undefined) {
    material.uniforms.uDiscInnerRadius.value = Math.max(
      finitePositive(discInnerRadius, DEFAULT_DISC_INNER_RADIUS),
      3.001
    );
  }
  if (discOuterRadius !== undefined) {
    material.uniforms.uDiscOuterRadius.value = Math.max(
      finitePositive(discOuterRadius, DEFAULT_DISC_OUTER_RADIUS),
      material.uniforms.uDiscInnerRadius.value + 0.1
    );
  }
  if (discOpacity !== undefined) {
    material.uniforms.uDiscOpacity.value = THREE.MathUtils.clamp(
      finite(discOpacity, 0.86),
      0,
      1
    );
  }
  if (influenceRadius !== undefined) {
    material.uniforms.uInfluenceRadius.value = THREE.MathUtils.clamp(
      finite(influenceRadius, DEFAULT_INFLUENCE_RADIUS),
      0.08,
      1.2
    );
  }
  if (hdrOutput !== undefined) {
    material.uniforms.uHdrOutput.value = hdrOutput === false ? 0 : 1;
  }
  if (opticalScale !== undefined) {
    material.uniforms.uOpticalScale.value = THREE.MathUtils.clamp(
      finite(opticalScale, OBSERVATORY_RELATIVISTIC_LENS_OPTICAL_SCALE),
      1,
      2
    );
  }

  lens.userData.quality = preset.id;
  lens.userData.reveal = safeReveal;
  lens.userData.timeSeconds = safeTime;
  lens.userData.fallback = preset.useLuts && !useLuts;
  lens.userData.fallbackReason = lens.userData.fallback
    ? (lutReady ? "forced-analytic" : "lut-unavailable")
    : null;
  material.userData.quality = preset.id;
  material.userData.fallback = lens.userData.fallback;
  material.userData.fallbackReason = lens.userData.fallbackReason;

  const active = lens.userData.requestedVisible
    && safeReveal > REVEAL_EPSILON
    && material.uniforms.uSkyReady.value > 0.5;
  lens.visible = active;
  return active;
}

export function prewarmObservatoryRelativisticLens(
  lens,
  quality = OBSERVATORY_RELATIVISTIC_LENS_DEFAULT_QUALITY
) {
  if (!lens?.isObject3D || lens.userData.disposed) return false;
  const material = materialFrom(lens);
  if (!material?.uniforms || material.userData.observatoryDisposed) return false;

  const previous = {
    visible: lens.visible,
    requestedVisible: lens.userData.requestedVisible,
    prewarming: lens.userData.prewarming,
    reveal: material.uniforms.uReveal.value,
    useLuts: material.uniforms.uUseLuts.value,
    secondaryDisc: material.uniforms.uSecondaryDisc.value,
    rayBundleTaps: material.uniforms.uRayBundleTaps.value,
    beamFilterStrength: material.uniforms.uBeamFilterStrength.value
  };
  const preset = getObservatoryRelativisticLensQualityPreset(quality);
  const lutReady = hasCompleteLuts(material.userData.schwarzschildLuts);
  lens.userData.prewarming = true;
  lens.visible = true;
  material.uniforms.uReveal.value = PREWARM_REVEAL;
  material.uniforms.uUseLuts.value = preset.useLuts && lutReady ? 1 : 0;
  material.uniforms.uSecondaryDisc.value =
    preset.useLuts && lutReady && preset.secondaryDisc ? 1 : 0;
  material.uniforms.uRayBundleTaps.value = preset.rayBundleTaps;
  material.uniforms.uBeamFilterStrength.value = preset.beamFilterStrength;

  let restored = false;
  return function restoreObservatoryRelativisticLensAfterPrewarm() {
    if (restored || lens.userData.disposed) return false;
    restored = true;
    lens.visible = previous.visible;
    lens.userData.requestedVisible = previous.requestedVisible;
    lens.userData.prewarming = previous.prewarming;
    material.uniforms.uReveal.value = previous.reveal;
    material.uniforms.uUseLuts.value = previous.useLuts;
    material.uniforms.uSecondaryDisc.value = previous.secondaryDisc;
    material.uniforms.uRayBundleTaps.value = previous.rayBundleTaps;
    material.uniforms.uBeamFilterStrength.value = previous.beamFilterStrength;
    return true;
  };
}

export function disposeObservatoryRelativisticLens(lens) {
  if (!lens?.isObject3D || lens.userData.disposed) return false;
  lens.userData.disposed = true;
  lens.userData.prewarming = false;
  const material = materialFrom(lens);
  lens.geometry?.dispose();
  material?.dispose();
  if (material) material.userData.observatoryDisposed = true;
  if (lens.userData.ownsLuts) {
    disposeObservatoryRelativisticLensLuts(lens.userData.luts);
  }
  lens.removeFromParent();
  lens.clear();
  return true;
}

export {
  FULLSCREEN_VERTEX_SHADER as OBSERVATORY_RELATIVISTIC_LENS_VERTEX_SHADER,
  RELATIVISTIC_FRAGMENT_SHADER as OBSERVATORY_RELATIVISTIC_LENS_FRAGMENT_SHADER
};
