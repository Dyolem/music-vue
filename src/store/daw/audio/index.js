import { defineStore } from "pinia"
import { useAudioGeneratorStore } from "@/store/daw/audio/audioGenerator.js"
import { ref, isRef } from "vue"
import { AUDIO_TRACK_ENUM } from "@/constants/daw/index.js"
import { AudioScheduler } from "@/core/audio/AudioScheduler.js"
import { useNoteItemStore } from "@/store/daw/note-editor/noteItem.js"
import { useTrackRulerStore } from "@/store/daw/trackRuler/timeLine.js"
import { clamp } from "@/utils/clamp.js"

export const useAudioStore = defineStore("audio", () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  const audioContext = ref(new AudioContext())

  const trackRulerStore = useTrackRulerStore()
  const noteItemStore = useNoteItemStore()
  const audioGeneratorStore = useAudioGeneratorStore()
  const instrumentsAudioNodeMap = new Map()
  const audioTrackMap = new Map([
    [AUDIO_TRACK_ENUM.VIRTUAL_INSTRUMENTS, instrumentsAudioNodeMap],
  ])
  audioGeneratorStore.preCreateBuffer(audioContext.value)

  const scheduler = new AudioScheduler(audioContext.value)
  scheduler.initialize()

  //存储每个音轨的左右立体声值，音轨id为键，StereoPannerNode实例为值
  const audioTrackStereoMap = new Map()

  //存储每个音轨的总分贝值，音轨id为键，代表Volume的GainNode实例为值
  const audioTrackVolumeGainNodeMap = new Map()

  //全局音量总控制
  const globalGainNode = audioContext.value.createGain()

  const mixingGainNode = audioContext.value.createGain()
  const compressor = new DynamicsCompressorNode(audioContext.value, {
    threshold: -20,
    ratio: 12,
  })

  // 创建全局 AnalyserNode
  const analyserNode = audioContext.value.createAnalyser()
  analyserNode.fftSize = 2048 // 影响数据精度与性能
  analyserNode.smoothingTimeConstant = 0.8 // 平滑系数（0~1，越大越平滑）

  mixingGainNode
    .connect(compressor)
    .connect(globalGainNode)
    .connect(analyserNode)
    .connect(audioContext.value.destination)

  /**
   * 以下Map结构的键均为note元素的id
   */
  const virtualInstrumentTypeDataProperty = {
    NOTE_BUFFER_SOURCE_MAP: "noteBufferSourceMap",
    AUDIO_BUFFER_SOURCE_NODE_MAP: "audioBufferSourceNodeMap",
    VELOCITY_GAIN_NODES_MAP: "velocityGainNodesMap",
    FADE_GAIN_NODE_MAP: "fadeGainNodeMap",
    AUDIO_CONTROLLER_MAP: "audioControllerMap",
  }
  const audioTracksBufferSourceMap = ref(new Map()) //存储所有音轨的音频节点映射表
  const audioTypeInit = {
    [AUDIO_TRACK_ENUM.VIRTUAL_INSTRUMENTS]: (audioTrackId) => {
      const noteBufferSourceMap = new Map() //单个音符对应的音频节点映射表,包含创建源节点的必要信息
      const audioBufferSourceNodeMap = new Map() //根据note的id存储所有创建的对应的音频节点
      const velocityGainNodesMap = new Map() //用于处理单个音符起始音量（按压力度）的增益节点的映射表
      const fadeGainNodeMap = new Map() //用于处理单个音符尾音淡出的增益节点的映射表
      const audioControllerMap = new Map() //用于控制设置在音频源节点的ended事件处理器函数的信号控制器
      const midiAudioInfo = {
        audioTrackId,
        audioType: AUDIO_TRACK_ENUM.VIRTUAL_INSTRUMENTS,
        audioDataInfo: {
          [virtualInstrumentTypeDataProperty.NOTE_BUFFER_SOURCE_MAP]:
            noteBufferSourceMap,
          [virtualInstrumentTypeDataProperty.AUDIO_BUFFER_SOURCE_NODE_MAP]:
            audioBufferSourceNodeMap,
          [virtualInstrumentTypeDataProperty.VELOCITY_GAIN_NODES_MAP]:
            velocityGainNodesMap,
          [virtualInstrumentTypeDataProperty.FADE_GAIN_NODE_MAP]:
            fadeGainNodeMap,
          [virtualInstrumentTypeDataProperty.AUDIO_CONTROLLER_MAP]:
            audioControllerMap,
        },
        stereoValue: 0,
      }
      audioTracksBufferSourceMap.value.set(audioTrackId, midiAudioInfo)
      return midiAudioInfo
    },
  }

  function createBufferSourceNode({
    audioTrackId,
    id,
    pitchName,
    audioContext,
  }) {
    const audioBuffer = audioGeneratorStore.fetchPreLoadedBuffer(pitchName)
    const audioBufferSourceNode = audioContext.createBufferSource()
    audioBufferSourceNode.buffer = audioBuffer
    const midiNumber = audioGeneratorStore.noteToMidi(pitchName)
    audioGeneratorStore.adjustPitch(
      audioBufferSourceNode,
      midiNumber,
      audioGeneratorStore.sampleMap,
    )
    const audioBufferSourceNodeMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.AUDIO_BUFFER_SOURCE_NODE_MAP,
    })
    audioBufferSourceNodeMap.set(id, audioBufferSourceNode)
    return audioBufferSourceNode
  }
  function createFadeGainNode({ audioTrackId, id, audioContext }) {
    const fadeGainNodeMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.FADE_GAIN_NODE_MAP,
    })
    const fadeGainNode = fadeGainNodeMap.get(id) ?? audioContext.createGain()
    fadeGainNodeMap.set(id, fadeGainNode)
    return fadeGainNode
  }

  function createVelocityGainNode({
    audioTrackId,
    id,
    audioContext,
    velocity,
  }) {
    const velocityGainNodesMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.VELOCITY_GAIN_NODES_MAP,
    })
    const velocityGainNode =
      velocityGainNodesMap.get(id) ?? audioContext.createGain()
    velocityGainNodesMap.set(id, velocityGainNode)

    // 动态范围配置
    const MIN_DB = -48 // 最低分贝值（可调节声音响度范围）
    const MAX_VELOCITY = 127

    // 空值保护和数值约束
    const safeVelocity = Math.max(0, Math.min(velocity, MAX_VELOCITY))

    // 计算对数增益（包含静音处理）
    let gainValue = 0
    if (safeVelocity > 0) {
      const velocityRatio = (safeVelocity - 1) / (MAX_VELOCITY - 1) // 映射到0-1非线性区间
      const decibels = MIN_DB + velocityRatio * -MIN_DB // 计算分贝值变化
      gainValue = 10 ** (decibels / 20) // 转线性增益
    }

    // 原子化增益设置（避免click声）
    const now = audioContext.currentTime
    velocityGainNode.gain.cancelScheduledValues(now)
    velocityGainNode.gain.setValueAtTime(gainValue, now)
    return velocityGainNode
  }

  let controller = null
  async function generateSingleAudioNode({
    noteId,
    audioTrackId,
    audioContext,
  }) {
    if (controller) return Promise.reject()
    const noteBufferSourceMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.NOTE_BUFFER_SOURCE_MAP,
    })
    const audioBufferSourceNodeMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.AUDIO_BUFFER_SOURCE_NODE_MAP,
    })
    const fadeGainNodeMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.FADE_GAIN_NODE_MAP,
    })
    const velocityGainNodesMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.VELOCITY_GAIN_NODES_MAP,
    })
    const noteBufferSourceInstance = noteBufferSourceMap.get(noteId)
    const {
      pitchName,
      duration: _duration,
      velocity,
    } = noteBufferSourceInstance
    if (audioContext.state === "suspended") {
      await audioContext.resume()
    }
    const audioBufferSourceNode = createBufferSourceNode({
      audioTrackId,
      id: noteId,
      pitchName,
      audioContext,
    })
    const velocityGainNode = createVelocityGainNode({
      audioTrackId,
      id: noteId,
      audioContext,
      velocity,
    })
    const fadeGainNode = createFadeGainNode({
      audioTrackId,
      id: noteId,
      pitchName,
      audioContext,
    })
    const currentTime = audioContext.currentTime
    const fadeOutDuration = 0.8
    fadeGainNode.gain.setValueAtTime(
      fadeGainNode.gain.value,
      currentTime + _duration,
    ) // 保持音量为 1
    fadeGainNode.gain.exponentialRampToValueAtTime(
      0.01,
      currentTime + _duration + fadeOutDuration,
    ) // 淡出至 0

    const stereoPannerNode = audioTrackStereoMap.get(audioTrackId)
    controller = new AbortController()
    audioBufferSourceNode.addEventListener(
      "ended",
      () => {
        controller.abort()
        controller = null
        audioBufferSourceNode.disconnect()
        audioBufferSourceNodeMap.delete(noteId)
        fadeGainNode.disconnect()
        fadeGainNodeMap.delete(noteId)
        velocityGainNode.disconnect()
        velocityGainNodesMap.delete(noteId)
        if (!trackRulerStore.isPlaying) {
          audioContext.suspend()
        }
      },
      {
        once: true,
      },
    )
    audioBufferSourceNode
      .connect(fadeGainNode)
      .connect(velocityGainNode)
      .connect(stereoPannerNode)
    audioBufferSourceNode.start(currentTime, 0, _duration + fadeOutDuration)
    return controller
  }

  function generateAudioNode({
    audioTracksBufferSourceMap,
    timelinePlayTime,
    generableAudioTimeEnd,
    audioContext,
  }) {
    if (audioContext.state === "suspended") return

    for (const [audioTrackId, audioInfo] of audioTracksBufferSourceMap) {
      const noteBufferSourceMap = getSpecifiedAudioTracksProperty({
        audioTrackId,
        property: virtualInstrumentTypeDataProperty.NOTE_BUFFER_SOURCE_MAP,
      })
      const audioBufferSourceNodeMap = getSpecifiedAudioTracksProperty({
        audioTrackId,
        property:
          virtualInstrumentTypeDataProperty.AUDIO_BUFFER_SOURCE_NODE_MAP,
      })
      const audioControllerMap = getSpecifiedAudioTracksProperty({
        audioTrackId,
        property: virtualInstrumentTypeDataProperty.AUDIO_CONTROLLER_MAP,
      })
      const fadeGainNodeMap = getSpecifiedAudioTracksProperty({
        audioTrackId,
        property: virtualInstrumentTypeDataProperty.FADE_GAIN_NODE_MAP,
      })
      const velocityGainNodesMap = getSpecifiedAudioTracksProperty({
        audioTrackId,
        property: virtualInstrumentTypeDataProperty.VELOCITY_GAIN_NODES_MAP,
      })
      const stereoPannerNode = audioTrackStereoMap.get(audioTrackId)
      for (const [id, noteBufferSourceInstance] of noteBufferSourceMap) {
        let startTime = 0
        let duration = 0
        let offsetTime = 0
        let isPlayedInMiddle = false
        const {
          pitchName,
          startTime: _startTime,
          duration: _duration,
          velocity,
        } = noteBufferSourceInstance
        if (_startTime >= generableAudioTimeEnd) continue
        if (timelinePlayTime > _startTime + _duration) continue
        else if (
          timelinePlayTime >= _startTime &&
          timelinePlayTime <= _startTime + _duration
        ) {
          startTime = 0
          offsetTime = timelinePlayTime - _startTime
          duration = _duration - offsetTime
          isPlayedInMiddle = true
        } else if (timelinePlayTime < _startTime) {
          startTime = _startTime - timelinePlayTime
          duration = _duration
        }

        if (audioControllerMap.has(id)) continue //避免这种情况：动态生成2秒内的音频，而有一段音频从1.5秒到2.5秒，这样在0-2秒会被生成一次，2-4秒又会生成
        const audioBufferSourceNode = createBufferSourceNode({
          audioTrackId,
          id,
          pitchName,
          audioContext,
        })
        const velocityGainNode = createVelocityGainNode({
          audioTrackId,
          id,
          audioContext,
          velocity,
        })
        const audioController = new AbortController()
        audioControllerMap.set(id, audioController)
        audioBufferSourceNode.addEventListener(
          "ended",
          () => {
            audioControllerMap.get(id).abort()
            audioControllerMap.delete(id)
            audioBufferSourceNode.disconnect()
            audioBufferSourceNodeMap.delete(id)
            scheduler.cleanup()
            fadeGainNodeMap.get(id)?.disconnect()
            fadeGainNodeMap.delete(id)
            velocityGainNodesMap.get(id)?.disconnect()
            velocityGainNodesMap.delete(id)
          },
          {
            signal: audioController.signal,
          },
        )
        const fadeGainNode = createFadeGainNode({
          audioTrackId,
          id,
          pitchName,
          audioContext,
        })
        const audioStartTime = audioContext.currentTime + startTime

        if (isPlayedInMiddle) {
          const fadeInStartTime = audioStartTime // 淡入开始时间
          const fadeInDuration = 0.01 // 淡入效果持续时间（秒）
          gainNodeFadeIn(fadeGainNode, {
            startTime: fadeInStartTime,
            duration,
            fadeInDuration,
          })
        }
        const fadeOutDuration = 0.8
        gainNodeFadeOut(fadeGainNode, {
          startTime: audioStartTime,
          duration,
          fadeOutDuration,
        })
        // velocityGainNode 和fadeGainNode的连接顺序是有讲究的
        scheduler
          .schedule(audioBufferSourceNode, id, () =>
            noteItemStore.simulatePlaySpecifiedNote(
              pitchName,
              audioController.signal,
            ),
          )
          .connect(fadeGainNode)
          .connect(velocityGainNode)
          .connect(stereoPannerNode)
        audioBufferSourceNode.start(
          audioStartTime,
          offsetTime,
          duration + fadeOutDuration,
        )
      }
    }
  }

  function gainNodeFadeIn(
    fadeGainNode,
    { startTime, duration, fadeInDuration = 0.01 },
  ) {
    fadeInDuration = Math.min(duration, fadeInDuration)
    const fadeInStopTime = startTime + fadeInDuration
    const fadeInStartTime = fadeInStopTime - fadeInDuration // 淡出开始时间
    fadeGainNode.gain.setValueAtTime(0, fadeInStartTime) // 保持音量为 1
    fadeGainNode.gain.linearRampToValueAtTime(1, fadeInStopTime)
  }

  function gainNodeFadeOut(
    fadeGainNode,
    { startTime, duration, fadeOutDuration = 0.2 },
  ) {
    const fadeOutStopTime = startTime + duration + fadeOutDuration
    const fadeOutStartTime = fadeOutStopTime - fadeOutDuration // 淡出开始时间
    fadeGainNode.gain.setValueAtTime(fadeGainNode.gain.value, fadeOutStartTime) // 保持音量为 1
    fadeGainNode.gain.exponentialRampToValueAtTime(0.01, fadeOutStopTime) // 淡出至 0
  }

  function getSpecifiedAudioTracksProperty({ audioTrackId, property }) {
    return audioTracksBufferSourceMap.value.get(audioTrackId).audioDataInfo[
      property
    ]
  }
  function initAudioTrackBufferSourceMap({ audioTrackId, type }) {
    return audioTypeInit[type](audioTrackId)
  }
  function insertSourceNodeAndGainNode(noteInfo) {
    const audioTrackId = noteInfo.audioTrackId
    const noteBufferSourceMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.NOTE_BUFFER_SOURCE_MAP,
    })
    noteBufferSourceMap.set(noteInfo.id, noteInfo)
  }

  function updateSpecifiedNoteBufferSourceMap({ audioTrackId, newId, oldId }) {
    const noteBufferSourceMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.NOTE_BUFFER_SOURCE_MAP,
    })
    if (!noteBufferSourceMap || !noteBufferSourceMap.has(oldId)) return

    noteBufferSourceMap.set(newId, noteBufferSourceMap.get(oldId))
    noteBufferSourceMap.delete(oldId)
  }

  function removeNodeFromNoteId({ audioTrackId, id }) {
    const noteBufferSourceMap = getSpecifiedAudioTracksProperty({
      audioTrackId,
      property: virtualInstrumentTypeDataProperty.NOTE_BUFFER_SOURCE_MAP,
    })
    noteBufferSourceMap.delete(id)
  }

  function stopAllNodes() {
    const FADE_TIME = 0.05 // 50ms 淡出
    const VOLUME_EPSILON = 0.0001 // 接近零的最小值
    const promises = []
    for (const [audioTrackId, audioInfo] of audioTracksBufferSourceMap.value) {
      if (audioInfo.audioType === AUDIO_TRACK_ENUM.VIRTUAL_INSTRUMENTS) {
        const audioBufferSourceNodeMap = getSpecifiedAudioTracksProperty({
          audioTrackId,
          property:
            virtualInstrumentTypeDataProperty.AUDIO_BUFFER_SOURCE_NODE_MAP,
        })
        const fadeGainNodeMap = getSpecifiedAudioTracksProperty({
          audioTrackId,
          property: virtualInstrumentTypeDataProperty.FADE_GAIN_NODE_MAP,
        })
        for (const [id, audioBufferSourceNode] of audioBufferSourceNodeMap) {
          const fadeGainNode = fadeGainNodeMap.get(id)
          if (!fadeGainNode) return
          const currentTime = audioBufferSourceNode.context.currentTime
          // 配置淡出曲线
          fadeGainNode.gain.cancelScheduledValues(currentTime) // 清除已有调度
          fadeGainNode.gain.setValueAtTime(fadeGainNode.gain.value, currentTime)
          fadeGainNode.gain.linearRampToValueAtTime(
            VOLUME_EPSILON,
            currentTime + FADE_TIME,
          )

          // 延迟停止音源（确保淡出完成）
          const stopTime = currentTime + FADE_TIME + 0.001 // 增益节点是物理执行，也就是说会比stop规定的时刻更靠后，需要留出容差时间避免关闭时的咔哒声（事实上最后还使用了定时器延长了100ms）
          audioBufferSourceNode.stop(stopTime)

          // 为每个节点创建一个 Promise
          const endedPromise = new Promise((resolve) => {
            // 添加一个一次性事件监听器，触发后 resolve
            const onEnded = () => {
              resolve() // 关键：通知该节点已停止
            }
            audioBufferSourceNode.addEventListener("ended", onEnded, {
              once: true,
            })
          })
          promises.push(endedPromise)
        }
      }
    }
    return Promise.all(promises)
  }

  function createStereoPannerNode({ audioTrackId, stereoValue = 0 }) {
    const stereoPannerNode = new StereoPannerNode(audioContext.value, {
      pan: clamp(stereoValue, [-1, 1]),
    })
    audioTrackStereoMap.set(audioTrackId, stereoPannerNode)
    return stereoPannerNode
  }
  function updateAudioTrackStereo({ audioTrackId, stereoValue }) {
    if (!audioTrackStereoMap.has(audioTrackId)) return
    const stereoPannerNode = audioTrackStereoMap.get(audioTrackId)
    stereoPannerNode.pan.value = clamp(stereoValue, [-1, 1])
  }
  function deleteStereoPannerNode(audioTrackId) {
    const stereoPannerNode = audioTrackStereoMap.get(audioTrackId)
    if (!stereoPannerNode) return
    stereoPannerNode.disconnect()
    audioTrackStereoMap.delete(audioTrackId)
  }

  function createAudioTrackVolumeGainNode({ audioTrackId, gainValue = 1 }) {
    const volumeGainNode = audioContext.value.createGain()
    audioTrackVolumeGainNodeMap.set(audioTrackId, volumeGainNode)
    volumeGainNode.gain.value = gainValue
    return volumeGainNode
  }
  function updateAudioTrackVolumeGainNodeValue({ audioTrackId, gainValue }) {
    const volumeGainNode = audioTrackVolumeGainNodeMap.get(audioTrackId)
    if (!volumeGainNode) return

    volumeGainNode.gain.value = gainValue
  }
  function deleteVolumeGainNode(audioTrackId) {
    const volumeGainNode = audioTrackVolumeGainNodeMap.get(audioTrackId)
    if (!volumeGainNode) return
    volumeGainNode.disconnect()
    audioTrackVolumeGainNodeMap.delete(audioTrackId)
  }
  function connectMixGainNode(audioNode) {
    audioNode.connect(mixingGainNode)
  }

  function updateGlobalGainNodeValue(gainValue) {
    globalGainNode.gain.value = gainValue
  }

  function calculateRMS(dataArray) {
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] ** 2
    }
    return Math.sqrt(sum / dataArray.length)
  }

  // 计算峰值
  function calculatePeak(dataArray) {
    let peak = 0
    for (let i = 0; i < dataArray.length; i++) {
      const absValue = Math.abs(dataArray[i])
      if (absValue > peak) {
        peak = absValue
      }
    }
    return peak
  }

  // 计算当前音量的函数
  function calculateVolume() {
    // 用于存储分析数据的数组
    const dataArray = new Float32Array(analyserNode.fftSize)
    analyserNode.getFloatTimeDomainData(dataArray)

    // 计算RMS和峰值
    const rms = Math.max(calculateRMS(dataArray), 1e-6)
    const peak = Math.max(calculatePeak(dataArray), 1e-6)

    // 转换为分贝 (dB)
    const rmsDb = 20 * Math.log10(rms)
    const peakDb = 20 * Math.log10(peak)

    // 假设最小分贝值为-60dB
    const minDB = -60
    const maxDB = 0

    // 限制输入分贝值在期望范围内
    const clampedRmsDB = Math.max(minDB, Math.min(maxDB, rmsDb))
    const clampedPeakDB = Math.max(minDB, Math.min(maxDB, peakDb))

    // 线性归一化到0-1区间
    const rmsNormalized = (clampedRmsDB - minDB) / (maxDB - minDB)
    const peakNormalized = (clampedPeakDB - minDB) / (maxDB - minDB)

    // 选择较大的值来表示当前音量
    const displayNormalized = Math.max(rmsNormalized, peakNormalized)

    return {
      rms: rms,
      peak: peak,
      rmsDb: rmsDb,
      peakDb: peakDb,
      rmsNormalized: rmsNormalized,
      peakNormalized: peakNormalized,
      displayNormalized: displayNormalized, // 显示用的归一化值（RMS和峰值中的较大者）
    }
  }

  let animationFrameId = null
  function updateMeter(signal, normalizedRef) {
    if (!analyserNode || signal.aborted) {
      cancelAnimationFrame(animationFrameId)
      return
    }
    const volume = calculateVolume()
    // 更新UI
    if (isRef(normalizedRef)) {
      normalizedRef.value = volume
    }

    animationFrameId = requestAnimationFrame(() =>
      updateMeter(signal, normalizedRef),
    )
  }

  return {
    audioContext,
    audioTracksBufferSourceMap,
    generateSingleAudioNode,
    generateAudioNode,
    stopAllNodes,
    removeNodeFromNoteId,
    insertSourceNodeAndGainNode,
    updateSpecifiedNoteBufferSourceMap,
    initAudioTrackBufferSourceMap,
    createStereoPannerNode,
    updateAudioTrackStereo,
    deleteStereoPannerNode,
    createAudioTrackVolumeGainNode,
    updateAudioTrackVolumeGainNodeValue,
    deleteVolumeGainNode,
    connectMixGainNode,
    updateGlobalGainNodeValue,
    updateMeter,
  }
})
