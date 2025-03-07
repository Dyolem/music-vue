import { defineStore } from "pinia"
import { ref } from "vue"
import {
  AUDIO_TRACK_ENUM,
  BASE_GRID_HEIGHT,
  ID_SET,
  MAIN_EDITOR_ID,
  SUBORDINATE_EDITOR_ID,
} from "@/constants/daw/index.js"
import { useAudioTrackMainColorStore } from "@/store/daw/audio-track-color/index.js"
import { useTrackFeatureMapStore } from "@/store/daw/track-feature-map/index.js"
import { useWorkspaceStore } from "@/store/daw/workspace/index.js"
import { useZoomRatioStore } from "@/store/daw/zoomRatio.js"
import { useBeatControllerStore } from "@/store/daw/beat-controller/index.js"
import { useAudioStore } from "@/store/daw/audio/index.js"

export const useMixTrackEditorStore = defineStore("mixTrackEditorStore", () => {
  const audioTrackMainColorStore = useAudioTrackMainColorStore()
  const trackFeatureMapStore = useTrackFeatureMapStore()
  const workspaceStore = useWorkspaceStore()
  const zoomRatioStore = useZoomRatioStore()
  const beatControllerStore = useBeatControllerStore()
  const audioStore = useAudioStore()

  /**
   * @typedef {import('../type.js').MixTracksMap} MixTracksMap
   * @typedef {import('vue').Ref<MixTracksMap>} mixTracksMap
   */
  const mixTracksMap = ref(new Map([]))
  function createNewTrack({
    audioTrackName,
    mainColor = audioTrackMainColorStore.getRandomColor(),
    mainEditorZoomRatio = 1,
  }) {
    const newAudioTrackId = ID_SET.AUDIO_TRACK()
    const existedTracksSize = mixTracksMap.value.size
    mixTracksMap.value.set(newAudioTrackId, {
      id: newAudioTrackId,
      audioTrackName,
      mainColor,
      serialNumbering: existedTracksSize + 1,
      subTrackItemsMap: new Map(),
      mainEditorZoomRatio,
    })
    return newAudioTrackId
  }

  const generateSubTrackItemId = (prefix) => ID_SET.SUB_TRACK_ITEM(prefix)
  function createSubTrackItem({
    audioTrackId,
    workspaceId,
    trackItemWidth,
    trackItemHeight = BASE_GRID_HEIGHT,
    startPosition,
    trackName,
  }) {
    const mixTrack = mixTracksMap.value.get(audioTrackId)
    const subTrackItemsMap = mixTrack.subTrackItemsMap
    const subTrackItemId = generateSubTrackItemId()
    const mainColor = mixTrack.mainColor
    const trackZoomRatio = mixTrack.mainEditorZoomRatio
    subTrackItemsMap.set(subTrackItemId, {
      audioTrackId,
      workspaceId,
      subTrackItemId,
      trackItemWidth,
      trackItemHeight,
      mainColor,
      startPosition,
      trackName,
      trackZoomRatio,
    })
    return subTrackItemId
  }
  function addAudioTrack({
    audioTrackName,
    mainColor = audioTrackMainColorStore.getRandomColor(),
    mainEditorZoomRatio,
    midiWorkspaceZoomRatio,
  }) {
    const newTrackId = createNewTrack({
      audioTrackName,
      mainColor,
      mainEditorZoomRatio,
    })
    trackFeatureMapStore.addTrackFeatureMap(newTrackId, {
      midiWorkspace: {
        workspaceBadgeName: audioTrackName,
        workspaceMap: workspaceStore.createNewWorkspaceMap(),
        zoomRatio: midiWorkspaceZoomRatio,
      },
    })
    audioStore.initAudioTrackBufferSourceMap({
      audioTrackId: newTrackId,
      type: AUDIO_TRACK_ENUM.VIRTUAL_INSTRUMENTS,
    })
    return newTrackId
  }

  const convertDataFromSubToMain = (value) => {
    return zoomRatioStore.convertDataBetweenEditors({
      fromValue: value,
      fromZoomRatio: zoomRatioStore.getSpecifiedEditorZoomRatio(
        SUBORDINATE_EDITOR_ID,
      ),
      toZoomRatio: zoomRatioStore.getSpecifiedEditorZoomRatio(MAIN_EDITOR_ID),
    })
  }
  function getSubTrackItemsMap({ audioTrackId }) {
    return mixTracksMap.value.get(audioTrackId).subTrackItemsMap
  }
  function getSubTrackItem({ audioTrackId, subTrackItemId }) {
    return getSubTrackItemsMap({ audioTrackId }).get(subTrackItemId)
  }

  const convert = zoomRatioStore.createConvert(MAIN_EDITOR_ID)
  /**
   *
   * @param {string} editorId - 调用该方法的编辑器id
   * @param {string} audioTrackId - 音轨id
   * @param {string} subTrackItemId - 子轨道id
   * @param {number} x - 相对于编辑器中的垂直边横坐标，不是相对于document的坐标
   * @param {[number,number]} scale - 数值范围
   * @param {number} initLeftEdgeX - 初始左边界的横坐标
   */

  function updateRightEdge({
    editorId,
    audioTrackId,
    subTrackItemId,
    x,
    initLeftEdgeX,
  }) {
    const subTrackItem = getSubTrackItem({
      audioTrackId,
      subTrackItemId,
    })
    const scale = [initLeftEdgeX, beatControllerStore.totalLength(editorId)]
    const { convertedX, convertedScale } = convert({ x, editorId, scale })
    const { min: convertedLeftEdgeX } = convertedScale
    subTrackItem.trackItemWidth = convertedX - convertedLeftEdgeX
    return [convertedX, x]
  }

  function updateLeftEdge({
    editorId,
    audioTrackId,
    subTrackItemId,
    x,
    initRightEdgeX,
  }) {
    const subTrackItem = getSubTrackItem({
      audioTrackId,
      subTrackItemId,
    })
    const scale = [0, initRightEdgeX]
    const { convertedX, convertedScale } = convert({ x, editorId, scale })
    const { max: convertedRightEdgeX } = convertedScale
    const newTrackItemWidth = convertedRightEdgeX - convertedX
    subTrackItem.startPosition = convertedX
    subTrackItem.trackItemWidth = newTrackItemWidth
    return [convertedX, x]
  }

  function updateSubTrackItemStartPosition({
    editorId,
    audioTrackId,
    subTrackItemId,
    startPosition,
    horizontalScale,
  }) {
    const subTrackItem = getSubTrackItem({ audioTrackId, subTrackItemId })
    const { convertedX: newStartPosition } = convert({
      x: startPosition,
      editorId,
      scale: horizontalScale,
    })

    const oldStartPosition = subTrackItem.startPosition
    subTrackItem.startPosition = newStartPosition
    return [newStartPosition, oldStartPosition]
  }

  function passivePatchUpdateAudioTracksWithZoomRatio({
    newZoomRatio,
    oldZoomRatio,
  }) {
    if (
      newZoomRatio === oldZoomRatio ||
      newZoomRatio === undefined ||
      oldZoomRatio === undefined
    )
      return

    for (const audioTrack of mixTracksMap.value.values()) {
      for (const subTrackItem of audioTrack.subTrackItemsMap.values()) {
        subTrackItem.trackItemWidth *= newZoomRatio / oldZoomRatio
        subTrackItem.startPosition =
          (subTrackItem.startPosition / oldZoomRatio) * newZoomRatio
        subTrackItem.trackZoomRatio = newZoomRatio
      }
    }
  }

  function deleteSpecifiedSubTrackItem({ audioTrackId, subTrackItemId }) {
    const subTrackItemsMap = getSubTrackItemsMap({ audioTrackId })
    subTrackItemsMap?.delete(subTrackItemId)
  }

  return {
    mixTracksMap,
    generateSubTrackItemId,
    addAudioTrack,
    getSubTrackItem,
    getSubTrackItemsMap,
    createSubTrackItem,
    updateLeftEdge,
    updateRightEdge,
    updateSubTrackItemStartPosition,
    passivePatchUpdateAudioTracksWithZoomRatio,
    deleteSpecifiedSubTrackItem,
  }
})
