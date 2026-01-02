<template>
  <q-layout view="hHh kpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn dense flat round icon="menu" @click="toggleLeftDrawer" />
        <q-toolbar-title>
          Sales Data Processor
        </q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer show-if-above v-model="leftDrawerOpen" side="left" bordered>
      <q-list>
        <q-item-label header>Menu</q-item-label>
        <q-item clickable v-ripple @click="activeTab = 'data-process'" :active="activeTab === 'data-process'">
          <q-item-section avatar>
            <q-icon name="analytics" />
          </q-item-section>
          <q-item-section>Data Process</q-item-section>
        </q-item>
        <q-item clickable v-ripple @click="activeTab = 'outlet-map'" :active="activeTab === 'outlet-map'">
          <q-item-section avatar>
            <q-icon name="map" />
          </q-item-section>
          <q-item-section>Outlet Map</q-item-section>
        </q-item>
        <q-item clickable v-ripple @click="activeTab = 'panel'" :active="activeTab === 'panel'">
          <q-item-section avatar>
            <q-icon name="table_chart" />
          </q-item-section>
          <q-item-section>Panel</q-item-section>
        </q-item>
        <q-item clickable v-ripple @click="activeTab = 'marketing-structure'" :active="activeTab === 'marketing-structure'">
          <q-item-section avatar>
            <q-icon name="people" />
          </q-item-section>
          <q-item-section>Marketing Structure</q-item-section>
        </q-item>
        <q-item clickable v-ripple @click="activeTab = 'outlet-panel'" :active="activeTab === 'outlet-panel'">
          <q-item-section avatar>
            <q-icon name="store" />
          </q-item-section>
          <q-item-section>Outlet Editor</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <component :is="activeComponent" />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, defineAsyncComponent } from 'vue'

const leftDrawerOpen = ref(false)
const activeTab = ref('data-process')

function toggleLeftDrawer () {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

const DataProcessPage = defineAsyncComponent(() => import('./pages/DataProcessPage.vue'))
const OutletMapPage = defineAsyncComponent(() => import('./pages/OutletMapPage.vue'))
const PanelPage = defineAsyncComponent(() => import('./pages/PanelPage.vue'))
const MarketingStructurePage = defineAsyncComponent(() => import('./pages/MarketingStructurePage.vue'))
const OutletEditorPage = defineAsyncComponent(() => import('./pages/OutletEditorPage.vue'))

const activeComponent = computed(() => {
  if (activeTab.value === 'data-process') return DataProcessPage
  if (activeTab.value === 'outlet-map') return OutletMapPage
  if (activeTab.value === 'panel') return PanelPage
  if (activeTab.value === 'marketing-structure') return MarketingStructurePage
  if (activeTab.value === 'outlet-panel') return OutletEditorPage
  return null
})
</script>
