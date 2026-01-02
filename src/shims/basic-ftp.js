
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('basic-ftp') || {};
export default mod;
export const { Client } = mod;
