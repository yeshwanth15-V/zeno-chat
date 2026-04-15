/**
 * getPriorityLevel — Classifies message content into priority tiers.
 *
 * HIGH: contains urgency keywords → red indicator + glow
 * LOW:  very short messages or purely emoji → faded
 * MEDIUM: everything else
 *
 * @param {string} content
 * @returns {'high' | 'medium' | 'low'}
 */
export function getPriorityLevel(content) {
    if (!content) return 'medium'

    const normalized = content.toLowerCase()

    const highKeywords = [
        'urgent', 'asap', 'important', 'critical', 'emergency',
        'immediately', 'now', 'deadline', 'must', 'required',
        'help!', 'help me', 'sos', 'priority', 'crucial',
    ]

    if (highKeywords.some((kw) => normalized.includes(kw))) return 'high'

    // Low priority: very short (< 12 chars) or purely emoji/punctuation
    const strippedEmoji = content.replace(/[\p{Emoji}]/gu, '').trim()
    if (strippedEmoji.length < 8) return 'low'

    return 'medium'
}

/**
 * formatMessageTime — Formats a UTC timestamp for display in messages.
 * @param {string} ts ISO timestamp
 * @returns {string}
 */
export function formatMessageTime(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * formatLastSeen — Human-readable "last seen" string.
 * @param {string} ts
 * @returns {string}
 */
export function formatLastSeen(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 2) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
