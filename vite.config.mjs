import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import electron from 'vite-plugin-electron/simple'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue({
            template: { transformAssetUrls }
        }),
        quasar({
            // sassVariables: 'src/quasar-variables.sass'
        }),
        electron({
            main: {
                entry: 'main.js',
            },
            preload: {
                input: 'preload.js',
            },
            // optional: use this to load renderer.js if needed
            // renderer: {},
        }),
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true, // Enable sourcemaps for debugging
    },
    base: './'
})
