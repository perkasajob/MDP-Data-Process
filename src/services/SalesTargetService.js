import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getDbConnection } from './DbService';
import logger from './LoggerService';

const fs = window.require('fs');
const xlsx = window.require('xlsx');

dayjs.extend(customParseFormat);

export async function updateSalesTargets(filePath, dateStr) {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error("File path is invalid or file does not exist.");
    }

    const connection = getDbConnection();
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

    // Convert to JSON with array of arrays to handle indices easily
    // range: 5 means start from row 6 (0-indexed 5)
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 5 });

    logger.info(`Processing sales targets from ${filePath} for ${tahun}-${bulan}. Found ${rows.length} rows.`);

    let updatedCount = 0;

    // Helper to get safe numeric value
    const getNum = (val) => {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        return isNaN(num) ? 0 : num;
    };

    for (const row of rows) {
        // row is an array of values. 
        // Col A=0, B=1, C=2, D=3, E=4, F=5, G=6
        // row is 0-indexed based on the range we selected. 
        // If range=19 (row 20), then row[0] is Column A of row 20.
        // We want Column D (index 3), E (4), F (5), G (6)
        const key = row[3]; // Column D

        if (!key) continue; // Skip if key is empty

        const target = getNum(row[4]);  // Column E
        const target1 = getNum(row[5]); // Column F
        const target2 = getNum(row[6]); // Column G

        // Update Query
        // Using LIKE %key% for nama_pejabat
        // We match any record where nama_pejabat contains the key name
        const sql = `
            UPDATE pejabat_divisi_lama 
            SET sales_target = ?, sales_target1 = ?, sales_target2 = ? 
            WHERE tahun = ? AND bulan = ? AND nama_pejabat LIKE ?
        `;

        const [result] = await connection.execute(sql, [
            target, target1, target2,
            tahun, bulan, `%${key.trim()}%`
        ]);

        if (result.affectedRows > 0) {
            updatedCount += result.affectedRows;
        }
    }

    logger.info(`Updated sales targets.Total affected rows: ${updatedCount} `);
    processSalesTargets(connection, tahun, bulan)
    return updatedCount;
}


async function processSalesTargets(connection, year, month) {
    if (!year || !month) {
        console.error("Error: Year and Month are required.");
        return;
    }

    console.log(`\n--- Starting Calculation for ${year}-${month} ---`);

    try {
        // 1. Fetch Data for this specific period
        // We get every employee active in this period and their manager (if any)
        console.log("1. Fetching data...");

        const [rows] = await connection.execute(`
            SELECT 
                p.pejid, 
                p.sales_target, 
                p.sales_target1, 
                p.sales_target2,
                mc.cheker AS manager_id
            FROM pejabat_divisi_lama p
            LEFT JOIN old_maker_cheker mc 
                ON p.pejid = mc.maker 
                AND p.tahun = mc.thn 
                AND p.bulan = mc.bln
            WHERE p.tahun = ? AND p.bulan = ?
        `, [year, month]);

        if (rows.length === 0) {
            console.log("   No data found for this period.");
            return;
        }
        console.log(`   Fetched ${rows.length} employees.`);

        // 2. Build In-Memory Graph
        // Since we filtered by Year/Month, ID is unique enough for the key
        const employees = new Map();
        const hierarchy = new Map(); // manager_id -> [child_ids]

        rows.forEach(row => {
            // Create employee object
            const empData = {
                id: row.pejid,
                // Ensure values are numbers for calculation
                t1: parseFloat(row.sales_target) || 0,
                t2: parseFloat(row.sales_target1) || 0,
                t3: parseFloat(row.sales_target2) || 0,
                isManager: false // Flag to track if we need to update this person
            };
            employees.set(row.pejid, empData);

            // Build hierarchy links
            if (row.manager_id) {
                if (!hierarchy.has(row.manager_id)) {
                    hierarchy.set(row.manager_id, []);
                }
                hierarchy.get(row.manager_id).push(row.pejid);
            }
        });

        // 3. Recursive Calculation (Post-Order Traversal)
        const visited = new Set();
        const updates = [];

        function getRecursiveTotals(empId) {
            if (visited.has(empId)) {
                // Return cached values if already processed
                // (Handles duplicate links safely, though hierarchy should be a tree)
                return employees.get(empId) || { t1: 0, t2: 0, t3: 0 };
            }

            const emp = employees.get(empId);

            // Safety: If manager exists in hierarchy but not in 'pejabat' table
            if (!emp) return { t1: 0, t2: 0, t3: 0 };

            const childrenIds = hierarchy.get(empId);

            // --- BASE CASE: LEAF NODE (The Bottom) ---
            // If no children, return the manually entered target
            if (!childrenIds || childrenIds.length === 0) {
                visited.add(empId);
                return { t1: emp.t1, t2: emp.t2, t3: emp.t3 };
            }

            // --- RECURSIVE STEP: MANAGER ---
            let sumT1 = 0, sumT2 = 0, sumT3 = 0;

            for (const childId of childrenIds) {
                const childTotals = getRecursiveTotals(childId);
                sumT1 += childTotals.t1;
                sumT2 += childTotals.t2;
                sumT3 += childTotals.t3;
            }

            // Update the manager's totals with the sum of children
            emp.t1 = sumT1;
            emp.t2 = sumT2;
            emp.t3 = sumT3;
            emp.isManager = true; // Mark as modified so we save it later

            updates.push(emp); // Add to save queue
            visited.add(empId);

            return { t1: sumT1, t2: sumT2, t3: sumT3 };
        }

        console.log("2. Calculating hierarchy sums...");

        // Run recursion on every employee to ensure disconnected trees are processed
        // (The visited set ensures we don't double-process)
        for (const [id] of employees) {
            getRecursiveTotals(id);
        }

        // 4. Batch Update to MySQL
        if (updates.length > 0) {
            console.log(`3. updating ${updates.length} managers...`);

            // Process in chunks to respect MySQL packet limits
            const CHUNK_SIZE = 2000;

            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);

                // Map data to array of arrays: [pejid, tahun, bulan, t1, t2, t3]
                const values = chunk.map(u => [u.id, year, month, u.t1, u.t2, u.t3]);

                const sql = `
                    INSERT INTO pejabat_divisi_lama 
                        (pejid, tahun, bulan, sales_target, sales_target1, sales_target2) 
                    VALUES ? 
                    ON DUPLICATE KEY UPDATE 
                        sales_target = VALUES(sales_target),
                        sales_target1 = VALUES(sales_target1),
                        sales_target2 = VALUES(sales_target2)
                `;

                await connection.query(sql, [values]);
            }
            console.log("   Success!");
        } else {
            console.log("   No hierarchy updates needed (everyone is a leaf node?).");
        }

    } catch (error) {
        console.error("FATAL ERROR:", error);
    }
}