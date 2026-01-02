import { getDbConnection } from './DbService';

export async function getPanelData(limit = 100) {
    const connection = getDbConnection();
    const [rows] = await connection.execute(`
        SELECT p.nomor_faktur, p.proid, p.mrid, m.MR as mr_name 
        FROM pj_sales_panel p
        LEFT JOIN pj_mkt_structure m ON p.mrid = m.MRID
        ORDER BY p.nomor_faktur DESC 
        LIMIT ?
    `, [limit]);
    return rows;
}

export async function searchMr(query) {
    if (!query) return [];
    const connection = getDbConnection();
    // Assuming 'MR' is the column for the name/label
    const [rows] = await connection.execute(`
        SELECT MRID as value, MR as label 
        FROM pj_mkt_structure 
        WHERE MR LIKE ? 
        LIMIT 20
    `, [`%${query}%`]);
    return rows;
}

export async function savePanelRow(row) {
    const connection = getDbConnection();

    await connection.execute(`
        INSERT INTO pj_sales_panel (nomor_faktur, proid, mrid) 
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE proid = VALUES(proid), mrid = VALUES(mrid)
    `, [row.nomor_faktur, row.proid || null, row.mrid || null]);
}

export async function deletePanelRow(nomor_faktur) {
    const connection = getDbConnection();
    await connection.execute('DELETE FROM pj_sales_panel WHERE nomor_faktur = ?', [nomor_faktur]);
}

export async function searchPjSales(filters) {
    const connection = getDbConnection();
    let query = `
        SELECT 
            s.nomor_faktur, 
            MAX(s.tanggal_faktur) as tanggal_faktur, 
            MAX(o.outid) as outid, 
            MAX(o.outlet) as outlet_name,
            MAX(xp.nama) as nama_produk,
            xp.id as proid,
            MAX(s.dist) as dist, 
            MAX(s.kode_outlet) as kode_outlet, 
            MAX(o.mrid) as mrid, 
            MAX(m.MR) as mr_name,
            SUM(s.net_value) as total_net, 
            SUM(s.quantity) as total_qty
        FROM pj_sales s
        LEFT JOIN pj_outlets o 
            ON o.kode_outlet = s.kode_outlet 
            AND o.distributor = s.dist
        LEFT JOIN new_autosales.xmatch_product xp
            ON xp.disid = o.disid
            AND xp.kode = s.item_code
            AND xp.comid = o.comid
        LEFT JOIN pj_mkt_structure m
            ON o.mrid = m.MRID
        WHERE 1=1
    `;

    const params = [];

    if (filters.nomor_faktur) {
        query += ` AND s.nomor_faktur LIKE ?`;
        params.push(`%${filters.nomor_faktur}%`);
    }
    if (filters.outid) {
        query += ` AND o.outid LIKE ?`;
        params.push(`%${filters.outid}%`);
    }
    if (filters.outlet_name) {
        query += ` AND o.outlet LIKE ?`;
        params.push(`%${filters.outlet_name}%`);
    }
    if (filters.nama_produk) {
        query += ` AND xp.nama LIKE ?`;
        params.push(`%${filters.nama_produk}%`);
    }
    if (filters.mr_name) {
        query += ` AND m.MR LIKE ?`;
        params.push(`%${filters.mr_name}%`);
    }

    query += ` GROUP BY s.nomor_faktur, xp.id ORDER BY tanggal_faktur DESC LIMIT 50`;

    const [rows] = await connection.execute(query, params);
    return rows;
}
