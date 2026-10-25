import { Garden } from '../garden'
import { sample, SAMPLE_GROUND } from './sample.ts'

export default function App() {
  return (
    <main className="fixed inset-0 overflow-hidden overscroll-none bg-page">
      <Garden tree={sample} ground={SAMPLE_GROUND} />
    </main>
  )
}
