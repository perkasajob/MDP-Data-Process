
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('tls') || {};
export default mod;
export const { connect, createServer } = mod;
