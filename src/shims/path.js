
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('path') || {};
export default mod;
export const { join, resolve, basename, dirname, extname, parse, format, sep, delimiter } = mod;
