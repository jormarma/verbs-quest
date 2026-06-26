import type { RunReviewItem } from '../../lib/game/runReview'
import { useTranslation } from '../../lib/hooks/useTranslation'

interface RunReviewPanelProps {
  items: RunReviewItem[]
}

export function RunReviewPanel({ items }: RunReviewPanelProps) {
  const { t } = useTranslation()

  if (items.length === 0) return null

  return (
    <div className="w-full max-w-lg bg-slate-900/60 backdrop-blur border border-slate-700 p-4 md:p-6 rounded-2xl shadow-xl">
      <h3 className="text-lg md:text-xl font-black text-rose-400 mb-3 text-center uppercase tracking-widest">
        {t('review.title')}
      </h3>
      <ul className="space-y-3 max-h-48 overflow-y-auto pr-1">
        {items.map((item, index) => (
          <li
            key={`${item.infinitive}-${item.tense}-${index}`}
            className="p-3 rounded-lg bg-slate-800/70 border border-slate-700/80 text-sm md:text-base"
          >
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-black text-white uppercase">{item.infinitive}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded">
                {t(`tense.${item.tense}`)}
              </span>
            </div>
            <p className="text-red-300">
              {t('review.your_answer')}{' '}
              <span className="font-mono font-bold line-through">{item.playerAnswer || '—'}</span>
            </p>
            <p className="text-emerald-300">
              {t('review.correct')}{' '}
              <span className="font-mono font-bold">{item.correctAnswer}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
