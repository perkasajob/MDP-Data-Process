import { getDbConnection } from './DbService';
import { getConfig } from './ConfigService';
import { HOME_DIR, outlet_type } from '../const';

const MEILI_HOST = 'http://127.0.0.1:7700';
const MEILI_INDEX = 'pj_outlets';

export async function getUnmappedOutlets() {
    const connection = getDbConnection();
    const [rows] = await connection.execute(`
        SELECT p.*, m.MR as mr_name
        FROM pj_outlets p
        LEFT JOIN pj_mkt_structure m ON p.mrid = m.MRID
        WHERE p.outid IS NULL OR p.outid = "" or p.outid=0 or p.mrid=0 or p.comid IS NULL
    `);
    return rows;
}

export async function saveOutletMappings(mappings) {
    // mappings is an array of { index, originalRow, newData } or similar
    // Actually we should just pass the modified outlet objects

    const connection = getDbConnection();
    for (const mapping of mappings) {
        await connection.execute(
            `UPDATE pj_outlets
            SET comid=?, outid=?, mrid=?
            WHERE kode_outlet=?`,
            [
                mapping.comid,
                mapping.outid,
                mapping.mrid,
                mapping.kode_outlet
            ]
        );
    }
}

export async function searchMeilisearch(query) {
    try {
        const searchRes = await fetch(`${MEILI_HOST}/indexes/${MEILI_INDEX}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: query,
                limit: 50,
                attributesToHighlight: ['outlet', 'alamat'],
            })
        });

        if (!searchRes.ok) {
            if (searchRes.status === 404) return { error: 'Index not found' };
            throw new Error(searchRes.statusText);
        }
        return await searchRes.json();
    } catch (e) {
        return { error: e.message };
    }
}

export async function searchFuseJs(query, distributor) {
    try {
        const Fuse = window.require('fuse.js');
        const connection = getDbConnection();

        // Extract area suffix, e.g., 'APL-PTK' -> 'PTK'
        // If no hyphen, maybe use the whole string or default? 
        // User said: "omit the first 4 prefix letters" (e.g. APL-). 
        // Let's safe guard:
        let areaSuffix = '';
        if (distributor && distributor.includes('-')) {
            areaSuffix = distributor.split('-')[1];
        } else if (distributor && distributor.length > 4) {
            areaSuffix = distributor.substring(4);
        }

        if (!areaSuffix) {
            return { error: 'Could not extract area code from distributor' };
        }

        // Fetch candidates
        const sql = `
            SELECT p.*, m.MR as mr_name
            FROM pj_outlets p
            LEFT JOIN pj_mkt_structure m ON p.mrid = m.MRID
            WHERE p.distributor LIKE ? AND p.outid IS NOT NULL AND p.outid != ""
        `;
        const [rows] = await connection.execute(sql, [`%${areaSuffix}`]);

        if (rows.length === 0) {
            return { hits: [] };
        }

        // Initialize Fuse
        const options = {
            includeScore: true,
            keys: ['outlet', 'alamat'],
            threshold: 0.42 // Adjust as needed
        };
        const fuse = new Fuse(rows, options);

        // Search
        const result = fuse.search(query);

        // Transform to match Meilisearch struct for UI
        const hits = result.map(r => ({
            ...r.item,
            _formatted: {
                outlet: r.item.outlet, // No highlighting for now or maybe implement manual highlighting
                alamat: r.item.alamat
            }
        }));

        return { hits };

    } catch (e) {
        console.error(e);
        return { error: e.message };
    }
}

export async function searchSql(criteria) {
    const connection = getDbConnection();
    try {
        let sql = `
            SELECT p.*, m.MR as mr_name
            FROM pj_outlets p
            LEFT JOIN pj_mkt_structure m ON p.mrid = m.MRID
            WHERE p.outid IS NOT NULL AND p.outid != ""
        `;
        const params = [];

        if (criteria.outlet) {
            sql += ' AND p.outlet LIKE ?';
            params.push(`%${criteria.outlet}%`);
        }
        if (criteria.alamat) {
            sql += ' AND p.alamat LIKE ?';
            params.push(`%${criteria.alamat}%`);
        }
        if (criteria.kota) {
            sql += ' AND p.kota LIKE ?';
            params.push(`%${criteria.kota}%`);
        }
        if (criteria.comid) {
            sql += ' AND p.comid = ?';
            params.push(criteria.comid);
        }

        console.log(sql, params);
        sql += ' LIMIT 50';

        const [rows] = await connection.execute(sql, params);

        const hits = rows.map(r => ({
            ...r,
            _formatted: {
                outlet: r.outlet,
                alamat: r.alamat
            }
        }));

        return { hits };
    } catch (e) {
        console.error(e);
        return { error: e.message };
    }
}

export async function syncToMeilisearch() {
    const connection = getDbConnection();
    const [rows] = await connection.execute(`
        SELECT p.*, m.MR as mr_name
        FROM pj_outlets p
        LEFT JOIN pj_mkt_structure m ON p.mrid = m.MRID
        WHERE p.outid IS NOT NULL AND p.outid != "" AND p.kode_outlet != ""
    `);

    if (rows.length === 0) throw new Error('No valid outlets found');

    const documents = rows
        .filter(r => r.kode_outlet && r.kode_outlet.trim() !== '')
        .map(r => {
            const safeId = r.kode_outlet.replace(/[^a-zA-Z0-9\-_]/g, '_');
            return {
                ...r,
                id: safeId,
                alamat: sanitizeAddress(r.alamat)
            };
        });

    if (documents.length === 0) throw new Error('No valid documents to sync');

    // Update settings
    await fetch(`${MEILI_HOST}/indexes/${MEILI_INDEX}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            searchableAttributes: ['outlet', 'alamat', 'kota'],
            filterableAttributes: ['distributor', 'outid'],
            sortableAttributes: ['outid']
        })
    });

    // Upload
    const response = await fetch(`${MEILI_HOST}/indexes/${MEILI_INDEX}/documents?primaryKey=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documents)
    });

    if (!response.ok) throw new Error(response.statusText);

    const task = await response.json();
    return task; // let caller handle waiting or we can implement wait here
}

function sanitizeAddress(address) {
    if (!address) return '';
    return address
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s(jalan|jl|jln|jendral|jend|no|nomor|blok|kav|rt|rw|kecamatan|kec|kelurahan|kel|kabupaten|kab|kota)\s/g, ' ')
        .replace(/^(jl|jln)/i, '')
        .trim();
}

export async function updateOutletsFromCsv(filePath) {
    const fs = window.require('fs');
    const { parse } = window.require('csv-parse/sync'); // Synchronous parsing for simplicity
    const connection = getDbConnection();

    const fileContent = fs.readFileSync(filePath);
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    // 1. Collect IDs to validate
    const comids = new Set();
    const outids = new Set();
    const mrids = new Set();

    for (const r of records) {
        if (r.comid) comids.add(r.comid);
        if (r.Outid) outids.add(r.Outid);
        if (r.MRID) mrids.add(r.MRID);
    }

    const invalidErrors = [];

    // 2. Validate against DB
    // Helper to check existence
    const checkExistence = async (field, values) => {
        if (values.size === 0) return;
        const arr = Array.from(values);
        // mysql2 'IN (?)' expands array
        const [rows] = await connection.query(`SELECT DISTINCT ${field} FROM pj_outlets WHERE ${field} IN (?)`, [arr]);
        const existing = new Set(rows.map(r => String(r[field])));
        const invalid = arr.filter(id => !existing.has(String(id)));
        if (invalid.length > 0) {
            invalidErrors.push(`Invalid ${field}: ${invalid.slice(0, 10).join(', ')}${invalid.length > 10 ? '...' : ''}`);
        }
    };

    await checkExistence('comid', comids);
    await checkExistence('outid', outids);
    await checkExistence('mrid', mrids);

    if (invalidErrors.length > 0) {
        throw new Error(invalidErrors.join('\n'));
    }

    // 3. Update if valid
    let updatedCount = 0;
    const sql = `UPDATE pj_outlets SET comid=?, outid=?, mrid=? WHERE kode_outlet=?`;

    for (const record of records) {
        const kode_outlet = record['Outlet Code'];
        const comid = record['comid'] || null;
        const outid = record['Outid'] || null;
        const mrid = record['MRID'] || null;

        if (kode_outlet && (comid || outid || mrid)) {
            await connection.execute(sql, [comid, outid, mrid, kode_outlet]);
            updatedCount++;
        }
    }
    return updatedCount;
}

export async function exportUnmappedOutletsToCsv(filePath) {
    const fs = window.require('fs');
    const { stringify } = window.require('csv-stringify/sync');
    const connection = getDbConnection();
    const [rows] = await connection.execute(`
        SELECT p.*, m.MR as mr_name
        FROM pj_outlets p
        LEFT JOIN pj_mkt_structure m ON p.mrid = m.MRID
        WHERE p.outid IS NULL OR p.outid = "" AND p.kode_outlet != ""
    `);

    const data = rows.map(o => ({
        'Outlet Code': o.kode_outlet,
        'Outlet Name': o.outlet,
        'Address': o.alamat,
        'City': o.kota,
        'Distributor': o.distributor,
        'comid': o.comid || '',
        'Outid': o.outid || '',
        'MRID': o.mrid || ''
    }));

    const csvContent = stringify(data, {
        header: true
    });

    fs.writeFileSync(filePath, csvContent);
}


export async function searchOutlets(filters, limit = 50, offset = 0) {
    const connection = getDbConnection();
    let sql = `
        SELECT p.*, m.MR as mr_name
        FROM pj_outlets p
        LEFT JOIN pj_mkt_structure m ON p.mrid = m.MRID
        WHERE 1=1
    `;
    const params = [];

    if (filters.outlet) {
        sql += ' AND p.outlet LIKE ?';
        params.push(`%${filters.outlet}%`);
    }
    if (filters.distributor) {
        sql += ' AND p.distributor LIKE ?';
        params.push(`%${filters.distributor}%`);
    }
    if (filters.kota) {
        sql += ' AND p.kota LIKE ?';
        params.push(`%${filters.kota}%`);
    }
    if (filters.kode_outlet) {
        sql += ' AND p.kode_outlet LIKE ?';
        params.push(`%${filters.kode_outlet}%`);
    }
    if (filters.alamat) {
        sql += ' AND p.alamat LIKE ?';
        params.push(`%${filters.alamat}%`);
    }
    if (filters.comid) {
        sql += ' AND p.comid LIKE ?';
        params.push(`%${filters.comid}%`);
    }
    if (filters.outid) {
        sql += ' AND p.outid LIKE ?';
        params.push(`%${filters.outid}%`);
    }
    if (filters.mr_name) {
        sql += ' AND m.MR LIKE ?';
        params.push(`%${filters.mr_name}%`);
    }

    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await connection.execute(sql, params);
    return rows;
}

export async function saveOutlet(outlet) {
    const connection = getDbConnection();
    // Check if exists
    const [existing] = await connection.execute('SELECT kode_outlet FROM pj_outlets WHERE kode_outlet = ?', [outlet.kode_outlet]);

    if (existing.length > 0) {
        // Update
        await connection.execute(`
            UPDATE pj_outlets 
            SET outlet=?, alamat=?, kota=?, distributor=?, comid=?, outid=?, mrid=?
            WHERE kode_outlet=?
        `, [
            outlet.outlet, outlet.alamat, outlet.kota, outlet.distributor,
            outlet.comid, outlet.outid, outlet.mrid, outlet.kode_outlet
        ]);
    } else {
        // Insert
        await connection.execute(`
            INSERT INTO pj_outlets (kode_outlet, outlet, alamat, kota, distributor, comid, outid, mrid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            outlet.kode_outlet, outlet.outlet, outlet.alamat, outlet.kota,
            outlet.distributor, outlet.comid, outlet.outid, outlet.mrid
        ]);
    }
}

export async function deleteOutlet(kode_outlet) {
    const connection = getDbConnection();
    await connection.execute('DELETE FROM pj_outlets WHERE kode_outlet = ?', [kode_outlet]);
}

export async function syncFromSalesDivisi2() {
    const connection = getDbConnection();
    const sql = `
        UPDATE pj_outlets o
        JOIN (
        -- Find the latest transaction date per outlet group
        SELECT 
            comid, 
            disid, 
            distributor, 
            MAX(tanggal_faktur) as max_tgl
        FROM salesdivisi2
        WHERE tahun >= YEAR(CURDATE()) - 1
        GROUP BY comid, disid, distributor
        ) latest ON o.disid = latest.disid 
            AND o.distributor = latest.distributor

        JOIN salesdivisi2 sd ON sd.disid = latest.disid 
            AND sd.distributor = latest.distributor
            AND sd.tanggal_faktur = latest.max_tgl
            AND sd.tahun >= YEAR(CURDATE()) - 1

        -- Validating against matching_outlet to ensure ID consistency
        JOIN matching_outlet m ON o.kode_outlet = m.kode 
            AND sd.outid = m.id 
            AND sd.comid = m.comid

        SET 
            o.comid = sd.comid,
            o.mrid = sd.mrid,
            o.outid = sd.outid
        WHERE 1=1
    `;
    const [result] = await connection.execute(sql);
    return result.affectedRows;
}
export async function updateOutletsFromSalesCsv() {
    const fs = window.require('fs');
    const path = window.require('path');
    const { parse } = window.require('csv-parse/sync');
    const config = getConfig();
    const connection = getDbConnection();

    const relativePath = config.apl?.sales_filename;
    if (!relativePath) throw new Error('config.apl.sales_filename not found in config.yaml');

    const filePath = path.join(HOME_DIR, relativePath);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    const fileContent = fs.readFileSync(filePath);
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    const updates = new Map();
    for (const r of records) {
        const rawCode = r['Customer - Sold To Customer Code'];
        if (!rawCode) continue;
        const kode_outlet = rawCode.replace(/^0+/, '');

        const key = `${kode_outlet}`;
        // Adapt sa_group mapping from processAPL logic
        const saGroupRaw = r['Customer SA Group'];
        const tipe_outlet = outlet_type[saGroupRaw] || saGroupRaw || '';

        updates.set(key, {
            kode_outlet,
            outlet: r['Sold To Customer Name'],
            alamat: r['Location - Sold To Customer Address 1'],
            kota: r['Sold To City']?.replace(/^kota\s*/i, ''),
            kode_pos: r['Location - Sold To Post Code'],
            distrik: r['Sold To District'],
            sa_group: r['Customer SA Group'],
            tipe_outlet
        });
    }
    console.log(updates.size);

    let updatedCount = 0;
    const sql = `
        UPDATE pj_outlets 
        SET outlet = ?, alamat = ?, kota = ?, kode_pos = ?, distrik = ?, tipe_outlet = ?, sa_group = ?
        WHERE kode_outlet = ? AND distributor LIKE "APL-%"
    `;

    for (const data of updates.values()) {
        const [result] = await connection.execute(sql, [
            data.outlet || null,
            data.alamat || null,
            data.kota || null,
            data.kode_pos || null,
            data.distrik || null,
            data.tipe_outlet || null,
            data.sa_group || null,
            data.kode_outlet,
        ]);
        if (result.affectedRows > 0) {
            updatedCount++;
        }
    }

    return updatedCount;
}
