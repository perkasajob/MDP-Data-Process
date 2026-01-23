import { getDbConnection } from './DbService';
const fs = window.require('fs');
const path = window.require('path');
import { HOME_DIR } from '../const';
import dayjs from 'dayjs';

export async function exportMarketingStructure(year, month) {
    const pool = getDbConnection();

    const rows = await pool.query(
        'SELECT * FROM sales.mkt_structure WHERE GSM IS NOT NULL AND tahun = ? AND bulan = ?',
        [year, month]
    );
    const data = rows[0]; // execute returns [rows, fields]

    if (data.length === 0) {
        throw new Error('No data found for export.');
    }

    // Determine dynamic headers
    const currentMonthDate = dayjs(`${year}-${month}-01`);
    const m1 = currentMonthDate.format('M-YYYY');
    const m2 = currentMonthDate.add(1, 'month').format('M-YYYY');
    const m3 = currentMonthDate.add(2, 'month').format('M-YYYY');

    // Filter out unneeded columns if necessary, or map specific ones.
    // The request implies renaming specific columns:
    // sales_target -> Sales Target (M-YYYY)
    // sales_target1 -> Sales Target (M+1-YYYY)
    // sales_target2 -> Sales Target (M+2-YYYY)
    // Keep other columns as is? Or mapped?
    // Usually "export" implies dumping the table.

    // Get columns from first row, excluding 'tahun' and 'bulan'
    const keys = Object.keys(data[0]).filter(k => k !== 'tahun' && k !== 'bulan');

    // Create header mapping
    const headerMap = {
        'sales_target': `Sales Target (${m1})`,
        'sales_target1': `Sales Target (${m2})`,
        'sales_target2': `Sales Target (${m3})`
    };

    const headerRow = keys.map(k => headerMap[k] || k).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');

    const csvRows = data.map(row => {
        return keys.map(k => {
            let val = row[k];
            if (val === null || val === undefined) val = '';
            // Format dates if any? 
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',');
    });

    const csvContent = [headerRow, ...csvRows].join('\n');

    const fileName = `marketing structure ${month}-${year}.csv`;
    // Ensure report directory exists
    const reportDir = path.join(HOME_DIR, 'report');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const filePath = path.join(reportDir, fileName);
    fs.writeFileSync(filePath, csvContent);

    // Open file
    const { shell } = window.require('electron');
    shell.openPath(filePath);

    return filePath;
}


export async function getMarketingStructure(year, month, filters = {}) {
    const pool = getDbConnection();
    // pj.pejid, pj.nama_pejabat, j.kode, pj.comid, cm.checker, checker_name (nama_pejabat)
    let sql = `
        SELECT 
            pj.pejid,
            pj.nama_pejabat,
            j.kode,
            pj.comid,
            j.jabid,
            driver.checker_id as checker,
            pj_checker.nama_pejabat AS checker_name,
            sp.chatid
        FROM (            
            SELECT 
                p.pejid,
                p.tahun,
                p.bulan,
                MAX(cm.cheker) as checker_id
            FROM pj_tst_pejabat_divisi_lama p
            LEFT JOIN pj_tst_old_maker_cheker cm 
                ON p.pejid = cm.maker 
                AND p.tahun = cm.thn 
                AND p.bulan = cm.bln
            WHERE p.tahun = ? 
            AND p.bulan = ?
            AND p.is_active = 1
            GROUP BY p.pejid, p.tahun, p.bulan
        ) driver
        JOIN pj_tst_pejabat_divisi_lama pj 
            ON driver.pejid = pj.pejid 
            AND driver.tahun = pj.tahun 
            AND driver.bulan = pj.bulan
        LEFT JOIN jabatan j 
            ON pj.jabid = j.jabid
        LEFT JOIN pj_tst_pejabat_divisi_lama pj_checker 
            ON driver.checker_id = pj_checker.pejid AND driver.tahun = pj_checker.tahun AND driver.bulan = pj_checker.bulan
        LEFT JOIN pj_sales_person sp
            ON pj.pejid = sp.pejid    
        WHERE 1=1
    `;

    const params = [year, month];

    if (filters.nama_pejabat) {
        sql += ` AND pj.nama_pejabat LIKE ?`;
        params.push(`%${filters.nama_pejabat}%`);
    }

    if (filters.checker_name) {
        sql += ` AND pj_checker.nama_pejabat LIKE ?`;
        params.push(`%${filters.checker_name}%`);
    }

    sql += ` ORDER BY pj.comid ASC, pj.nama_pejabat ASC`;

    const [rows] = await pool.query(sql, params);
    return rows;
}

export async function deleteMarketingStructure(pejid, year, month) {
    const pool = getDbConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Delete from pj_tst_old_maker_cheker
        await connection.query(
            'DELETE FROM pj_tst_old_maker_cheker WHERE maker = ? AND thn = ? AND bln = ?',
            [pejid, year, month]
        );

        // Delete from pj_tst_pejabat_divisi_lama
        await connection.query(
            'DELETE FROM pj_tst_pejabat_divisi_lama WHERE pejid = ? AND tahun = ? AND bulan = ?',
            [pejid, year, month]
        );

        await connection.commit();
        logger.info('DELETE marketing structure row', { pejid, year, month });
        return true;
    } catch (error) {
        await connection.rollback();
        logger.error('Error deleting marketing structure row', error);
        throw error;
    } finally {
        connection.release();
    }
}

export async function getJabatanOptions() {
    const pool = getDbConnection();
    const [rows] = await pool.query('SELECT jabid, kode, namajabatan FROM jabatan ORDER BY kode');
    return rows;
}

// Get potential checkers (other pejabats). 
// Passing year/month to filter current active ones might be good, 
// but usually we want to search all or valid ones. 
// For now let's just search by name or return all if small.
export async function searchPejabat(query, year, month) {
    const pool = getDbConnection();
    if (!query) return [];
    // Simple search
    const sql = `SELECT pejid, nama_pejabat FROM pj_tst_pejabat_divisi_lama p WHERE nama_pejabat LIKE ? and p.tahun = ? AND p.bulan = ? LIMIT 20`;
    const [rows] = await pool.query(sql, [`%${query}%`, year, month]);
    return rows;
}

export async function getNewPejId() {
    const pool = getDbConnection();
    const [rows] = await pool.query('SELECT MAX(pejid) as maxid FROM pj_tst_pejabat_divisi_lama');
    const max = rows[0].maxid || 0;
    return max + 1;
}

export async function saveMarketingRow(row, year, month) {
    const pool = getDbConnection();

    // Resolve jabid from kode if necessary
    let jabid = row.jabid;
    if (!jabid && row.kode) {
        const [jabs] = await pool.query('SELECT jabid FROM jabatan WHERE kode = ?', [row.kode]);
        if (jabs.length > 0) jabid = jabs[0].jabid;
    }

    // Check if record exists in pj_tst_pejabat_divisi_lama FOR THIS YEAR/MONTH (snapshot)
    // and assuming if we are editing a "current view", we are editing that specific snapshot.
    // However, usually officials have IDs that persist. 
    // If the record exists for that month/year, we update. If not, maybe we insert?
    // But typically getNewPejId gets a global ID. 
    // If we are "inserting new record", we insert into that year/month.

    // Let's check existence by pejid AND year AND month
    const [existing] = await pool.query(
        'SELECT * FROM pj_tst_pejabat_divisi_lama WHERE pejid = ? AND tahun = ? AND bulan = ?',
        [row.pejid, year, month]
    );

    const dataToSave = { ...row, jabid, tahun: year, bulan: month };

    if (existing.length > 0) {
        const oldData = existing[0];
        // Update
        await pool.query(
            'UPDATE pj_tst_pejabat_divisi_lama SET nama_pejabat=?, comid=?, jabid=? WHERE pejid=? AND tahun=? AND bulan=?',
            [row.nama_pejabat, row.comid, jabid, row.pejid, year, month]
        );
        // Log update
        logger.info('UPDATE pj_tst_pejabat_divisi_lama', { refId: row.pejid, action: 'UPDATE', old: oldData, new: dataToSave });
    } else {
        // Insert
        await pool.query(
            'INSERT INTO pj_tst_pejabat_divisi_lama (pejid, nama_pejabat, comid, jabid, tahun, bulan, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [row.pejid, row.nama_pejabat, row.comid, jabid, year, month]
        );
        // Log insert
        logger.info('INSERT pj_tst_pejabat_divisi_lama', { refId: row.pejid, action: 'INSERT', new: dataToSave });
    }

    // Handle pj_tst_old_maker_cheker (Checker)
    // maker = pejid
    if (row.checker) {
        const [cmList] = await pool.query(
            'SELECT * FROM pj_tst_old_maker_cheker WHERE maker=? AND thn=? AND bln=?',
            [row.pejid, year, month]
        );

        if (cmList.length > 0) {
            await pool.query(
                'UPDATE pj_tst_old_maker_cheker SET cheker=? WHERE maker=? AND thn=? AND bln=?',
                [row.checker, row.pejid, year, month]
            );
        } else {
            await pool.query(
                'INSERT INTO pj_tst_old_maker_cheker (maker, thn, bln, cheker) VALUES (?, ?, ?, ?)',
                [row.pejid, year, month, row.checker]
            );
        }
    } else {
        // If checker cleared, maybe delete? 
        // For now leaving as is or strictly following "save what is there"
    }

    return true;
}

export async function copyPreviousMonthData(targetYear, targetMonth) {
    const pool = getDbConnection();
    let prevMonth = targetMonth - 1;
    let prevYear = targetYear;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = targetYear - 1;
    }

    // Copy pj_tst_pejabat_divisi_lama
    await pool.query(`
        INSERT INTO pj_tst_pejabat_divisi_lama (pejid, nama_pejabat, comid, jabid, tahun, bulan, is_active)
        SELECT pejid, nama_pejabat, comid, jabid, ? as tahun, ? as bulan, 1
        FROM pj_tst_pejabat_divisi_lama
        WHERE tahun = ? AND bulan = ? AND is_active = 1
    `, [targetYear, targetMonth, prevYear, prevMonth]);

    // Update prevname
    await pool.query(`        
        UPDATE pj_tst_pejabat_divisi_lama
        SET prevname = nama_pejabat
        WHERE tahun = ? AND bulan = ? AND is_active = 1;
    `, [targetYear, targetMonth]);

    // Copy pj_tst_old_maker_cheker
    await pool.query(`
        INSERT INTO pj_tst_old_maker_cheker (maker, thn, bln, cheker)
        SELECT maker, ? as thn, ? as bln, cheker
        FROM pj_tst_old_maker_cheker mk
        LEFT JOIN pj_tst_pejabat_divisi_lama pj_checker 
            ON mk.maker = pj_checker.pejid AND  mk.thn = pj_checker.tahun AND mk.bln = pj_checker.bulan
        WHERE mk.thn = ? AND mk.bln = ? AND pj_checker.is_active = 1
    `, [targetYear, targetMonth, prevYear, prevMonth]);

    // Optionally log this mass action?
    logger.info('COPY_MONTH pj_tst_pejabat_divisi_lama', { action: 'COPY_MONTH', from: `${prevYear}-${prevMonth}`, to: `${targetYear}-${targetMonth}` });

    return true;
}


