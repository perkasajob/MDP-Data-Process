
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('stream') || {};
export default mod;
export const { Readable, Writable, Transform, PassThrough } = mod;
