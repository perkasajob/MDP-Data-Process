const { parse } = require('csv-parse');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
const yaml = require('js-yaml');
const fs = require('fs');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const { DBFFile } = require('dbffile');
const { exec } = require('child_process');
const Client = require('basic-ftp').Client;
const path = require('node:path');
const { city_abbr, outlet_type, HOME_DIR } = require('./const');


const os = require('os');

const DOCUMENTS_PATH = HOME_DIR;

// Create the directory if it doesn't exist
if (!fs.existsSync(DOCUMENTS_PATH)) {
    try {
        fs.mkdirSync(DOCUMENTS_PATH, { recursive: true });
    } catch (e) {
        console.error('Could not create MDP Sales folder in Documents:', e);
    }
}

let configPath = path.join(DOCUMENTS_PATH, 'config.yaml');

// If not in Documents, check AppData
if (!fs.existsSync(configPath)) {
    if (process.env.APPDATA) {
        const appDataConfig = path.join(process.env.APPDATA, 'MDP', 'config.yaml');
        if (fs.existsSync(appDataConfig)) {
            configPath = appDataConfig;
        }
    }
}

// If not in Documents or AppData, check current directory (dev) or resources (prod)
if (!fs.existsSync(configPath)) {
    if (fs.existsSync('./config.yaml')) {
        // Development mode
        configPath = './config.yaml';
    } else {
        // Production mode - check resources
        const resourcesPath = process.resourcesPath || path.join(path.dirname(process.execPath), 'resources');
        const resourceConfig = path.join(resourcesPath, 'config.yaml');
        if (fs.existsSync(resourceConfig)) {
            configPath = resourceConfig;
            // Optional: Copy to Documents so user can see/edit it? 
            // For now, just use it.
        }
    }
}

const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

const connection = mysql.createPool(config.connectionstr); //process.env.MDP_MYSQL_STR
// Show the selected section
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
}
