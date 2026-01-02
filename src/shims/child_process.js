
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('child_process') || {};
export default mod;
export const { exec, spawn, execSync } = mod;
