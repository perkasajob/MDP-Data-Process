<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h4">Outlet Map</div>
      <div class="q-gutter-sm row items-center">
        <q-select 
          dense filled 
          v-model="searchMethod" 
          :options="['SQL', 'Fuse', 'Meilisearch', 'Google']" 
          label="Search Method" 
          style="min-width: 150px"
        />
        <q-btn color="info" label="Sync to Meilisearch" @click="handleSync" :loading="loadingSync" />
        <q-btn color="positive" label="Save Changes" @click="handleSave" :loading="loadingSave" />
      </div>
    </div>

    <div class="text-h6 q-mt-md">Unmapped Outlets</div>
    <q-table      
      :rows="unmappedData"
      :columns="unmappedColumns"
      row-key="kode_outlet"
      selection="single"
      v-model:selected="selectedUnmapped"
      @selection="handleSelection"
      :pagination="{ rowsPerPage: 10 }"
      wrap-cells
    >
      <template v-slot:body-cell-comid="props">
        <q-td :props="props">
          <q-input 
            v-model="props.row.comid" 
            dense borderless 
            @update:model-value="markModified(props.row)"
          />
        </q-td>
      </template>
      <template v-slot:body-cell-outid="props">
        <q-td :props="props">
          <q-input 
            v-model="props.row.outid" 
            dense borderless 
            @update:model-value="markModified(props.row)"
          />
        </q-td>
      </template>
      <template v-slot:body-cell-mrid="props">
        <q-td :props="props" style="min-width: 200px;">
          <q-select
            v-model="props.row.mrOption"
            use-input
            hide-selected
            fill-input
            input-debounce="300"
            :options="mrOptions"
            option-label="label"
            option-value="value"
            dense borderless
            @filter="filterMr"
            @update:model-value="(val) => updateMr(props.row, val)"
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
      </template>
    </q-table>

    <div class="text-h6 q-mt-lg">Suggestions (Select an unmapped row first)</div>
    <q-table
      :rows="suggestions"
      :columns="suggestionColumns"
      row-key="id"
      :loading="loadingSuggestions"
    >
      <template v-slot:body-cell-action="props">
        <q-td :props="props">
          <q-btn size="sm" color="primary" label="Select" @click="applyMatch(props.row)" />
        </q-td>
      </template>
      <template v-slot:body-cell-outlet="props">
        <q-td :props="props">
            <span v-html="props.row._formatted ? props.row._formatted.outlet : props.row.outlet"></span>
        </q-td>
      </template>
      <template v-slot:body-cell-alamat="props">
        <q-td :props="props">
            <span v-html="props.row._formatted ? props.row._formatted.alamat : props.row.alamat"></span>
        </q-td>
      </template>
    </q-table>

    <!-- SQL Search Dialog -->
    <q-dialog v-model="showSqlDialog" persistent>
      <q-card style="min-width: 500px">
        <q-card-section>
          <div class="text-h6">SQL Search Criteria</div>
        </q-card-section>

        <q-card-section class="q-pt-none q-gutter-sm">
          <q-input dense v-model="sqlSearchParams.outlet" label="Outlet Name" autofocus />
          <q-input dense v-model="sqlSearchParams.alamat" label="Address" />
          <q-input dense v-model="sqlSearchParams.kota" label="City" />
          <q-input dense v-model="sqlSearchParams.comid" label="ComID" />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="negative" v-close-popup />
          <q-btn flat label="Search" color="primary" @click="executeSqlSearch" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { getUnmappedOutlets, saveOutletMappings, searchMeilisearch, searchFuseJs, syncToMeilisearch, searchSql } from '../services/OutletService'
import { searchMr } from '../services/PanelService'

const $q = useQuasar()
const unmappedData = ref([])
const selectedUnmapped = ref([])
const suggestions = ref([])
const modifiedRows = ref(new Set()) // Track modified rows by reference or ID
const searchMethod = ref('SQL')

const loadingSync = ref(false)
const loadingSave = ref(false)
const loadingSuggestions = ref(false)

const mrOptions = ref([])

// SQL Search State
const showSqlDialog = ref(false)
const sqlSearchParams = ref({
  outlet: '',
  alamat: '',
  kota: '',
  comid: ''
})

const unmappedColumns = [
  { name: 'distributor', label: 'Distributor', field: 'distributor', sortable: true, align: 'left' },
  { name: 'outlet', label: 'Outlet', field: 'outlet', sortable: true, align: 'left' },
  { name: 'alamat', label: 'Address', field: 'alamat', align: 'left' },
  { name: 'kota', label: 'City', field: 'kota', sortable: true, align: 'left' },
  { name: 'comid', label: 'ComID', field: 'comid', align: 'left' },
  { name: 'outid', label: 'OutID', field: 'outid', align: 'left' },
  { name: 'mrid', label: 'MR', field: 'mrid', align: 'left' }
]

const suggestionColumns = [
  { name: 'comid', label: 'ComID', field: 'comid', align: 'left' },
  { name: 'outid', label: 'OutID', field: 'outid', align: 'left' },
  { name: 'distributor', label: 'Distributor', field: 'distributor', align: 'left' },
  { name: 'outlet', label: 'Outlet', field: 'outlet', align: 'left' },
  { name: 'alamat', label: 'Address', field: 'alamat', align: 'left' },
  { name: 'action', label: 'Action', field: 'action', align: 'center' }
]

async function loadData() {
  try {
    const rows = await getUnmappedOutlets()
    // Map data to include the option object for the select
    unmappedData.value = rows.map(r => ({
      ...r,
      mrOption: r.mrid ? { label: r.mr_name || `ID: ${r.mrid}`, value: r.mrid } : null
    }))
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load unmapped outlets' })
  }
}

async function handleSelection({ rows, added }) {
  if (added && rows.length > 0) {
    const row = rows[0]

    if (searchMethod.value === 'SQL') {
       // Pre-fill dialog with current values
       sqlSearchParams.value = {
         outlet: row.outlet || '',
         alamat: row.alamat || '',
         kota: row.kota || '',
         comid: ''
       }
       showSqlDialog.value = true
       suggestions.value = [] 
       return
    }

    loadingSuggestions.value = true
    try {
      if (searchMethod.value === 'Google') {
        const { shell } = window.require('electron')
        const query = `${row.outlet} ${row.alamat} ${row.kota}`
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
        shell.openExternal(url)
        loadingSuggestions.value = false
        suggestions.value = []
        return
      }

      const query = `${row.outlet} ${sanitizeAddress(row.alamat)}`
      
      let res;
      if (searchMethod.value === 'Fuse') {
        const distributor = row.distributor;
        res = await searchFuseJs(query, distributor) 
      } else {
        res = await searchMeilisearch(query)
      }

      if (res.hits) {
        suggestions.value = res.hits
      } else {
        suggestions.value = []
        if (res.error) $q.notify({ type: 'warning', message: res.error })
      }
    } catch (e) {
      console.error(e)
    } finally {
      loadingSuggestions.value = false
    }
  } else {
    suggestions.value = []
  }
}

async function executeSqlSearch() {
  loadingSuggestions.value = true
  try {
     const res = await searchSql(sqlSearchParams.value)
     if (res.hits) {
        suggestions.value = res.hits
        // showSqlDialog.value = false // Keep open to refine search? Usually user wants to see result.
        // If we close it, how do they refine? 
        // But if we don't close it, it blocks the view (QDialog is modal).
        // Let's close it.
        showSqlDialog.value = false 
     } else {
        suggestions.value = []
        if (res.error) $q.notify({ type: 'warning', message: res.error })
     }
  } catch(e) {
     $q.notify({ type: 'negative', message: 'Search Error: ' + e.message })
  } finally {
     loadingSuggestions.value = false
  }
}

function markModified(row) {
    modifiedRows.value.add(row)
}

function updateMr(row, val) {
  if (val) {
    row.mrid = val.value
    row.mrOption = val
    markModified(row)
  }
}

async function filterMr(val, update) {
  if (val === '') {
    update(() => {
      mrOptions.value = []
    })
    return
  }
  
  const results = await searchMr(val)
  update(() => {
    mrOptions.value = results
  })
}

function applyMatch(match) {
    if (selectedUnmapped.value.length === 0) return
    const target = selectedUnmapped.value[0]
    
    // Update target
    target.comid = match.comid
    target.outid = match.outid
    
    if (match.mrid) {
        target.mrid = match.mrid
        target.mrOption = { label: match.mr_name || `ID: ${match.mrid}`, value: match.mrid }
    }

    target.distributor = match.distributor 
    
    markModified(target)
    $q.notify({ type: 'positive', message: 'Match applied locally', timeout: 1000 })
}

async function handleSave() {
    if (modifiedRows.value.size === 0) return $q.notify({ type: 'warning', message: 'No changes to save' })
    
    loadingSave.value = true
    try {
        await saveOutletMappings(Array.from(modifiedRows.value))
        $q.notify({ type: 'positive', message: 'Saved successfully' })
        modifiedRows.value.clear()
        selectedUnmapped.value = []
        suggestions.value = []
        await loadData()
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Save Failed: ' + e.message })
    } finally {
        loadingSave.value = false
    }
}

async function handleSync() {
    loadingSync.value = true
    try {
        const task = await syncToMeilisearch()
        $q.notify({ type: 'positive', message: `Sync Enqueued: Task ${task.taskUid}` })
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Sync Failed: ' + e.message })
    } finally {
        loadingSync.value = false
    }
}

function sanitizeAddress(address) {
    if (!address) return '';
    return address
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s(jalan|jl|jln|jendral|jend|no|nomor|blok|kav|rt|rw|kecamatan|kec|kelurahan|kel|kabupaten|kab|kota)\s/g, ' ')
        .replace(/^(jl|jln)/i, '')
        .trim();
}

onMounted(() => {
  loadData()
})
</script>
