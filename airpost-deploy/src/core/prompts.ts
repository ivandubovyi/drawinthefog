import type { Prompt } from './types'

/** SVG path data in a 100×100 viewBox for memory-flash silhouettes */
const SIL: Record<string, string> = {
  cat: 'M30 70 C28 45 35 30 50 28 C65 30 72 45 70 70 M38 28 L32 12 M62 28 L68 12 M40 55 Q50 62 60 55',
  house: 'M20 55 L50 25 L80 55 L80 80 L20 80 Z M42 80 L42 58 L58 58 L58 80',
  tree: 'M48 80 L48 55 M48 55 C30 55 28 35 48 30 C68 35 66 55 48 55',
  fish: 'M25 50 C40 30 70 30 80 50 C70 70 40 70 25 50 M80 50 L95 35 M80 50 L95 65 M35 45 A2 2 0 1 1 35.1 45',
  bicycle: 'M28 65 A12 12 0 1 1 28.1 65 M72 65 A12 12 0 1 1 72.1 65 M28 65 L45 40 L60 40 L72 65 M45 40 L40 55 L55 55',
  umbrella: 'M20 48 Q50 20 80 48 L20 48 M50 48 L50 78 Q42 82 38 78',
  moon: 'M55 20 A30 30 0 1 0 55 80 A22 22 0 1 1 55 20',
  heart: 'M50 78 L20 45 C10 30 30 18 50 35 C70 18 90 30 80 45 Z',
  rocket: 'M50 15 L62 45 L62 70 L50 80 L38 70 L38 45 Z M38 55 L25 65 M62 55 L75 65',
  bird: 'M20 55 Q40 30 50 50 Q60 30 80 55',
  wave: 'M10 55 Q25 30 40 55 Q55 80 70 55 Q85 30 95 50',
  robot: 'M35 30 L65 30 L65 55 L35 55 Z M42 38 A2 2 0 1 1 42.1 38 M58 38 A2 2 0 1 1 58.1 38 M45 48 L55 48 M50 30 L50 22 M40 55 L40 70 M60 55 L60 70',
}

export const PROMPTS: Prompt[] = [
  { id: 'cat', label: 'a cat', hint: 'Ears help. Whiskers are optional bravery.', difficulty: 'easy', silhouette: SIL.cat },
  { id: 'house', label: 'a house', hint: 'Roof, door, one window. That’s enough.', difficulty: 'easy', silhouette: SIL.house },
  { id: 'tree', label: 'a tree', hint: 'Trunk first, then the cloud of leaves.', difficulty: 'easy', silhouette: SIL.tree },
  { id: 'fish', label: 'a fish', hint: 'Oval body, triangle tail.', difficulty: 'easy', silhouette: SIL.fish },
  { id: 'bicycle', label: 'a bicycle', hint: 'Two circles and a prayer.', difficulty: 'medium', silhouette: SIL.bicycle },
  { id: 'umbrella', label: 'an umbrella', hint: 'Arc, stick, a little hook.', difficulty: 'easy', silhouette: SIL.umbrella },
  { id: 'guitar', label: 'a guitar', hint: 'Body, neck, headstock — strings optional.', difficulty: 'medium' },
  { id: 'rocket', label: 'a rocket', hint: 'Pointy top, fins, lift-off scribble.', difficulty: 'easy', silhouette: SIL.rocket },
  { id: 'octopus', label: 'an octopus', hint: 'Head blob + as many arms as you dare.', difficulty: 'medium' },
  { id: 'castle', label: 'a castle', hint: 'Towers. Flags if you’re feeling royal.', difficulty: 'medium' },
  { id: 'self', label: 'yourself', hint: 'Blind self-portrait. Honesty optional.', difficulty: 'wild' },
  { id: 'city', label: 'a skyline', hint: 'Rectangles of different heights.', difficulty: 'medium' },
  { id: 'bird', label: 'a bird in flight', hint: 'Two wings, one act of faith.', difficulty: 'medium', silhouette: SIL.bird },
  { id: 'teapot', label: 'a teapot', hint: 'Belly, spout, handle, lid.', difficulty: 'medium' },
  { id: 'dragon', label: 'a tiny dragon', hint: 'Wings + attitude.', difficulty: 'wild' },
  { id: 'moon', label: 'the moon', hint: 'Circle. Craters if you remember them.', difficulty: 'easy', silhouette: SIL.moon },
  { id: 'shoe', label: 'a shoe', hint: 'Harder than it looks. That’s the joke.', difficulty: 'wild' },
  { id: 'heart', label: 'a heart', hint: 'You know this one. Or do you?', difficulty: 'easy', silhouette: SIL.heart },
  { id: 'robot', label: 'a robot', hint: 'Boxes with personality.', difficulty: 'easy', silhouette: SIL.robot },
  { id: 'wave', label: 'a wave', hint: 'One big curl about to break.', difficulty: 'medium', silhouette: SIL.wave },
]

export function pickPrompt(excludeId?: string): Prompt {
  const pool = excludeId ? PROMPTS.filter((p) => p.id !== excludeId) : PROMPTS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function guessOptions(correctId: string, n = 4): Prompt[] {
  const correct = PROMPTS.find((p) => p.id === correctId) ?? PROMPTS[0]
  const others = PROMPTS.filter((p) => p.id !== correct.id).sort(() => Math.random() - 0.5)
  const opts = [correct, ...others.slice(0, n - 1)]
  return opts.sort(() => Math.random() - 0.5)
}

/** Draw silhouette path centered on canvas for memory flash */
export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  pathD: string,
  w: number,
  h: number,
  alpha = 0.55,
) {
  const scale = Math.min(w, h) * 0.72
  const ox = (w - scale) / 2
  const oy = (h - scale) / 2
  const path = new Path2D(pathD)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(scale / 100, scale / 100)
  ctx.strokeStyle = `rgba(232, 240, 242, ${alpha})`
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(path)
  ctx.restore()
}
