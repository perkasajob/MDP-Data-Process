try {
    const renderer = require('vite-plugin-electron-renderer');
    console.log('Renderer loaded:', renderer);
} catch (e) {
    console.error('Renderer failed:', e.message);
}

try {
    const quasar = require('@quasar/vite-plugin');
    console.log('Quasar loaded:', quasar);
} catch (e) {
    console.error('Quasar failed:', e.message);
    console.log('Trying default import...');
    try {
        const qDefault = require('@quasar/vite-plugin').default;
        console.log('Quasar default:', qDefault);
    } catch (e2) {
        console.error('Quasar default failed:', e2.message);
    }
}
