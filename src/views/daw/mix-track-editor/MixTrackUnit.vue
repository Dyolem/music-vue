<script setup>
import {
  inject,
  onMounted,
  onUnmounted,
  useTemplateRef,
  provide,
  toRef,
} from "vue"
import TrackItem from "@/views/daw/mix-track-editor/TrackItem.vue"
import {
  AUDIO_TRACK_ENUM,
  BASE_GRID_WIDTH,
  BEAT_GRID_RATIO,
  BEATS_COUNT,
  FALLBACK_THEME_COLOR,
  MAIN_EDITOR_ID,
} from "@/constants/daw/index.js"
import { useWorkspaceStore } from "@/store/daw/workspace/index.js"
import { deepClone } from "@/utils/deepClone.js"
import { useMixTrackEditorStore } from "@/store/daw/mix-track-editor/index.js"
import clearSelection from "@/utils/clearSelection.js"
import ContextMenu from "@/views/daw/components/context-menu/ContextMenu.vue"
import { useBeatControllerStore } from "@/store/daw/beat-controller/index.js"
import { storeToRefs } from "pinia"
import { useNoteItemStore } from "@/store/daw/note-editor/noteItem.js"
import { resizeMixTrackItemThumbnailCanvas } from "@/views/daw/mix-track-editor/renderThumbnail.js"
import { snapshotYSharedData } from "@/core/history/index.js"

const workspaceStore = useWorkspaceStore()
const mixTrackEditorStore = useMixTrackEditorStore()
const beatControllerStore = useBeatControllerStore()
const noteItemsStore = useNoteItemStore()
const { getSpecifiedNoteItemsMap } = noteItemsStore

const { pixelsPerTick } = storeToRefs(beatControllerStore)
const editorId = inject("mainEditorId")
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  audioTrackType: {
    type: String,
    default: "",
  },
  subTrackItemsMap: {
    type: Map,
    default: () => new Map(),
  },
  trackHeight: {
    type: Number,
    default: 90,
  },
  trackWidth: {
    type: Number,
    default: BASE_GRID_WIDTH * BEATS_COUNT * BEAT_GRID_RATIO,
  },
  mainColor: {
    type: String,
    default: FALLBACK_THEME_COLOR,
  },
  getGeometryInfoInParentElement: {
    type: Function,
    required: true,
  },
  contextMenu: {
    type: Array,
    default: () => [],
  },
})

provide("mixTrackMainColor", toRef(props, "mainColor"))
const { filterEffect } = inject("playableAudioTrack")

const { selectedAudioTrackId, updateSelectedAudioTrackId } = inject(
  "selectedAudioTrackId",
  {},
)
const { updateSelectedTrackItemId } = inject("selectedTrackItemId", {})

function updateSelectedId(event) {
  updateSelectedAudioTrackId(props.id)
  const target = event.target.closest(".track-item")
  if (target) {
    const trackItemId = target.dataset["trackItemId"]
    updateSelectedTrackItemId(trackItemId)
    event.stopPropagation()
  }
}
const trackUnitGridRef = useTemplateRef("trackUnitGridRef")
const dragController = new AbortController()

onMounted(() => {
  if (!trackUnitGridRef.value) return
  trackUnitGridRef.value.addEventListener(
    "mousedown",
    (event) => {
      const selectionController = clearSelection()
      const trackItemTarget = event.target.closest(".track-item")
      const stretchHandleTarget = event.target.closest(".stretch")
      const trackItemContainer = event.target.closest(".track-item-container")
      const trackItemId = trackItemContainer?.dataset["trackItemId"]
      if (!trackItemId) return

      event.stopPropagation() //避免选区事件被注册，选区事件会在创建选区后禁用一切冒泡至document的mouseup事件
      const subTrackItemsMap = mixTrackEditorStore.getSubTrackItemsMap({
        audioTrackId: props.id,
      })
      const subTrackItem = subTrackItemsMap.get(trackItemId)
      const initSubTrackItemStartPosition = subTrackItem.startPosition
      const initSubTrackItemWidth = subTrackItem.trackItemWidth

      let hasMoved = false
      if (trackItemTarget) {
        // const trackItemId = trackItemTarget.dataset["trackItemId"]
        const controller = new AbortController()
        let isDragging = false
        const { cursorPosition } = props.getGeometryInfoInParentElement(event)
        let [startX, startY] = cursorPosition

        let deltaX = 0
        let deltaY = 0

        const clonedSubTrackItemId =
          mixTrackEditorStore.generateSubTrackItemId()

        const workspaceMap = workspaceStore.getWorkspaceMap({
          audioTrackId: props.id,
        })
        const workspaceId = subTrackItem.workspaceId
        const workspace = workspaceMap.get(workspaceId)
        const clonedWorkspace = deepClone(workspace)
        const clonedWorkspaceId = workspaceStore.generateWorkspaceId()
        clonedWorkspace.id = clonedWorkspaceId
        clonedWorkspace.subTrackItemId = clonedSubTrackItemId
        workspaceMap.set(clonedWorkspaceId, clonedWorkspace)

        const clonedSubTrackItem = deepClone(subTrackItem)
        clonedSubTrackItem.subTrackItemId = clonedSubTrackItemId
        clonedSubTrackItem.workspaceId = clonedWorkspaceId
        subTrackItemsMap.set(clonedSubTrackItemId, clonedSubTrackItem)

        const minStartPosition = 0
        const maxStartPosition = props.trackWidth - initSubTrackItemWidth

        let newSubTrackItemStartPosition = 0
        document.addEventListener(
          "mousemove",
          (event) => {
            hasMoved = true
            isDragging = true

            const { cursorPosition } =
              props.getGeometryInfoInParentElement(event)
            const [x, y] = cursorPosition
            deltaX = (x - startX) / pixelsPerTick.value(editorId.value)
            deltaY = y - startY

            newSubTrackItemStartPosition =
              initSubTrackItemStartPosition + deltaX
            workspaceStore.updateWorkspacePosition({
              editorId: MAIN_EDITOR_ID,
              workspaceId: clonedWorkspaceId,
              selectedAudioTrackId: props.id,
              startPosition: newSubTrackItemStartPosition,
              positionScale: [minStartPosition, maxStartPosition],
            })
            mixTrackEditorStore.updateSubTrackItemStartPosition({
              editorId: MAIN_EDITOR_ID,
              audioTrackId: props.id,
              subTrackItemId: clonedSubTrackItemId,
              startPosition: newSubTrackItemStartPosition,
              horizontalScale: [minStartPosition, maxStartPosition],
            })
          },
          { signal: controller.signal },
        )
        document.addEventListener(
          "mouseup",
          () => {
            selectionController.abort()
            controller.abort()
            workspaceStore.deleteWorkspace({
              audioTrackId: props.id,
              workspaceId: clonedWorkspaceId,
            })

            mixTrackEditorStore.deleteSpecifiedSubTrackItem({
              audioTrackId: props.id,
              subTrackItemId: clonedSubTrackItemId,
            })
            if (isDragging) {
              workspaceStore.updateWorkspacePosition({
                editorId: MAIN_EDITOR_ID,
                workspaceId: workspaceId,
                selectedAudioTrackId: props.id,
                startPosition: newSubTrackItemStartPosition,
                positionScale: [minStartPosition, maxStartPosition],
              })
              mixTrackEditorStore.updateSubTrackItemStartPosition({
                editorId: MAIN_EDITOR_ID,
                audioTrackId: props.id,
                subTrackItemId: trackItemId,
                startPosition: newSubTrackItemStartPosition,
                horizontalScale: [minStartPosition, maxStartPosition],
              })
            }
            updateSelectedTrackItemId(trackItemId)
            if (hasMoved) {
              snapshotYSharedData()
              hasMoved = false
            }
          },
          {
            once: true,
          },
        )
      }
      if (stretchHandleTarget) {
        const controller = new AbortController()
        const { cursorPosition } = props.getGeometryInfoInParentElement(event)
        let [startX, startY] = cursorPosition

        const subTrackItemsMap = mixTrackEditorStore.getSubTrackItemsMap({
          audioTrackId: props.id,
        })
        const subTrackItem = subTrackItemsMap.get(trackItemId)
        const workspaceId = subTrackItem.workspaceId
        const initSubTrackItemStartPosition = subTrackItem.startPosition
        const initSubTrackItemWidth = subTrackItem.trackItemWidth

        const mousedownX =
          event.clientX - trackItemContainer.getBoundingClientRect().left
        document.addEventListener(
          "mousemove",
          (event) => {
            hasMoved = true
            const { cursorPosition } =
              props.getGeometryInfoInParentElement(event)
            const [x, y] = cursorPosition

            if (
              mousedownX <
              (initSubTrackItemWidth * pixelsPerTick.value(editorId.value)) / 2
            ) {
              const initRightEdgeX =
                initSubTrackItemStartPosition + initSubTrackItemWidth
              const newLeftEdgeX =
                (x - startX) / pixelsPerTick.value(editorId.value) +
                initSubTrackItemStartPosition
              mixTrackEditorStore.updateLeftEdge({
                x: newLeftEdgeX,
                initRightEdgeX,
                editorId: MAIN_EDITOR_ID,
                subTrackItemId: trackItemId,
                audioTrackId: props.id,
              })
              workspaceStore.updateLeftEdge({
                editorId: MAIN_EDITOR_ID,
                audioTrackId: props.id,
                workspaceId,
                x: newLeftEdgeX,
                initRightEdgeX,
              })
            } else {
              const newRightEdgeX =
                initSubTrackItemStartPosition +
                initSubTrackItemWidth -
                (startX - x) / pixelsPerTick.value(editorId.value)
              const initLeftEdgeX = initSubTrackItemStartPosition
              mixTrackEditorStore.updateRightEdge({
                x: newRightEdgeX,
                initLeftEdgeX,
                editorId: MAIN_EDITOR_ID,
                subTrackItemId: trackItemId,
                audioTrackId: props.id,
              })
              workspaceStore.updateRightEdge({
                x: newRightEdgeX,
                initLeftEdgeX,
                editorId: MAIN_EDITOR_ID,
                workspaceId,
                audioTrackId: props.id,
              })
            }
          },
          { signal: controller.signal },
        )
        document.addEventListener(
          "mouseup",
          () => {
            if (props.audioTrackType === AUDIO_TRACK_ENUM.VIRTUAL_INSTRUMENTS) {
              resizeMixTrackItemThumbnailCanvas({
                id: trackItemId,
                width:
                  subTrackItem.trackItemWidth *
                  pixelsPerTick.value(MAIN_EDITOR_ID),
              })
            }

            selectionController.abort()
            controller.abort()
            if (hasMoved) {
              snapshotYSharedData()
              hasMoved = false
            }
          },
          {
            once: true,
          },
        )
      }
    },
    {
      signal: dragController.signal,
    },
  )
})
const handleSelect = (selectedOption) => {
  beatControllerStore.updateGridType(selectedOption)
}
onUnmounted(() => {
  dragController.abort()
})
</script>

<template>
  <context-menu :menu="contextMenu" @select="handleSelect">
    <div
      class="track-unit-grid"
      ref="trackUnitGridRef"
      :style="{
        filter: filterEffect(id),
      }"
      :class="{
        'track-unit-grid-selected': selectedAudioTrackId === id,
      }"
      @click="updateSelectedId"
    >
      <TrackItem
        v-for="[subTrackItemId, subTrackItem] in subTrackItemsMap"
        :key="subTrackItemId"
        :id="subTrackItemId"
        :audio-track-id="id"
        :workspace-id="subTrackItem.workspaceId"
        :audio-track-type="audioTrackType"
        :note-items-map="
          getSpecifiedNoteItemsMap({
            audioTrackId: id,
            workspaceId: subTrackItem.workspaceId,
          })
        "
        :main-color="mainColor"
        :width="subTrackItem.trackItemWidth"
        :height="trackHeight"
        :start-position="subTrackItem.startPosition"
        :track-name="subTrackItem.trackName"
        :track-zoom-ratio="subTrackItem.trackZoomRatio"
      >
      </TrackItem>
    </div>
  </context-menu>
</template>

<style scoped>
.track-unit-grid {
  position: relative;
  width: v-bind(trackWidth * pixelsPerTick(editorId) + "px");
  height: v-bind(trackHeight + "px");
  display: flex;
}
.track-unit-grid-selected {
  background-color: v-bind(mainColor + "22");
}
</style>
