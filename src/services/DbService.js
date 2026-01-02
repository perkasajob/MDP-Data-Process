import { getConfig } from './ConfigService';

const mysql = window.require('mysql2/promise');

let pool = null;

export function getDbConnection() {
    if (pool) return pool;
    const config = getConfig();
    if (!config.connectionstr) {
        throw new Error('Database connection string not found in config');
    }
    pool = mysql.createPool(config.connectionstr);
    return pool;
}
