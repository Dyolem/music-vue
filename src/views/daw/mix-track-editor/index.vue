<script setup>
import Editor from "@/views/daw/editor-template/index.vue"
import MixTrackUnitManagement from "@/views/daw/mix-track-editor/MixTrackUnitManagement.vue"
import { inject, provide, ref, toRef } from "vue"
import AddTrackSidebar from "@/views/daw/add-track-sidebar/index.vue"
import MixTrackPlaceholder from "@/views/daw/mix-track-editor/MixTrackPlaceholder.vue"

const props = defineProps({
  mainEditorId: {
    type: String,
    required: true,
  },
  mainEditorViewWidth: {
    type: Number,
    required: true,
  },
  mainEditorViewHeight: {
    type: Number,
    required: true,
  },
})
provide(
  "mainEditorId",
  toRef(() => props.mainEditorId),
)

const { totalAudioTracksHeight } = inject("foldedAudioTrack")
provide("bgSvgHeight", totalAudioTracksHeight)
provide("canvasContentHeight", { canvasContentHeight: totalAudioTracksHeight })

const addTrackSidebarScrollTop = ref(0)
const scrollMovement = ref({
  scrollTop: 0,
  scrollLeft: 0,
})
function updateScrollMovement({ scrollTop, scrollLeft }) {
  if (scrollTop !== undefined) {
    scrollMovement.value.scrollTop = scrollTop
  }
  if (scrollLeft !== undefined) {
    scrollMovement.value.scrollLeft = scrollLeft
  }
  addTrackSidebarScrollTop.value = scrollTop
}
provide("scrollMovement", { scrollMovement, updateScrollMovement })
function updateMainEditorSidebarScrollTop(newMainEditorSidebarScrollTop) {
  scrollMovement.value.scrollTop = newMainEditorSidebarScrollTop
}
</script>

<template>
  <main>
    <div class="editor-main">
      <div class="editor-side-bar">
        <AddTrackSidebar
          :main-editor-sidebar-scroll-top="addTrackSidebarScrollTop"
          @update:main-editor-sidebar-scroll-top="
            updateMainEditorSidebarScrollTop
          "
        ></AddTrackSidebar>
      </div>
      <Editor
        :id="mainEditorId"
        :editor-view-height="mainEditorViewHeight"
        :editor-view-width="mainEditorViewWidth"
      >
        <template
          #default-interactable-layer="{
            interactableLayerWidth,
            interactableLayerHeight,
            zoomRatio,
          }"
        >
          <MixTrackUnitManagement
            :id="mainEditorId"
            :width="interactableLayerWidth"
            :height="interactableLayerHeight"
            :zoom-ratio="zoomRatio"
          ></MixTrackUnitManagement>
          <MixTrackPlaceholder
            :width="mainEditorViewWidth"
          ></MixTrackPlaceholder>
        </template>
      </Editor>
    </div>
  </main>
</template>

<style scoped>
.editor-main {
  --main-editor-height: v-bind(mainEditorViewHeight + "px");
  height: var(--main-editor-height);
  position: relative;
  width: 100vw;
  display: flex;
  background-color: #0f1214;
}
.editor-side-bar {
  flex-grow: 1;
  flex-basis: 100px;
  flex-shrink: 0;
  height: var(--main-editor-height);
  background-color: gray;
  margin-right: 10px;
}
</style>
