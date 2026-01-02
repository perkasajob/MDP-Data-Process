
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('xlsx') || {};
export default mod;
export const { readFile, utils, writeFile } = mod;
