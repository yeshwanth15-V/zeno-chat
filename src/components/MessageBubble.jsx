import { formatMessageTime } from '../utils/priority'

/**
 * MessageBubble — Renders a single chat message with priority styling.
 *
 * Priority tiers:
 *   high   → red border + animated glow + badge
 *   medium → normal styling
 *   low    → slight opacity fade
 */
export default function MessageBubble({ message, isSent, showAvatar, partnerInitials }) {
    const { content, created_at, priority_level } = message

    /* ── Priority style map ─────────────────────────────────────── */
    const priorityStyles = {
        high: {
            wrapper: 'priority-high-glow border border-red-200',
            badge: (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    URGENT
                </span>
            ),
        },
        medium: {
            wrapper: '',
            badge: null,
        },
        low: {
            wrapper: 'opacity-70',
            badge: null,
        },
    }

    const pStyle = priorityStyles[priority_level] || priorityStyles.medium

    return (
        <div className={`flex items-end gap-2 mb-1.5 animate-fadeIn ${isSent ? 'justify-end' : 'justify-start'}`}>

            {/* Partner avatar (left side only) */}
            {!isSent && (
                <div className="flex-shrink-0 mb-1">
                    {showAvatar ? (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-xs font-semibold">
                            {partnerInitials}
                        </div>
                    ) : (
                        <div className="w-7" />
                    )}
                </div>
            )}

            {/* Bubble */}
            <div className={`max-w-[72%] sm:max-w-[60%] ${isSent ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Priority badge */}
                {pStyle.badge}

                <div
                    className={`
            px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
            transition-shadow duration-300
            ${isSent
                            ? 'bg-gradient-to-br from-primary to-accent text-white rounded-br-sm shadow-md'
                            : 'bg-white text-slate-800 border border-border rounded-bl-sm shadow-sm'
                        }
            ${pStyle.wrapper}
          `}
                >
                    {content}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-muted mt-1 px-1">
                    {formatMessageTime(created_at)}
                </span>
            </div>
        </div>
    )
}
