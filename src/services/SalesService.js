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
const { shell } = window.require('electron');

dayjs.extend(customParseFormat);

const homeDir = HOME_DIR;

const REPORT_HEADERS = [
    'Tahun', 'Bulan', 'Comid', 'Disid', 'Distributor', 'Outid', 'Outlet', 'Alamat',
    'Tanggal Faktur', 'Nomor Faktur', 'PO Outlet', 'Proid', 'Product', 'Batch No',
    'Quantity', 'hnr', 'Value', 'disc_distributor', 'disc_amt', 'disc_p', 'disc_berno',
    'hnr2', 'Value Net', 'nama_group', 'TPID', 'TP', 'SPVID', 'SPV', 'DMID', 'DM',
    'AMID', 'AM', 'SMID', 'SM', 'GSMID', 'GSM', 'Off MR', 'Off SPV', 'Off DM',
    'Off AM', 'SP Sales', 'DPLID'
];

/**
 * Maps a sales row to an array for report generation. Format numbers for CSV if needed.
 */
function mapRowData(row, formatForCsv = false) {
    const data = [
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
        row.value,
        row.disc_distributor,
        row.disc_amt,
        row.disc_p,
        row.disc_berno,
        row.hnr2,
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
    ];

    if (formatForCsv) {
        return data.map((val, idx) => {
            if ((idx >= 17 && idx <= 20) && typeof val === 'number') return val.toFixed(5);
            if (idx === 21 && typeof val === 'number') return val.toFixed(0);
            return val;
        }).map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',');
    }
    return data;
}


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
    let sql = "REPLACE INTO pj_sales (dist, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value, net_value, po_outlet, batch_no, disc_distributor, ecat) VALUES ";

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
        const ecat = outlet_type[rows[i]['Customer SA Group']] === 'ECAT';

        if (!city_abbr[city]) {
            logger.warn(`Area ${city} not found in area list.`);
            continue;
        }

        // Deduplicate sales records in memory AND against Database
        const saleKey = `${plant_code}-${nomor_faktur}-${item_code}`;
        if (processedSales.has(saleKey) || existingSales.has(saleKey)) continue;
        processedSales.add(saleKey);

        sql += `('${plant_code}', '${disid}', '${tanggal_faktur}', '${nomor_faktur}', '${item_code}', ${quantity}, '${kode_outlet}', ${value}, ${net_value}, '${po_outlet}', '${batch_no}', ${disc_distributor}, ${ecat}),`;

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


/**
 * Bulk updates the pj_sales table with enriched data from the report query.
 */
async function updateSalesCache(connection, rows) {
    if (!rows || rows.length === 0) return;

    logger.info(`Updating pj_sales with ${rows.length} rows of enriched data...`);

    // Using INSERT ... ON DUPLICATE KEY UPDATE for batch performance.
    // Assumes pj_sales has a unique key on (dist, nomor_faktur, item_code).
    const updateSql = `
        INSERT INTO sales.pj_sales (
            dist, nomor_faktur, item_code,
            comid, outid, outlet, alamat, 
            proid, product, batch_no, urut_prod, hnr, 
            disc_amt, disc_p, disc_berno, hnr2, nama_grup, 
            TPID, TP, SPVID, SPV, DMID, DM, 
            AMID, AM, SMID, SM, GSMID, GSM, 
            off_mr, off_spv, off_dm, off_am, SP_SALES, DPLID
        ) VALUES ?
        ON DUPLICATE KEY UPDATE 
            comid = VALUES(comid), outid = VALUES(outid), outlet = VALUES(outlet), alamat = VALUES(alamat), 
            proid = VALUES(proid), product = VALUES(product), batch_no = VALUES(batch_no), urut_prod = VALUES(urut_prod), hnr = VALUES(hnr), 
            disc_amt = VALUES(disc_amt), disc_p = VALUES(disc_p), disc_berno = VALUES(disc_berno), hnr2 = VALUES(hnr2), nama_grup = VALUES(nama_grup), 
            TPID = VALUES(TPID), TP = VALUES(TP), SPVID = VALUES(SPVID), SPV = VALUES(SPV), DMID = VALUES(DMID), DM = VALUES(DM), 
            AMID = VALUES(AMID), AM = VALUES(AM), SMID = VALUES(SMID), SM = VALUES(SM), GSMID = VALUES(GSMID), GSM = VALUES(GSM), 
            off_mr = VALUES(off_mr), off_spv = VALUES(off_spv), off_dm = VALUES(off_dm), off_am = VALUES(off_am), SP_SALES = VALUES(SP_SALES), DPLID = VALUES(DPLID)
    `;

    const values = rows.map(r => [
        r.distributor, r.nomor_faktur, r.item_code,
        r.comid, r.outid, r.outlet, r.alamat,
        r.proid, r.product, r.batch_no, r.urut_prod, r.hnr,
        r.disc_amt, r.disc_p, r.disc_berno, r.hnr2, r.nama_grup,
        r.TPID, r.TP, r.SPVID, r.SPV, r.DMID, r.DM,
        r.AMID, r.AM, r.SMID, r.SM, r.GSMID, r.GSM,
        r.off_mr, r.off_spv, r.off_dm, r.off_am, r.SP_SALES, r.DPLID
    ]);

    const CHUNK_SIZE = 1000;
    for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        const chunk = values.slice(i, i + CHUNK_SIZE);
        await connection.query(updateSql, [chunk]);
    }
    logger.info('Finished updating pj_sales cache.');
}

/**
 * Creates the pivot sheet "Sales per Sales Person" in the provided workbook.
 */
async function createPivotSheet(workbook, rows) {
    try {
        const pivotMap = {};
        let grandTotal = 0;

        rows.forEach(r => {
            const sm = r.SM || '';
            const dm = r.DM || '';
            const val = Number(r.value_net) || 0;
            const key = `${sm}||${dm}`;

            if (!pivotMap[key]) {
                pivotMap[key] = { SM: sm, DM: dm, val: 0 };
            }
            pivotMap[key].val += val;
            grandTotal += val;
        });

        const sortedKeys = Object.keys(pivotMap).sort((a, b) => {
            if (pivotMap[a].SM < pivotMap[b].SM) return -1;
            if (pivotMap[a].SM > pivotMap[b].SM) return 1;
            if (pivotMap[a].DM < pivotMap[b].DM) return -1;
            if (pivotMap[a].DM > pivotMap[b].DM) return 1;
            return 0;
        });

        const pivotData = [['SM', 'DM', 'Sum of value_net']];
        sortedKeys.forEach(key => {
            pivotData.push([pivotMap[key].SM, pivotMap[key].DM, pivotMap[key].val]);
        });

        const pivotSheetName = "Sales per Sales Person";
        const wsPivot = xlsx.utils.aoa_to_sheet(pivotData);
        xlsx.utils.sheet_add_aoa(wsPivot, [[grandTotal]], { origin: "D7" });

        if (workbook.Sheets[pivotSheetName]) {
            workbook.Sheets[pivotSheetName] = wsPivot;
        } else {
            xlsx.utils.book_append_sheet(workbook, wsPivot, pivotSheetName);
        }
    } catch (e) {
        logger.error("Error creating pivot sheet", e);
    }
}

export async function createSalesReport(ecatFilter = 'Non ECAT', startDate, endDate) {
    const outlets = await getOutletDetailsContentAPL()
    const connection = getDbConnection();

    let ecatCondition = '';
    if (ecatFilter === 'ECAT') ecatCondition = ' AND s.ecat = 1';
    else if (ecatFilter === 'Non ECAT') ecatCondition = ' AND s.ecat = 0';

    const params = [];
    let dateCondition = '';
    if (startDate && endDate) {
        dateCondition = ' AND s.tanggal_faktur BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }

    const query = `
        SELECT 
            EXTRACT(YEAR FROM s.tanggal_faktur) AS tahun,
            EXTRACT(MONTH FROM s.tanggal_faktur) AS bulan,
            o.comid, o.disid, s.dist AS distributor, o.outid, o.outlet, o.alamat, 
            s.tanggal_faktur, s.nomor_faktur, s.item_code, s.po_outlet, s.kode_outlet,
            xp.id AS proid, mg.produk AS product, s.batch_no, mg.urut_prod, s.quantity,
            mg.hna AS hnr, s.value AS value, s.disc_distributor,
            (s.value - s.net_value) AS disc_amt,
            1-(s.net_value/s.value) AS disc_p,
            1-(s.net_value/s.value) AS disc_berno,
            (s.net_value/s.quantity) AS hnr2,
            s.net_value AS value_net,
            mg.nama_grup AS nama_grup,
            COALESCE(sp.mrid, o.mrid) AS TPID,
            ms.MR AS TP, ms.SPVID, ms.SPV, ms.DMID, ms.DM, ms.AMID, ms.AM, ms.SMID, ms.SM, ms.GSMID, ms.GSM,
            NULL AS off_mr, NULL AS off_spv, NULL AS off_dm, NULL AS off_am, NULL AS SP_SALES, NULL AS DPLID
        FROM sales.pj_sales s   
        LEFT JOIN sales.pj_outlets o ON o.kode_outlet = s.kode_outlet AND o.distributor = s.dist
        LEFT JOIN new_autosales.xmatch_product xp ON xp.disid = o.disid AND xp.kode = s.item_code AND xp.comid = o.comid
        LEFT JOIN sales.pj_sales_panel sp ON sp.nomor_faktur = s.nomor_faktur AND sp.proid = xp.id
        LEFT JOIN sales.mkt_structure ms ON ms.MRID = COALESCE(sp.mrid, o.mrid)
            AND ms.tahun = EXTRACT(YEAR FROM s.tanggal_faktur) 
            AND ms.bulan = EXTRACT(MONTH FROM s.tanggal_faktur)
        LEFT JOIN new_autosales.master_group mg ON mg.proid = xp.id
        WHERE 1=1 ${dateCondition} ${ecatCondition};
    `;

    const [rows] = await connection.execute(query, params);

    // 1. Sync generated data back to pj_sales cache
    await updateSalesCache(connection, rows);

    const reportDir = path.join(HOME_DIR, 'report');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const timestamp = dayjs().format('YYYYMMDD_HHmm');
    const csvPath = path.join(reportDir, `sales_report_${timestamp}_${ecatFilter}.csv`);

    // 2. Generate Main CSV Report
    const csvContent = [
        REPORT_HEADERS.join(','),
        ...rows.map(row => mapRowData(row, true))
    ].join('\n');
    fs.writeFileSync(csvPath, csvContent);

    // 3. Generate Excel Report from Template
    let excelPath = null;
    const templatePath = path.join(HOME_DIR, 'templates', 'Sales Harian Template.xlsm');
    if (fs.existsSync(templatePath)) {
        try {
            const workbook = xlsx.readFile(templatePath, { bookVBA: true });
            const sheetName = 'Today';
            if (workbook.Sheets[sheetName]) {
                const ws = workbook.Sheets[sheetName];
                const excelData = rows.map(r => mapRowData(r, false));

                xlsx.utils.sheet_add_aoa(ws, [REPORT_HEADERS], { origin: "A1" });
                xlsx.utils.sheet_add_aoa(ws, excelData, { origin: "A2" });

                await createPivotSheet(workbook, rows);

                excelPath = path.join(reportDir, `sales_report_${timestamp}_${ecatFilter}.xlsm`);
                xlsx.writeFile(workbook, excelPath);
                logger.info(`Excel report generated: ${excelPath}`);
            }
        } catch (error) {
            logger.error('Error processing Excel template:', error);
        }
    }

    // 4. Handle Unmatched Outlets
    const unmatched = rows.filter(r => r.SM == null);
    let unmatchedPath = null;
    if (unmatched.length > 0) {
        const uniqueMap = new Map();
        unmatched.forEach(r => {
            const key = r.outid ? String(r.outid) : `code:${r.kode_outlet ?? ''}`;
            if (!uniqueMap.has(key)) uniqueMap.set(key, r);
        });

        const unmatchedHeader = ['Outlet Code', 'comid', 'Outid', 'Outlet', 'Alamat', 'Kota', 'Distrik', 'Kode Pos', 'Tipe Outlet', 'DM', 'MRID'];
        const unmatchedCsvRows = [
            unmatchedHeader.join(','),
            ...Array.from(uniqueMap.values()).map(r => {
                const o = outlets[r.kode_outlet] || {};
                return [
                    r.kode_outlet ?? '', r.comid ?? '', r.outid ?? '',
                    o.outlet || r.outlet || '', o.alamat || r.alamat || '',
                    o.kota || '', o.distrik || '', o.kode_pos || '', o.tipe_outlet || '',
                    r.DM ?? '', r.TPID ?? ''
                ].map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',');
            })
        ].join('\n');

        unmatchedPath = path.join(reportDir, `sales_unmatched_mkt_outlet_${timestamp}.csv`);
        fs.writeFileSync(unmatchedPath, unmatchedCsvRows);
    }

    // 5. Open results
    if (excelPath || csvPath) shell.openPath(excelPath || csvPath);
    if (unmatchedPath) shell.openPath(unmatchedPath);

    // 6. Submit to final sales_harian table
    await submitSalesReport(rows);

    return { fullPath: csvPath, excelPath, unmatchedPath, unmatchedCount: unmatched.length };
}


export async function sendTelegramReport(selectedDate) {
    const config = getConfig();
    const token = config.telegram_bot_token;

    if (!token) {
        throw new Error("Telegram Bot Token (telegram_bot_token) not configured in config.yaml");
    }

    const connection = getDbConnection();
    const now = dayjs(selectedDate);
    const year = now.year();
    const month = now.month() + 1;

    // 1. Get Targets
    // Assuming pejabat_divisi_lama has pejid, target, tahun, bulan
    // Adjust column names if schema differs (e.g. sales_person_id vs pejid)
    // We try 'pejid' based on consistency with other tables.
    const [targets] = await connection.execute(
        'SELECT pejid, sales_target FROM sales.pejabat_divisi_lama WHERE tahun = ? AND bulan = ? AND sales_target IS NOT NULL',
        [year, month]
    );

    if (!targets || targets.length === 0) {
        throw new Error(`No sales targets found in pejabat_divisi_lama for ${year}-${month}`);
    }

    // 2. Get Contacts
    const [contacts] = await connection.execute(
        'SELECT pejid, chatid FROM sales.pj_sales_person'
    );
    const contactMap = {};
    contacts.forEach(c => {
        if (c.chatid) contactMap[c.pejid] = c.chatid;
    });

    // 3. Get Sales Data (Aggregated)
    // Query sales_harian for the month
    const sqlSales = `
        SELECT 
            ms.MRID, ms.DMID, ms.SMID,
            SUM(s.value_net) as val
        FROM sales.sales_harian s
        LEFT JOIN sales.pj_outlets o 
            ON o.kode_outlet = s.kode_outlet 
            AND o.distributor = s.distributor
        LEFT JOIN sales.pj_sales_panel sp 
            ON sp.nomor_faktur = s.nomor_faktur 
            AND sp.proid = s.proid
        LEFT JOIN sales.mkt_structure ms 
            ON ms.MRID = COALESCE(sp.mrid, o.mrid)
            AND ms.tahun = s.tahun AND ms.bulan = s.bulan
        WHERE s.tahun = ? AND s.bulan = ?
        GROUP BY ms.MRID, ms.DMID, ms.SMID
    `;

    const [salesRows] = await connection.execute(sqlSales, [year, month]);

    const salesByPerson = { all: 0 };
    salesRows.forEach(row => {
        const v = Number(row.val) || 0;
        if (row.MRID) salesByPerson[row.MRID] = (salesByPerson[row.MRID] || 0) + v;
        if (row.DMID) salesByPerson[row.DMID] = (salesByPerson[row.DMID] || 0) + v;
        if (row.SMID) salesByPerson[row.SMID] = (salesByPerson[row.SMID] || 0) + v;
        salesByPerson.all += v;
    });

    // 4. Calculate Days
    const daysInMonth = now.daysInMonth();
    let totalWorkingDays = 0;
    let progressingWorkingDays = 0;
    const currentDay = now.date();

    for (let d = 1; d <= daysInMonth; d++) {
        const date = dayjs(`${year}-${month}-${d}`, 'YYYY-M-D');
        const dayOfWeek = date.day(); // 0=Sun, 6=Sat
        // Mon(1) to Sat(6) are working days
        if (dayOfWeek !== 0) {
            totalWorkingDays++;
            if (d <= currentDay) {
                progressingWorkingDays++;
            }
        }
    }

    // 5. Send Telegrams
    let sentCount = 0;
    let skippedCount = 0;

    for (const t of targets) {
        const pejid = t.pejid;
        const target = Number(t.sales_target);
        if (!target) continue; // Skip 0 targets?        

        const chatid = contactMap[pejid];
        if (!chatid) {
            // logger.warn(`No chatid for pejid ${pejid}`);
            skippedCount++;
            continue;
        }


        const salesNet = salesByPerson[pejid] || 0;
        const dailyTarget = target / totalWorkingDays;

        const kekurangan = (progressingWorkingDays * dailyTarget) - salesNet;
        const sisaHari = totalWorkingDays - progressingWorkingDays;

        let updateVal = 0;
        if (sisaHari > 0) {
            updateVal = dailyTarget + (kekurangan / sisaHari);
        } else {
            // Fallback if sisaHari is 0 (last day or past)
            updateVal = dailyTarget + (kekurangan); // Just an approximation
        }

        const fmt = (n) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0, notation: "compact", compactDisplay: "short", }).format(n);

        const message =
            `Sales Report ${now.subtract(1, 'days').format('DD-MM-YYYY')}\n
🎯 Target         : ${fmt(target)} \n💰 Sales          : ${fmt(salesNet)} \n📅 Hari Aktif   : ${progressingWorkingDays} / ${totalWorkingDays}\n
🥅 Target Harian: ${fmt(dailyTarget)} \n📉 Defisit        : ${fmt(kekurangan)} \n⏳ Sisa Hari    : ${sisaHari} \n📊 Update       : ${fmt(updateVal)}`;

        console.log(message);

        try {
            await sendTelegramMessage(token, chatid, message);
            sentCount++;
        } catch (e) {
            logger.error(`Telegram send failed for pejid ${pejid} (${chatid})`, e.message);
            skippedCount++;
        }
    }

    return { sent: sentCount, skipped: skippedCount };
}

async function sendTelegramMessage(token, chatId, text) {
    // In Electron/Node context, fetch is available (Node 18+) or we rely on window.fetch if in renderer (but this is Service)
    // If Service runs in Main process, we need native fetch. 
    // If Service runs in Renderer process (imported by Vue), we have window.fetch.
    // Assuming Renderer since it is imported by DataProcessPage.vue

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error: ${response.status} ${errText}`);
    }
}
