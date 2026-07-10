import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { HandState } from './types'

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

type LM = { x: number; y: number; z: number }

function dist(a: LM, b: LM) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function isPenDown(lm: LM[]): boolean {
  const wrist = lm[0]
  const thumbTip = lm[4]
  const indexTip = lm[8]
  const indexPip = lm[6]
  const middleTip = lm[12]
  const ringTip = lm[16]
  const pinkyTip = lm[20]

  const pinch = dist(thumbTip, indexTip)
  if (pinch < 0.048) return false

  const indexExt = dist(indexTip, wrist) > dist(indexPip, wrist) * 1.05
  const others =
    (dist(middleTip, wrist) + dist(ringTip, wrist) + dist(pinkyTip, wrist)) / 3
  const pointing = dist(indexTip, wrist) > others * 0.92
  return indexExt && pointing
}

/** Open palm: all fingertips far from wrist, low curl — used as eraser. */
function isPalmOpen(lm: LM[]): boolean {
  const wrist = lm[0]
  const tips = [lm[8], lm[12], lm[16], lm[20], lm[4]]
  const pips = [lm[6], lm[10], lm[14], lm[18], lm[3]]
  let extended = 0
  for (let i = 0; i < tips.length; i++) {
    if (dist(tips[i], wrist) > dist(pips[i], wrist) * 1.15) extended++
  }
  // not pinching
  const pinch = dist(lm[4], lm[8])
  return extended >= 4 && pinch > 0.08
}

export class FingerTracker {
  private landmarker: HandLandmarker | null = null
  private video: HTMLVideoElement
  private lastVideoTime = -1
  private depthEma = 0.5
  ready = false

  constructor(video: HTMLVideoElement) {
    this.video = video
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM)
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    this.ready = true
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    this.video.srcObject = stream
    await this.video.play()
  }

  detect(now: number): HandState {
    const empty: HandState = {
      index: null,
      penDown: false,
      palmOpen: false,
      pinch: 1,
      confidence: 0,
      depth: this.depthEma,
    }
    if (!this.landmarker || this.video.readyState < 2) return empty
    if (this.video.currentTime === this.lastVideoTime) return empty
    this.lastVideoTime = this.video.currentTime

    const result = this.landmarker.detectForVideo(this.video, now)
    if (!result.landmarks?.length) return empty

    const lm = result.landmarks[0] as LM[]
    const tip = lm[8]
    // MediaPipe z: more negative ≈ closer to camera
    const rawDepth = Math.min(1, Math.max(0, 0.5 - tip.z * 2.2))
    this.depthEma = this.depthEma * 0.85 + rawDepth * 0.15
    const pinch = dist(lm[4], lm[8])

    return {
      index: { x: 1 - tip.x, y: tip.y, z: tip.z },
      penDown: isPenDown(lm) && !isPalmOpen(lm),
      palmOpen: isPalmOpen(lm),
      pinch,
      confidence: 1,
      depth: this.depthEma,
    }
  }

  stop() {
    const stream = this.video.srcObject as MediaStream | null
    stream?.getTracks().forEach((t) => t.stop())
    this.video.srcObject = null
  }
}
