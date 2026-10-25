// The site's sound: cues for what just happened, and the welcome tune.
// Sound is always on: the tune greets each arrival as soon as the browser lets a page be heard.
import { createSound } from './sound.ts'

export type { Cue } from './cues.ts'
export type { PlayOptions, Sound } from './sound.ts'

export const sound = createSound()
