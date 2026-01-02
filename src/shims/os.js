
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('os') || {};
export default mod;
export const { platform, homedir, tmpdir, type, arch, release } = mod;
