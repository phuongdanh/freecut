import type { GpuTransitionDefinition } from '../types';

export const fade: GpuTransitionDefinition = {
  id: 'fade',
  name: 'Fade',
  category: 'basic',
  hasDirection: false,
  entryPoint: 'fadeFragment',
  uniformSize: 16,
  shader: /* wgsl */ `
struct FadeParams {
  progress: f32,
  width: f32,
  height: f32,
  _pad: f32,
};

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var leftTex: texture_2d<f32>;
@group(0) @binding(2) var rightTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: FadeParams;

@fragment
fn fadeFragment(input: VertexOutput) -> @location(0) vec4f {
  let left = textureSample(leftTex, texSampler, input.uv);
  let right = textureSample(rightTex, texSampler, input.uv);

  // Smooth cosine interpolation: t = sin²(p·π/2) = ½ − ½·cos(p·π).
  // Weights (1−t) and t always sum to 1, preserving alpha for soft crop & masks.
  let t = 0.5 - 0.5 * cos(params.progress * PI);
  return mix(left, right, t);
}`,
  packUniforms: (progress, width, height) => {
    return new Float32Array([progress, width, height, 0]);
  },
};
