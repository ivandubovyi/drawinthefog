import type { Pt } from './types'
import type { Stroke } from './blind'

type Vec = { x: number; y: number }

function dist(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Ramer–Douglas–Peucker simplification */
function rdp(points: Vec[], epsilon: number): Vec[] {
  if (points.length < 3) return points.slice()
  let maxD = 0
  let idx = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last)
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon)
    const right = rdp(points.slice(idx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [first, last]
}

function perpDist(p: Vec, a: Vec, b: Vec) {
  const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x)
  const den = Math.hypot(b.y - a.y, b.x - a.x) || 1
  return num / den
}

function fitCircle(pts: Vec[]): { cx: number; cy: number; r: number; error: number } | null {
  if (pts.length < 5) return null
  let sumX = 0,
    sumY = 0
  for (const p of pts) {
    sumX += p.x
    sumY += p.y
  }
  const cx = sumX / pts.length
  const cy = sumY / pts.length
  let r = 0
  for (const p of pts) r += dist(p, { x: cx, y: cy })
  r /= pts.length
  if (r < 12) return null
  let err = 0
  for (const p of pts) err += Math.abs(dist(p, { x: cx, y: cy }) - r)
  err /= pts.length * r
  return { cx, cy, r, error: err }
}

function resampleStroke(stroke: Pt[], n: number): Pt[] {
  if (stroke.length < 2) return stroke.slice()
  let total = 0
  const seg = [0]
  for (let i = 1; i < stroke.length; i++) {
    total += dist(stroke[i], stroke[i - 1])
    seg.push(total)
  }
  if (total < 1) return stroke.slice()
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total
    let j = 1
    while (j < seg.length && seg[j] < target) j++
    const a = stroke[j - 1]
    const b = stroke[Math.min(j, stroke.length - 1)]
    const span = seg[Math.min(j, seg.length - 1)] - seg[j - 1] || 1
    const f = (target - seg[j - 1]) / span
    out.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      t: a.t + (b.t - a.t) * f,
      drawing: true,
      p: a.p + (b.p - a.p) * f,
      depth: a.depth + (b.depth - a.depth) * f,
    })
  }
  return out
}

function circleStroke(cx: number, cy: number, r: number, n = 48): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 2
    out.push({
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      t: i,
      drawing: true,
      p: 0.55,
      depth: 0.5,
    })
  }
  return out
}

export type TwinResult = {
  strokes: Stroke[]
  label: string
  confidence: number
  notes: string[]
}

/**
 * Intention Twin: reconstruct what the hand *might* have meant.
 * Uses RDP simplification + circle detection — a geometric “mind-read”
 * shown beside the raw fog drawing.
 */
export function buildIntentionTwin(raw: Stroke[]): TwinResult {
  if (!raw.length) {
    return { strokes: [], label: 'empty', confidence: 0, notes: ['No strokes to interpret.'] }
  }

  const twin: Stroke[] = []
  const notes: string[] = []
  let circleHits = 0
  let lineHits = 0

  for (const stroke of raw) {
    if (stroke.length < 3) continue
    const simplified = rdp(
      stroke.map((p) => ({ x: p.x, y: p.y })),
      4.5,
    )
    const circle = fitCircle(stroke)

    // Closed-ish loop + low circle error → snap to circle
    const startEnd = dist(stroke[0], stroke[stroke.length - 1])
    const pathLen = stroke.reduce(
      (s, p, i) => (i ? s + dist(p, stroke[i - 1]) : 0),
      0,
    )
    const closed = startEnd < pathLen * 0.18

    if (circle && circle.error < 0.22 && closed) {
      twin.push(circleStroke(circle.cx, circle.cy, circle.r))
      circleHits++
      continue
    }

    // Nearly straight → snap to line
    if (simplified.length <= 3) {
      const a = stroke[0]
      const b = stroke[stroke.length - 1]
      const line: Pt[] = []
      for (let i = 0; i < 24; i++) {
        const f = i / 23
        line.push({
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          t: a.t + (b.t - a.t) * f,
          drawing: true,
          p: 0.5,
          depth: 0.5,
        })
      }
      twin.push(line)
      lineHits++
      continue
    }

    // Otherwise: smoothed resample of simplified polyline
    const keyed: Pt[] = simplified.map((p) => {
      const nearest = stroke.reduce(
        (best, q) => (dist(q, p) < dist(best, p) ? q : best),
        stroke[0],
      )
      return {
        x: p.x,
        y: p.y,
        t: nearest.t,
        drawing: true,
        p: nearest.p,
        depth: nearest.depth,
      }
    })
    twin.push(resampleStroke(keyed, Math.min(64, Math.max(16, keyed.length * 4))))
  }

  if (circleHits) notes.push(`Snapped ${circleHits} loop${circleHits > 1 ? 's' : ''} → circle`)
  if (lineHits) notes.push(`Snapped ${lineHits} stroke${lineHits > 1 ? 's' : ''} → line`)
  notes.push('Smoothed remaining gesture with Ramer–Douglas–Peucker')

  const confidence = Math.min(
    95,
    40 + circleHits * 12 + lineHits * 8 + Math.min(20, twin.length * 4),
  )

  let label = 'gesture'
  if (circleHits >= 2 && lineHits >= 1) label = 'wheels + frame?'
  else if (circleHits >= 1 && raw.length <= 2) label = 'orb / moon / head'
  else if (lineHits >= 3) label = 'structure / skyline'
  else if (raw.length >= 5) label = 'complex figure'

  return { strokes: twin, label, confidence, notes }
}

export function renderTwin(
  ctx: CanvasRenderingContext2D,
  twin: Stroke[],
  color = 'rgba(47, 107, 138, 0.7)',
) {
  for (const stroke of twin) {
    if (stroke.length < 2) continue
    ctx.strokeStyle = color
    ctx.lineWidth = 3.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
    ctx.stroke()
  }
}
