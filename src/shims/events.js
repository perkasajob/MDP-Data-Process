
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('events') || {};
export default mod;
export const { EventEmitter } = mod;
