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
    return str.match(/PT\. APL\s(.+)/)[1].toLowerCase()
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
    const [rows] = await connection.execute(`SELECT comid, MAX(slhid) AS last_slhid FROM sales.pj_sales_harian GROUP BY comid;`);
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

    const salesValues = [];
    const outletValues = [];

    // Extract all invoice numbers from rows to narrow down the DB query
    const invoiceNos = [...new Set(rows.slice(1, -1).map(r => r['Invoice No']).filter(n => !!n))];

    let existingSales = new Set();
    if (invoiceNos.length > 0) {
        // Fetch existing records for these invoices
        const [dbRows] = await connection.query(
            'SELECT dist, nomor_faktur, item_code, batch_no FROM pj_sales WHERE nomor_faktur IN (?)',
            [invoiceNos]
        );
        dbRows.forEach(r => {
            existingSales.add(`${r.dist}-${r.nomor_faktur}-${r.item_code}-${r.batch_no}`);
        });
    }

    for (let i = 0; i < rows.length - 1; i++) {
        const disidMatch = rows[i]['Plant'].match(/\d+/g);
        const disid = disidMatch ? disidMatch[0] : '';
        if (!rows[i]['Billing Date']) continue;
        const tanggal_faktur = dayjs(rows[i]['Billing Date']).format('YYYY-MM-DD');
        const nomor_faktur = rows[i]['Invoice No'];
        const item_code = rows[i]['Material Code'];
        const quantity = Number(rows[i]['Qty - Transaction']?.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;
        const kode_outlet = rows[i]['Sold To Customer Code']?.replace(/^0+/, '') || '';
        const value = Number(rows[i]['Selling Price']?.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;
        const net_value = Number(rows[i]['ID Net Value Principal - Transaction']?.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;
        const po_outlet = rows[i]['Customer PO No'];
        const batch_no = rows[i]['Batch No'];
        const disc_distributor = net_value === 0 ? 0 : (Number(rows[i]['Value - Transaction']?.replace(/[^0-9.-]/g, '')) - net_value) / net_value * 100;
        const city = extractCityName(rows[i]['Plant']);
        const plant_code = 'APL-' + (city_abbr[city] || city);
        const ecat = outlet_type[rows[i]['Customer SA Group']] === 'ECAT';
        if (plant_code.length > 9) {
            console.log(plant_code)
        }

        if (!city_abbr[city]) {
            logger.warn(`Area "${city}" not found in area list. add to const.js`);
            debugger
            // continue; // Let's not skip, just use the city name as suffix if missing
        }

        // Deduplicate sales records in memory AND against Database
        const saleKey = `${plant_code}-${nomor_faktur}-${item_code}-${batch_no}`;
        if (existingSales.has(saleKey)) continue; //processedSales.has(saleKey) || 
        processedSales.add(saleKey);

        salesValues.push([
            plant_code, disid, tanggal_faktur, nomor_faktur, item_code, quantity,
            kode_outlet, value, net_value, po_outlet, batch_no, disc_distributor, ecat
        ]);

        if (outlets[kode_outlet]) {
            if (!added_outlets.includes(kode_outlet) && !existingOutlets.has(kode_outlet)) {
                const o = outlets[kode_outlet];
                outletValues.push([
                    kode_outlet, plant_code, disid,
                    o["Sold To Customer Name"],
                    o["Location - Sold To Customer Address 1"],
                    o["Sold To City"]?.replace(/^kota\s*/i, ''),
                    o["Location - Sold To Post Code"],
                    o["Sold To District"],
                    outlet_type[o["Customer SA Group"]] || ''
                ]);
                added_outlets.push(kode_outlet);
            }
        }
    }

    const CHUNK_SIZE = 500;
    if (salesValues.length > 0) {
        const sql = "REPLACE INTO pj_sales (dist, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value, net_value, po_outlet, batch_no, disc_distributor, ecat) VALUES ?";
        for (let i = 0; i < salesValues.length; i += CHUNK_SIZE) {
            await connection.query(sql, [salesValues.slice(i, i + CHUNK_SIZE)]);
        }
    }

    if (outletValues.length > 0) {
        const sql_outlet = "INSERT INTO pj_outlets (kode_outlet, distributor, disid, outlet, alamat, kota, kode_pos, distrik, tipe_outlet) VALUES ?";
        for (let i = 0; i < outletValues.length; i += CHUNK_SIZE) {
            await connection.query(sql_outlet, [outletValues.slice(i, i + CHUNK_SIZE)]);
        }
        logger.info(`Inserted ${added_outlets.length} new outlets.`);
    }
}

async function processPPG(rows) {
    const connection = getDbConnection();
    const distributor = 'PPG';
    const values = [];

    for (let i = 1; i < rows.length - 1; i++) {
        const disid = 'PPG-' + (rows[i]['Branch Code'] || '');
        const tanggal_faktur = dayjs(rows[i]['Inv Date'], 'DD-MM-YYYY').isValid()
            ? dayjs(rows[i]['Inv Date'], 'DD-MM-YYYY').format('YYYY-MM-DD')
            : null;
        const nomor_faktur = rows[i]['Inv No'];
        if (!tanggal_faktur) continue;
        const item_code = rows[i]['Part No'];
        const quantity = Number(rows[i]['Qty']) || 0;
        const kode_outlet = rows[i]['Customer Id'];
        const value = Number(rows[i]['Sales Nett (DPP)']) || 0;

        values.push([distributor, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value]);
    }

    if (values.length > 0) {
        const sql = "REPLACE INTO pj_sales (dist, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value) VALUES ?";
        const CHUNK_SIZE = 500;
        for (let i = 0; i < values.length; i += CHUNK_SIZE) {
            await connection.query(sql, [values.slice(i, i + CHUNK_SIZE)]);
        }
    }
}

async function processTSJ(rows) {
    const connection = getDbConnection();
    const distributor = 'TSJ';
    const values = [];

    for (let i = 1; i < rows.length - 1; i++) {
        const disid = rows[i]['KODECAB'];
        const tanggal_faktur = dayjs(rows[i]['TGLDOKJDI']).format('YYYY-MM-DD');
        const nomor_faktur = rows[i]['NODOKJDI'];
        const item_code = rows[i]['KODEPROD'];
        const quantity = Number(rows[i]['BANYAK']) || 0;
        const kode_outlet = `${rows[i]['GRUPLANG']}${rows[i]['KODELANG']}`;
        const value = Number(rows[i]['NETSALES']) || 0;

        values.push([distributor, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value]);
    }

    if (values.length > 0) {
        const sql = "REPLACE INTO pj_sales (dist, disid, tanggal_faktur, nomor_faktur, item_code, quantity, kode_outlet, value) VALUES ?";
        const CHUNK_SIZE = 500;
        for (let i = 0; i < values.length; i += CHUNK_SIZE) {
            await connection.query(sql, [values.slice(i, i + CHUNK_SIZE)]);
        }
    }
}

async function submitSalesReport(rows) {
    const connection = getDbConnection();
    try {
        let slhids = await getSlhId(connection);
        const validRows = rows.filter(row =>
            row.proid != null &&
            row.outid != null &&
            row.comid != null
        );
        const invalidRows = rows.filter(row =>
            row.proid == null ||
            row.outid == null ||
            row.comid == null
        );

        if (invalidRows.length > 0) {
            Dialog.create({
                title: 'Warning',
                message: `${invalidRows.length} rows have missing Product or Outlet mappings and will be skipped. Please check mapping tables.`,
                color: 'warning'
            });
            // We continue with validRows instead of returning
        }

        // Filter out records that already exist in pj_sales_harian based on (nomor_faktur, proid, value_asli)
        const invoiceNos = [...new Set(validRows.map(r => r.nomor_faktur).filter(n => !!n))];
        let existingSet = new Set();
        if (invoiceNos.length > 0) {
            // Fetch existing records for these invoices to prevent duplicates
            const [existing] = await connection.query(
                'SELECT nomor_faktur, proid, value_asli FROM sales.pj_sales_harian WHERE nomor_faktur IN (?)',
                [invoiceNos]
            );
            existing.forEach(r => {
                existingSet.add(`${r.nomor_faktur}|${r.proid}|${Number(r.value_asli)}`);
            });
        }

        const processedKeys = new Set();
        const data = [];

        for (const row of validRows) {
            const key = `${row.nomor_faktur}|${row.proid}|${Number(row.value)}`;

            // Skip if already in database or if it's a duplicate within the current set
            if (existingSet.has(key) || processedKeys.has(key)) continue;
            processedKeys.add(key);

            // Ensure slhids for this comid exists, if not start at 0
            if (slhids[row.comid] === undefined) {
                slhids[row.comid] = 0;
            }
            slhids[row.comid]++;

            const disidMatch = String(row.disid).match(/\d+/g);
            const disid = disidMatch ? disidMatch[0] : row.disid;

            data.push([
                row.comid,
                slhids[row.comid],
                row.tahun,
                row.bulan,
                row.tanggal_faktur,
                row.nomor_faktur,
                row.quantity,
                null, null, null, null, // thn_retur, bln_retur, qty_retur, realokasi
                row.proid,
                disid,
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
                row.value // maps to value_asli
            ]);
        }

        if (data.length === 0) return;

        const sql = "INSERT INTO sales.pj_sales_harian (comid, slhid, tahun, bulan, tanggal_faktur, nomor_faktur, quantity, thn_retur, bln_retur, qty_retur, realokasi, proid, disid, outid, distributor, outlet, product, bonus, hna, diskon, kode_outlet, value_net, disc_berno, disc_distributor, disc_p, value_asli) VALUES ?";

        const CHUNK_SIZE = 500;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await connection.query(sql, [chunk]);
        }
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

    const updateSql = `
        UPDATE sales.pj_sales SET
            comid = ?, outid = ?, outlet = ?, alamat = ?, 
            proid = ?, product = ?, urut_prod = ?, hnr = ?, 
            disc_amt = ?, disc_p = ?, disc_berno = ?, hnr2 = ?, nama_grup = ?, 
            TPID = ?, TP = ?, SPVID = ?, SPV = ?, DMID = ?, DM = ?, 
            AMID = ?, AM = ?, SMID = ?, SM = ?, GSMID = ?, GSM = ?, 
            off_mr = ?, off_spv = ?, off_dm = ?, off_am = ?, SP_SALES = ?, DPLID = ?
        WHERE dist = ? AND nomor_faktur = ? AND item_code = ?
    `;

    for (const r of rows) {
        await connection.query(updateSql, [
            r.comid, r.outid, r.outlet, r.alamat,
            r.proid, r.product, r.urut_prod, r.hnr,
            r.disc_amt, r.disc_p, r.disc_berno, r.hnr2, r.nama_grup,
            r.TPID, r.TP, r.SPVID, r.SPV, r.DMID, r.DM,
            r.AMID, r.AM, r.SMID, r.SM, r.GSMID, r.GSM,
            r.off_mr, r.off_spv, r.off_dm, r.off_am, r.SP_SALES, r.DPLID,
            r.distributor, r.nomor_faktur, r.item_code
        ]);
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
            o.comid, s.disid, s.dist AS distributor, o.outid, o.outlet, o.alamat, 
            s.tanggal_faktur, s.nomor_faktur, s.item_code, s.po_outlet, s.kode_outlet,
            xp.id AS proid, mg.produk AS product, s.batch_no, mg.urut_prod, s.quantity,
            mg.hna AS hnr, s.value AS value, s.disc_distributor,
            (s.value * s.quantity - s.net_value) AS disc_amt,
            1-(s.net_value/s.value / s.quantity) AS disc_p,
            1-(s.net_value/s.value / s.quantity) AS disc_berno,
            (s.net_value/s.quantity) AS hnr2,
            s.net_value AS value_net,
            mg.nama_grup AS nama_grup,
            s.ecat,
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
    // Filter out rows where mandatory IDs are missing (e.g. unmapped outlets/products)
    const validCacheRows = rows.filter(r => r.outid != null && r.proid != null && r.comid != null);
    await updateSalesCache(connection, validCacheRows);

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


export async function sendTelegramReport(startDate, endDate) {
    const config = getConfig();
    const token = config.telegram_bot_token;

    if (!token) {
        throw new Error("Telegram Bot Token (telegram_bot_token) not configured in config.yaml");
    }

    const connection = getDbConnection();
    const now = dayjs(endDate);
    const year = now.year();
    const month = now.month() + 1;
    const formattedDate = (startDate === endDate) ? now.format('DD-MM-YYYY') : `${dayjs(startDate).format('DD-MM-YYYY')} - ${now.format('DD-MM-YYYY')}`;

    // 1. Get Targets
    // Assuming pejabat_divisi_lama has pejid, target, tahun, bulan
    // Adjust column names if schema differs (e.g. sales_person_id vs pejid)
    // We try 'pejid' based on consistency with other tables.
    const [targets] = await connection.execute(
        'SELECT pejid, target as sales_target FROM sales.pj_sales_target WHERE tahun = ? AND bulan = ? AND target IS NOT NULL',
        [year, month]
    );

    if (!targets || targets.length === 0) {
        throw new Error(`No sales targets found in pejabat_divisi_lama for ${year}-${month}`);
    }

    // 2. Get Contacts
    const [contacts] = await connection.execute(
        'SELECT pejid, chatid, `all` FROM sales.pj_sales_person'
    );
    const targetContactMap = {}; // pejid -> chatid
    const allReportContacts = []; // list of {chatid, pejid?}

    contacts.forEach(c => {
        if (!c.chatid) return;
        if (c.pejid) targetContactMap[c.pejid] = c.chatid;
        if (c.all) allReportContacts.push({ chatid: c.chatid, pejid: c.pejid });
    });

    // 3. Get Sales Data (Aggregated)
    const sqlSales = `
        SELECT 
            s.TPID, s.TP, s.DMID, s.DM, s.SMID, s.SM,
            SUM(s.net_value) as val
        FROM sales.pj_sales s  
        WHERE EXTRACT(YEAR FROM s.tanggal_faktur) = ? 
          AND EXTRACT(MONTH FROM s.tanggal_faktur) = ?
        GROUP BY s.TPID, s.TP, s.DMID, s.DM, s.SMID, s.SM
    `;

    const [salesRows] = await connection.execute(sqlSales, [year, month]);

    const salesByPerson = { all: 0 };
    salesRows.forEach(row => {
        const v = Number(row.val) || 0;
        if (row.TPID) salesByPerson[row.TPID] = (salesByPerson[row.TPID] || 0) + v;
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

    // Get Global Target (Sum of jabid=4 and is_active=1)
    const [globalTargetRow] = await connection.execute(
        'SELECT SUM(t.target) as total FROM sales.pejabat_divisi_lama p JOIN sales.pj_sales_target t ON p.pejid = t.pejid AND p.tahun = t.tahun AND p.bulan = t.bulan WHERE p.tahun = ? AND p.bulan = ? AND p.jabid = 4 AND p.is_active = 1',
        [year, month]
    );
    const globalTargetVal = Number(globalTargetRow[0]?.total || 0);

    // Build list of all messages to be sent
    const pendingMessages = [];

    // Individual Targets
    for (const t of targets) {
        const chatid = targetContactMap[t.pejid];
        if (chatid) {
            pendingMessages.push({
                pejid: t.pejid,
                chatid: chatid,
                target: Number(t.sales_target),
                salesNet: salesByPerson[t.pejid] || 0,
                isAll: false
            });
        }
    }

    // All-Report Recipients (everyone with all=1/true)
    for (const contact of allReportContacts) {
        pendingMessages.push({
            pejid: contact.pejid || 'Global',
            chatid: contact.chatid,
            target: globalTargetVal,
            salesNet: salesByPerson.all,
            isAll: true
        });
    }

    for (const msg of pendingMessages) {
        const { pejid, chatid, target, salesNet, isAll } = msg;

        if (!target && !isAll) continue;

        const dailyTarget = target / totalWorkingDays;
        const kekurangan = (progressingWorkingDays * dailyTarget) - salesNet;
        const sisaHari = totalWorkingDays - progressingWorkingDays;

        let updateVal = 0;
        if (sisaHari > 0) {
            updateVal = dailyTarget + (kekurangan / sisaHari);
        } else {
            updateVal = dailyTarget + (kekurangan);
        }

        const fmt = (n) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2, notation: "compact", compactDisplay: "short", }).format(n);
        const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let message =
            `<b>Sales Report ${formattedDate}</b>\n\n` +
            `🎯 Target         : ${fmt(target)} \n💰 Sales          : ${fmt(salesNet)} \n📅 Hari Aktif   : ${progressingWorkingDays} / ${totalWorkingDays}\n\n` +
            `🥅 Target Harian: ${fmt(dailyTarget)} \n📉 Defisit        : ${fmt(kekurangan)} \n⏳ Sisa Hari    : ${sisaHari} \n📊 Update       : ${fmt(updateVal)}`;

        // If isAll, add breakdown (complete sales)
        if (isAll) {
            const smSales = {};
            salesRows.forEach(row => {
                const smName = (row.SM || 'Unknown').split('#')[0].trim();
                smSales[smName] = (smSales[smName] || 0) + Number(row.val);
            });
            const breakdown = Object.entries(smSales)
                .sort((a, b) => b[1] - a[1])
                .map(([name, val]) => `${escapeHtml(name).padEnd(20)}: ${fmt(val)}`)
                .join('\n');

            message += `\n\n📌 <b>Breakdown Sales SM:</b>\n<pre>${breakdown}</pre>`;
        }

        if (config.telegram_footnote) {
            message += `\n\n${config.telegram_footnote}`;
        }

        try {
            // TODO: Uncomment this to enable Telegram sending pjob
            // await sendTelegramMessage(token, chatid, message);
            console.log(pejid);
            console.log(message);
            sentCount++;
            // Throttle: pause 1s between messages
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
            logger.error(`Telegram send failed for pejid ${pejid} (${chatid})`, e.message);
            skippedCount++;
        }
    }

    return { sent: sentCount, skipped: skippedCount };
}

async function sendTelegramMessage(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error: ${response.status} ${errText}`);
    }
}
