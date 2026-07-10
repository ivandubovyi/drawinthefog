import './style.css'
import { FingerTracker } from './core/hands'
import { BlindCanvas } from './core/blind'
import { drawSilhouette, guessOptions, pickPrompt } from './core/prompts'
import {
  addPost,
  guessPost,
  hasGuessed,
  likePost,
  loadWall,
  markGuessed,
} from './core/wall'
import { buildIntentionTwin, renderTwin } from './core/twin'
import type { DrawMode, Phase, Post, Prompt, SessionAnalytics } from './core/types'

const app = document.querySelector<HTMLDivElement>('#app')!
const DRAW_SECONDS = 25
const FLASH_MS = 900

function uid() {
  return `p_${Math.random().toString(36).slice(2, 10)}`
}

function lobby() {
  app.innerHTML = `
    <section class="lobby">
      <div class="fog-layer" aria-hidden="true"></div>
      <div class="lobby-main">
        <div class="lobby-card">
          <p class="eyebrow">Hack the Arts · blind air drawing</p>
          <h1>
            Draw in the fog.
            <span class="soft">Depth ink · Intention twin · Memory flash · Guess the wall</span>
          </h1>
          <p class="lede">
            Point your finger through mist. The computer hides every mark,
            then reconstructs what your hand might have meant —
            and strangers guess the prompt on the wall.
          </p>
          <div class="rules">
            <div class="rule"><div class="n">DEPTH</div><p>Move closer → thicker ink. Z from MediaPipe drives pressure.</p></div>
            <div class="rule"><div class="n">TWIN</div><p>After unveil, an Intention Twin snaps loops to circles & smooths gesture.</p></div>
            <div class="rule"><div class="n">FLASH</div><p>Hard mode: a 0.9s silhouette, then pure fog. Palm open = undo.</p></div>
          </div>
          <div class="cta-row">
            <button class="btn btn-coral" id="play">Classic fog</button>
            <button class="btn btn-ghost" id="flash">Memory flash</button>
            <button class="btn btn-ghost" id="wall">The wall</button>
          </div>
        </div>
      </div>
      <div class="lobby-foot">
        <span>Cinematic replay · hesitation heatmap · guess-the-prompt social layer</span>
        <button type="button" id="why">Tech deep-dive</button>
      </div>
    </section>
  `

  document.querySelector('#why')?.addEventListener('click', () => {
    alert(
      'Hard pieces under the hood:\n\n' +
        '• MediaPipe Hand Landmarker → index tip + Z-depth pressure + palm-open undo\n' +
        '• Hidden stroke buffer (you never see ink while drawing)\n' +
        '• Cinematic fog replay of the exact timed gesture\n' +
        '• Intention Twin: Ramer–Douglas–Peucker + circle fitting\n' +
        '• Hesitation heatmap from micro-speed analysis\n' +
        '• Memory Flash silhouettes + Wall “guess the prompt” game\n\n' +
        'None of that exists as a physical medium.',
    )
  })
  document.querySelector('#play')?.addEventListener('click', () => void play('classic'))
  document.querySelector('#flash')?.addEventListener('click', () => void play('flash'))
  document.querySelector('#wall')?.addEventListener('click', () => showWall())
}

async function play(mode: DrawMode) {
  app.innerHTML = `
    <div class="stage">
      <header class="stage-top">
        <div class="brand-mini">air<span>post</span></div>
        <div class="prompt-pill" id="prompt-pill">warming up…</div>
        <div class="top-right">
          <span class="mode-tag" id="mode-tag">${mode === 'flash' ? 'FLASH' : 'CLASSIC'}</span>
          <button class="btn btn-ghost" id="to-wall" style="padding:0.5rem 0.9rem;font-size:0.8rem">Wall</button>
        </div>
      </header>
      <main class="arena" id="arena">
        <video id="cam" playsinline muted autoplay></video>
        <canvas id="ink"></canvas>
        <canvas id="veil"></canvas>
        <canvas id="hud-canvas"></canvas>
        <div class="status-chip"><span class="dot" id="dot"></span><span id="status">Calibrating</span></div>
        <div class="timer" id="timer">${DRAW_SECONDS}</div>
        <div class="depth-meter" id="depth-meter" title="Hand depth → ink weight">
          <div class="depth-fill" id="depth-fill"></div>
        </div>
        <div class="veil-msg" id="veil-msg">
          <div class="big">The fog holds your marks</div>
          <div class="small">Point = ink · Pinch = lift · Palm = undo</div>
        </div>
      </main>
      <footer class="stage-bottom">
        <div class="hint-line" id="hint">Allow camera, then stand so your hand is visible.</div>
        <div class="actions">
          <button class="btn btn-ghost" id="skip" disabled>New prompt</button>
          <button class="btn btn-coral" id="primary" disabled>Start</button>
        </div>
      </footer>
    </div>
  `

  const video = document.querySelector('#cam') as HTMLVideoElement
  const ink = document.querySelector('#ink') as HTMLCanvasElement
  const veil = document.querySelector('#veil') as HTMLCanvasElement
  const hud = document.querySelector('#hud-canvas') as HTMLCanvasElement
  const arena = document.querySelector('#arena') as HTMLElement
  const primary = document.querySelector('#primary') as HTMLButtonElement
  const skip = document.querySelector('#skip') as HTMLButtonElement
  const timerEl = document.querySelector('#timer') as HTMLElement
  const hint = document.querySelector('#hint') as HTMLElement
  const status = document.querySelector('#status') as HTMLElement
  const dot = document.querySelector('#dot') as HTMLElement
  const veilMsg = document.querySelector('#veil-msg') as HTMLElement
  const promptPill = document.querySelector('#prompt-pill') as HTMLElement
  const depthFill = document.querySelector('#depth-fill') as HTMLElement

  const ictx = ink.getContext('2d')!
  const vctx = veil.getContext('2d')!
  const hctx = hud.getContext('2d')!

  let w = 0
  let h = 0
  let dpr = 1
  let phase: Phase = 'ready'
  let prompt: Prompt = pickPrompt()
  let remaining = DRAW_SECONDS
  let timerId = 0
  let palmCooldown = 0
  let analytics: SessionAnalytics | null = null
  let twin = buildIntentionTwin([])

  const tracker = new FingerTracker(video)
  const canvas = new BlindCanvas()

  const resize = () => {
    const r = arena.getBoundingClientRect()
    dpr = Math.min(devicePixelRatio || 1, 2)
    w = r.width
    h = r.height
    for (const c of [ink, veil, hud]) {
      c.width = Math.floor(w * dpr)
      c.height = Math.floor(h * dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
    }
    ictx.setTransform(dpr, 0, 0, dpr, 0, 0)
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintVeil(1)
  }
  resize()
  window.addEventListener('resize', resize)

  promptPill.innerHTML = `Draw <strong>${prompt.label}</strong>`
  primary.disabled = true
  skip.disabled = true

  try {
    await tracker.init()
    await tracker.startCamera()
    primary.disabled = false
    skip.disabled = false
    status.textContent = 'Hand ready'
    hint.textContent =
      mode === 'flash'
        ? 'Flash mode: you’ll see a silhouette for under a second, then fog.'
        : `Classic: ${DRAW_SECONDS}s blind. Depth controls ink weight.`
    primary.textContent = mode === 'flash' ? 'Flash & draw' : 'Start drawing'
  } catch (err) {
    status.textContent = 'Camera blocked'
    hint.textContent = err instanceof Error ? err.message : 'Camera required'
    primary.textContent = 'Retry'
    primary.disabled = false
    primary.onclick = () => location.reload()
    return
  }

  const setPrompt = () => {
    prompt = pickPrompt(prompt.id)
    promptPill.innerHTML = `Draw <strong>${prompt.label}</strong>`
    hint.textContent = prompt.hint
  }

  const beginBlindDraw = () => {
    phase = 'drawing'
    canvas.beginSession()
    remaining = DRAW_SECONDS
    timerEl.textContent = String(remaining)
    ictx.clearRect(0, 0, w, h)
    paintVeil(1)
    veilMsg.classList.remove('hidden')
    veilMsg.innerHTML = `<div class="big">Drawing blind</div><div class="small">Closer = thicker · Palm open = undo last stroke</div>`
    primary.textContent = 'Unveil'
    primary.disabled = false
    skip.disabled = true
    hint.textContent = prompt.hint
    window.clearInterval(timerId)
    timerId = window.setInterval(() => {
      remaining -= 1
      timerEl.textContent = String(Math.max(0, remaining))
      if (remaining <= 0) startReplay()
    }, 1000)
  }

  const startFlashThenDraw = () => {
    if (!prompt.silhouette) {
      hint.textContent = 'No silhouette for this prompt — classic blind instead.'
      beginBlindDraw()
      return
    }
    phase = 'flash'
    primary.disabled = true
    skip.disabled = true
    veilMsg.classList.add('hidden')
    status.textContent = 'Memorize'
    hint.textContent = 'Burn this shape into memory…'
    ictx.clearRect(0, 0, w, h)
    paintVeil(0.35)
    drawSilhouette(ictx, prompt.silhouette, w, h, 0.85)
    const t0 = performance.now()
    const tick = (now: number) => {
      const u = (now - t0) / FLASH_MS
      paintVeil(0.35 + u * 0.65)
      ictx.clearRect(0, 0, w, h)
      if (u < 1) {
        drawSilhouette(ictx, prompt.silhouette!, w, h, 0.85 * (1 - u))
        requestAnimationFrame(tick)
      } else {
        ictx.clearRect(0, 0, w, h)
        beginBlindDraw()
      }
    }
    requestAnimationFrame(tick)
  }

  const startReplay = () => {
    if (phase !== 'drawing') return
    window.clearInterval(timerId)
    canvas.endSession()
    analytics = canvas.analyze()
    twin = buildIntentionTwin(canvas.allStrokes())
    phase = 'replay'
    primary.disabled = true
    veilMsg.classList.add('hidden')
    status.textContent = 'Replay'
    hint.textContent = 'Cinematic fog replay — your exact gesture, still veiled…'

    const strokes = canvas.allStrokes()
    if (!strokes.length) {
      runUnveil()
      return
    }

    // Flatten timed points relative to session start
    type Ev = { x: number; y: number; p: number; t: number; stroke: number }
    const events: Ev[] = []
    strokes.forEach((s, si) => {
      for (const p of s) events.push({ x: p.x, y: p.y, p: p.p, t: p.t, stroke: si })
    })
    const t0 = events[0].t
    const t1 = events[events.length - 1].t
    const span = Math.max(800, t1 - t0)
    const playDur = Math.min(3200, Math.max(1400, span * 0.55))
    const start = performance.now()

    const tick = (now: number) => {
      const u = Math.min(1, (now - start) / playDur)
      const simT = t0 + u * span
      paintVeil(0.92)
      hctx.clearRect(0, 0, w, h)
      ictx.clearRect(0, 0, w, h)

      // draw partial strokes into ink at low alpha under heavy veil — still "hidden" feel
      // Actually keep ink clear and only show tip trail on hud for true blind aesthetic
      let tip: Ev | null = null
      for (const e of events) {
        if (e.t <= simT) tip = e
      }
      // ghost trail of last N points
      const trail = events.filter((e) => e.t <= simT && e.t > simT - 180)
      if (trail.length > 1) {
        hctx.beginPath()
        hctx.strokeStyle = 'rgba(255,107,74,0.35)'
        hctx.lineWidth = 2
        hctx.moveTo(trail[0].x, trail[0].y)
        for (let i = 1; i < trail.length; i++) hctx.lineTo(trail[i].x, trail[i].y)
        hctx.stroke()
      }
      if (tip) {
        const r = 6 + tip.p * 10
        hctx.beginPath()
        hctx.fillStyle = 'rgba(255,107,74,0.9)'
        hctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2)
        hctx.fill()
        hctx.strokeStyle = 'rgba(255,107,74,0.5)'
        hctx.beginPath()
        hctx.arc(tip.x, tip.y, r, 0, Math.PI * 2)
        hctx.stroke()
      }

      timerEl.textContent = `${Math.round(u * 100)}%`
      if (u < 1) requestAnimationFrame(tick)
      else runUnveil()
    }
    requestAnimationFrame(tick)
  }

  const runUnveil = () => {
    phase = 'unveil'
    status.textContent = 'Unveiling'
    hint.textContent = 'Paper rises. Intention Twin overlays in blue.'
    const t0 = performance.now()
    const dur = 1800
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / dur)
      const p = easeOut(u)
      paintVeil(1 - p)
      ictx.clearRect(0, 0, w, h)
      if (p > 0.12) {
        ictx.fillStyle = `rgba(243,235,224,${Math.min(1, (p - 0.12) * 1.3)})`
        ictx.fillRect(0, 0, w, h)
      }
      if (analytics && p > 0.4) {
        ictx.globalAlpha = Math.min(1, (p - 0.4) * 2) * 0.85
        canvas.renderHeatmap(ictx, analytics)
        ictx.globalAlpha = 1
      }
      canvas.render(ictx, { color: '#1a2430', progress: p })
      if (p > 0.55) {
        ictx.globalAlpha = Math.min(1, (p - 0.55) * 2.2) * 0.75
        renderTwin(ictx, twin.strokes)
        ictx.globalAlpha = 1
      }
      if (u < 1) requestAnimationFrame(tick)
      else openPostModal()
    }
    requestAnimationFrame(tick)
  }

  const openPostModal = () => {
    phase = 'post'
    const exportW = Math.max(720, w)
    const exportH = Math.max(540, h)
    const rawUrl = canvas.toDataURL(exportW, exportH, prompt.label, '', { showHeat: true })
    const twinUrl = canvas.toDataURL(exportW, exportH, prompt.label, '', {
      twin: twin.strokes,
      showHeat: false,
    })
    const a = analytics ?? canvas.analyze()

    const overlay = document.createElement('div')
    overlay.className = 'reveal-panel'
    overlay.innerHTML = `
      <div class="reveal-card wide">
        <div class="dual">
          <figure>
            <img src="${rawUrl}" alt="Raw hand" />
            <figcaption>Raw hand + hesitation heat</figcaption>
          </figure>
          <figure>
            <img src="${twinUrl}" alt="Intention twin" />
            <figcaption>Intention Twin · ${escapeHtml(twin.label)} · ${twin.confidence}%</figcaption>
          </figure>
        </div>
        <div class="reveal-body">
          <h2>You meant: ${escapeHtml(prompt.label)}</h2>
          <p class="sub">${a.strokeCount} strokes · ${a.liftCount} lifts · steadiness ${Math.round(a.steadiness)} · ${(a.durationMs / 1000).toFixed(1)}s</p>
          <div class="analytics">
            <div><b>${Math.round(a.pathLength)}</b><span>path px</span></div>
            <div><b>${Math.round(a.avgPressure * 100)}%</b><span>avg pressure</span></div>
            <div><b>${Math.round(a.depthRange * 100)}%</b><span>depth range</span></div>
            <div><b>${a.hesitationHotspots.length}</b><span>hesitations</span></div>
          </div>
          <p class="twin-notes">${twin.notes.map(escapeHtml).join(' · ')}</p>
          <div class="field">
            <label>Sign it</label>
            <input id="author" maxlength="24" placeholder="your name / handle" />
          </div>
          <div class="reveal-actions">
            <button class="btn btn-ink" id="post">Post to the wall</button>
            <button class="btn btn-paper" id="again">Draw again</button>
            <button class="btn btn-paper" id="dl">Download twin</button>
          </div>
        </div>
      </div>
    `
    app.querySelector('.stage')!.appendChild(overlay)

    overlay.querySelector('#dl')?.addEventListener('click', () => {
      const a = document.createElement('a')
      a.href = twinUrl
      a.download = `airpost-twin-${prompt.id}.png`
      a.click()
    })
    overlay.querySelector('#again')?.addEventListener('click', () => {
      overlay.remove()
      resetRound()
    })
    overlay.querySelector('#post')?.addEventListener('click', () => {
      const author =
        (overlay.querySelector('#author') as HTMLInputElement).value.trim() || 'anonymous'
      const signed = canvas.toDataURL(exportW, exportH, '???', author, { showHeat: true })
      const post: Post = {
        id: uid(),
        prompt: prompt.label,
        promptId: prompt.id,
        author,
        createdAt: Date.now(),
        image: signed,
        twinImage: twinUrl,
        likes: 0,
        guesses: 0,
        correctGuesses: 0,
        strokeCount: a.strokeCount,
        durationMs: a.durationMs,
        steadiness: a.steadiness,
        mode,
      }
      addPost(post)
      overlay.remove()
      showWall(post.id)
    })
  }

  const resetRound = () => {
    phase = 'ready'
    setPrompt()
    ictx.clearRect(0, 0, w, h)
    hctx.clearRect(0, 0, w, h)
    paintVeil(1)
    veilMsg.classList.remove('hidden')
    veilMsg.innerHTML = `<div class="big">The fog holds your marks</div><div class="small">Point = ink · Pinch = lift · Palm = undo</div>`
    primary.disabled = false
    skip.disabled = false
    primary.textContent = mode === 'flash' ? 'Flash & draw' : 'Start drawing'
    remaining = DRAW_SECONDS
    timerEl.textContent = String(DRAW_SECONDS)
    status.textContent = 'Hand ready'
    hint.textContent = prompt.hint
  }

  function paintVeil(opacity: number) {
    vctx.clearRect(0, 0, w, h)
    if (opacity <= 0.01) return
    const g = vctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      20,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.7,
    )
    g.addColorStop(0, `rgba(40, 70, 85, ${0.55 * opacity})`)
    g.addColorStop(0.55, `rgba(18, 36, 46, ${0.82 * opacity})`)
    g.addColorStop(1, `rgba(8, 16, 22, ${0.95 * opacity})`)
    vctx.fillStyle = g
    vctx.fillRect(0, 0, w, h)
    vctx.globalAlpha = 0.12 * opacity
    for (let i = 0; i < 40; i++) {
      const y = ((i / 40) * h + performance.now() * 0.01 * (i % 3)) % h
      vctx.fillStyle = i % 2 ? '#8fadb8' : '#1c303c'
      vctx.fillRect(0, y, w, 3)
    }
    vctx.globalAlpha = 1
  }

  primary.addEventListener('click', () => {
    if (phase === 'ready') {
      if (mode === 'flash') startFlashThenDraw()
      else beginBlindDraw()
    } else if (phase === 'drawing') startReplay()
  })
  skip.addEventListener('click', () => {
    if (phase === 'ready') setPrompt()
  })
  document.querySelector('#to-wall')?.addEventListener('click', () => showWall())

  let smoothX = 0.5
  let smoothY = 0.5
  let velEma = 0
  let lastSX = 0.5
  let lastSY = 0.5

  const loop = (now: number) => {
    const hand = tracker.detect(now)
    hctx.clearRect(0, 0, w, h)
    depthFill.style.height = `${Math.round(hand.depth * 100)}%`

    if (hand.index) {
      smoothX = smoothX * 0.62 + hand.index.x * 0.38
      smoothY = smoothY * 0.62 + hand.index.y * 0.38
      const instVel = Math.hypot(smoothX - lastSX, smoothY - lastSY)
      velEma = velEma * 0.85 + instVel * 0.15
      lastSX = smoothX
      lastSY = smoothY

      dot.classList.toggle('on', true)
      dot.classList.toggle('draw', hand.penDown && phase === 'drawing')

      const cx = smoothX * w
      const cy = smoothY * h
      const aura = 12 + hand.depth * 16 + Math.min(20, velEma * 400)

      // stability aura
      hctx.beginPath()
      hctx.strokeStyle = hand.palmOpen
        ? 'rgba(94,196,160,0.7)'
        : hand.penDown
          ? `rgba(255,107,74,${0.35 + hand.depth * 0.45})`
          : 'rgba(143,173,184,0.45)'
      hctx.lineWidth = 2
      hctx.arc(cx, cy, aura, 0, Math.PI * 2)
      hctx.stroke()
      hctx.beginPath()
      hctx.fillStyle = hand.penDown ? 'rgba(255,107,74,0.95)' : 'rgba(232,240,242,0.75)'
      hctx.arc(cx, cy, 3.2 + hand.depth * 3, 0, Math.PI * 2)
      hctx.fill()

      if (phase === 'drawing') {
        if (hand.palmOpen && now > palmCooldown) {
          if (canvas.undoLastStroke()) {
            palmCooldown = now + 700
            status.textContent = 'Undid stroke (palm)'
            hint.textContent = 'Palm erase — last stroke removed from the hidden buffer.'
          }
        } else if (!hand.palmOpen) {
          // pressure from depth + inverse speed (slow = intentional press)
          const pressure = Math.min(
            1,
            0.25 + hand.depth * 0.55 + (1 - Math.min(1, velEma * 80)) * 0.25,
          )
          canvas.feed(smoothX, smoothY, hand.penDown, now, w, h, pressure, hand.depth)
          status.textContent = hand.penDown
            ? `Inking · depth ${Math.round(hand.depth * 100)}%`
            : 'Pen up'
        }
      } else if (phase === 'ready') {
        status.textContent = hand.palmOpen ? 'Palm (undo ready)' : hand.penDown ? 'Pointing' : 'Ready'
      }
    } else {
      dot.classList.remove('on', 'draw')
      if (phase === 'drawing' || phase === 'ready') status.textContent = 'Show your hand'
    }

    if (phase === 'drawing' || phase === 'ready') paintVeil(1)

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function showWall(highlightId?: string) {
  let posts = loadWall()
  app.innerHTML = `
    <section class="wall">
      <header class="wall-top">
        <div>
          <h1>the wall</h1>
          <p class="wall-sub">Guess the prompt before it’s spoiled — that’s the game.</p>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-ghost" id="home" style="padding:0.55rem 1rem;font-size:0.85rem">Home</button>
          <button class="btn btn-coral" id="draw" style="padding:0.55rem 1rem;font-size:0.85rem">Draw</button>
        </div>
      </header>
      <div class="wall-grid" id="grid"></div>
    </section>
  `

  const grid = document.querySelector('#grid') as HTMLElement

  const render = (list: Post[]) => {
    grid.innerHTML = list
      .map((p) => {
        const guessed = hasGuessed(p.id)
        const rate =
          p.guesses > 0 ? Math.round((p.correctGuesses / p.guesses) * 100) : null
        return `
      <article class="card" data-id="${p.id}" style="${p.id === highlightId ? 'border-color:rgba(255,107,74,0.55)' : ''}">
        <img src="${p.image}" alt="blind drawing by ${escapeAttr(p.author)}" />
        <div class="card-body">
          <h3>${guessed ? escapeHtml(p.prompt) : '???'}</h3>
          <div class="meta">${escapeHtml(p.author)} · ${p.mode} · steadiness ${Math.round(p.steadiness)}${rate !== null ? ` · ${rate}% guessed` : ''}</div>
          <div class="card-actions">
            <button class="like-btn" data-like="${p.id}">♥ ${p.likes}</button>
            ${
              guessed
                ? `<span class="guessed-tag">solved</span>`
                : `<button class="like-btn guess" data-guess="${p.id}">Guess prompt</button>`
            }
          </div>
        </div>
      </article>`
      })
      .join('')
  }
  render(posts)

  grid.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t.dataset.like) {
      posts = likePost(t.dataset.like)
      render(posts)
      return
    }
    if (t.dataset.guess) openGuessModal(t.dataset.guess, () => {
      posts = loadWall()
      render(posts)
    })
  })

  document.querySelector('#home')?.addEventListener('click', () => lobby())
  document.querySelector('#draw')?.addEventListener('click', () => void play('classic'))
}

function openGuessModal(postId: string, onDone: () => void) {
  const post = loadWall().find((p) => p.id === postId)
  if (!post || hasGuessed(postId)) return
  const opts = guessOptions(post.promptId, 4)
  const modal = document.createElement('div')
  modal.className = 'reveal-panel'
  modal.innerHTML = `
    <div class="reveal-card">
      <img src="${post.image}" alt="guess this drawing" />
      <div class="reveal-body">
        <h2>What did they try to draw?</h2>
        <p class="sub">Blind air drawing by ${escapeHtml(post.author)}</p>
        <div class="guess-grid" id="guess-grid">
          ${opts
            .map(
              (o) =>
                `<button class="guess-opt" data-id="${o.id}">${escapeHtml(o.label)}</button>`,
            )
            .join('')}
        </div>
        <div class="reveal-actions" style="margin-top:1rem">
          <button class="btn btn-paper" id="cancel-guess">Cancel</button>
        </div>
      </div>
    </div>
  `
  app.appendChild(modal)
  modal.querySelector('#cancel-guess')?.addEventListener('click', () => modal.remove())
  modal.querySelector('#guess-grid')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.guess-opt') as HTMLElement | null
    if (!btn?.dataset.id) return
    const correct = btn.dataset.id === post.promptId
    guessPost(postId, correct)
    markGuessed(postId)
    btn.style.background = correct ? 'rgba(94,196,160,0.35)' : 'rgba(255,107,74,0.35)'
    const grid = modal.querySelector('#guess-grid') as HTMLElement
    for (const b of grid.querySelectorAll('.guess-opt')) {
      const el = b as HTMLElement
      el.style.pointerEvents = 'none'
      if (el.dataset.id === post.promptId) el.style.outline = '2px solid #5ec4a0'
    }
    const msg = document.createElement('p')
    msg.className = 'sub'
    msg.textContent = correct
      ? `Correct — it was ${post.prompt}.`
      : `Nope — it was ${post.prompt}.`
    modal.querySelector('.reveal-body')?.appendChild(msg)
    setTimeout(() => {
      modal.remove()
      onDone()
    }, 1400)
  })
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function escapeAttr(s: string) {
  return escapeHtml(s)
}

lobby()
