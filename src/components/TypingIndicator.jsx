/**
 * TypingIndicator — Animated "..." bubble shown when the partner is typing.
 */
export default function TypingIndicator({ name }) {
    return (
        <div className="flex items-end gap-2 mb-1.5 animate-fadeIn">
            {/* Spacer for avatar alignment */}
            <div className="w-7 flex-shrink-0" />

            <div className="bg-white border border-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-muted inline-block"
                        style={{
                            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                    />
                ))}
            </div>

            <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
        </div>
    )
}
