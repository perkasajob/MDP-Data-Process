
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('net') || {};
export default mod;
export const { connect, Socket, createServer } = mod;
