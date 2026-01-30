<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h4">Data Process</div>
      <div class="row q-gutter-sm">
        <q-btn color="primary" icon="folder" label="Data" @click="handleOpenData" />
        <q-btn color="info" icon="folder_open" label="Report" @click="handleOpenReport" />
      </div>

      
    </div>
    
    <div class="q-gutter-md max-w-600">
      <q-select
        filled
        v-model="distributor"
        :options="distributorOptions"
        label="Distributor"
      />
      

      <q-select
        filled
        v-model="ecatFilter"
        :options="['ECAT', 'Non ECAT', 'All']"
        label="ECAT Filter"
      />

      <div class="row q-col-gutter-sm">
        <div class="col-12">
          <q-select
            filled
            v-model="reportRange"
            :options="['yesterday', 'this month', 'last month', 'this year']"
            label="Report Time Range"
            clearable
          />
        </div>
        <div class="col-6">
          <q-input
            filled
            v-model="startDate"
            type="date"
            label="Report Start Date"
            stack-label
          />
        </div>
        <div class="col-6">
          <q-input
            filled
            v-model="endDate"
            type="date"
            label="Report End Date"
            stack-label
          />
        </div>
      </div>

      
      <!-- File Picker -->
      <!-- Since electron has access to FS, we might just want a path, but browser file input gives File object. 
           In Node context, file.path gives the absolute path (in Electron) -->
      <q-file
        filled
        v-model="salesFile"
        label="Sales Document"
        accept=".csv,.xlsx,.dbf"
      >
        <template v-slot:prepend>
          <q-icon name="attach_file" />
        </template>
      </q-file>
      <q-file
        filled
        v-model="updateFile"
        label="Update Outlets (CSV)"
        accept=".csv"
      >
        <template v-slot:prepend>
          <q-icon name="edit_document" />
        </template>
        <template v-slot:after>
          <q-btn round dense flat icon="upload" @click="handleUpdateOutlets" :loading="loadingUpdate" />
        </template>
      </q-file>
      
      <div class="row q-gutter-sm">
        <q-btn color="primary" label="Get FTP" @click="handleGetFtp" :loading="loadingFtp" />
        <q-btn color="secondary" label="Submit" @click="handleSubmit" :loading="loadingSubmit" />
        <q-btn color="accent" label="Create Sales Report" @click="handleCreateReport" :loading="loadingReport" />
        <q-btn color="deep-purple" icon="send" label="Telegram Report" @click="handleTelegramReport" :loading="loadingTelegram" />
      </div>



    </div>
  </q-page>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { processSales, createSalesReport, sendTelegramReport } from '../services/SalesService'
import { updateOutletsFromCsv } from '../services/OutletService'
import { downloadFtpFiles } from '../services/FtpService'
import dayjs from 'dayjs'
import { HOME_DIR } from '../const'

const $q = useQuasar()
const distributor = ref('APL')
const distributorOptions = ['APL', 'TSJ', 'PPG', 'ALL']
const ecatFilter = ref('Non ECAT')
const salesFile = ref(null)

const reportRange = ref('yesterday')
const getYesterdayStr = () => {
  const today = dayjs()
  // If today is Monday (1), return Saturday (subtract 2 days), else return yesterday (subtract 1 day)
  const daysToSubtract = today.day() === 1 ? 2 : 1
  return today.subtract(daysToSubtract, 'day').format('YYYY-MM-DD')
}

const yesterdayStr = getYesterdayStr()
const startDate = ref(yesterdayStr)
const endDate = ref(yesterdayStr)

const loadingFtp = ref(false)
const loadingSubmit = ref(false)
const loadingReport = ref(false)
const loadingTelegram = ref(false)
const loadingUpdate = ref(false)
const updateFile = ref(null)

watch(reportRange, (val) => {
  if (!val) return
  const today = dayjs()
  if (val === 'yesterday') {
    const yestStr = getYesterdayStr()
    startDate.value = yestStr
    endDate.value = yestStr
  } else if (val === 'this month') {
    startDate.value = today.startOf('month').format('YYYY-MM-DD')
    endDate.value = today.format('YYYY-MM-DD')
  } else if (val === 'last month') {
    startDate.value = today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD')
    endDate.value = today.subtract(1, 'month').endOf('month').format('YYYY-MM-DD')
  } else if (val === 'this year') {
    startDate.value = today.startOf('year').format('YYYY-MM-DD')
    endDate.value = today.format('YYYY-MM-DD')
  }
})

async function handleGetFtp() {
  loadingFtp.value = true
  try {
    const results = await downloadFtpFiles()
    let msg = 'FTP Download Completed.<br>'
    results.forEach(r => {
        msg += `${r.file}: ${r.status}<br>`
    })
    $q.notify({
      type: 'info',
      message: msg,
      html: true,
      timeout: 5000
    })
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: 'FTP Error: ' + e.message
    })
  } finally {
    loadingFtp.value = false
  }
}

async function handleSubmit() {
  if (!distributor.value) return $q.notify({ type: 'warning', message: 'Select Distributor' })
  // For file, we pass the path if it exists
  let filePath = null
  if (salesFile.value) {
      try {
          const { webUtils } = window.require('electron')
          filePath = webUtils.getPathForFile(salesFile.value)
      } catch (e) {
          // Fallback or old behavior
          filePath = salesFile.value.path
      }
  }
  
  loadingSubmit.value = true
  try {
    await processSales(distributor.value, startDate.value, filePath)
    $q.notify({ type: 'positive', message: 'Sales Processed Successfully' })
  } catch (e) {
    console.error(e)
    $q.notify({ type: 'negative', message: 'Processing Error: ' + e.message })
  } finally {
    loadingSubmit.value = false
  }
}

async function handleCreateReport() {
  loadingReport.value = true
  try {
    const res = await createSalesReport(ecatFilter.value, startDate.value, endDate.value)
    $q.notify({ 
        type: 'positive', 
        message: `Report Created: ${res.fullPath} (${res.unmatchedCount} unmatched)`,
        timeout: 5000
    })
  } catch (e) {
    console.error(e)
    $q.notify({ type: 'negative', message: 'Report Error: ' + e.message })
  } finally {
    loadingReport.value = false
  }
}

async function handleTelegramReport() {
  loadingTelegram.value = true
  try {
    const results = await sendTelegramReport(startDate.value, endDate.value)
    $q.notify({ 
        type: 'positive', 
        message: `Telegram Report Sent. Valid: ${results.sent}, Skipped: ${results.skipped}`,
        timeout: 5000
    })
  } catch (e) {
    console.error(e)
    $q.notify({ type: 'negative', message: 'Telegram Error: ' + e.message })
  } finally {
    loadingTelegram.value = false
  }
}

function handleOpenData() {
  try {
    const { shell } = window.require('electron')
    const path = window.require('path')
    const fs = window.require('fs')
    
    
    // Use global HOME_DIR with absolute path    
    const dataPath = path.join(HOME_DIR, 'data')
    
    if (!fs.existsSync(dataPath)) {
      $q.notify({ 
        type: 'warning', 
        message: `Folder not found at: ${dataPath}`,
        timeout: 5000
      })
      return
    }

    shell.openPath(dataPath).then((err) => {
      if (err) {
        $q.notify({ type: 'negative', message: `Failed to open: ${err}` })
      } else {
        // Optional: notify success for debugging
        // $q.notify({ type: 'positive', message: `Opened: ${dataPath}` })
      }
    })
  } catch (error) {
    console.error(error)
    $q.notify({ type: 'negative', message: `Error: ${error.message}` })
  }
}

function handleOpenReport() {
  const { shell } = window.require('electron')
  const path = window.require('path')
  const reportPath = path.join(HOME_DIR, 'report')
  shell.openPath(reportPath).then((err) => {
    if (err) $q.notify({ type: 'negative', message: `Failed to open report folder: ${err}` })
  })
}

async function handleUpdateOutlets() {
  if (!updateFile.value) return $q.notify({ type: 'warning', message: 'Select a CSV file first' })
  
  console.log('Update File Object:', updateFile.value)
  
  let filePath = null
  try {
      const { webUtils } = window.require('electron')
      // q-file might return array or single file depending on props, but here it's single
      // However, if the user mentioned "File path missing on object:", let's be safe
      const fileObj = Array.isArray(updateFile.value) ? updateFile.value[0] : updateFile.value
      filePath = webUtils.getPathForFile(fileObj)
  } catch (e) {
      console.warn('webUtils failed, trying .path', e)
      const fileObj = Array.isArray(updateFile.value) ? updateFile.value[0] : updateFile.value
      filePath = fileObj ? fileObj.path : null
  }
  
  if (!filePath) {
      console.error('File path missing on object:', updateFile.value)
      $q.notify({ type: 'negative', message: 'Error: Cannot retrieve file path. App must verify file access.' })
      return
  }

  loadingUpdate.value = true
  try {
     const count = await updateOutletsFromCsv(filePath)
     $q.notify({ type: 'positive', message: `Updated ${count} outlets` })
     updateFile.value = null // Reset
  } catch (e) {
    console.error(e)
    if (e.message.includes('Invalid')) {
        $q.dialog({
            title: 'Validation Error',
            message: `<pre>${e.message}</pre>`,
            html: true
        })
    } else {
        $q.notify({ type: 'negative', message: 'Update Failed: ' + e.message })
    }
  } finally {
    loadingUpdate.value = false
  }
}
</script>

<style scoped>
.max-w-600 {
  max-width: 600px;
}
</style>
