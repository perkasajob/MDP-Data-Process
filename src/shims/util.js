
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('util') || {};
export default mod;
export const { promisify, inspect } = mod;
