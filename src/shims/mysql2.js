
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('mysql2') || {};
export default mod;
export const { createPool, createConnection } = mod;
