
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('fs') || {};
export default mod;
export const { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream, createWriteStream, unlink, unlinkSync, stat, statSync, readFile, writeFile, readdir, readdirSync } = mod;
