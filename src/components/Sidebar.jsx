import { useState } from 'react'

/* ── Helpers ── */
function getInitials(name, email) {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    return (email?.[0] || '?').toUpperCase()
}

function fmtLastSeen(isOnline, lastSeen) {
    if (isOnline) return 'Online'
    if (!lastSeen) return 'Offline'
    const d = new Date(lastSeen)
    const today = new Date()
    if (d.toDateString() === today.toDateString())
        return `Last seen ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    return `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
}

function fmtPreviewTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString())
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/* ── Avatar ── */
function Avatar({ name, email, size = 42, bg = '#a78bfa' }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%', background: bg,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.38, fontWeight: 700, flexShrink: 0, userSelect: 'none',
        }}>
            {getInitials(name, email)}
        </div>
    )
}

const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#f87171', '#fbbf24', '#f472b6', '#fb923c']

export default function Sidebar({
    users, loading, currentProfile, selectedUser,
    onSelectUser, onLogout, sidebarData,
}) {
    const [search, setSearch] = useState('')

    const filtered = users.filter(u => {
        const q = search.toLowerCase()
        return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    })

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>

            {/* ── Header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
            }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>💬 Zeno Chat</span>
                <button onClick={onLogout} style={{
                    fontSize: 13, color: '#ef4444', background: 'none', border: 'none',
                    cursor: 'pointer', fontWeight: 500, padding: '4px 10px',
                    borderRadius: 6, transition: 'background 0.15s',
                }}>
                    Logout
                </button>
            </div>

            {/* ── Current user ── */}
            {currentProfile && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb', flexShrink: 0,
                }}>
                    <div style={{ position: 'relative' }}>
                        <Avatar name={currentProfile.name} email={currentProfile.email} size={36} bg="#6d28d9" />
                        <span style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 10, height: 10, borderRadius: '50%',
                            background: '#22c55e', border: '2px solid #f9fafb',
                        }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                            {currentProfile.name || currentProfile.email}
                        </div>
                        <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 500 }}>● Online</div>
                    </div>
                </div>
            )}

            {/* ── Search ── */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
                    <input
                        type="text" placeholder="Search contacts..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 12px 8px 30px',
                            border: '1.5px solid #e5e7eb', borderRadius: 20,
                            fontSize: 13, color: '#111827', background: '#f9fafb', outline: 'none',
                        }}
                        onFocus={e => (e.target.style.borderColor = '#a78bfa')}
                        onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                    />
                </div>
            </div>

            {/* ── User list ── */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    [...Array(5)].map((_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f3f4f6', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ height: 12, background: '#f3f4f6', borderRadius: 6, width: '55%', marginBottom: 8 }} />
                                <div style={{ height: 10, background: '#f9fafb', borderRadius: 6, width: '40%' }} />
                            </div>
                        </div>
                    ))
                ) : filtered.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', color: '#9ca3af', gap: 8 }}>
                        <span style={{ fontSize: 32 }}>{search ? '🔍' : '👥'}</span>
                        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                            {search ? 'No contacts found' : 'No contacts yet'}
                        </p>
                    </div>
                ) : (
                    filtered.map((user, i) => {
                        const isSelected = selectedUser?.id === user.id
                        const bg = COLORS[i % COLORS.length]
                        const { lastMessage, unreadCount = 0 } = sidebarData[user.id] || {}
                        const online = user.is_online

                        let preview = ''
                        if (lastMessage) {
                            preview = lastMessage.deleted
                                ? 'This message was deleted'
                                : (lastMessage.content || '')
                            if (preview.length > 38) preview = preview.slice(0, 38) + '...'
                        }

                        return (
                            <div
                                key={user.id}
                                onClick={() => onSelectUser(user)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '11px 16px', cursor: 'pointer',
                                    background: isSelected ? '#f5f3ff' : 'transparent',
                                    borderLeft: `3px solid ${isSelected ? '#a78bfa' : 'transparent'}`,
                                    borderBottom: '1px solid #f9fafb',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa' }}
                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                            >
                                {/* Avatar + online dot */}
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <Avatar name={user.name} email={user.email} size={44} bg={bg} />
                                    {online && (
                                        <span style={{
                                            position: 'absolute', bottom: 1, right: 1,
                                            width: 11, height: 11, borderRadius: '50%',
                                            background: '#22c55e', border: '2px solid #fff',
                                        }} />
                                    )}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Name row */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                                        <span style={{
                                            fontSize: 14, fontWeight: 600, color: '#111827',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {user.name || user.email}
                                        </span>
                                        {lastMessage && (
                                            <span style={{ fontSize: 11, color: unreadCount > 0 ? '#a78bfa' : '#9ca3af', flexShrink: 0, marginLeft: 6 }}>
                                                {fmtPreviewTime(lastMessage.created_at)}
                                            </span>
                                        )}
                                    </div>
                                    {/* Preview + badge row */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{
                                            fontSize: 12, color: '#9ca3af', flex: 1,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            fontStyle: lastMessage?.deleted ? 'italic' : 'normal',
                                        }}>
                                            {preview || fmtLastSeen(online, user.last_seen)}
                                        </span>
                                        {unreadCount > 0 && (
                                            <span style={{
                                                background: '#a78bfa', color: '#fff',
                                                borderRadius: 99, fontSize: 11, fontWeight: 700,
                                                padding: '1px 7px', marginLeft: 8, flexShrink: 0,
                                                minWidth: 20, textAlign: 'center',
                                            }}>
                                                {unreadCount > 99 ? '99+' : unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}