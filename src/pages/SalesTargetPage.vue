<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h4">Sales Target Update</div>
    </div>

    <q-card style="max-width: 600px; margin: 0 auto;">
      <q-card-section>
        <div class="text-h6">Upload Sales Target</div>
        <div class="text-subtitle2 text-grey">Select Month/Year for the target update</div>
      </q-card-section>

      <q-card-section>
        <!-- Date Selection -->
        <div class="q-mb-md">
          <q-input filled v-model="targetDate" mask="####-##-##" label="Date (YYYY-MM-DD)">
            <template v-slot:append>
              <q-icon name="event" class="cursor-pointer">
                <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                  <q-date v-model="targetDate" mask="YYYY-MM-DD">
                    <div class="row items-center justify-end">
                      <q-btn v-close-popup label="Close" color="primary" flat />
                    </div>
                  </q-date>
                </q-popup-proxy>
              </q-icon>
            </template>
          </q-input>
        </div>

        <!-- File Upload -->
        <q-file v-model="targetFile" label="Upload Target File (.xlsx)" accept=".xlsx" outlined bottom-slots>
          <template v-slot:prepend>
            <q-icon name="attach_file" />
          </template>
          <template v-slot:hint>
             Excel Format: Row 6+, Col D: Key (Name), E: Target, F: Target 1, G: Target 2
          </template>
        </q-file>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn label="Update Target" color="primary" @click="processSalesTarget" :loading="targetLoading" icon="upload" />
      </q-card-actions>
    </q-card>

  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import { updateSalesTargets } from '../services/SalesTargetService'

const $q = useQuasar()

// Update Target State
const targetFile = ref(null)
const targetDate = ref(new Date().toISOString().split('T')[0])
const targetLoading = ref(false)

async function processSalesTarget() {
    if (!targetFile.value) {
        $q.notify({ type: 'warning', message: 'Please select a file' })
        return
    }

    let filePath = null
    try {
        // Try getting path via Electron webUtils (safe path retrieval)
        const { webUtils } = window.require('electron')
        filePath = webUtils.getPathForFile(targetFile.value)
    } catch (e) {
        // Fallback or legacy behavior
        // console.warn('webUtils failed or not available, trying .path', e)
        filePath = targetFile.value.path
    }

    if (!filePath) {
        console.error('File path missing on object:', targetFile.value)
        $q.notify({ type: 'negative', message: 'Error: Cannot retrieve file path.' })
        return
    }
    
    // Validate date format if needed, but Input mask helps.
    
    targetLoading.value = true
    try {
        const count = await updateSalesTargets(filePath, targetDate.value)
        $q.notify({ type: 'positive', message: `Sales Target Updated Successfully. (${count} rows affected)` })
        
        // Reset file?
        targetFile.value = null
    } catch (e) {
        $q.notify({ type: 'negative', message: 'Update failed: ' + e.message })
    } finally {
        targetLoading.value = false
    }
}
</script>
