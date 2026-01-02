import { HOME_DIR } from '../const';

const yaml = window.require('js-yaml');
const fs = window.require('fs');
const path = window.require('path');

let config = null;

export function loadConfig() {
    if (config) return config;
    try {
        // Look for config.yaml in HOME_DIR
        const configPath = path.join(HOME_DIR, 'config.yaml');

        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found at ${configPath}`);
        }

        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = yaml.load(fileContents);
        return config;
    } catch (e) {
        console.error('Error loading config:', e);
        throw e;
    }
}

export function getConfig() {
    if (!config) return loadConfig();
    return config;
}
