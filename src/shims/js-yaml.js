
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('js-yaml') || {};
export default mod;
export const { load, dump } = mod;
