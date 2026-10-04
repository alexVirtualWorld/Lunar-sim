import * as THREE from 'three';

/**
 * Lunar surface material for real DEM terrain.
 *
 * Responsibilities:
 *  - LROC regional albedo is used only as low-frequency / macro colour guidance.
 *  - Fine regolith colour, roughness and normals are generated procedurally in
 *    stable lunar ENU coordinates, not UV space, so steep crater walls do not
 *    stretch the near-field material.
 *  - Geometry remains entirely DEM-driven; this shader never changes vertices.
 */
export function createLunarRegolithMaterial({
  macroAlbedoStrength = 0.34,
  macroSaturation = 0.28,
  baseColor = 0x77736b
} = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor),
    roughness: 0.96,
    metalness: 0.0,
    side: THREE.FrontSide
  });

  material.userData.lunarParams = {
    macroAlbedoStrength,
    macroSaturation
  };

  material.customProgramCacheKey = () => 'lunar-regolith-triplanar-v6';

  material.onBeforeCompile = shader => {
    material.userData.shader = shader;

    shader.uniforms.uMacroAlbedoStrength = { value: material.userData.lunarParams.macroAlbedoStrength };
    shader.uniforms.uMacroSaturation = { value: material.userData.lunarParams.macroSaturation };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 lunarCoord;
varying vec3 vLunarPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
// Stable lunar ENU coordinates in metres. East/North come from the geographic
// tile attribute, and height comes from DEM-authored geometry. This deliberately
// ignores floating-origin X/Z so procedural detail does not jump after recentering.
vLunarPos = vec3(lunarCoord.x, position.y, -lunarCoord.y);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLunarPos;
uniform float uMacroAlbedoStrength;
uniform float uMacroSaturation;

float lunarHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float lunarNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = lunarHash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = lunarHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = lunarHash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = lunarHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = lunarHash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = lunarHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = lunarHash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = lunarHash13(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float lunarFBM3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * lunarNoise3(p);
    p = p * 2.03 + vec3(17.1, 9.7, 13.3);
    a *= 0.5;
  }
  return v;
}

// A compact derivative-based bump perturbation. h is a procedural scalar field
// evaluated in stable 3D lunar coordinates, so the result works on floors and
// near-vertical crater walls without planar UV stretching.
vec3 lunarPerturbNormal3(vec3 surfPos, vec3 surfNorm, float h, float strength) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  float dHx = dFdx(h);
  float dHy = dFdy(h);
  vec3 R1 = cross(sigmaY, surfNorm);
  vec3 R2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, R1);
  vec3 grad = sign(det) * (dHx * R1 + dHy * R2);
  return normalize(abs(det) * surfNorm - grad * strength);
}

vec3 lunarDesaturate(vec3 c, float saturation) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luma), c, saturation);
}`
      )
      // Do NOT let MeshStandardMaterial multiply the full LROC texture directly
      // into diffuseColor. The geographic albedo remains correctly UV-mapped, but
      // acts only as low-frequency colour guidance. This prevents the photograph
      // from dominating steep walls.
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 lunarMacroTexel = texture2D(map, vMapUv);
  vec3 lunarMacroColor = lunarDesaturate(lunarMacroTexel.rgb, uMacroSaturation);
  float lunarMacroLuma = dot(lunarMacroTexel.rgb, vec3(0.2126, 0.7152, 0.0722));

  // Preserve broad maria/highland brightness while suppressing photographic
  // colour cast. The multiplier is centred close to 1 so the regolith base
  // remains in control at rover distance.
  vec3 lunarMacroMultiplier = mix(
    vec3(0.78 + lunarMacroLuma * 0.44),
    lunarMacroColor,
    0.30
  );
  diffuseColor.rgb *= mix(vec3(1.0), lunarMacroMultiplier, uMacroAlbedoStrength);
#endif

// Multi-scale 3D regolith variation. Because it uses lunar position rather than
// UV, detail has the same scale on horizontal ground and steep crater walls.
float lunarMacro3D = lunarFBM3(vLunarPos / 2200.0);
float lunarSoil3D  = lunarFBM3(vLunarPos / 8.0);
float lunarFine3D  = lunarFBM3(vLunarPos / 0.95);
float lunarColorVariation =
    0.955
  + (lunarMacro3D - 0.5) * 0.055
  + (lunarSoil3D  - 0.5) * 0.045
  + (lunarFine3D  - 0.5) * 0.014;
diffuseColor.rgb *= lunarColorVariation;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
float lunarRoughMedium = lunarFBM3(vLunarPos / 2.4);
float lunarRoughMicro  = lunarFBM3(vLunarPos / 0.28);
roughnessFactor = clamp(
  0.91 + lunarRoughMedium * 0.065 + lunarRoughMicro * 0.035,
  0.91,
  1.0
);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
float lunarBump =
    lunarFBM3(vLunarPos / 1.6) * 0.36
  + lunarFBM3(vLunarPos / 0.34) * 0.44
  + lunarFBM3(vLunarPos / 0.075) * 0.20;
normal = lunarPerturbNormal3(-vViewPosition, normal, lunarBump, 0.19);`
      );
  };

  material.needsUpdate = true;
  return material;
}

/** Runtime tuning helpers; useful for quick visual iteration without recompiling. */
export function setLunarMacroAlbedoStrength(material, value) {
  const v = THREE.MathUtils.clamp(value, 0, 1);
  if (material.userData?.lunarParams) material.userData.lunarParams.macroAlbedoStrength = v;
  const shader = material.userData?.shader;
  if (shader?.uniforms?.uMacroAlbedoStrength) shader.uniforms.uMacroAlbedoStrength.value = v;
}

export function setLunarMacroSaturation(material, value) {
  const v = THREE.MathUtils.clamp(value, 0, 1);
  if (material.userData?.lunarParams) material.userData.lunarParams.macroSaturation = v;
  const shader = material.userData?.shader;
  if (shader?.uniforms?.uMacroSaturation) shader.uniforms.uMacroSaturation.value = v;
}
