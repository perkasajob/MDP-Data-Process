import { getDbConnection } from './DbService';
import logger from './LoggerService';

export async function getMarketingStructure(year, month) {
    const pool = getDbConnection();
    // pj.pejid, pj.nama_pejabat, j.kode, pj.comid, cm.checker, checker_name (nama_pejabat)
    const sql = `
        SELECT 
            pj.pejid,
            pj.nama_pejabat,
            j.kode,
            pj.comid,
            j.jabid,
            driver.checker_id as checker,
            pj_checker.nama_pejabat AS checker_name
        FROM (            
            SELECT 
                p.pejid,
                p.tahun,
                p.bulan,
                MAX(cm.cheker) as checker_id
            FROM pejabat_divisi_lama p
            LEFT JOIN old_maker_cheker cm 
                ON p.pejid = cm.maker 
                AND p.tahun = cm.thn 
                AND p.bulan = cm.bln
            WHERE p.tahun = ? 
            AND p.bulan = ?
            AND p.is_active = 1
            GROUP BY p.pejid, p.tahun, p.bulan
        ) driver
        JOIN pejabat_divisi_lama pj 
            ON driver.pejid = pj.pejid 
            AND driver.tahun = pj.tahun 
            AND driver.bulan = pj.bulan
        LEFT JOIN jabatan j 
            ON pj.jabid = j.jabid
        LEFT JOIN pejabat_divisi_lama pj_checker 
            ON driver.checker_id = pj_checker.pejid AND driver.tahun = pj_checker.tahun AND driver.bulan = pj_checker.bulan    
        ORDER BY 
            pj.comid ASC, 
            pj.nama_pejabat ASC
    `;
    const [rows] = await pool.query(sql, [year, month]);
    return rows;
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
    const sql = `SELECT pejid, nama_pejabat FROM pejabat_divisi_lama p WHERE nama_pejabat LIKE ? and p.tahun = ? AND p.bulan = ? LIMIT 20`;
    const [rows] = await pool.query(sql, [`%${query}%`, year, month]);
    return rows;
}

export async function getNewPejId() {
    const pool = getDbConnection();
    const [rows] = await pool.query('SELECT MAX(pejid) as maxid FROM pejabat_divisi_lama');
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

    // Check if record exists in pejabat_divisi_lama FOR THIS YEAR/MONTH (snapshot)
    // and assuming if we are editing a "current view", we are editing that specific snapshot.
    // However, usually officials have IDs that persist. 
    // If the record exists for that month/year, we update. If not, maybe we insert?
    // But typically getNewPejId gets a global ID. 
    // If we are "inserting new record", we insert into that year/month.

    // Let's check existence by pejid AND year AND month
    const [existing] = await pool.query(
        'SELECT * FROM pejabat_divisi_lama WHERE pejid = ? AND tahun = ? AND bulan = ?',
        [row.pejid, year, month]
    );

    const dataToSave = { ...row, jabid, tahun: year, bulan: month };

    if (existing.length > 0) {
        const oldData = existing[0];
        // Update
        await pool.query(
            'UPDATE pejabat_divisi_lama SET nama_pejabat=?, comid=?, jabid=? WHERE pejid=? AND tahun=? AND bulan=?',
            [row.nama_pejabat, row.comid, jabid, row.pejid, year, month]
        );
        // Log update
        logger.info('UPDATE pejabat_divisi_lama', { refId: row.pejid, action: 'UPDATE', old: oldData, new: dataToSave });
    } else {
        // Insert
        await pool.query(
            'INSERT INTO pejabat_divisi_lama (pejid, nama_pejabat, comid, jabid, tahun, bulan, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [row.pejid, row.nama_pejabat, row.comid, jabid, year, month]
        );
        // Log insert
        logger.info('INSERT pejabat_divisi_lama', { refId: row.pejid, action: 'INSERT', new: dataToSave });
    }

    // Handle old_maker_cheker (Checker)
    // maker = pejid
    if (row.checker) {
        const [cmList] = await pool.query(
            'SELECT * FROM old_maker_cheker WHERE maker=? AND thn=? AND bln=?',
            [row.pejid, year, month]
        );

        if (cmList.length > 0) {
            await pool.query(
                'UPDATE old_maker_cheker SET cheker=? WHERE maker=? AND thn=? AND bln=?',
                [row.checker, row.pejid, year, month]
            );
        } else {
            await pool.query(
                'INSERT INTO old_maker_cheker (maker, thn, bln, cheker) VALUES (?, ?, ?, ?)',
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

    // Copy pejabat_divisi_lama
    await pool.query(`
        INSERT INTO pejabat_divisi_lama (pejid, nama_pejabat, comid, jabid, tahun, bulan, is_active)
        SELECT pejid, nama_pejabat, comid, jabid, ? as tahun, ? as bulan, 1
        FROM pejabat_divisi_lama
        WHERE tahun = ? AND bulan = ? AND is_active = 1
    `, [targetYear, targetMonth, prevYear, prevMonth]);

    // Copy old_maker_cheker
    await pool.query(`
        INSERT INTO old_maker_cheker (maker, thn, bln, cheker)
        SELECT maker, ? as thn, ? as bln, cheker
        FROM old_maker_cheker
        WHERE thn = ? AND bln = ?
    `, [targetYear, targetMonth, prevYear, prevMonth]);

    // Optionally log this mass action?
    logger.info('COPY_MONTH pejabat_divisi_lama', { action: 'COPY_MONTH', from: `${prevYear}-${prevMonth}`, to: `${targetYear}-${targetMonth}` });

    return true;
}
