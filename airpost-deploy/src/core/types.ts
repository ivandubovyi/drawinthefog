export type Pt = {
  x: number
  y: number
  t: number
  drawing: boolean
  /** 0..1 from hand depth / speed */
  p: number
  /** normalized depth (closer = higher) */
  depth: number
}

export type Prompt = {
  id: string
  label: string
  hint: string
  difficulty: 'easy' | 'medium' | 'wild'
  /** optional SVG path in 0..1 space for memory flash */
  silhouette?: string
}

export type Post = {
  id: string
  prompt: string
  promptId: string
  author: string
  createdAt: number
  image: string
  twinImage?: string
  likes: number
  guesses: number
  correctGuesses: number
  strokeCount: number
  durationMs: number
  steadiness: number
  mode: 'classic' | 'flash'
}

export type Phase =
  | 'lobby'
  | 'ready'
  | 'flash'
  | 'drawing'
  | 'replay'
  | 'unveil'
  | 'post'
  | 'wall'

export type HandState = {
  index: { x: number; y: number; z: number } | null
  penDown: boolean
  /** open palm facing camera — erase last stroke */
  palmOpen: boolean
  pinch: number
  confidence: number
  /** 0..1 closer to camera */
  depth: number
}

export type DrawMode = 'classic' | 'flash'

export type SessionAnalytics = {
  strokeCount: number
  liftCount: number
  pathLength: number
  durationMs: number
  avgPressure: number
  depthRange: number
  steadiness: number
  hesitationHotspots: { x: number; y: number; intensity: number }[]
}
