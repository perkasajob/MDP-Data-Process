
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('mysql2/promise') || {};
export default mod;
export const { createConnection, createPool } = mod;
