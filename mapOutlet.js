const mysql_mo = require('mysql2/promise');
const fs_mo = require('fs');
const yaml_mo = require('js-yaml');

// Load config
const config_mo = yaml_mo.load(fs_mo.readFileSync('./config.yaml', 'utf8'));
const connection_mo = mysql_mo.createPool(config_mo.connectionstr);

// Meilisearch Config
const MEILI_HOST = 'http://127.0.0.1:7700';
const MEILI_INDEX = 'pj_outlets';

let unmappedData = [];
let modifiedRows = new Map();

async function initMapOutlet() {
    console.log('Initializing Map Outlet module...');
    await loadUnmapped();
}

async function loadUnmapped() {
    try {
        const [rows] = await connection_mo.execute('SELECT * FROM pj_outlets WHERE outid IS NULL OR outid = ""');
        unmappedData = rows;
        renderUnmappedTable();
    } catch (error) {
        console.error('Error loading unmapped outlets:', error);
        alert('Failed to load unmapped outlets.');
    }
}

function renderUnmappedTable() {
    const tbody = document.querySelector('#unmapped-table tbody');
    tbody.innerHTML = '';

    unmappedData.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        tr.onclick = () => selectUnmappedRow(index);

        const displayData = modifiedRows.has(index) ? { ...row, ...modifiedRows.get(index) } : row;

        if (modifiedRows.has(index)) {
            tr.classList.add('bg-green-100');
        }

        // Highlight active row if selected
        if (selectedUnmappedIndex === index) {
            tr.classList.add('active-row');
        }

        const comidValue = displayData.comid || '';
        const outidValue = displayData.outid || '';

        tr.innerHTML = `
            <td>${displayData.distributor || ''}</td>
            <td>${displayData.outlet || ''}</td>
            <td>${displayData.alamat || ''}</td>
            <td>${displayData.kota || ''}</td>
            <td><input type="text" class="input input-xs input-bordered w-20" value="${comidValue}" onchange="handleManualEdit(${index}, 'comid', this.value)" onclick="event.stopPropagation()"></td>
            <td><input type="text" class="input input-xs input-bordered w-20" value="${outidValue}" onchange="handleManualEdit(${index}, 'outid', this.value)" onclick="event.stopPropagation()"></td>
        `;
        tbody.appendChild(tr);
    });
}

function handleManualEdit(index, field, value) {
    // Get existing modifications or create new object
    const currentMods = modifiedRows.get(index) || {};

    // Update the specific field
    currentMods[field] = value;

    // Store back in map
    modifiedRows.set(index, currentMods);

    // Update UI styling to show modified state
    const tr = document.querySelector(`#unmapped-table tbody tr[data-index="${index}"]`);
    if (tr) tr.classList.add('bg-green-100');
}

let selectedUnmappedIndex = null;

function selectUnmappedRow(index) {
    selectedUnmappedIndex = index;

    document.querySelectorAll('#unmapped-table tbody tr').forEach(tr => tr.classList.remove('active-row'));
    const tr = document.querySelector(`#unmapped-table tbody tr[data-index="${index}"]`);
    if (tr) tr.classList.add('active-row');

    const rowData = unmappedData[index];
    // Search using Meilisearch
    // construct a query focusing on outlet name and address
    searchSuggestions(rowData.outlet, rowData.alamat);
}

// --- Meilisearch Integration ---

async function syncToMeilisearch() {
    const btn = document.getElementById('btn-sync-meili');
    btn.disabled = true;
    btn.innerText = 'Syncing...';

    try {
        const distributor = document.getElementById('distributor').value;
        // 1. Fetch valid outlets from MySQL
        console.log('Fetching valid outlets from MySQL...');
        const [rows] = await connection_mo.execute(
            'SELECT * FROM pj_outlets WHERE outid IS NOT NULL AND outid != ""'
        );
        console.log(`Fetched ${rows.length} records.`);

        if (rows.length === 0) {
            alert('No valid outlets found to sync.');
            return;
        }

        // 2. Transform data
        // Meilisearch needs a valid primary key (alphanumeric, -, _).
        // We will generate a safe 'id' from 'kode_outlet' and keep the original 'kode_outlet' field.
        const documents = rows
            .filter(r => r.kode_outlet && r.kode_outlet.trim() !== '') // Filter out empty kode_outlet
            .map(r => {
                // Sanitize kode_outlet to create a valid ID
                // Replace non-alphanumeric chars with '_'
                const safeId = r.kode_outlet.replace(/[^a-zA-Z0-9\-_]/g, '_');
                return {
                    ...r,
                    id: safeId,
                    alamat: sanitizeAddress(r.alamat) // Sanitize address for better matching
                };
            });

        if (documents.length === 0) {
            alert('No valid records to sync (all have empty outlet codes).');
            return;
        }

        console.log(`Prepared ${documents.length} documents for sync.`);

        // 3. Update Settings (Searchable & Filterable Attributes)
        console.log('Updating Meilsearch settings...');
        await fetch(`${MEILI_HOST}/indexes/${MEILI_INDEX}/settings`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                searchableAttributes: ['outlet', 'alamat', 'kota'],
                filterableAttributes: ['distributor', 'outid'],
                sortableAttributes: ['outid']
            })
        });

        // 4. Upload Documents
        console.log('Uploading documents to Meilisearch...');
        // Use 'id' as the primary key since we sanitized it.
        const response = await fetch(`${MEILI_HOST}/indexes/${MEILI_INDEX}/documents?primaryKey=id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(documents)
        });

        if (!response.ok) {
            throw new Error(`Meilisearch sync failed: ${response.statusText}`);
        }

        const task = await response.json();
        console.log('Meilisearch task enqueued:', task);

        // Poll for task completion
        await waitForTask(task.taskUid);

        alert(`Sync completed successfully! Processed ${documents.length} records.`);

    } catch (error) {
        console.error('Error syncing to Meilisearch:', error);
        alert('Failed to sync: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Sync to Meilisearch';
    }
}

async function waitForTask(taskUid) {
    const btn = document.getElementById('btn-sync-meili');

    while (true) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s

        try {
            const res = await fetch(`${MEILI_HOST}/tasks/${taskUid}`);
            if (!res.ok) throw new Error('Failed to check task status');

            const task = await res.json();
            console.log('Task status:', task.status);
            btn.innerText = `Syncing... (${task.status})`;

            if (task.status === 'succeeded') return;
            if (task.status === 'failed' || task.status === 'canceled') {
                throw new Error(`Task ${task.status}: ${task.error ? task.error.message : 'Unknown error'}`);
            }
        } catch (err) {
            console.warn('Error checking task:', err);
            // Don't break loop on network glitch, but maybe break if persistent?
        }
    }
}

async function searchSuggestions(outletName, address) {
    const tbody = document.querySelector('#suggestions-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Searching Meilisearch...</td></tr>';

    try {
        // Combine name and address for the query or just use the name
        // Meilisearch handles multi-word queries well.
        const query = `${outletName} ${sanitizeAddress(address) || ''}`;

        const searchRes = await fetch(`${MEILI_HOST}/indexes/${MEILI_INDEX}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: query,
                limit: 50,
                attributesToHighlight: ['outlet', 'alamat'],
                // showRankingScore: true // Optional: to see score
            })
        });

        if (!searchRes.ok) {
            // If index not found
            if (searchRes.status === 404) {
                tbody.innerHTML = '<tr><td colspan="5">Index not found. Please Sync first.</td></tr>';
                return;
            }
            throw new Error(`Search failed: ${searchRes.statusText}`);
        }

        const result = await searchRes.json();
        renderSuggestionsTable(result.hits);

    } catch (error) {
        console.error('Error searching suggestions:', error);
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}. Is Meilisearch running?</td></tr>`;
    }
}

function renderSuggestionsTable(hits) {
    const tbody = document.querySelector('#suggestions-table tbody');
    tbody.innerHTML = '';

    if (hits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No matches found in Meilisearch</td></tr>';
        return;
    }

    hits.forEach(hit => {
        const tr = document.createElement('tr');
        // Use formatted (highlighted) text if available, else standard
        const outletDisplay = hit._formatted ? hit._formatted.outlet : hit.outlet;
        const addressDisplay = hit._formatted ? hit._formatted.alamat : hit.alamat;

        tr.innerHTML = `
            <td>${hit.comid || ''}</td>
            <td>${hit.outid || ''}</td>
            <td>${hit.distributor || ''}</td>
            <td>${hit.disid || ''}</td>
            <td>${hit.tipe_outlet || ''}</td>
            <td>${outletDisplay || ''}</td>
            <td>${addressDisplay || ''}</td>
            <td>
                <button class="btn btn-xs btn-primary" onclick='applyMatch(${JSON.stringify(hit).replace(/'/g, "&#39;")})'>Select Match</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- End Meilisearch Integration ---

function applyMatch(matchData) {
    if (selectedUnmappedIndex === null) {
        alert('No unmapped row selected.');
        return;
    }

    // Store the changes
    modifiedRows.set(selectedUnmappedIndex, {
        comid: matchData.comid,
        outid: matchData.outid,
        mrid: matchData.mrid,
        disid: matchData.disid,
        distributor: matchData.distributor,
        tipe_outlet: matchData.tipe_outlet
    });

    // Refresh UI
    renderUnmappedTable();
}

async function saveMapOutletChanges() {
    if (modifiedRows.size === 0) {
        alert('No changes to save.');
        return;
    }

    const confirmSave = confirm(`Are you sure you want to save ${modifiedRows.size} mappings?`);
    if (!confirmSave) return;

    const btn = document.getElementById('btn-save-changes');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        for (const [index, newData] of modifiedRows) {
            const originalRow = unmappedData[index];

            if (!originalRow.kode_outlet) {
                console.error('Cannot update row without kode_outlet:', originalRow);
                continue;
            }

            // Combine original data with modifications
            const finalData = { ...originalRow, ...newData };

            // Upsert logic: Insert or Update if exists
            // We need to ensure we have all values for the INSERT part.
            // Assuming kode_outlet and distributor are the distinct keys.

            await connection_mo.execute(
                `UPDATE pj_outlets
                SET comid=?, outid=?, mrid=?
                WHERE kode_outlet=?`,
                [
                    finalData.comid,
                    finalData.outid,
                    finalData.mrid,
                    finalData.kode_outlet
                ]
            );
        }

        alert('Changes saved successfully!');
        modifiedRows.clear();
        selectedUnmappedIndex = null;
        await loadUnmapped(); // Reload fresh data
        document.querySelector('#suggestions-table tbody').innerHTML = '';

    } catch (error) {
        console.error('Error saving changes:', error);
        alert('Failed to save changes.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Save Changes';
    }
}

// --- Helper Functions ---

function sanitizeAddress(address) {
    if (!address) return '';

    return address
        .toLowerCase()
        // Remove punctuation
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
        // Collapse multiple spaces
        .replace(/\s{2,}/g, ' ')
        // Remove common prefixes/words (exact match surrounded by spaces)
        // We add spaces around the string to ensure we match start/end words too
        .replace(/\s(jalan|jl|jln|jendral|jend|no|nomor|blok|kav|rt|rw|kecamatan|kec|kelurahan|kel|kabupaten|kab|kota)\s/g, ' ')
        .replace(/^(jl|jln)/i, '')
        // Clean up leading/trailing spaces
        .trim();
}

// Exports
window.initMapOutlet = initMapOutlet;
window.applyMatch = applyMatch;
window.saveMapOutletChanges = saveMapOutletChanges;
window.syncToMeilisearch = syncToMeilisearch;
window.handleManualEdit = handleManualEdit;
