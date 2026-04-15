import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'

export default function Chat({ session }) {
    const [users, setUsers] = useState([])
    const [selectedUser, setSelectedUser] = useState(null)
    const [currentProfile, setCurrentProfile] = useState(null)
    const [loadingUsers, setLoadingUsers] = useState(true)
    // { [userId]: { lastMessage, unreadCount } }
    const [sidebarData, setSidebarData] = useState({})

    const currentUserId = session?.user?.id

    /* ── Mark all undelivered msgs as delivered (user is online) ── */
    const markDelivered = useCallback(async () => {
        if (!currentUserId) return
        await supabase.from('messages')
            .update({ is_delivered: true })
            .eq('receiver_id', currentUserId)
            .eq('is_delivered', false)
    }, [currentUserId])

    /* ── Fetch own profile ── */
    useEffect(() => {
        if (!currentUserId) return
        supabase.from('profiles').select('*').eq('id', currentUserId).single()
            .then(({ data }) => { if (data) setCurrentProfile(data) })
    }, [currentUserId])
    /* ── Presence tracking ── */
    const setPresence = useCallback(async (is_online) => {
        if (!currentUserId) return
        await supabase.from('profiles')
            .update({ is_online, last_seen: new Date().toISOString() })
            .eq('id', currentUserId)
    }, [currentUserId])

    useEffect(() => {
        if (!currentUserId) return

        setPresence(true)
        markDelivered()

        const handleUnload = () => setPresence(false)
        window.addEventListener('beforeunload', handleUnload)

        return () => {
            window.removeEventListener('beforeunload', handleUnload)
            setPresence(false)
        }
    }, [currentUserId, setPresence, markDelivered])

    /* ── Auto select first user (Desktop Only) ── */
    useEffect(() => {
        if (!loadingUsers && users.length > 0 && !selectedUser && window.innerWidth >= 768) {
            handleSelectUser(users[0])
        }
    }, [users, loadingUsers, selectedUser])

    /* ── Fetch other users ── */
    useEffect(() => {
        if (!currentUserId) return
        setLoadingUsers(true)
        supabase.from('profiles').select('*').neq('id', currentUserId).order('name')
            .then(({ data }) => { setUsers(data || []); setLoadingUsers(false) })
    }, [currentUserId])

    /* ── Realtime: profile changes (online status) ── */
    useEffect(() => {
        if (!currentUserId) return
        const ch = supabase.channel('profiles-rt')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles' },
                ({ new: upd }) => {
                    if (upd.id !== currentUserId)
                        setUsers(prev => prev.map(u => u.id === upd.id ? { ...u, ...upd } : u))
                }
            ).subscribe()
        return () => supabase.removeChannel(ch)
    }, [currentUserId])

    /* ── Compute sidebar data from all messages ── */
    const computeSidebarData = useCallback(async () => {
        if (!currentUserId) return
        const { data } = await supabase
            .from('messages').select('*')
            .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
            .order('created_at', { ascending: false })

        if (!data) return
        const result = {}
        data.forEach(msg => {
            const otherId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
            if (!result[otherId]) result[otherId] = { lastMessage: msg, unreadCount: 0 }
            // Use is_seen boolean (new system); fall back to status check for old rows
            const unseen = msg.receiver_id === currentUserId && !msg.is_seen && msg.status !== 'seen'
            if (unseen) result[otherId].unreadCount++
        })
        setSidebarData(result)
    }, [currentUserId])

    useEffect(() => { computeSidebarData() }, [computeSidebarData])

    /* ── Realtime: all messages (keeps sidebar preview fresh) ── */
    useEffect(() => {
        if (!currentUserId) return
        const ch = supabase.channel('all-msgs-rt')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'messages' },
                ({ new: msg }) => {
                    if (!msg) return
                    if (msg.sender_id === currentUserId || msg.receiver_id === currentUserId)
                        computeSidebarData()
                }
            ).subscribe()
        return () => supabase.removeChannel(ch)
    }, [currentUserId, computeSidebarData])

    /* ── Select user (clear unread locally) ── */
    const handleSelectUser = (user) => {
        setSelectedUser(user)
        setSidebarData(prev => ({
            ...prev,
            [user.id]: { ...(prev[user.id] || {}), unreadCount: 0 },
        }))
    }

    const handleLogout = async () => {
        await setPresence(false)
        await supabase.auth.signOut()
    }

    return (
        <div className="h-screen flex overflow-hidden bg-white w-full">

            {/* Sidebar */}
            <div
                className={`
                    ${selectedUser ? 'hidden' : 'flex'} md:flex 
                    flex-col w-full md:w-[320px] lg:w-[360px] shrink-0 
                    border-r border-gray-200 bg-white
                `}
            >
                <Sidebar
                    users={[...users].sort((a, b) => {
                        const tA = sidebarData[a.id]?.lastMessage?.created_at || ''
                        const tB = sidebarData[b.id]?.lastMessage?.created_at || ''
                        return tB.localeCompare(tA)   // newest first
                    })}
                    loading={loadingUsers}
                    currentProfile={currentProfile} selectedUser={selectedUser}
                    onSelectUser={handleSelectUser} onLogout={handleLogout}
                    sidebarData={sidebarData}
                />
            </div>

            {/* Chat area */}
            <div className={`
                ${selectedUser ? 'flex' : 'hidden'} md:flex
                flex-1 flex-col min-w-0 bg-gray-50
            `}>
                {selectedUser ? (
                    <ChatWindow
                        key={selectedUser.id}
                        currentUserId={currentUserId}
                        partner={selectedUser}
                        onBack={() => setSelectedUser(null)}
                    />
                ) : (
                    <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#9ca3af', gap: 10,
                    }}>
                        <div style={{ fontSize: 52 }}>💬</div>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#374151', margin: 0 }}>Zeno Chat</p>
                        <p style={{ fontSize: 14, margin: 0 }}>Select a contact to start chatting</p>
                    </div>
                )}
            </div>
        </div>
    )
}