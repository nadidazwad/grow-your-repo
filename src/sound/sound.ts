import { CUES, WELCOME, type Cue, type CueSpec } from './cues.ts'

export interface PlayOptions {
  /** Which note of a tuned cue, from 0 up; past the top it stays on the top one. */
  step?: number
  /** Scales the cue's own level. */
  gain?: number
  /** Where it sits, -1 left to 1 right. */
  pan?: number
  /** Seconds from now. */
  delay?: number
}

export interface Sound {
  /** Plays a cue once the page has been touched. Too soon after the last of its kind, it's dropped. */
  play(cue: Cue, options?: PlayOptions): void
  /** Something with its own sound has started (a film): the welcome tune bows out. */
  hush(): void
  /**
   * Plays the welcome as the page lands, if the browser lets a page make a sound
   * before it's been touched, or else on the first touch or key; then fetches the
   * rest of the sounds once the page has settled.
   */
  start(): () => void
}

/** More than this many at once and new ones are dropped. */
const VOICES = 16
/** A tuned note queued behind the last waits at most this long (s), or it's dropped. */
const QUEUE = 0.4
/** If the tune is still on its way when the speakers open, it still comes in if it lands within this long (ms). */
const WELCOME_LATE = 3000

/**
 * Whether a sound started now will be heard. Shut speakers only count while the
 * visitor is touching the page, which is what opens them; anything started on
 * them before that would wait, and burst out all together on the first click.
 */
const audible = (context: AudioContext) =>
  context.state === 'running' || (context.state === 'suspended' && document.visibilityState === 'visible' && navigator.userActivation?.isActive === true)

export function createSound(): Sound {
  const buffers = new Map<string, AudioBuffer>()
  const last = new Map<Cue, number>()
  const lastTake = new Map<Cue, number>()
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let music: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  const requests = new Map<string, Promise<void>>()
  // Played once per page: it greets every arrival, a reload included.
  let welcoming = false
  let hushed = false
  let voices = 0

  let opus: boolean | null = null
  let decoder: OfflineAudioContext | null = null
  const fetchOne = async (file: string, ext: string) => {
    const response = await fetch(`/sound/${file}.${ext}`)
    if (!response.ok) throw new Error(`${file}.${ext}: ${response.status}`)
    // Decoded offline, so the effects can be ready before the speakers are.
    decoder ??= new OfflineAudioContext(2, 1, 48000)
    return decoder.decodeAudioData(await response.arrayBuffer())
  }
  /** Fetches one sound, once. */
  const load = (file: string) => {
    let request = requests.get(file)
    if (!request) {
      opus ??= new Audio().canPlayType('audio/ogg; codecs="opus"') !== ''
      const ext = opus ? 'ogg' : 'mp3'
      request = fetchOne(file, ext).then(
        (buffer) => void buffers.set(file, buffer),
        // Some browsers say they play Opus and then can't decode it.
        () => (ext === 'ogg' ? fetchOne(file, 'mp3').then((buffer) => void buffers.set(file, buffer), () => {}) : undefined),
      )
      requests.set(file, request)
    }
    return request
  }
  const loadAll = () => Promise.all([...new Set(Object.values(CUES).flatMap((cue: CueSpec) => cue.files))].map(load))

  const startMusic = () => {
    const buffer = buffers.get(WELCOME.file)
    if (!context || !master || !buffer || music || hushed) return
    const source = context.createBufferSource()
    source.buffer = buffer
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(WELCOME.gain, context.currentTime + 0.03)
    source.connect(gain).connect(master)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      if (music?.source === source) music = null
    }
    source.start()
    music = { source, gain }
  }

  /** The tune, as soon as the speakers open up; if it's still on its way, when it lands. */
  const welcome = () => {
    if (welcoming) return
    welcoming = true
    if (buffers.has(WELCOME.file)) return startMusic()
    const asked = performance.now()
    void load(WELCOME.file).then(() => performance.now() - asked < WELCOME_LATE && startMusic())
  }

  /** The speakers, asked for as the page lands. Most browsers keep them shut until the first touch. */
  const open = () => {
    if (context) return
    context = new AudioContext({ latencyHint: 'interactive' })
    master = context.createGain()
    master.connect(context.destination)
    // Whenever the speakers do open up, the tune comes in.
    context.addEventListener('statechange', () => context?.state === 'running' && welcome())
    if (context.state === 'running') welcome()
  }

  const unlock = () => {
    open()
    if (context?.state === 'suspended' && document.visibilityState === 'visible') void context.resume().catch(() => {})
  }

  const play = (cue: Cue, { step = 0, gain = 1, pan = 0, delay = 0 }: PlayOptions = {}) => {
    const spec: CueSpec = CUES[cue]
    if (!context || !master || voices >= VOICES || !audible(context)) return
    const now = context.currentTime
    let when = now + Math.max(0, delay)
    const gap = (spec.gap ?? 0) / 1000
    const previous = last.get(cue) ?? -Infinity
    if (when - previous < gap) {
      // A run of tuned notes keeps its rhythm instead of losing notes; anything else that crowds in is dropped.
      if (!spec.tuned || previous + gap - now > QUEUE) return
      when = previous + gap
    }
    const file = spec.tuned ? spec.files[Math.min(spec.files.length - 1, Math.max(0, Math.round(step)))] : take(cue, spec)
    const buffer = buffers.get(file)
    if (!buffer) return
    last.set(cue, when)

    const source = context.createBufferSource()
    source.buffer = buffer
    if (spec.wobble) source.playbackRate.value = 2 ** (((Math.random() * 2 - 1) * spec.wobble) / 1200)
    const level = context.createGain()
    level.gain.value = spec.gain * gain
    source.connect(level)
    let out: AudioNode = level
    if (pan) {
      const panner = context.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, pan))
      out = level.connect(panner)
    }
    out.connect(master)
    voices++
    source.onended = () => {
      voices--
      source.disconnect()
      out.disconnect()
      level.disconnect()
    }
    source.start(when)
  }

  /** A different take from last time, when there's more than one. */
  const take = (cue: Cue, spec: CueSpec) => {
    const count = spec.files.length
    const before = lastTake.get(cue) ?? -1
    let index = Math.floor(Math.random() * count)
    if (count > 1 && index === before) index = (index + 1) % count
    lastTake.set(cue, index)
    return spec.files[index]
  }

  const hush = () => {
    hushed = true
    if (!context || !music) return
    const { source, gain } = music
    gain.gain.cancelScheduledValues(context.currentTime)
    gain.gain.setTargetAtTime(0, context.currentTime, 0.12)
    source.stop(context.currentTime + 0.6)
    music = null
  }

  return {
    play,
    hush,
    start() {
      const events = ['pointerdown', 'keydown', 'touchend'] as const
      // The tune first, at once, so it can come in with the plant.
      void load(WELCOME.file)
      open()
      events.forEach((type) => window.addEventListener(type, unlock, { capture: true, passive: true }))
      // A hidden tab goes quiet, and picks up where it was when it comes back.
      const visibility = () => {
        if (!context) return
        if (document.visibilityState === 'hidden') void context.suspend().catch(() => {})
        else void context.resume().catch(() => {})
      }
      document.addEventListener('visibilitychange', visibility)
      // The sounds are small, but the page and the plant come first.
      const idle = 'requestIdleCallback' in window
      const later = idle ? window.requestIdleCallback(() => void loadAll(), { timeout: 3000 }) : window.setTimeout(() => void loadAll(), 1500)
      return () => {
        events.forEach((type) => window.removeEventListener(type, unlock, { capture: true }))
        document.removeEventListener('visibilitychange', visibility)
        if (idle) window.cancelIdleCallback(later)
        else window.clearTimeout(later)
      }
    },
  }
}
