const fs = require('fs');
const path = require('path');

const createShim = (modName, exportsList) => {
    // Check if window is defined (browser), else use global/native require if possible or mock
    // In build (Node), window is undefined. But this code runs in BROWSER.
    // However, Vite parsing might choke on window if it tries to optimize? No.
    // use generic check?
    // "const r = typeof window !== 'undefined' ? window.require : typeof require !== 'undefined' ? require : null;"

    // Simplest for Electron Renderer:
    let content = `
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('${modName}') || {};
export default mod;
`;
    if (exportsList && exportsList.length) {
        content += `export const { ${exportsList.join(', ')} } = mod;\n`;
    }
    return content;
};

const shims = {
    'fs': ['readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync', 'createReadStream', 'createWriteStream', 'unlink', 'unlinkSync', 'stat', 'statSync', 'readFile', 'writeFile', 'readdir', 'readdirSync'],
    'path': ['join', 'resolve', 'basename', 'dirname', 'extname', 'parse', 'format', 'sep', 'delimiter'],
    'child_process': ['exec', 'spawn', 'execSync'],
    'crypto': ['createHash', 'randomBytes'],
    'os': ['platform', 'homedir', 'tmpdir', 'type', 'arch', 'release'],
    'util': ['promisify', 'inspect'],
    'events': ['EventEmitter'],
    'stream': ['Readable', 'Writable', 'Transform', 'PassThrough'],
    'net': ['connect', 'Socket', 'createServer'],
    'tls': ['connect', 'createServer'],
    'mysql2': ['createPool', 'createConnection'],
    'js-yaml': ['load', 'dump'],
    'basic-ftp': ['Client'],
    'csv-parse': ['parse'],
    'xlsx': ['readFile', 'utils', 'writeFile'],
    'dbffile': ['DBFFile']
};

Object.entries(shims).forEach(([mod, exports]) => {
    fs.writeFileSync(path.join('src', 'shims', `${mod}.js`), createShim(mod, exports));
});

fs.writeFileSync(path.join('src', 'shims', 'mysql2-promise.js'),
    `
const r = (typeof window !== 'undefined' && window.require) || (typeof require !== 'undefined' ? require : () => {});
const mod = r('mysql2/promise') || {};
export default mod;
export const { createConnection, createPool } = mod;
`);
