<script setup>
import { computed } from "vue"
import MixEditorButton from "@/views/daw/mix-editor-button/MixEditorButton.vue"
import { currentProject, saveCurrentProject } from "@/core/history/index.js"
import { formatISODateWithDayjs } from "@/utils/formatISODateWithDayjs.js"

const lastSavedDate = computed(() => {
  return formatISODateWithDayjs(currentProject.updatedAt)
})
function saveProjectHandler() {
  saveCurrentProject()
}
</script>

<template>
  <div class="save-container">
    <div class="saved-date">
      <span>Last Saved</span>
      <span>{{ lastSavedDate }}</span>
    </div>
    <MixEditorButton circle size="large" @click="saveProjectHandler">
      <div class="icon">
        <echo-icon-park-outline:save></echo-icon-park-outline:save>
        <span>Save</span>
      </div>
    </MixEditorButton>
    <MixEditorButton circle size="large">
      <div class="icon">
        <echo-streamline:ai-network-spark></echo-streamline:ai-network-spark>
        <span>Publish</span>
      </div>
    </MixEditorButton>
  </div>
</template>

<style scoped>
.save-container {
  display: flex;
  align-items: center;
  padding-right: 10px;
  gap: 10px;
}
.saved-date {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 12px;
}
.saved-date span {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.saved-date span:first-child {
  color: #7c899b;
}
.saved-date span:last-child {
  color: #ffffff;
}
.icon {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 14px;
}
</style>
