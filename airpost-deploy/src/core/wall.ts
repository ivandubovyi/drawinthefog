import type { Post } from './types'

const KEY = 'airpost.wall.v2'

function drawSeedCard(_prompt: string, author: string, seed: number): string {
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 360
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#efe6d6'
  ctx.fillRect(0, 0, 480, 360)
  ctx.strokeStyle = '#1a2430'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  let x = 80 + (seed % 40)
  let y = 100 + (seed % 30)
  ctx.beginPath()
  ctx.moveTo(x, y)
  for (let i = 0; i < 28; i++) {
    x += Math.sin(seed * 0.7 + i) * 18 + 8
    y += Math.cos(seed * 1.1 + i * 0.8) * 14
    ctx.lineTo(80 + ((x - 80) % 320), 60 + Math.abs(y % 220))
  }
  ctx.stroke()
  ctx.fillStyle = 'rgba(26,36,48,0.5)'
  ctx.font = '600 16px system-ui'
  ctx.fillText(`airpost · ???`, 20, 330)
  ctx.font = '500 13px system-ui'
  ctx.fillText(author, 20, 348)
  return c.toDataURL('image/png')
}

const SEED: Post[] = [
  {
    id: 'seed_1',
    prompt: 'a cat',
    promptId: 'cat',
    author: 'mira',
    createdAt: Date.now() - 86400000 * 2,
    image: '',
    likes: 12,
    guesses: 20,
    correctGuesses: 11,
    strokeCount: 4,
    durationMs: 18000,
    steadiness: 62,
    mode: 'classic',
  },
  {
    id: 'seed_2',
    prompt: 'a bicycle',
    promptId: 'bicycle',
    author: 'jonah',
    createdAt: Date.now() - 86400000,
    image: '',
    likes: 7,
    guesses: 14,
    correctGuesses: 4,
    strokeCount: 6,
    durationMs: 24000,
    steadiness: 48,
    mode: 'flash',
  },
]

export function loadWall(): Post[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Post[]
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {
    /* ignore */
  }
  const seeded = SEED.map((p, i) => ({
    ...p,
    image: drawSeedCard(p.prompt, p.author, (i + 1) * 97),
  }))
  saveWall(seeded)
  return seeded
}

export function saveWall(posts: Post[]) {
  localStorage.setItem(KEY, JSON.stringify(posts.slice(0, 80)))
}

export function addPost(post: Post) {
  const wall = loadWall()
  wall.unshift(post)
  saveWall(wall)
  return wall
}

export function likePost(id: string) {
  const wall = loadWall()
  const p = wall.find((x) => x.id === id)
  if (p) {
    p.likes += 1
    saveWall(wall)
  }
  return wall
}

export function guessPost(id: string, correct: boolean) {
  const wall = loadWall()
  const p = wall.find((x) => x.id === id)
  if (p) {
    p.guesses += 1
    if (correct) p.correctGuesses += 1
    saveWall(wall)
  }
  return wall
}

const GUESSED_KEY = 'airpost.guessed.v1'

export function hasGuessed(id: string) {
  try {
    const set = new Set(JSON.parse(localStorage.getItem(GUESSED_KEY) || '[]') as string[])
    return set.has(id)
  } catch {
    return false
  }
}

export function markGuessed(id: string) {
  try {
    const set = new Set(JSON.parse(localStorage.getItem(GUESSED_KEY) || '[]') as string[])
    set.add(id)
    localStorage.setItem(GUESSED_KEY, JSON.stringify([...set].slice(-200)))
  } catch {
    /* ignore */
  }
}
