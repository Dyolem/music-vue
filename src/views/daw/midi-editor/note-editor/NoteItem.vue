<script setup>
import { inject, ref, useTemplateRef } from "vue"
import clearSelection from "@/utils/clearSelection.js"
import { useNoteItemStore } from "@/store/daw/note-editor/noteItem.js"
import { useAudioGeneratorStore } from "@/store/daw/audio/audioGenerator.js"
import { ZIndex } from "@/constants/daw/index.js"
import { useBeatControllerStore } from "@/store/daw/beat-controller/index.js"
import { storeToRefs } from "pinia"
import { useAudioStore } from "@/store/daw/audio/index.js"
import { useZoomRatioStore } from "@/store/daw/zoomRatio.js"

const audioStore = useAudioStore()
const beatControllerStore = useBeatControllerStore()
const { pixelsPerTick } = storeToRefs(beatControllerStore)
const zoomRatioStore = useZoomRatioStore()
const noteItemMap = useNoteItemStore()
const audioGenerator = useAudioGeneratorStore()
const { isSelectMode, isInsertMode } = storeToRefs(zoomRatioStore)
const editorNoteRef = useTemplateRef("editorNoteRef")
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  workspaceId: {
    type: String,
    required: true,
  },
  audioTrackId: {
    type: String,
    required: true,
  },
  belongedPitchName: {
    type: String,
    default: "",
    required: true,
  },
  noteWidth: {
    type: Number,
    default: 30,
  },
  noteHeight: {
    type: Number,
  },
  noteBackGroundColor: {
    type: String,
    default: "lightblue",
  },
  notePadWidth: {
    type: Number,
    required: true,
  },
  notePadHeight: {
    type: Number,
    required: true,
  },
  x: {
    type: Number,
    default: 0,
  },
  y: {
    type: Number,
    default: 0,
  },
  noteEditorRegionRef: {
    type: Object,
    required: true,
  },
  workspaceStartPosition: {
    type: Number,
    default: 0,
  },
})
const midiEditorId = inject("subordinateEditorId")
const { selectedAudioTrackId } = inject("selectedAudioTrackId")
const editorNoteZIndex = ref(ZIndex.EDITOR_NOTE)
const { noteMainSelectedId, updateNoteMainSelectedId } =
  inject("noteMainSelectedId")

let translateXDistance = 0
let translateYDistance = 0
function isLegalTranslateDistance(translateXDistance, translateYDistance) {
  return (
    translateXDistance >= 0 &&
    translateXDistance <=
      (props.notePadWidth - props.noteWidth) *
        pixelsPerTick.value(midiEditorId.value) &&
    translateYDistance >= 0 &&
    translateYDistance <= props.notePadHeight - props.noteHeight
  )
}

function getMovementInNoteEditorRegion(event) {
  return {
    x: event.clientX - props.noteEditorRegionRef.getBoundingClientRect().left,
    y: event.clientY - props.noteEditorRegionRef.getBoundingClientRect().top,
  }
}

function playNoteAudioSample(pitchName) {
  audioGenerator
    .generateAudio(pitchName)
    .then((audioController) => {
      audioController?.abort()
    })
    .catch((error) => {
      console.error("Failed to abort audioController:", error)
    })
}

function draggableRegionHandler(event) {
  // 'insert' editor mode prohibit to drag note element
  if (isInsertMode.value) return
  if (noteMainSelectedId.value !== props.id) updateNoteMainSelectedId(props.id)

  const selectionController = clearSelection()
  const id = props.id
  const belongedPitchName = props.belongedPitchName
  const mousedownX =
    event.clientX - editorNoteRef.value.getBoundingClientRect().left
  const mousedownY =
    event.clientY - editorNoteRef.value.getBoundingClientRect().top
  let lastPitchName = props.belongedPitchName
  /*
   * Reserve in the future need to achieve vertical smooth movement effect
   * const mousedownY = event.clientY - editorNoteRef.value.getBoundingClientRect().top
   * */

  let newId = ""
  function mouseMoveHandler(event) {
    translateXDistance =
      event.clientX -
      props.noteEditorRegionRef.getBoundingClientRect().left -
      mousedownX

    translateYDistance =
      event.clientY -
      props.noteEditorRegionRef.getBoundingClientRect().top -
      mousedownY

    if (isLegalTranslateDistance(translateXDistance, translateYDistance)) {
      const { newNoteId, newPitchName } =
        noteItemMap.updateNoteItemPosition({
          editorId: midiEditorId.value,
          id,
          audioTrackId: selectedAudioTrackId.value,
          workspaceId: props.workspaceId,
          pitchName: belongedPitchName,
          x: translateXDistance / pixelsPerTick.value(midiEditorId.value),
          y: translateYDistance,
        }) ?? {}
      newId = newNoteId

      if (newPitchName !== lastPitchName) {
        playNoteAudioSample(newPitchName)
        noteItemMap.simulatePlaySpecifiedNote(newPitchName)
        lastPitchName = newPitchName
      }
    }
  }
  document.addEventListener("mousemove", mouseMoveHandler)
  document.addEventListener(
    "mouseup",
    () => {
      document.removeEventListener("mousemove", mouseMoveHandler)
      selectionController.abort()
      if (!newId) return
      noteItemMap.updateNoteItemsMap({
        oldId: id,
        newId,
        audioTrackId: selectedAudioTrackId.value,
        workspaceId: props.workspaceId,
        oldPitchName: belongedPitchName,
        newPitchName: props.belongedPitchName,
      })
      updateNoteMainSelectedId(newId)
    },
    {
      once: true,
    },
  )
}

function stretchEditorNoteLength(event) {
  if (noteMainSelectedId.value !== props.id) updateNoteMainSelectedId(props.id)
  const selectionController = clearSelection()
  const { x: mousedownStartX } = getMovementInNoteEditorRegion(event)
  const initWidth = props.noteWidth
  const initX = props.x
  function mousemoveHandler(event) {
    const { x: moveX } = getMovementInNoteEditorRegion(event)
    const deltaX = moveX - mousedownStartX
    const pixelsWorkspaceStartPosition =
      props.workspaceStartPosition * pixelsPerTick.value(midiEditorId.value)
    const pixelsInitX = initX * pixelsPerTick.value(midiEditorId.value)
    const pixelsInitWidth = initWidth * pixelsPerTick.value(midiEditorId.value)
    const mousedownXInNote =
      mousedownStartX - (pixelsInitX + pixelsWorkspaceStartPosition)
    const tickDeltaX = deltaX / pixelsPerTick.value(midiEditorId.value)
    if (mousedownXInNote < pixelsInitWidth / 2) {
      noteItemMap.updateNoteLeftEdge({
        editorId: midiEditorId.value,
        id: props.id,
        audioTrackId: selectedAudioTrackId.value,
        workspaceId: props.workspaceId,
        pitchName: props.belongedPitchName,
        absoluteX: initX + props.workspaceStartPosition + tickDeltaX,
        initRightEdgeX: initX + initWidth + props.workspaceStartPosition,
      })
    } else {
      noteItemMap.updateNoteRightEdge({
        editorId: midiEditorId.value,
        id: props.id,
        audioTrackId: selectedAudioTrackId.value,
        workspaceId: props.workspaceId,
        pitchName: props.belongedPitchName,
        absoluteX:
          initX + props.workspaceStartPosition + initWidth + tickDeltaX,
        initLeftEdgeX: initX + props.workspaceStartPosition,
      })
    }
  }
  document.addEventListener("mousemove", mousemoveHandler)
  document.addEventListener(
    "mouseup",
    () => {
      document.removeEventListener("mousemove", mousemoveHandler)
      selectionController.abort()
    },
    {
      once: true,
    },
  )
}

let isMoved = false
let firstRapidMouseDown = 0
function noteMainMousedownHandler(event) {
  firstRapidMouseDown =
    firstRapidMouseDown === 0 ? event.timeStamp : firstRapidMouseDown

  const timeInterval = event.timeStamp - firstRapidMouseDown
  /*
   * If there is no second click within 300 milliseconds,
   * all the states changed by the first click will be reset
   * */
  const timer = setTimeout(() => {
    firstRapidMouseDown = 0
    isMoved = false
  }, 300)

  //A single click should execute the logic
  if (timeInterval === 0) {
    if (isInsertMode.value) {
      noteItemMap.deleteNoteItem({
        id: props.id,
        workspaceId: props.workspaceId,
        audioTrackId: selectedAudioTrackId.value,
        pitchName: props.belongedPitchName,
      })
      updateNoteMainSelectedId("")
    } else {
      /*
       * In selected mode, a single click will play the corresponding sound name
       * */

      audioStore
        .generateSingleAudioNode({
          noteId: props.id,
          audioTrackId: props.audioTrackId,
          audioContext: audioStore.audioContext,
        })
        .then(
          (controller) => {
            noteItemMap.simulatePlaySpecifiedNote(
              props.belongedPitchName,
              controller.signal,
            )
          },
          () => {},
        )
    }
  }
  //The second click(double click) should execute the logic
  if (timeInterval > 0 && timeInterval < 300) {
    /*
     * Clear the previous timer used to reset the state ,
     * because the second click was performed within 300 milliseconds
     * */
    clearTimeout(timer)

    /*
     * The following event handler function must be one-time ,
     * otherwise it will add up as the number of double clicks increases
     * */
    document.addEventListener(
      "mousemove",
      () => {
        isMoved = true
      },
      {
        once: true,
      },
    )
    document.addEventListener(
      "mouseup",
      () => {
        if (!isMoved) {
          noteItemMap.deleteNoteItem({
            id: props.id,
            workspaceId: props.workspaceId,
            audioTrackId: selectedAudioTrackId.value,
            pitchName: props.belongedPitchName,
          })
        } else {
          isMoved = false
        }
      },
      {
        once: true,
      },
    )
  }
}
</script>

<template>
  <div
    class="editor-note"
    :class="{
      'is-edited': noteMainSelectedId === id,
      'is-selected': noteMainSelectedId === id && isSelectMode,
    }"
    ref="editorNoteRef"
    @click.stop="() => {}"
    @dblclick.stop="() => {}"
    @mousedown.stop="draggableRegionHandler"
  >
    <div
      class="editor-note-left draggable-region"
      @mousedown.stop="
        (event) => {
          stretchEditorNoteLength(event)
        }
      "
    ></div>
    <div class="editor-note-main" @mousedown="noteMainMousedownHandler"></div>
    <div
      class="editor-note-right draggable-region"
      @mousedown.stop="
        (event) => {
          stretchEditorNoteLength(event)
        }
      "
    ></div>
  </div>
</template>

<style scoped>
.editor-note {
  --note-background-color: v-bind(noteBackGroundColor);
  --translateX: v-bind(x * pixelsPerTick(midiEditorId) + "px");
  --translateY: v-bind(y + "px");
  --note-width: v-bind(noteWidth * pixelsPerTick(midiEditorId) + "px");
  box-sizing: border-box;
  position: absolute;
  overflow: hidden;
  display: flex;
  width: var(--note-width);
  height: v-bind(noteHeight + "px");
  background-color: var(--note-background-color);
  border-radius: 2px;
  z-index: v-bind(editorNoteZIndex);
  border: 1px solid
    color-mix(in srgb, var(--note-background-color), #ffffff 50%);
  transform: translate(var(--translateX), var(--translateY));
}
.editor-note-main {
  flex-grow: 1;
  height: 100%;
  background-color: var(--note-background-color);
}
.draggable-region {
  width: 4px;
  height: 100%;
  background-color: var(--note-background-color);
}
.draggable-region:hover {
  cursor: ew-resize;
}

.is-selected:hover {
  cursor: move;
}
.is-edited {
  border: 1px solid #fff;
}
</style>
