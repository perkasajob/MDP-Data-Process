<template>
  <q-page padding>
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-6">
        <q-card flat bordered class="settings-card">
          <q-card-section class="bg-primary text-white">
            <div class="text-h6">
              <q-icon name="telegram" class="q-mr-sm" />
              Telegram Settings
            </div>
          </q-card-section>

          <q-card-section class="q-pt-md">
            <div class="q-mb-md">
              <q-item-label header class="q-pa-none q-mb-xs">Sales Report Footnote</q-item-label>
              <q-input
                v-model="settings.telegram_footnote"
                type="textarea"
                outlined
                autogrow
                placeholder="Text to be added at the bottom of sales report..."
                hint="This text will be appended to the bottom of message."
              />
            </div>


          </q-card-section>

          <q-separator />

          <q-card-actions align="right">
            <q-btn 
              unelevated 
              color="primary" 
              label="Save Settings" 
              icon="save" 
              @click="handleSave" 
              :loading="saving"
            />
          </q-card-actions>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { getConfig, saveConfig } from '../services/ConfigService';

const $q = useQuasar();
const settings = ref({
  telegram_footnote: '',
  telegram_bot_token: ''
});
const saving = ref(false);

onMounted(() => {
  try {
    const config = getConfig();
    settings.value = {
      ...settings.value,
      ...config
    };
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
});

async function handleSave() {
  saving.value = true;
  try {
    const currentConfig = getConfig();
    const newConfig = {
      ...currentConfig,
      ...settings.value
    };
    
    saveConfig(newConfig);
    
    $q.notify({
      type: 'positive',
      message: 'Settings saved successfully',
      position: 'top'
    });
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: 'Failed to save settings: ' + e.message,
      position: 'top'
    });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.settings-card {
  border-radius: 8px;
}
</style>
