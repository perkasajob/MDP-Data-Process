import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { Dialog } from 'quasar';
import { getConfig } from './ConfigService';
import { getDbConnection } from './DbService';
import { city_abbr, outlet_type, HOME_DIR } from '../const';
import logger from './LoggerService';

const fs = window.require('fs');
const path = window.require('path');
const { parse } = window.require('csv-parse');
const xlsx = window.require('xlsx');
const { DBFFile } = window.require('dbffile');
const { exec } = window.require('child_process');

dayjs.extend(customParseFormat);

const homeDir = HOME_DIR;

export async function processSales(distributor, date, filePathInput) {
    const config = getConfig();

    let distributorsToProcess = [];
    if (distributor.toUpperCase() === 'ALL') {
        distributorsToProcess = ['APL', 'PPG', 'TSJ'];
    } else {
        distributorsToProcess = [distributor];
    }

    for (const dist of distributorsToProcess) {
        await getContent(dist, date, filePathInput);
    }
}

async function getContent(distributor, date, filePathInput) {
    let rows = [];
    const config = getConfig();
    let filePath = filePathInput;

    // If no input file (e.g. from file picker), try to load from config defaults if processing batch? 
    // The original logic checked config.files[distributor.toLowerCase()]
    // But here we might want to be more explicit. 
    // For now, let's assume if filePathInput is null, we look up config.
    if (!filePath) {
        filePath = config.files && config.files[distributor.toLowerCase()];
        filePath = path.join(homeDir, filePath);
    }

    if (!filePath) {
        // alert(`No file configured for distributor: ${distributor}`);
        throw new Error(`No file configured for distributor: ${distributor}`);
    }

    (`Reading file: ${filePath}`);
    const fileData = fs.readFileSync(filePath);
    const fileExtension = filePath.split('.').pop().toLowerCase();

    if (fileExtension === 'csv') { //APL
        rows = await processCSV(fileData);
    } else if (fileExtension === 'dbf') { //tsj
        rows = await processDBF(filePath);
    } else if (fileExtension === 'xlsx') { //PPG
        rows = await processXLSX(filePath);
    } else {
        throw new Error('Unsupported file format. Please upload a CSV, XLSX or DBF file.');
    }

    switch (distributor.toUpperCase()) {
        case 'APL':
            await processAPL(rows);
            break;
        case 'PPG':
            await processPPG(rows);
            break;
        case 'TSJ':
            await processTSJ(rows);
            break;
        default:
            throw new Error(`Unknown distributor: ${distributor}`);
    }
}

function processCSV(csvData) {
    return new Promise((resolve, reject) => {
        parse(
            csvData,
            { columns: header => header.map(h => h.trim()), skip_empty_lines: true, trim: true },
            (err, parsedRows) => {
                if (err) resolve([]); // or reject? logic in mdp.js wasn't fully clear on reject but let's reject
                else resolve(parsedRows);
            }
        );
    });
}

function processXLSX(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    return rows;
}

async function processDBF(filePath) {
    const dbf = await DBFFile.open(filePath);
    const rows = await dbf.readRecords();
    return rows;
}

// ... helper functions from mdp.js ...
function extractCityName(str) {
    const parts = str.trim().split(/\s+/);
    const city = parts[parts.length - 1];
    return city.toLowerCase()
}

async function getOutletDetailsContentAPL() {
    const config = getConfig();
    const filePath = path.join(homeDir, config.files['apl_outlet']);

    if (!filePath) {
        throw new Error(`No Outlet Details file configured for distributor: APL`);
    }
    const fileData = fs.readFileSync(filePath);
    let rows = await processCSV(fileData);
    let outlets = {}
    for (let i = 1; i < rows.length - 1; i++) {
        const key = rows[i]['Customer - Sold To Customer Code'].replace(/^0+/, '')
        outlets[key] = rows[i]
        outlets[key]['outlet'] = rows[i]['Sold To Customer Name']
        outlets[key]['kota'] = rows[i]['Sold To City'].replace(/^kota\s*/i, '')
        outlets[key]['alamat'] = rows[i]['Location - Sold To Customer Address 1']
        outlets[key]['distrik'] = rows[i]['Sold To District']
        outlets[key]['kode_pos'] = rows[i]['Location - Sold To Post Code']
        outlets[key]['po_outlet'] = rows[i]['Customer PO No']
        outlets[key]['batch_no'] = rows[i]['Batch No']
        outlets[key]['tipe_outlet'] = outlet_type[rows[i]['Customer SA Group']]
    }
    return outlets;
}

async function getSlhId(connection) {
    const [rows] = await connection.execute(`SELECT comid, MAX(slhid) AS last_slhid FROM sales.sales_harian GROUP BY comid;`);
    const last_slhids = rows.reduce((acc, item) => { acc[item.comid] = Number(item.last_slhid); return acc; }, {});
    return last_slhids;
}



async function processAPL(rows) {
    const connection = getDbConnection();
    let outlets = await getOutletDetailsContentAPL()
    let added_outlets = [];
    let processedSales = new Set();

    // Fetch existing outlets for APL to check against
    const [existingRows] = await connection.execute('SELECT DISTINCT kode_outlet FROM pj_outlets WHERE distributor LIKE "APL-%"');
    const existingOutlets = new Set(existingRows.map(r => r.kode_outlet));

    let sql_outlet = "INSERT INTO pj_outlets (kode_outlet, distributor, disid, outlet, alamat, kota, kode_pos, distrik, tipe_outlet) VALUES ";
    let sql = "REPLACE INTO pj_sales (dist, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value, net_value, po_outlet, batch_no, disc_distributor) VALUES ";

    // Extract all invoice numbers from rows to narrow down the DB query
    const invoiceNos = [...new Set(rows.slice(1, -1).map(r => r['Invoice No']).filter(n => !!n))];

    let existingSales = new Set();
    if (invoiceNos.length > 0) {
        // Fetch existing records for these invoices
        const [existingRows] = await connection.query(
            'SELECT dist, nomor_faktur, item_code FROM pj_sales WHERE nomor_faktur IN (?)',
            [invoiceNos]
        );
        existingRows.forEach(r => {
            existingSales.add(`${r.dist}-${r.nomor_faktur}-${r.item_code}`);
        });
    }

    for (let i = 1; i < rows.length - 1; i++) {
        const disid = rows[i]['Plant'].match(/\d+/g)[0];
        if (!rows[i]['Billing Date']) continue;
        const tanggal_faktur = dayjs(rows[i]['Billing Date']).format('YYYY-MM-DD');
        const nomor_faktur = rows[i]['Invoice No'];
        const item_code = rows[i]['Material Code'];
        const quantity = Number(rows[i]['Qty - Transaction'].replace(/,/g, '').replace(/[^0-9.-]/g, ''));
        const kode_outlet = rows[i]['Sold To Customer Code'].replace(/^0+/, '');
        const value = Number(rows[i]['Selling Price'].replace(/,/g, '').replace(/[^0-9.-]/g, ''));
        const net_value = Number(rows[i]['ID Net Value Principal - Transaction'].replace(/,/g, '').replace(/[^0-9.-]/g, ''));
        const po_outlet = rows[i]['Customer PO No'];
        const batch_no = rows[i]['Batch No'];
        const disc_distributor = (value - Number(rows[i]['Value - Transaction'].replace(/[^0-9.-]/g, ''))) / value * 100;
        const city = extractCityName(rows[i]['Plant']);
        const plant_code = 'APL-' + city_abbr[city];

        if (!city_abbr[city]) {
            logger.warn(`Area ${city} not found in area list.`);
            continue;
        }

        // Deduplicate sales records in memory AND against Database
        const saleKey = `${plant_code}-${nomor_faktur}-${item_code}`;
        if (processedSales.has(saleKey) || existingSales.has(saleKey)) continue;
        processedSales.add(saleKey);

        sql += `('${plant_code}', '${disid}', '${tanggal_faktur}', '${nomor_faktur}', '${item_code}', ${quantity}, '${kode_outlet}', ${value}, ${net_value}, '${po_outlet}', '${batch_no}', ${disc_distributor}),`;

        if (outlets[kode_outlet]) {
            if (!added_outlets.includes(kode_outlet) && !existingOutlets.has(kode_outlet)) {
                sql_outlet += `("${kode_outlet}", "${plant_code}", "${disid}", "${outlets[kode_outlet]["Sold To Customer Name"].replace(/"/g, '""')}", "${outlets[kode_outlet]["Location - Sold To Customer Address 1"].replace(/"/g, '""').replace(/'/g, "''")}", "${outlets[kode_outlet]["Sold To City"].replace(/^kota\s*/i, '').replace(/"/g, '""')}", "${outlets[kode_outlet]["Location - Sold To Post Code"]}", "${outlets[kode_outlet]["Sold To District"].replace(/"/g, '""')}","${outlet_type[outlets[kode_outlet]["Customer SA Group"]] || ''}"),`;
                added_outlets.push(kode_outlet);
            }
        }
    }

    if (sql.endsWith(',')) await connection.execute(sql.slice(0, -1));
    if (added_outlets.length > 0 && sql_outlet.endsWith(',')) {
        await connection.execute(sql_outlet.slice(0, -1));
        logger.info(`Inserted ${added_outlets.length} new outlets.`);
    }
}

async function processPPG(rows) {
    const connection = getDbConnection();
    const distributor = 'PPG';
    let sql = "REPLACE INTO pj_sales (dist, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value) VALUES ";

    for (let i = 1; i < rows.length - 1; i++) {
        // logic from mdp.js
        const disid = 'PPG-' + rows[i]['Branch Code'];
        const tanggal_faktur = dayjs(rows[i]['Inv Date'], 'DD-MM-YYYY').isValid()
            ? dayjs(rows[i]['Inv Date'], 'DD-MM-YYYY').format('YYYY-MM-DD')
            : null;
        const nomor_faktur = rows[i]['Inv No'];
        if (!tanggal_faktur) continue;
        const item_code = rows[i]['Part No'];
        const quantity = rows[i]['Qty'];
        const kode_outlet = rows[i]['Customer Id'];
        const value = rows[i]['Sales Nett (DPP)'];

        sql += `('${distributor}', '${disid}', '${tanggal_faktur}', '${nomor_faktur}', '${item_code}', ${quantity}, '${kode_outlet}', ${value}),`;
    }

    if (sql.endsWith(',')) await connection.execute(sql.slice(0, -1));
}

async function processTSJ(rows) {
    const connection = getDbConnection();
    const distributor = 'TSJ';
    let sql = "REPLACE INTO pj_sales (dist, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value) VALUES ";

    for (let i = 1; i < rows.length - 1; i++) {
        const disid = rows[i]['KODECAB'];
        const tanggal_faktur = dayjs(rows[i]['TGLDOKJDI']).format('YYYY-MM-DD');
        const nomor_faktur = rows[i]['NODOKJDI'];
        const item_code = rows[i]['KODEPROD'];
        const quantity = rows[i]['BANYAK'];
        const kode_outlet = `${rows[i]['GRUPLANG']}${rows[i]['KODELANG']}`;
        const value = rows[i]['NETSALES'];

        sql += `('${distributor}', '${disid}', '${tanggal_faktur}', '${nomor_faktur}', '${item_code}', ${quantity}, '${kode_outlet}', ${value}),`;
    }
    if (sql.endsWith(',')) await connection.execute(sql.slice(0, -1));
}

async function submitSalesReport(rows) {
    const connection = getDbConnection();
    try {
        let slhids = await getSlhId(connection);
        const validRows = rows.filter(row => row.proid !== null && row.proid !== undefined);
        const invalidRows = rows.filter(row => row.proid === null || row.proid === undefined);

        if (invalidRows.length > 0) {
            Dialog.create({
                title: 'Warning',
                message: `${invalidRows.length} rows have missing Product IDs and will be skipped. Please check product mappings.`,
                color: 'warning'
            });
            return;
        }

        const data = validRows.map(row => {
            // Ensure slhids for this comid exists, if not start at 0
            if (slhids[row.comid] === undefined) {
                slhids[row.comid] = 0;
            }
            slhids[row.comid]++;

            return [
                row.comid,
                slhids[row.comid],
                row.tahun,
                row.bulan,
                row.tanggal_faktur,
                row.nomor_faktur,
                row.quantity,
                null, null, null, null, // thn_retur, bln_retur, qty_retur, realokasi
                row.proid,
                row.disid.match(/\d+/g)[0], // expected disid to be a number
                row.outid,
                row.distributor,
                row.outlet,
                row.product,
                1, // bonus
                row.hnr,
                row.disc_amt,
                row.kode_outlet,
                row.value_net,
                row.disc_berno,
                row.disc_distributor,
                row.disc_p,
                row.value
            ];
        });

        if (data.length === 0) return;


        const sql = "INSERT INTO sales.sales_harian (comid, slhid, tahun, bulan, tanggal_faktur, nomor_faktur, quantity, thn_retur, bln_retur, qty_retur, realokasi, proid, disid, outid, distributor, outlet, product, bonus, hna, diskon, kode_outlet, value_net, disc_berno, disc_distributor, disc_p, value_asli) VALUES ?";

        await connection.query(sql, [data]);
    } catch (error) {
        logger.error('Error in submitSalesReport:', error);
        throw error;
    }
}


export async function createSalesReport() {
    const outlets = await getOutletDetailsContentAPL()
    const connection = getDbConnection();

    const [rows] = await connection.execute(`
        SELECT 
        EXTRACT(YEAR  FROM s.tanggal_faktur) AS tahun,
        EXTRACT(MONTH FROM s.tanggal_faktur) AS bulan,

        o.comid,
        o.disid,
        s.dist           AS distributor,
        o.outid,
        o.outlet,
        o.alamat, 

        s.tanggal_faktur,
        s.nomor_faktur,
        s.po_outlet,
        s.kode_outlet,

        xp.id                  AS proid,
        mg.produk           AS product,
        s.batch_no,
        mg.urut_prod,

        s.quantity,

        mg.hna                 AS hnr,
        s.value                AS value,
        s.disc_distributor,

        (s.value - s.net_value)    AS disc_amt,
        1-(s.net_value/s.value) AS disc_p,
        1-(s.net_value/s.value) AS disc_berno,

        (s.net_value/s.quantity) AS hnr2,
        s.net_value            AS value_net,

        mg.nama_grup           AS nama_grup,

        COALESCE(sp.mrid, o.mrid) AS TPID,
        ms.MR                    AS TP,

        /* === DIKOSONGKAN === */
        ms.SPVID                 AS SPVID,
        ms.SPV                 AS SPV,

        ms.DMID                  AS DMID,
        ms.DM                  AS DM,

        ms.AMID                  AS AMID,
        ms.AM                  AS AM,

        ms.SMID                  AS SMID,
        ms.SM                  AS SM,

        ms.GSMID                 AS GSMID,
        ms.GSM                 AS GSM,

        NULL                   AS off_mr,
        NULL                   AS off_spv,
        NULL                   AS off_dm,
        NULL                   AS off_am,

        NULL                   AS SP_SALES,
        NULL                   AS DPLID

        FROM sales.pj_sales s   

        LEFT JOIN sales.pj_outlets o
            ON o.kode_outlet = s.kode_outlet
        AND o.distributor = s.dist

        LEFT JOIN new_autosales.xmatch_product xp
            ON xp.disid = o.disid
        AND xp.kode = s.item_code
        AND xp.comid = o.comid
        
        LEFT JOIN sales.pj_sales_panel sp
            ON sp.nomor_faktur = s.nomor_faktur
        AND sp.proid = xp.id

        LEFT JOIN sales.pj_mkt_structure ms
            ON ms.MRID = COALESCE(sp.mrid, o.mrid)

        LEFT JOIN new_autosales.master_group mg
            ON mg.proid = xp.id;
    `);

    // CSV header 
    const header = [
        'Tahun',
        'Bulan',
        'Comid',
        'Disid',
        'Distributor',
        'Outid',
        'Outlet',
        'Alamat',
        'Tanggal Faktur',
        'Nomor Faktur',
        'PO Outlet',
        'Proid',
        'Product',
        'Batch No',
        'Quantity',
        'hnr',
        'Value',
        'disc_distributor',
        'disc_amt',
        'disc_p',
        'disc_berno',
        'hnr2',
        'Value Net',
        'nama_group',
        'TPID',
        'TP',
        'SPVID',
        'SPV',
        'DMID',
        'DM',
        'AMID',
        'AM',
        'SMID',
        'SM',
        'GSMID',
        'GSM',
        'Off MR',
        'Off SPV',
        'Off DM',
        'Off AM',
        'SP Sales',
        'DPLID'
    ];

    const reportDir = path.join(homeDir, 'report');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const buildCsv = (rowsSubset) => {
        const csvRows = [
            header.join(','),
            ...rowsSubset.map(row =>
                [
                    row.tahun,
                    row.bulan,
                    row.comid,
                    row.disid,
                    row.distributor,
                    row.outid,
                    row.outlet,
                    row.alamat,
                    row.tanggal_faktur ? dayjs(row.tanggal_faktur).format('YYYY-MM-DD') : '',
                    row.nomor_faktur,
                    row.po_outlet,
                    row.proid,
                    row.product,
                    row.batch_no,
                    row.quantity,
                    row.hnr,
                    row.VALUE,
                    row.disc_distributor.toFixed(5),
                    row.disc_amt.toFixed(5),
                    row.disc_p.toFixed(5),
                    row.disc_berno.toFixed(5),
                    row.hnr2.toFixed(0),
                    row.value_net,
                    row.nama_grup,
                    row.TPID,
                    row.TP,
                    row.SPVID,
                    row.SPV,
                    row.DMID,
                    row.DM,
                    row.AMID,
                    row.AM,
                    row.SMID,
                    row.SM,
                    row.GSMID,
                    row.GSM,
                    row.off_mr,
                    row.off_spv,
                    row.off_dm,
                    row.off_am,
                    row.SP_SALES,
                    row.DPLID
                ].map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
            )
        ];
        return csvRows.join('\n');
    };

    const timestamp = dayjs().format('YYYYMMDD_HHmm');
    const fullPath = path.join(reportDir, `sales_report_${timestamp}.csv`);
    const fullCsv = buildCsv(rows);
    fs.writeFileSync(fullPath, fullCsv);

    // ... unmatched logic ...
    const unmatched = rows.filter(r => r.SM == null);
    let unmatchedPath = null;
    if (unmatched.length > 0) {
        const uniqueMap = new Map();
        for (const r of unmatched) {
            const key = r.outid ? String(r.outid) : `code:${r.kode_outlet ?? ''}`;
            if (!uniqueMap.has(key)) uniqueMap.set(key, r);
        }
        const uniqueUnmatched = Array.from(uniqueMap.values());

        const unmatchedHeader = ['Outlet Code', 'comid', 'Outid', 'Outlet', 'Alamat', 'Distributor City', 'Kota', 'Distrik', 'Kode Pos', 'Tipe Outlet', 'DM', 'MRID'];
        const unmatchedCsvRows = [
            unmatchedHeader.join(','),
            ...uniqueUnmatched.map(r =>
                [r.kode_outlet ?? '', r.comid ?? '', r.outid ?? '', (outlets[r.kode_outlet] ? outlets[r.kode_outlet]['outlet'] : r.outlet), (outlets[r.kode_outlet] ? outlets[r.kode_outlet]['alamat'] : r.alamat), r.DIST_KOTA ?? '', (outlets[r.kode_outlet] ? outlets[r.kode_outlet]['kota'] : ''), (outlets[r.kode_outlet] ? outlets[r.kode_outlet]['distrik'] : ''), (outlets[r.kode_outlet] ? outlets[r.kode_outlet]['kode_pos'] : ''), (outlets[r.kode_outlet] ? outlets[r.kode_outlet]['tipe_outlet'] : ''), r.DM ?? '', r.mrid ?? '']
                    .map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
            )
        ].join('\n');

        unmatchedPath = path.join(reportDir, `sales_unmatched_mkt_outlet_${timestamp}.csv`);
        fs.writeFileSync(unmatchedPath, unmatchedCsvRows);
    }

    // Auto open excel
    exec(`start excel "${fullPath}"`);
    if (unmatchedPath) exec(`start excel "${unmatchedPath}"`);

    // Submit sales report
    await submitSalesReport(rows);

    return { fullPath, unmatchedPath, unmatchedCount: unmatched.length };
}
