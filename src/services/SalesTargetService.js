import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getDbConnection } from './DbService';
import logger from './LoggerService';
import { getNum } from '../utils/NumberHelper';

const fs = window.require('fs');
const xlsx = window.require('xlsx');

dayjs.extend(customParseFormat);

async function ensureTableSetup(connection) {
    try {
        // First, ensure the table exists (though it likely does if user sees duplicates)
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS pj_sales_target (
                pejid INT NOT NULL,
                tahun INT NOT NULL,
                bulan INT NOT NULL,
                target DOUBLE DEFAULT 0,
                PRIMARY KEY (pejid, tahun, bulan)
            )
        `);

        // If it already existed but without PK/Unique, try to add it.
        // We catch errors because it might already have the index or fail due to duplicates.
        try {
            await connection.execute(`
                ALTER TABLE pj_sales_target ADD UNIQUE INDEX unq_pej_target (pejid, tahun, bulan)
            `);
        } catch (e) {
            // Index might already exist or table has duplicates preventing index creation
            if (e.message.indexOf('Duplicate entry') !== -1) {
                logger.warn('Duplicate entries found in pj_sales_target. Attempting cleanup...');
                // Cleanup: keep the one with the highest target? or just any one.
                // Standard MySQL trick to delete duplicates:
                await connection.execute(`
                    CREATE TABLE pj_sales_target_temp AS 
                    SELECT pejid, tahun, bulan, MAX(target) as target 
                    FROM pj_sales_target 
                    GROUP BY pejid, tahun, bulan
                `);
                await connection.execute('DROP TABLE pj_sales_target');
                await connection.execute('RENAME TABLE pj_sales_target_temp TO pj_sales_target');
                await connection.execute('ALTER TABLE pj_sales_target ADD PRIMARY KEY (pejid, tahun, bulan)');
            }
        }
    } catch (error) {
        logger.error('Error ensuring pj_sales_target table setup:', error);
    }
}

export async function updateSalesTargets(filePath, dateStr) {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error("File path is invalid or file does not exist.");
    }

    const connection = getDbConnection();
    // await ensureTableSetup(connection);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // dateStr is expected to be 'YYYY-MM-DD' or similar compatible with dayjs
    const dateObj = dayjs(dateStr);
    if (!dateObj.isValid()) {
        throw new Error("Invalid date provided.");
    }
    const tahun = dateObj.year();
    const bulan = dateObj.month() + 1; // dayjs month is 0-indexed

    // Define months for target, target1, target2
    const targetMonths = [
        dateObj,
        dateObj.add(1, 'month'),
        dateObj.add(2, 'month')
    ];

    // Convert to JSON with array of arrays to handle indices easily
    // range: 5 means start from row 6 (0-indexed 5)
    // Looking at the original code, it seems the headers are at Row 6 (range: 5)
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 5 });

    logger.info(`Processing sales targets from ${filePath} for ${tahun}-${bulan}. Found ${rows.length} rows.`);

    // Pre-load PEJIDs from name to handle rows without PEJID
    const [pejabatRows] = await connection.execute(
        'SELECT pejid, nama_pejabat FROM pejabat_divisi_lama WHERE tahun = ? AND bulan = ?',
        [tahun, bulan]
    );
    const nameToIdMap = {};
    pejabatRows.forEach(p => {
        const cleanName = p.nama_pejabat.replace(/\s/g, "").toLowerCase();
        nameToIdMap[cleanName] = p.pejid;
    });

    // Use a map to deduplicate Step 1 entries: pejid|year|month -> target
    const targetMap = new Map();

    for (const row of rows) {
        // Col D (index 3) = Key (Name)
        // Col E (index 4) = PEJID (usually for DM/SM)
        // Col F (index 5) = Target (M)
        // Col G (index 6) = Target 1 (M+1)
        // Col H (index 7) = Target 2 (M+2)

        const name = row[3];
        if (!name) continue;

        let pejid = getNum(row[4]);
        // If pejid is 0 (or large number like target mistakenly put in E), try lookup by name
        if (!pejid || pejid === 0 || pejid > 100000) {
            const cleanKey = String(name).replace(/\s/g, "").toLowerCase();
            pejid = nameToIdMap[cleanKey];
        }

        if (!pejid) {
            // Last resort: try LIKE matching if exact match failed
            const [match] = await connection.execute(
                'SELECT pejid FROM pejabat_divisi_lama WHERE tahun = ? AND bulan = ? AND nama_pejabat LIKE ? LIMIT 1',
                [tahun, bulan, `%${String(name).trim()}%`]
            );
            if (match.length > 0) {
                pejid = match[0].pejid;
            }
        }

        if (!pejid) {
            logger.warn(`Could not find PEJID for official: ${name}`);
            continue;
        }

        // Add 3 months of targets to the map
        for (let i = 0; i < 3; i++) {
            const val = getNum(row[5 + i]);
            const d = targetMonths[i];
            const key = `${pejid}|${d.year()}|${d.month() + 1}`;
            targetMap.set(key, val);
        }
    }

    if (targetMap.size > 0) {
        const updatedRows = Array.from(targetMap.entries()).map(([key, target]) => {
            const [pId, yr, mo] = key.split('|').map(Number);
            return [pId, yr, mo, target];
        });

        const sql = `
            INSERT INTO pj_sales_target (pejid, tahun, bulan, target)
            VALUES ?
            ON DUPLICATE KEY UPDATE target = VALUES(target)
        `;
        const CHUNK_SIZE = 500;
        for (let i = 0; i < updatedRows.length; i += CHUNK_SIZE) {
            await connection.query(sql, [updatedRows.slice(i, i + CHUNK_SIZE)]);
        }
    }

    logger.info(`Updated pj_sales_target. Total unique entries from Step 1: ${targetMap.size}`);

    // Step 2: Perform hierarchy calculation for each of the 3 months
    // This sums up MR targets into DM/SM targets
    for (const d of targetMonths) {
        await processSalesTargets(connection, d.year(), d.month() + 1);
    }

    // Step 3: Explicitly update DM/SM sales targets from file where PEJID is provided in Col E
    // This overrides the calculated sums if specific targets were provided in the Excel for DM/SM
    const dmsmMap = new Map();
    for (const row of rows) {
        const pejid = getNum(row[4]); // Column E
        // Only consider it a manual DM/SM override if pejid is valid and small
        if (pejid > 0 && pejid < 100000) {
            for (let i = 0; i < 3; i++) {
                const val = getNum(row[5 + i]); // F, G, H
                const d = targetMonths[i];
                const key = `${pejid}|${d.year()}|${d.month() + 1}`;
                dmsmMap.set(key, val);
            }
        }
    }

    if (dmsmMap.size > 0) {
        const dmsmRows = Array.from(dmsmMap.entries()).map(([key, target]) => {
            const [pId, yr, mo] = key.split('|').map(Number);
            return [pId, yr, mo, target];
        });

        const sql = `
            INSERT INTO pj_sales_target (pejid, tahun, bulan, target)
            VALUES ?
            ON DUPLICATE KEY UPDATE target = VALUES(target)
        `;
        const CHUNK_SIZE = 500;
        for (let i = 0; i < dmsmRows.length; i += CHUNK_SIZE) {
            await connection.query(sql, [dmsmRows.slice(i, i + CHUNK_SIZE)]);
        }
        logger.info(`Applied DM/SM overrides from file for ${dmsmMap.size / 3} officials.`);
    }

    return (targetMap.size / 3) + (dmsmMap.size / 3);
}



async function processSalesTargets(connection, year, month) {
    if (!year || !month) {
        console.error("Error: Year and Month are required.");
        return;
    }

    logger.info(`Recalculating hierarchy targets for ${year}-${month}...`);

    try {
        // 1. Fetch Data
        // We need the hierarchy from old_maker_cheker and targets from pj_sales_target
        // We also join pejabat_divisi_lama to ensure we only process existing/active officials
        const [rows] = await connection.execute(`
            SELECT 
                p.pejid, 
                COALESCE(t.target, 0) as target,
                mc.cheker AS manager_id
            FROM pejabat_divisi_lama p
            LEFT JOIN pj_sales_target t
                ON p.pejid = t.pejid AND p.tahun = t.tahun AND p.bulan = t.bulan
            LEFT JOIN old_maker_cheker mc 
                ON p.pejid = mc.maker 
                AND p.tahun = mc.thn 
                AND p.bulan = mc.bln
            WHERE p.tahun = ? AND p.bulan = ?
        `, [year, month]);

        if (rows.length === 0) {
            return;
        }

        const employees = new Map();
        const hierarchy = new Map(); // manager_id -> [child_ids]

        rows.forEach(row => {
            employees.set(row.pejid, {
                id: row.pejid,
                target: parseFloat(row.target) || 0,
                isManager: false
            });

            if (row.manager_id) {
                if (!hierarchy.has(row.manager_id)) {
                    hierarchy.set(row.manager_id, []);
                }
                hierarchy.get(row.manager_id).push(row.pejid);
            }
        });

        const visited = new Set();
        const updates = [];

        function getRecursiveTotals(empId) {
            if (visited.has(empId)) {
                return employees.get(empId) || { target: 0 };
            }

            const emp = employees.get(empId);
            if (!emp) return { target: 0 };

            const childrenIds = hierarchy.get(empId);

            // BASE CASE: LEAF NODE
            if (!childrenIds || childrenIds.length === 0) {
                visited.add(empId);
                return { target: emp.target };
            }

            // RECURSIVE STEP: MANAGER
            let sumTarget = 0;
            for (const childId of childrenIds) {
                const childTotals = getRecursiveTotals(childId);
                sumTarget += childTotals.target;
            }

            // Update the manager's totals with the sum of children
            emp.target = sumTarget;
            emp.isManager = true;
            updates.push(emp);
            visited.add(empId);

            return { target: sumTarget };
        }

        for (const [id] of employees) {
            getRecursiveTotals(id);
        }

        if (updates.length > 0) {
            const values = updates.map(u => [u.id, year, month, u.target]);
            const sql = `
                INSERT INTO pj_sales_target (pejid, tahun, bulan, target) 
                VALUES ? 
                ON DUPLICATE KEY UPDATE target = VALUES(target)
            `;
            await connection.query(sql, [values]);
        }

    } catch (error) {
        logger.error(`Error in processSalesTargets for ${year}-${month}:`, error);
    }
}



