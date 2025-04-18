/**
 * mid解析数据结构
 * @typedef {Object} MidiEvent
 * @property {string} type
 * @property {number} tick
 * @property {string | undefined} program
 */

/**
 * @typedef {Object} MidiNote
 * @property {number} channel
 * @property {number} durationTicks
 * @property {number} midi
 * @property {number} startTicks
 * @property {number} velocity
 */

/**
 * @typedef {Object} Track
 * @property {number} channel
 * @property {string} color
 * @property {number | string} id
 * @property {string | undefined} instrument
 * @property {boolean} isMuted
 * @property {string} name
 * @property {MidiEvent[]} events
 * @property {MidiNote[]} notes
 * @property {{startTick:number,endTick:number}} timeRange
 */

/**
 * @typedef {Object} MidiMeta
 * @property {number} formatType
 * @property {number} ppqn
 * @property {number} initialBpm
 * @property {TempoEvent[]} tempoEvents
 * @property {string} timeSignature
 * @property {number} durationTicks
 */

/**
 * @typedef {Object} MidiData
 * @property {number} version
 * @property {MidiMeta} meta
 * @property {Track[]} tracks
 */

import { useMixTrackEditorStore } from "@/store/daw/mix-track-editor/index.js"
import { useWorkspaceStore } from "@/store/daw/workspace/index.js"
import { useNoteItemStore } from "@/store/daw/note-editor/noteItem.js"
import { useBeatControllerStore } from "@/store/daw/beat-controller/index.js"
import {
  AUDIO_TRACK_ENUM,
  AUDIO_TRACK_TYPE_CONFIG,
  midiToNoteName,
} from "@/constants/daw/index.js"

/**
 *
 * @param {{meta:MidiMeta,tracks:Track[],version:number,mainEditorZoomRatio:number,midiWorkspaceZoomRatio:number}} midiData
 */
export function generateAudioTrack(midiData) {
  const {
    meta,
    tracks,
    version,
    midiWorkspaceZoomRatio = 1,
    mainEditorZoomRatio = 1,
  } = midiData
  const mixTrackEditorStore = useMixTrackEditorStore()
  const workspaceStore = useWorkspaceStore()
  const noteItemStore = useNoteItemStore()
  const beatControllerStore = useBeatControllerStore()

  const parsedAudioTrackIdArr = []
  const { ppqn, timeSignature } = meta
  beatControllerStore.updateChoreAudioParams({
    ppqn,
    timeSignature,
  })
  const midiTypeAudioTrackInfo = AUDIO_TRACK_TYPE_CONFIG.get(
    AUDIO_TRACK_ENUM.VIRTUAL_INSTRUMENTS,
  )
  for (const { events, timeRange, notes, name, color } of tracks) {
    if (notes.length === 0) continue
    else {
      const { startTick = 0, endTick = 0 } = timeRange
      beatControllerStore.updateChoreAudioParams({
        editableTotalTick: endTick,
      })
      const audioTrackId = mixTrackEditorStore.addAudioTrack({
        audioTrackName: name,
        audioTrackType: midiTypeAudioTrackInfo.type,
        audioTrackIcon: midiTypeAudioTrackInfo.icon,
        mainEditorZoomRatio,
        midiWorkspaceZoomRatio,
      })
      parsedAudioTrackIdArr.push(audioTrackId)
      const newWorkspaceWidth = endTick - startTick
      const newWorkspaceStartPosition = startTick
      const newWorkspaceId = workspaceStore.addNewWorkspace({
        audioTrackId,
        badgeName: name,
        width: newWorkspaceWidth,
        startPosition: newWorkspaceStartPosition,
        zoomRatio: midiWorkspaceZoomRatio,
      })
      const subTrackItemId = mixTrackEditorStore.createSubTrackItem({
        audioTrackId,
        workspaceId: newWorkspaceId,
        trackItemWidth: newWorkspaceWidth,
        startPosition: newWorkspaceStartPosition,
        trackName: name,
      })

      const workspace = workspaceStore.getWorkspace({
        audioTrackId,
        workspaceId: newWorkspaceId,
      })
      workspace.subTrackItemId = subTrackItemId
      const noteItemsMap = workspace.noteItemsMap
      for (const {
        channel,
        durationTicks,
        midi,
        startTicks,
        velocity,
      } of notes) {
        const specifiedPitchName = midiToNoteName(midi)
        const template = noteItemStore.getNoteItemTemplate({
          x: startTicks,
          y: noteItemStore.noteHeight * (119 - midi),
          noteItemWidth: durationTicks,
          insertToSpecifiedPitchName: specifiedPitchName,
          workspaceId: newWorkspaceId,
          audioTrackId,
          velocity,
          isDirectPosition: true,
        })
        noteItemsMap.set(template.id, template)
      }
    }
  }
  return parsedAudioTrackIdArr?.[0] ?? ""
}
