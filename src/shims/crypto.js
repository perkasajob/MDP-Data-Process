
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('crypto') || {};
export default mod;
export const { createHash, randomBytes } = mod;
