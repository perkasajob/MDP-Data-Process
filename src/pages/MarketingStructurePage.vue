<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h4">Marketing Structure</div>
      <div class="row q-gutter-sm items-center">
         <q-input 
            v-model.number="filterYear" 
            label="Year" 
            type="number" 
            dense filled 
            class="w-100" 
            @change="loadData"
        />
         <q-input 
            v-model.number="filterMonth" 
            label="Month" 
            type="number" 
            dense filled 
            class="w-100" 
            min="1"
            max="12"
            @change="loadData"
        />        
        <q-select
            v-model="filterCheckerName"
            label="Filter Checker"
            dense filled
            class="w-150"
            use-input
            hide-selected
            fill-input
            input-debounce="300"
            :options="filterCheckerOptions"
            @filter="filterCheckerFn"
            @input-value="val => filterCheckerName = val"
            @keyup.enter="loadData"
            clearable
            @clear="loadData"
        >
            <template v-slot:no-option>
                <q-item>
                    <q-item-section class="text-grey">
                        No results
                    </q-item-section>
                </q-item>
            </template>
        </q-select>
        <q-select
            v-model="filterNamaPejabat"
            label="Filter Nama"
            dense filled
            class="w-150"
            use-input
            hide-selected
            fill-input
            input-debounce="300"
            :options="filterNamaOptions"
            @filter="filterNamaFn"
            @input-value="val => filterNamaPejabat = val"
            @keyup.enter="loadData"
            clearable
            @clear="loadData"
        >
            <template v-slot:no-option>
                <q-item>
                    <q-item-section class="text-grey">
                        No results
                    </q-item-section>
                </q-item>
            </template>
        </q-select>
         <q-btn icon="search" @click="loadData" round flat />
      </div>
    </div>

    <!-- Toolbar -->
    <div class="q-mb-md row q-gutter-sm">
        <q-btn color="primary" icon="add" label="Add Row" @click="addNewRow" />
        <q-btn color="positive" icon="save" label="Save" @click="saveAll" :loading="saving" />
        <q-btn color="secondary" icon="download" label="Export CSV" @click="exportCSV" :loading="exporting" />
    </div>

    <div class="table-container shadow-2">
        <q-table
            :rows="rows"
            :columns="columns"
            row-key="pejid"
            :loading="loading"
            flat 
            :pagination="{ rowsPerPage: 0 }" 
            separator="cell"
            class="sticky-header compact-table"
            :row-class="getRowClass"
            table-style="table-layout: fixed; width: 100%; border-collapse: collapse;"
        >
            <template v-slot:header="props">
                <q-tr :props="props">
                    <q-th v-for="col in props.cols" :key="col.name" :props="props" class="resizable-th" :style="col.headerStyle">
                        <div class="row justify-between items-center no-wrap" style="width: 100%">
                            <span>{{ col.label }}</span>
                            <div 
                                class="resizer" 
                                @mousedown.stop.prevent="startResize($event, col.name)"
                            ></div>
                        </div>
                    </q-th>
                </q-tr>
            </template>

            <template v-slot:body="props">
                <q-tr :props="props" :class="getRowClass(props.row)">
                    <q-td key="checker_name" :props="props" :style="getColStyle('checker_name')">
                        <q-select
                            v-model="props.row.checkerOption"
                            use-input
                            input-debounce="300"
                            :options="checkerOptions"
                            option-label="nama_pejabat"
                            option-value="pejid"
                            dense borderless
                            options-dense
                            @filter="filterCheckers"
                            @update:model-value="val => { 
                                props.row.checker = val ? val.pejid : null; 
                                props.row.checker_name = val ? val.nama_pejabat : '';
                                markDirty(props.row);
                            }"
                        >
                             <template v-slot:no-option>
                                <q-item>
                                    <q-item-section class="text-grey">
                                    No results
                                    </q-item-section>
                                </q-item>
                            </template>
                        </q-select>
                    </q-td>
                    <q-td key="pejid" :props="props" :style="getColStyle('pejid')">
                        {{ props.row.pejid }}
                    </q-td>
                    <q-td key="nama_pejabat" :props="props" :style="getColStyle('nama_pejabat')">
                        <q-input 
                            v-model="props.row.nama_pejabat" 
                            dense borderless 
                            input-class="text-body2" 
                            @update:model-value="markDirty(props.row)"
                        />
                    </q-td>
                    <q-td key="kode" :props="props" :style="getColStyle('kode')">
                        <q-select 
                            v-model="props.row.jabOption" 
                            :options="jabatanOptions" 
                            option-label="kode" 
                            option-value="jabid"
                            dense borderless
                            options-dense
                            @update:model-value="val => { 
                                props.row.jabid = val ? val.jabid : null; 
                                props.row.kode = val ? val.kode : '';
                                markDirty(props.row);
                            }"
                        />
                    </q-td>
                    <q-td key="comid" :props="props" :style="getColStyle('comid')">
                         <q-input 
                            v-model="props.row.comid" 
                            dense borderless 
                            input-class="text-body2" 
                            @update:model-value="markDirty(props.row)"
                        />
                    </q-td>
                    <q-td key="actions" :props="props" :style="getColStyle('actions')">
                        <q-btn 
                            icon="delete" 
                            color="negative" 
                            flat round dense 
                            @click="confirmDelete(props.row)"
                        />
                    </q-td>
                </q-tr>
            </template>
        </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import dayjs from 'dayjs'
import { 
    getMarketingStructure, 
    getJabatanOptions, 
    getNewPejId, 
    saveMarketingRow,
    searchPejabat,
    copyPreviousMonthData,
    deleteMarketingStructure,
    exportMarketingStructure
} from '../services/MarketingService'

const $q = useQuasar()

const filterYear = ref(parseInt(dayjs().format('YYYY')))
const filterMonth = ref(parseInt(dayjs().format('MM')))
const filterNamaPejabat = ref('')
const filterCheckerName = ref('')

const rows = ref([])
const loading = ref(false)
const saving = ref(false)
const exporting = ref(false)

const jabatanOptions = ref([])
const checkerOptions = ref([])
const filterNamaOptions = ref([])
const filterCheckerOptions = ref([])

const columns = ref([
    { name: 'checker_name', label: 'Checker', field: 'checker_name', align: 'left', sortable: true, style: 'width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;', headerStyle: 'width: 300px' },
    { name: 'pejid', label: 'Pej ID', field: 'pejid', align: 'left', sortable: true, style: 'width: 60px', headerStyle: 'width: 60px' },
    { name: 'nama_pejabat', label: 'Nama Pejabat', field: 'nama_pejabat', align: 'left', sortable: true, style: 'width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;', headerStyle: 'width: 300px' },
    { name: 'kode', label: 'Jabatan', field: 'kode', align: 'left', sortable: true, style: 'width: 80px', headerStyle: 'width: 80px' },
    { name: 'comid', label: 'ComID', field: 'comid', align: 'left', sortable: true, style: 'width: 40px', headerStyle: 'width: 40px' },
    { name: 'actions', label: 'Actions', field: 'actions', align: 'center', style: 'width: 40px', headerStyle: 'width: 40px' }
])

function getColStyle(name) {
    const col = columns.value.find(c => c.name === name)
    return col ? col.style : ''
}

// Resizing Logic
const draggingColumn = ref(null)
const startX = ref(0)
const startWidth = ref(0)

function startResize(e, colName) {
    const col = columns.value.find(c => c.name === colName)
    if (!col) return
    
    draggingColumn.value = col
    startX.value = e.pageX
    // Simple parse of width
    const match = col.style ? col.style.match(/width:\s*(\d+)px/) : null
    startWidth.value = match ? parseInt(match[1]) : 100
    
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
}

function onMouseMove(e) {
    if (!draggingColumn.value) return
    const diff = e.pageX - startX.value
    const newWidth = Math.max(50, startWidth.value + diff)
    
    // Update style and headerStyle
    const styleStr = `width: ${newWidth}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
    draggingColumn.value.style = styleStr
    draggingColumn.value.headerStyle = `width: ${newWidth}px`
}

function onMouseUp() {
    draggingColumn.value = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
}

function getRowClass(row) {
    if (row.isDirty) return 'bg-yellow-1'
    return ''
}

function markDirty(row) {
    row.isDirty = true
}

async function loadData() {
    loading.value = true
    try {
        if (jabatanOptions.value.length === 0) {
            jabatanOptions.value = await getJabatanOptions()
        }

        let data = await getMarketingStructure(filterYear.value, filterMonth.value, {
            nama_pejabat: filterNamaPejabat.value,
            checker_name: filterCheckerName.value
        })

        // Check for empty data in current/future month
        const targetDate = dayjs(`${filterYear.value}-${filterMonth.value}-01`)
        const now = dayjs().startOf('month')
        
        if (data.length === 0 && (targetDate.isSame(now) || targetDate.isAfter(now))) {
             await new Promise(resolve => {
                $q.dialog({
                    title: 'No Data Found',
                    message: `No records found for ${targetDate.format('MMMM YYYY')}. Do you want to copy records from the previous month?`,
                    cancel: true,
                    persistent: true
                }).onOk(async () => {
                    try {
                        loading.value = true
                        await copyPreviousMonthData(filterYear.value, filterMonth.value)
                        $q.notify({ type: 'positive', message: 'Records copied successfully' })
                        data = await getMarketingStructure(filterYear.value, filterMonth.value)
                    } catch (err) {
                        $q.notify({ type: 'negative', message: 'Failed to copy records: ' + err.message })
                    }
                    resolve()
                }).onCancel(() => {
                    resolve()
                })
             })
        }
        
        rows.value = data.map(r => ({
            ...r,
            jabOption: r.jabid ? jabatanOptions.value.find(j => j.jabid === r.jabid) || { jabid: r.jabid, kode: r.kode } : null,
            checkerOption: r.checker ? { pejid: r.checker, nama_pejabat: r.checker_name } : null,
            isDirty: false // init as clean
        }))

    } catch (e) {
        $q.notify({ type: 'negative', message: 'Error loading data: ' + e.message })
    } finally {
        loading.value = false
    }
}

async function addNewRow() {
    try {
        const newId = await getNewPejId()
        let maxLocal = 0
        rows.value.forEach(r => { if(r.pejid > maxLocal) maxLocal = r.pejid })
        // If we have rows, check if last one is empty to prevent spam? No, user might mass add.
        
        const finalId = Math.max(newId, maxLocal + 1)

        const newRow = {
            pejid: finalId,
            nama_pejabat: '',
            kode: '',
            jabid: null,
            comid: '',
            checker: null,
            checker_name: '',
            jabOption: null,
            checkerOption: null,
            isNew: true,
            isDirty: true // New rows are dirty
        }
        rows.value.unshift(newRow)
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Error generating ID: ' + e.message })
    }
}

async function saveAll() {
    saving.value = true
    let successCount = 0
    let errors = []
    
    // Only save dirty rows
    const dirtyRows = rows.value.filter(r => r.isDirty)
    if (dirtyRows.length === 0) {
        $q.notify({ type: 'info', message: 'No changes to save' })
        saving.value = false
        return
    }

    try {
        for (const row of dirtyRows) {
            try {
                await saveMarketingRow(row, filterYear.value, filterMonth.value)
                successCount++
                row.isDirty = false // Reset dirty
                row.isNew = false
            } catch (err) {
                console.error(err)
                errors.push(`Row ${row.pejid}: ${err.message}`)
            }
        }

        if (errors.length > 0) {
            $q.notify({ 
                type: 'warning', 
                message: `Saved ${successCount} rows. Errors: ${errors.length}`,
                caption: errors[0]
            })
        } else {
            $q.notify({ type: 'positive', message: 'Saved Successfully' })
        }
        // Optional: Reload to ensure IDs/Consistency? 
        // If we reload, we lose visual context if user was doing something, but data is fresh.
        // It's safer to reload.
        await loadData()
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Save Loop Error: ' + e.message })
    } finally {
        saving.value = false
    }
}

function confirmDelete(row) {
    if (row.isNew) {
        rows.value = rows.value.filter(r => r !== row)
        return
    }

    $q.dialog({
        title: 'Confirm Delete',
        message: `Are you sure you want to delete ${row.nama_pejabat}?`,
        cancel: true,
        persistent: true
    }).onOk(async () => {
        try {
            loading.value = true
            await deleteMarketingStructure(row.pejid, filterYear.value, filterMonth.value)
            
            // 1. Immediate local update for better UX (using != for type safety)
            rows.value = rows.value.filter(r => r.pejid != row.pejid)
            
            $q.notify({ type: 'positive', message: 'Row deleted' })
            
            // 2. Full refresh from server to ensure state is perfectly synced
            await loadData()
        } catch (e) {
            $q.notify({ type: 'negative', message: 'Delete failed: ' + e.message })
        } finally {
            loading.value = false
        }
    })
}

async function filterCheckers (val, update) {
    if (val === '') {
        update(() => {
            checkerOptions.value = [] 
        })
        return
    }

    // Now uses Year/Month filter for better context if required
    const results = await searchPejabat(val, filterYear.value, filterMonth.value)
    update(() => {
        checkerOptions.value = results
    })
}

async function filterNamaFn(val, update) {
    if (val === '') {
        update(() => { filterNamaOptions.value = [] })
        return
    }
    const results = await searchPejabat(val, filterYear.value, filterMonth.value)
    update(() => {
        const names = results.map(r => r.nama_pejabat)
        filterNamaOptions.value = [...new Set(names)]
    })
}

async function filterCheckerFn(val, update) {
    if (val === '') {
        update(() => { filterCheckerOptions.value = [] })
        return
    }
    const results = await searchPejabat(val, filterYear.value, filterMonth.value)
    update(() => {
        const names = results.map(r => r.nama_pejabat)
        filterCheckerOptions.value = [...new Set(names)]
    })
}

async function exportCSV() {
    exporting.value = true
    try {
        const filePath = await exportMarketingStructure(filterYear.value, filterMonth.value)
        $q.notify({ 
            type: 'positive', 
            message: `Exported successfully: ${filePath}`,
            timeout: 5000
        })
        // Try opening the folder?
        const { shell } = window.require('electron')
        shell.showItemInFolder(filePath)
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Export failed: ' + e.message })
    } finally {
        exporting.value = false
    }
}

onMounted(() => {
    loadData()
})
</script>

<style scoped>
.w-100 {
    width: 100px;
}
.w-150 {
    width: 150px;
}
.table-container {
    overflow-x: auto; /* Make table width adjustable/scrollable */
    width: 100%;
    resize: vertical; /* Let user resize height if they want? Or maybe horizontal */
    /* resize: horizontal; overflow: auto; -- blocked by page width usually */
}
/* Sticky header */
.sticky-header :deep(.q-table__top),
.sticky-header :deep(.q-table__bottom),
.sticky-header :deep(thead tr:first-child th) {
  /* bg color is important for th; just specify one */
  background-color: #fff; 
}
.sticky-header :deep(thead tr:first-child th) {
  position: sticky;
  top: 0;
  opacity: 1;
  z-index: 1;
}
.resizer {
    width: 6px;
    height: 100%;
    position: absolute;
    right: 0;
    top: 0;
    cursor: col-resize;
    z-index: 100;
}
.resizer:hover{
    background-color: #2196f3;
}
.sticky-header :deep(.q-table) {
    table-layout: fixed;
}
.sticky-header :deep(td),
.sticky-header :deep(th) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Compact Table Styles */
.compact-table :deep(th),
.compact-table :deep(td) {
    font-size: 12px !important;
    padding: 2px 4px !important;
    height: 28px !important;
}

.compact-table :deep(.q-field--dense .q-field__control),
.compact-table :deep(.q-field--dense .q-field__marginal) {
    height: 24px !important;
    min-height: 24px !important;
}

.compact-table :deep(.q-field__native),
.compact-table :deep(.q-field__input) {
    font-size: 12px !important;
}

.compact-table :deep(.q-btn--flat.q-btn--dense) {
    padding: 2px !important;
    min-height: unset !important;
}
</style>
