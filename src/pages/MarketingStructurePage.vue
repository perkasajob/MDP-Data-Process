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
         <q-btn icon="refresh" @click="loadData" round flat />
      </div>
    </div>

    <!-- Toolbar -->
    <div class="q-mb-md row q-gutter-sm">
        <q-btn color="primary" icon="add" label="Add Row" @click="addNewRow" />
        <q-btn color="positive" icon="save" label="Save" @click="saveAll" :loading="saving" />
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
            class="sticky-header"
            :row-class="getRowClass"
        >
            <template v-slot:header="props">
                <q-tr :props="props">
                    <q-th v-for="col in props.cols" :key="col.name" :props="props" class="resizable-th">
                        {{ col.label }}
                    </q-th>
                </q-tr>
            </template>

            <template v-slot:body="props">
                <q-tr :props="props" :class="getRowClass(props.row)">
                    <q-td key="pejid" :props="props">
                        {{ props.row.pejid }}
                    </q-td>
                    <q-td key="nama_pejabat" :props="props">
                        <q-input 
                            v-model="props.row.nama_pejabat" 
                            dense borderless 
                            input-class="text-body2" 
                            @update:model-value="markDirty(props.row)"
                        />
                    </q-td>
                    <q-td key="kode" :props="props">
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
                    <q-td key="comid" :props="props">
                         <q-input 
                            v-model="props.row.comid" 
                            dense borderless 
                            input-class="text-body2" 
                            @update:model-value="markDirty(props.row)"
                        />
                    </q-td>
                    <q-td key="checker_name" :props="props" style="min-width: 250px;">
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
    copyPreviousMonthData
} from '../services/MarketingService'

const $q = useQuasar()

const filterYear = ref(parseInt(dayjs().format('YYYY')))
const filterMonth = ref(parseInt(dayjs().format('MM')))

const rows = ref([])
const loading = ref(false)
const saving = ref(false)

const jabatanOptions = ref([])
const checkerOptions = ref([])

const columns = [
  { name: 'pejid', label: 'Pej ID', field: 'pejid', align: 'left', sortable: true, style: 'width: 30px', headerStyle: 'width: 30px' },
  { name: 'nama_pejabat', label: 'Nama Pejabat', field: 'nama_pejabat', align: 'left', sortable: true, style: 'min-width: 250px', headerStyle: 'min-width: 250px' },
  { name: 'kode', label: 'Jabatan', field: 'kode', align: 'left', sortable: true, style: 'width: 30px', headerStyle: 'width: 30px' },
  { name: 'comid', label: 'Com ID', field: 'comid', align: 'left', sortable: true, style: 'width: 20px', headerStyle: 'width: 20px' },
  { name: 'checker_name', label: 'Checker', field: 'checker_name', align: 'left', sortable: true, style: 'min-width: 250px', headerStyle: 'min-width: 250px' },
]

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

        let data = await getMarketingStructure(filterYear.value, filterMonth.value)

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

onMounted(() => {
    loadData()
})
</script>

<style scoped>
.w-100 {
    width: 100px;
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
</style>
