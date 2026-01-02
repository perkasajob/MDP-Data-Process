
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('csv-parse') || {};
export default mod;
export const { parse } = mod;
