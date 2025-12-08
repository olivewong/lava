export type ParamDef = {
  name: string;
  min: number;
  max: number;
  default: number;
  step?: number;
};

export type ShaderParams = {
  [key: string]: number;
};

export type ParamMusicMode = 'none' | 'loudness' | 'beat' | 'music';

export type ParamMusicConfig = {
  [paramName: string]: ParamMusicMode;
};

export const shaderParamDefs: Record<string, ParamDef[]> = {
  metaballs: [
    { name: 'hue', min: 0, max: 1, default: 0, step: 0.01 },
    { name: 'speed', min: 0, max: 2, default: 0.4, step: 0.1 },
    { name: 'size', min: 0.1, max: 2, default: 1.3, step: 0.01 },
  ],
  pool_reflections: [
    { name: 'hue', min: 0, max: 1, default: 0, step: 0.01 },
    { name: 'speed', min: 0, max: 2, default: 0.3, step: 0.1 },
    { name: 'size', min: 0.5, max: 5, default: 3, step: 0.1 },
    { name: 'sparkliness', min: 0, max: 1, default: 0.2, step: 0.01 },
  ],
  sun: [],
  night_sky: [
    { name: 'speed', min: 0, max: 2, default: 1.7, step: 0.1 },
    { name: 'size', min: 0.5, max: 3, default: 1.5, step: 0.1 },
    { name: 'sparkliness', min: 0, max: 1, default: 0.7, step: 0.01 },
  ],
};

export function getDefaultParams(shaderName: string): ShaderParams {
  const defs = shaderParamDefs[shaderName] || [];
  const params: ShaderParams = {};
  defs.forEach(def => {
    params[def.name] = def.default;
  });
  return params;
}

