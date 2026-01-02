
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('dbffile') || {};
export default mod;
export const { DBFFile } = mod;
