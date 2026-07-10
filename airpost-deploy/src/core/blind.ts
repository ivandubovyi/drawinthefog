import getStroke from 'perfect-freehand'
import type { Pt, SessionAnalytics } from './types'

export type Stroke = Pt[]

export class BlindCanvas {
  strokes: Stroke[] = []
  private current: Stroke | null = null
  private lastDown = false
  private lifts = 0
  startedAt = 0
  endedAt = 0

  beginSession() {
    this.strokes = []
    this.current = null
    this.lastDown = false
    this.lifts = 0
    this.startedAt = performance.now()
    this.endedAt = 0
  }

  feed(
    x: number,
    y: number,
    penDown: boolean,
    now: number,
    w: number,
    h: number,
    pressure: number,
    depth: number,
  ) {
    const px = x * w
    const py = y * h
    const p = Math.min(1, Math.max(0.12, pressure))

    if (penDown && !this.lastDown) {
      this.current = [{ x: px, y: py, t: now, drawing: true, p, depth }]
    } else if (penDown && this.current) {
      const last = this.current[this.current.length - 1]
      if (Math.hypot(px - last.x, py - last.y) >= 1.2) {
        this.current.push({ x: px, y: py, t: now, drawing: true, p, depth })
      }
    } else if (!penDown && this.lastDown && this.current) {
      if (this.current.length >= 2) {
        this.strokes.push(this.current)
        this.lifts++
      }
      this.current = null
    }
    this.lastDown = penDown
  }

  undoLastStroke() {
    if (this.current) {
      this.current = null
      this.lastDown = false
      return true
    }
    if (this.strokes.length) {
      this.strokes.pop()
      return true
    }
    return false
  }

  endSession() {
    if (this.current && this.current.length >= 2) {
      this.strokes.push(this.current)
      this.lifts++
    }
    this.current = null
    this.lastDown = false
    this.endedAt = performance.now()
  }

  get durationMs() {
    return Math.max(0, (this.endedAt || performance.now()) - this.startedAt)
  }

  get strokeCount() {
    return this.strokes.length + (this.current && this.current.length >= 2 ? 1 : 0)
  }

  allStrokes(): Stroke[] {
    const all = [...this.strokes]
    if (this.current && this.current.length >= 2) all.push(this.current)
    return all
  }

  analyze(): SessionAnalytics {
    const all = this.allStrokes()
    let pathLength = 0
    let pressSum = 0
    let n = 0
    let minD = 1
    let maxD = 0
    const speeds: number[] = []
    const hotspots: { x: number; y: number; intensity: number }[] = []

    for (const stroke of all) {
      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i]
        pressSum += p.p
        n++
        minD = Math.min(minD, p.depth)
        maxD = Math.max(maxD, p.depth)
        if (i > 0) {
          const a = stroke[i - 1]
          const dist = Math.hypot(p.x - a.x, p.y - a.y)
          pathLength += dist
          const dt = Math.max(1, p.t - a.t)
          const spd = dist / dt
          speeds.push(spd)
          // hesitation = very slow while pen down
          if (spd < 0.08 && dist > 0.5) {
            hotspots.push({ x: p.x, y: p.y, intensity: 1 - spd / 0.08 })
          }
        }
      }
    }

    // steadiness: inverse of speed variance
    let steadiness = 70
    if (speeds.length > 4) {
      const mean = speeds.reduce((s, v) => s + v, 0) / speeds.length
      const variance =
        speeds.reduce((s, v) => s + (v - mean) ** 2, 0) / speeds.length
      steadiness = Math.max(0, Math.min(100, 100 - Math.sqrt(variance) * 180))
    }

    // cluster hotspots lightly
    const clustered: { x: number; y: number; intensity: number }[] = []
    for (const h of hotspots) {
      const near = clustered.find((c) => Math.hypot(c.x - h.x, c.y - h.y) < 28)
      if (near) {
        near.intensity = Math.min(1, near.intensity + h.intensity * 0.3)
        near.x = (near.x + h.x) / 2
        near.y = (near.y + h.y) / 2
      } else if (clustered.length < 24) {
        clustered.push({ ...h })
      }
    }

    return {
      strokeCount: all.length,
      liftCount: this.lifts,
      pathLength,
      durationMs: this.durationMs,
      avgPressure: n ? pressSum / n : 0.5,
      depthRange: Math.max(0, maxD - minD),
      steadiness,
      hesitationHotspots: clustered,
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    opts: {
      color?: string
      progress?: number
      sizeMul?: number
      usePressure?: boolean
    } = {},
  ) {
    const color = opts.color ?? '#1a2430'
    const progress = opts.progress ?? 1
    const sizeMul = opts.sizeMul ?? 1
    const usePressure = opts.usePressure ?? true
    const all = this.allStrokes()

    let totalPts = 0
    for (const s of all) totalPts += s.length
    const visible = Math.floor(totalPts * progress)
    let seen = 0

    for (const stroke of all) {
      const take = Math.min(stroke.length, Math.max(0, visible - seen))
      seen += stroke.length
      if (take < 2) continue
      const slice = stroke.slice(0, take)
      const avgP = slice.reduce((s, p) => s + p.p, 0) / slice.length
      const pts = slice.map((p) => [p.x, p.y, usePressure ? p.p : 0.5] as number[])
      const outline = getStroke(pts, {
        size: (4.5 + avgP * 8) * sizeMul,
        thinning: 0.55,
        smoothing: 0.5,
        streamline: 0.35,
        start: { taper: 10, cap: true },
        end: { taper: 12, cap: true },
      })
      if (!outline.length) continue
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(outline[0][0], outline[0][1])
      for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1])
      ctx.closePath()
      ctx.fill()
    }
  }

  renderHeatmap(ctx: CanvasRenderingContext2D, analytics: SessionAnalytics) {
    for (const h of analytics.hesitationHotspots) {
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 22 + h.intensity * 18)
      g.addColorStop(0, `rgba(255, 107, 74, ${0.35 * h.intensity})`)
      g.addColorStop(1, 'rgba(255, 107, 74, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(h.x, h.y, 22 + h.intensity * 18, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  toDataURL(
    w: number,
    h: number,
    prompt: string,
    author: string,
    extras?: { twin?: Stroke[]; showHeat?: boolean },
  ): string {
    const c = document.createElement('canvas')
    c.width = Math.floor(w)
    c.height = Math.floor(h)
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#f7f0e4')
    g.addColorStop(1, '#ebe1d0')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    if (extras?.showHeat) this.renderHeatmap(ctx, this.analyze())
    this.render(ctx, { color: '#1a2430' })

    if (extras?.twin?.length) {
      ctx.save()
      ctx.globalAlpha = 0.55
      for (const stroke of extras.twin) {
        if (stroke.length < 2) continue
        const pts = stroke.map((p) => [p.x, p.y, 0.55] as number[])
        const outline = getStroke(pts, {
          size: 5,
          thinning: 0.3,
          smoothing: 0.65,
          streamline: 0.5,
        })
        if (!outline.length) continue
        ctx.fillStyle = '#2f6b8a'
        ctx.beginPath()
        ctx.moveTo(outline[0][0], outline[0][1])
        for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1])
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    ctx.fillStyle = 'rgba(26,36,48,0.55)'
    ctx.font = '600 18px system-ui, sans-serif'
    ctx.fillText(`airpost · ${prompt}`, 24, h - 36)
    ctx.font = '500 14px system-ui, sans-serif'
    ctx.fillText(author || 'anonymous', 24, h - 16)
    return c.toDataURL('image/png')
  }
}
