<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h4">Panel Editor</div>
      <div class="q-gutter-sm">
        <q-btn color="primary" label="Add Row" icon="add" @click="addNewRow" />
        <q-btn color="secondary" label="Refresh" icon="refresh" @click="loadData" :loading="loading" />
      </div>
    </div>

    <q-table
      title="Sales Panel Data"
      :rows="rows"
      :columns="columns"
      row-key="nomor_faktur"
      :loading="loading"
      :pagination="{ rowsPerPage: 15 }"
    >
      <!-- Nomor Faktur Edit -->
      <template v-slot:body-cell-nomor_faktur="props">
        <q-td :props="props">
          <q-input 
            v-model.number="props.row.nomor_faktur" 
            type="number" 
            dense borderless 
            debounce="500"
            @change="handleSave(props.row)"
          />
        </q-td>
      </template>

      <!-- ProID Edit -->
      <template v-slot:body-cell-proid="props">
        <q-td :props="props">
          <q-input 
            v-model.number="props.row.proid" 
            type="number" 
            dense borderless 
            debounce="500"
            @change="handleSave(props.row)"
          />
        </q-td>
      </template>

      <!-- MRID Autocomplete -->
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

      <!-- Actions -->
      <template v-slot:body-cell-actions="props">
        <q-td :props="props" auto-width>
          <q-btn flat round color="negative" icon="delete" size="sm" @click="confirmDelete(props.row)" />
        </q-td>
      </template>
    </q-table>
    
    <div class="q-mt-xl">
      <div class="text-h5 q-mb-md">Search Sales</div>
      <div class="row q-gutter-sm q-mb-md">
        <q-input v-model="salesFilters.nomor_faktur" label="Nomor Faktur" dense outlined class="col" @keyup.enter="searchSales" />
        <q-input v-model="salesFilters.outid" label="OutID" dense outlined class="col" @keyup.enter="searchSales" />
        <q-input v-model="salesFilters.outlet_name" label="Outlet Name" dense outlined class="col" @keyup.enter="searchSales" />
        <q-input v-model="salesFilters.nama_produk" label="Product Name" dense outlined class="col" @keyup.enter="searchSales" />
        <q-input v-model="salesFilters.mr_name" label="MR Name" dense outlined class="col" @keyup.enter="searchSales" />
        <q-btn label="Search" color="primary" @click="searchSales" :loading="salesLoading" />
      </div>

      <q-table
        :rows="salesRows"
        :columns="salesColumns"
        row-key="nomor_faktur"
        :loading="salesLoading"
        :pagination="{ rowsPerPage: 15 }"
        class="cursor-pointer"
      >
        <template v-slot:body-cell-net_value="props">
            <q-td :props="props">
                {{ props.row.total_net.toLocaleString() }}
            </q-td>
        </template>
        
        <template v-slot:body-cell-actions="props">
            <q-td :props="props">
                <q-btn color="primary" label="Select" size="sm" @click="onSelectSales(props.row)" />
            </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { getPanelData, searchMr, savePanelRow, deletePanelRow, searchPjSales } from '../services/PanelService'

const $q = useQuasar()
const rows = ref([])
const loading = ref(false)
const mrOptions = ref([])

// Sales Search State
const salesRows = ref([])
const salesLoading = ref(false)
const salesFilters = ref({
    nomor_faktur: '',
    outid: '',
    outlet_name: '',
    nama_produk: '',
    mr_name: ''
})
const salesColumns = [
    { name: 'nomor_faktur', label: 'Nomor Faktur', field: 'nomor_faktur', sortable: true, align: 'left' },
    { name: 'tanggal_faktur', label: 'Tanggal', field: 'tanggal_faktur', sortable: true, align: 'left', format: val => {
        if (!val) return ''
        const d = new Date(val)
        return isNaN(d.getTime()) ? val : d.toISOString().split('T')[0]
    }},
    { name: 'outid', label: 'OutID', field: 'outid', sortable: true, align: 'left' },
    { name: 'outlet_name', label: 'Outlet Name', field: 'outlet_name', sortable: true, align: 'left' },
    { name: 'nama_produk', label: 'Product Name', field: 'nama_produk', sortable: true, align: 'left' },
    { name: 'mr_name', label: 'MR Name', field: 'mr_name', sortable: true, align: 'left' },
    { name: 'net_value', label: 'Total Net', field: 'total_net', sortable: true, align: 'right' },
    { name: 'quantity', label: 'Total Qty', field: 'total_qty', sortable: true, align: 'right' },
    { name: 'actions', label: 'Action', field: 'actions', align: 'center' },
]

const columns = [
  { name: 'nomor_faktur', label: 'Nomor Faktur', field: 'nomor_faktur', sortable: true, align: 'left' },
  { name: 'proid', label: 'Pro ID', field: 'proid', sortable: true, align: 'left' },
  { name: 'mrid', label: 'MR (Search Name)', field: 'mrid', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' }
]

async function loadData() {
  loading.value = true
  try {
    const data = await getPanelData()
    // Map data to include the option object for the select
    rows.value = data.map(r => ({
      ...r,
      mrOption: r.mrid ? { label: r.mr_name || `ID: ${r.mrid}`, value: r.mrid } : null
    }))
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load data: ' + e.message })
  } finally {
    loading.value = false
  }
}

function addNewRow() {
  rows.value.unshift({
    nomor_faktur: 0,
    proid: null,
    mrid: null,
    mrOption: null,
    isNew: true
  })
}

async function handleSave(row) {
  try {
    await savePanelRow({
      nomor_faktur: row.nomor_faktur,
      proid: row.proid,
      mrid: row.mrOption ? row.mrOption.value : null
    })
    $q.notify({ type: 'positive', message: 'Saved', timeout: 500 })
    row.isNew = false
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Save failed: ' + e.message })
  }
}

function updateMr(row, val) {
  if (val) {
    row.mrid = val.value
    row.mrOption = val
    handleSave(row)
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

function confirmDelete(row) {
  $q.dialog({
    title: 'Confirm',
    message: 'Delete this row?',
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      if (!row.isNew) {
        await deletePanelRow(row.nomor_faktur)
      }
      rows.value = rows.value.filter(r => r !== row)
      $q.notify({ type: 'positive', message: 'Deleted' })
    } catch (e) {
      $q.notify({ type: 'negative', message: 'Delete failed: ' + e.message })
    }
  })
}

async function searchSales() {
    salesLoading.value = true
    try {
        const results = await searchPjSales(salesFilters.value)
        salesRows.value = results
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Search failed: ' + e.message })
    } finally {
        salesLoading.value = false
    }
}

async function onSelectSales(row) {
    // Check if already exists
    const existing = rows.value.find(r => r.nomor_faktur == row.nomor_faktur && r.proid == row.proid)
    if (existing) {
        $q.notify({ type: 'warning', message: `Invoice ${row.nomor_faktur} with Product ID ${row.proid} already exists in Panel Data` })
        return
    }

    // Add to rows
    const newEntry = {
        nomor_faktur: row.nomor_faktur,
        proid: row.proid || null,
        mrid: row.mrid || null,
        mrOption: row.mrid ? { label: `ID: ${row.mrid}`, value: row.mrid } : null,
        isNew: false // We are saving immediately
    }

    // Pre-resolve MR name if possible?
    // User didn't ask, but would be nice. For now existing logic handles ID display.

    rows.value.unshift(newEntry)
    
    // Save
    try {
        await savePanelRow(newEntry)
        $q.notify({ type: 'positive', message: `Added ${row.nomor_faktur}` })
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Failed to add panel row: ' + e.message })
    }
}

onMounted(() => {
  loadData()
})
</script>
