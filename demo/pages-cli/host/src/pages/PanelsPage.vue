<template>
  <div>
    <PagesTablePanel />
    <ValidatePanel />
    <RemoteSchemaPanel />
    <ContextPanel />
    <ContractPanel />
    <TracePanel />
    <WidgetPanel />
  </div>
</template>

<script setup lang="ts">
import PagesTablePanel from '../components/panel/PagesTablePanel.vue'
import ValidatePanel from '../components/panel/ValidatePanel.vue'
import RemoteSchemaPanel from '../components/panel/RemoteSchemaPanel.vue'
import ContextPanel from '../components/panel/ContextPanel.vue'
import ContractPanel from '../components/panel/ContractPanel.vue'
import TracePanel from '../components/panel/TracePanel.vue'
import WidgetPanel from '../components/panel/WidgetPanel.vue'
</script>
