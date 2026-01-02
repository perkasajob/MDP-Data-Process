<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h4">Outlet Editor</div>
      <div class="row q-gutter-sm">
        <q-btn color="primary" label="Add Outlet" icon="add" @click="openDialog()" />
      </div>
    </div>

    <!-- Search Filters -->
    <div class="row q-gutter-sm q-mb-md">
      <q-input v-model="filters.kode_outlet" label="Code" dense outlined class="col" @keyup.enter="loadData" />
      <q-input v-model="filters.outlet" label="Outlet Name" dense outlined class="col" @keyup.enter="loadData" />
      <q-input v-model="filters.alamat" label="Address" dense outlined class="col" @keyup.enter="loadData" />
      <q-input v-model="filters.kota" label="City" dense outlined class="col" @keyup.enter="loadData" />
      <q-input v-model="filters.distributor" label="Distributor" dense outlined class="col" @keyup.enter="loadData" />
      <q-input v-model="filters.comid" label="ComID" dense outlined class="col" @keyup.enter="loadData" />
      <q-input v-model="filters.outid" label="OutID" dense outlined class="col" @keyup.enter="loadData" />
      <q-input v-model="filters.mr_name" label="MR Name" dense outlined class="col" @keyup.enter="loadData" />
      <q-btn label="Search" color="secondary" @click="loadData" :loading="loading" />
    </div>

    <q-table
      :rows="rows"
      :columns="columns"
      row-key="kode_outlet"
      :loading="loading"
      :pagination="pagination"
      @request="onRequest"
    >
      <template v-slot:body-cell-actions="props">
        <q-td :props="props" auto-width>
          <q-btn flat round color="primary" icon="edit" size="sm" @click="openDialog(props.row)" />
          <q-btn flat round color="negative" icon="delete" size="sm" @click="confirmDelete(props.row)" />
        </q-td>
      </template>
    </q-table>

    <!-- Edit/Add Dialog -->
    <q-dialog v-model="showDialog" persistent>
        <q-card style="min-width: 500px">
            <q-card-section>
                <div class="text-h6">{{ isEdit ? 'Edit Outlet' : 'Add Outlet' }}</div>
            </q-card-section>

            <q-card-section class="q-gutter-sm">
                <q-input v-model="form.kode_outlet" label="Outlet Code (PK)" :readonly="isEdit" outlined dense :rules="[val => !!val || 'Required']" />
                <q-input v-model="form.outlet" label="Outlet Name" outlined dense />
                <q-input v-model="form.alamat" label="Address" outlined dense type="textarea" rows="2" />
                <q-input v-model="form.kota" label="City" outlined dense />
                <q-input v-model="form.distributor" label="Distributor" outlined dense />
                <q-input v-model="form.comid" label="ComID" outlined dense />
                <q-input v-model="form.outid" label="OutID" outlined dense />
                <q-input v-model="form.mrid" label="MRID" outlined dense />
                
                <q-select
                    v-model="form.mrid"
                    use-input
                    input-debounce="300"
                    label="MR Name"
                    :options="mrOptions"
                    option-value="value"
                    option-label="label"
                    emit-value
                    map-options
                    outlined
                    dense
                    @filter="filterMr"
                >
                    <template v-slot:no-option>
                        <q-item>
                            <q-item-section class="text-grey">
                                No results
                            </q-item-section>
                        </q-item>
                    </template>
                </q-select>
            </q-card-section>

            <q-card-actions align="right">
                <q-btn flat label="Cancel" color="negative" v-close-popup />
                <q-btn flat label="Save" color="positive" @click="save" :loading="saving" />
            </q-card-actions>
        </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { useQuasar } from 'quasar'
import { searchOutlets, saveOutlet, deleteOutlet } from '../services/OutletService'
import { searchMr } from '../services/PanelService'

const $q = useQuasar()
const rows = ref([])
const loading = ref(false)
const showDialog = ref(false)
const saving = ref(false)
const isEdit = ref(false)

// MR Search State
const mrOptions = ref([])

const filters = reactive({
    kode_outlet: '',
    outlet: '',
    alamat: '',
    kota: '',
    distributor: '',
    comid: '', 
    outid: '',
    mr_name: ''
})

const pagination = ref({
    sortBy: 'outlet',
    descending: false,
    page: 1,
    rowsPerPage: 15,
    rowsNumber: 0
})

const columns = [
    { name: 'kode_outlet', label: 'Code', field: 'kode_outlet', align: 'left', sortable: true },
    { name: 'outlet', label: 'Outlet Name', field: 'outlet', align: 'left', sortable: true },
    { name: 'distributor', label: 'Distributor', field: 'distributor', align: 'left', sortable: true },
    { name: 'kota', label: 'City', field: 'kota', align: 'left', sortable: true },
    { name: 'comid', label: 'ComID', field: 'comid', align: 'left' },
    { name: 'outid', label: 'OutID', field: 'outid', align: 'left' },
    { name: 'mrid', label: 'MR', field: 'mr_name', align: 'left' },
    { name: 'actions', label: 'Actions', field: 'actions', align: 'center' }
]

const form = reactive({
    kode_outlet: '',
    outlet: '',
    alamat: '',
    kota: '',
    distributor: '',
    comid: '',
    outid: '',
    mrid: '',
    mr_name: '' // Kept for initialization logic
})

async function loadData(props) {
    loading.value = true
    
    // Handle pagination from q-table request or default
    const currentPagination = props && props.pagination ? props.pagination : pagination.value
    let { page, rowsPerPage } = currentPagination
    if (rowsPerPage === 0) rowsPerPage = 50 // Max if all

    const limit = rowsPerPage
    const offset = (page - 1) * rowsPerPage

    try {
        const data = await searchOutlets(filters, limit, offset)
        rows.value = data
        
        // Update pagination details
        pagination.value.page = page
        pagination.value.rowsPerPage = rowsPerPage
        
        // Pagination logic:
        if (data.length < limit) {
             pagination.value.rowsNumber = offset + data.length
        } else {
             pagination.value.rowsNumber = offset + limit + 1
        } 
        
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Load Error: ' + e.message })
    } finally {
        loading.value = false
    }
}

function onRequest(props) {
    loadData(props)
}

function openDialog(row = null) {
    if (row) {
        isEdit.value = true
        Object.assign(form, row)
        // Initialize mrOptions so the current value is displayed correctly
        if (row.mrid && row.mr_name) {
            mrOptions.value = [{ value: row.mrid, label: row.mr_name }]
        } else {
            mrOptions.value = []
        }
    } else {
        isEdit.value = false
        Object.assign(form, {
            kode_outlet: '',
            outlet: '',
            alamat: '',
            kota: '',
            distributor: '',
            comid: '',
            outid: '',
            mrid: '',
            mr_name: ''
        })
        mrOptions.value = []
    }
    showDialog.value = true
}

function filterMr (val, update, abort) {
    if (val.length < 2) {
        abort()
        return
    }

    update(() => {
        searchMr(val).then(data => {
            console.log(data)
            mrOptions.value = data
        }).catch(err => {
            console.error('MR search failed', err);
            // Optionally clear options or show error
        })
    })
}

async function save() {
    if (!form.kode_outlet) {
        $q.notify({ type: 'warning', message: 'Kode Outlet is required' })
        return
    }
    saving.value = true
    try {
        await saveOutlet({ ...form })
        $q.notify({ type: 'positive', message: 'Saved successfully' })
        showDialog.value = false
        loadData()
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Save Failed: ' + e.message })
    } finally {
        saving.value = false
    }
}

function confirmDelete(row) {
    $q.dialog({
        title: 'Confirm Delete',
        message: `Delete outlet ${row.outlet} (${row.kode_outlet})?`,
        cancel: true,
        persistent: true
    }).onOk(async () => {
        try {
            await deleteOutlet(row.kode_outlet)
            $q.notify({ type: 'positive', message: 'Deleted' })
            loadData()
        } catch (e) {
            $q.notify({ type: 'negative', message: 'Delete Failed: ' + e.message })
        }
    })
}

onMounted(() => {
    loadData()
})

</script>
