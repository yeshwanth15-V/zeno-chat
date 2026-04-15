import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import EmojiPicker from 'emoji-picker-react'

export default function ChatWindow({ currentUserId, partner, onBack }) {

    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [image, setImage] = useState(null)
    const [toast, setToast] = useState('')
    const [partnerTyping, setPartnerTyping] = useState(false)
    const [partnerOnline, setPartnerOnline] = useState(partner?.is_online || false)
    const [loadingMessages, setLoadingMessages] = useState(true)
    const [lightboxImg, setLightboxImg] = useState(null)

    const bottomRef = useRef(null)
    const inputRef = useRef(null)
    const fileInputRef = useRef(null)
    const typingTimeoutRef = useRef(null)
    const presenceChannelRef = useRef(null)

    // 📹 WebRTC state & refs
    const [callState, setCallState] = useState('idle') // idle | calling | incoming | active
    const [incomingOffer, setIncomingOffer] = useState(null)
    const [muted, setMuted] = useState(false)
    const [camOff, setCamOff] = useState(false)
    const localVideoRef = useRef(null)
    const remoteVideoRef = useRef(null)
    const pcRef = useRef(null)           // RTCPeerConnection
    const localStreamRef = useRef(null)  // local MediaStream

    // 📸 Camera capture state & refs
    const [cameraOpen, setCameraOpen] = useState(false)
    const [capturedPreview, setCapturedPreview] = useState(null) // blob URL for preview
    const cameraVideoRef = useRef(null)
    const cameraStreamRef = useRef(null)
    const canvasRef = useRef(null)

    // 😀 Emoji picker
    const [emojiOpen, setEmojiOpen] = useState(false)
    const emojiRef = useRef(null)

    // 🔹 Fetch messages
    const fetchMessages = useCallback(async () => {
        if (!partner?.id || !currentUserId) return
        setLoadingMessages(true)
        const { data } = await supabase
            .from('messages')
            .select('*')
            .or(
                `and(sender_id.eq.${currentUserId},receiver_id.eq.${partner.id}),` +
                `and(sender_id.eq.${partner.id},receiver_id.eq.${currentUserId})`
            )
            .order('created_at', { ascending: true })

        setMessages(data || [])
        setLoadingMessages(false)
    }, [currentUserId, partner?.id])

    useEffect(() => {
        fetchMessages()
    }, [fetchMessages])

    // 🔹 Mark partner's messages as 'seen' when chat opens
    useEffect(() => {
        if (!partner?.id || !currentUserId) return
        supabase
            .from('messages')
            .update({ status: 'seen' })
            .eq('sender_id', partner.id)
            .eq('receiver_id', currentUserId)
            .neq('status', 'seen')
            .then(() => {
                // Reflect locally without refetch
                setMessages(prev =>
                    prev.map(m =>
                        m.sender_id === partner.id && m.receiver_id === currentUserId && m.status !== 'seen'
                            ? { ...m, status: 'seen' }
                            : m
                    )
                )
            })
    }, [partner?.id, currentUserId])

    // 🔹 Realtime messages + typing indicator + presence
    useEffect(() => {
        if (!partner?.id || !currentUserId) return

        // Unique channel per conversation pair
        const roomId = [currentUserId, partner.id].sort().join('-')

        const channel = supabase
            .channel(`room:${roomId}`, { config: { presence: { key: currentUserId } } })
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                async (payload) => {
                    const msg = payload.new
                    // ✅ Deduplicate — skip if we already have this id in state
                    setMessages((prev) => {
                        if (prev.some(m => m.id === msg.id)) return prev
                        return [...prev, msg]
                    })
                    // If we are the receiver → mark as delivered
                    if (msg.receiver_id === currentUserId && msg.status !== 'seen') {
                        await supabase
                            .from('messages')
                            .update({ status: 'delivered' })
                            .eq('id', msg.id)
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'messages' },
                (payload) => {
                    const updated = payload.new
                    setMessages(prev =>
                        prev.map(m => m.id === updated.id ? { ...m, status: updated.status } : m)
                    )
                }
            )
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (payload?.userId === partner.id) {
                    setPartnerTyping(true)
                    clearTimeout(typingTimeoutRef.current)
                    typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 1500)
                }
            })
            // 📹 WebRTC signaling listeners
            .on('broadcast', { event: 'call-offer' }, async ({ payload }) => {
                if (payload?.from !== partner.id) return
                setIncomingOffer(payload.offer)
                setCallState('incoming')
            })
            .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
                if (payload?.from !== partner.id || !pcRef.current) return
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer))
                setCallState('active')
            })
            .on('broadcast', { event: 'call-ice' }, async ({ payload }) => {
                if (payload?.from !== partner.id || !pcRef.current) return
                try { await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch (_) { }
            })
            .on('broadcast', { event: 'call-end' }, ({ payload }) => {
                if (payload?.from !== partner.id) return
                endCall(false)
            })
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState()
                const isOnline = Object.keys(state).includes(partner.id)
                setPartnerOnline(isOnline)
            })
            .on('presence', { event: 'join' }, ({ key }) => {
                if (key === partner.id) setPartnerOnline(true)
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                if (key === partner.id) setPartnerOnline(false)
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ userId: currentUserId, online: true })
                }
            })

        presenceChannelRef.current = channel

        return () => {
            clearTimeout(typingTimeoutRef.current)
            supabase.removeChannel(channel)
        }
    }, [currentUserId, partner?.id])

    // ─── WebRTC helpers ────────────────────────────────────────────
    const createPeerConnection = (localStream) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        })
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream))
        pc.onicecandidate = ({ candidate }) => {
            if (candidate && presenceChannelRef.current) {
                presenceChannelRef.current.send({
                    type: 'broadcast', event: 'call-ice',
                    payload: { from: currentUserId, candidate: candidate.toJSON() }
                })
            }
        }
        pc.ontrack = (e) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]
        }
        return pc
    }

    const startCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            localStreamRef.current = stream
            if (localVideoRef.current) localVideoRef.current.srcObject = stream
            const pc = createPeerConnection(stream)
            pcRef.current = pc
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            presenceChannelRef.current?.send({
                type: 'broadcast', event: 'call-offer',
                payload: { from: currentUserId, offer: pc.localDescription }
            })
            setCallState('calling')
        } catch (err) {
            console.error('startCall error:', err)
            setToast('Camera/mic access denied')
        }
    }

    const acceptCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            localStreamRef.current = stream
            if (localVideoRef.current) localVideoRef.current.srcObject = stream
            const pc = createPeerConnection(stream)
            pcRef.current = pc
            await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            presenceChannelRef.current?.send({
                type: 'broadcast', event: 'call-answer',
                payload: { from: currentUserId, answer: pc.localDescription }
            })
            setCallState('active')
            setIncomingOffer(null)
        } catch (err) {
            console.error('acceptCall error:', err)
            setToast('Camera/mic access denied')
        }
    }

    const endCall = (notify = true) => {
        if (notify) {
            presenceChannelRef.current?.send({
                type: 'broadcast', event: 'call-end',
                payload: { from: currentUserId }
            })
        }
        localStreamRef.current?.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
        if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
        if (localVideoRef.current) localVideoRef.current.srcObject = null
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
        setCallState('idle')
        setIncomingOffer(null)
        setMuted(false)
        setCamOff(false)
    }

    const toggleMute = () => {
        if (!localStreamRef.current) return
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
        setMuted(m => !m)
    }

    const toggleCam = () => {
        if (!localStreamRef.current) return
        localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
        setCamOff(c => !c)
    }

    // 🔹 Auto scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // 📸 Camera helpers
    const openCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
            cameraStreamRef.current = stream
            setCapturedPreview(null)
            setCameraOpen(true)
            // attach stream after modal mounts
            setTimeout(() => {
                if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream
            }, 100)
        } catch (err) {
            console.error('Camera error:', err)
            setToast('Camera access denied')
        }
    }

    const capturePhoto = () => {
        const video = cameraVideoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) return
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d').drawImage(video, 0, 0)
        canvas.toBlob((blob) => {
            const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
            setCapturedPreview(URL.createObjectURL(blob))
            // stop live stream
            cameraStreamRef.current?.getTracks().forEach(t => t.stop())
            if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
            // push into existing image state → handleSend will upload it
            setImage(file)
        }, 'image/jpeg', 0.92)
    }

    const closeCamera = () => {
        cameraStreamRef.current?.getTracks().forEach(t => t.stop())
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
        cameraStreamRef.current = null
        setCapturedPreview(null)
        setCameraOpen(false)
    }

    // 🔥 Delete Message Logic
    const handleDeleteMessage = async (msgId) => {
        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', msgId)

        if (error) {
            console.error("Delete failed:", error)
            setToast('Failed to delete message')
        } else {
            // Keep the 'message deleted' placeholder in the UI locally 
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true } : m))
        }
    }

    // 🔥 FINAL FIXED SEND FUNCTION
    const handleSend = async (e) => {
        e?.preventDefault()

        const text = input ? input.trim() : ""
        if ((!text && !image) || sending || !partner?.id) return

        setSending(true)

        let imageUrl = null

        try {
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                alert("User not logged in")
                return
            }

            // Upload image
            if (image) {
                const safeName = image.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
                const filePath = `${user.id}/${Date.now()}-${safeName}`

                const { error: uploadError } = await supabase.storage
                    .from('chat-images')
                    .upload(filePath, image)

                if (uploadError) throw uploadError

                const { data } = supabase.storage
                    .from('chat-images')
                    .getPublicUrl(filePath)

                imageUrl = data?.publicUrl || null
            }

            console.log({
                sender_id: user.id,
                receiver_id: partner.id,
                content: text,
                image_url: imageUrl
            })

            // Insert message with status = 'sent'
            const { error } = await supabase.from('messages').insert([
                {
                    sender_id: user.id,
                    receiver_id: partner.id,
                    content: text ? text : null,
                    image_url: imageUrl ? imageUrl : null,
                    status: 'sent',
                }
            ])

            if (error) {
                console.error("Insert failed:", error)
                alert(error.message)
            }

            // Reset
            setInput("")
            setImage(null)

        } catch (err) {
            console.error("SEND ERROR:", err)
            setToast(err.message || "Failed to send")
        } finally {
            setSending(false)
            inputRef.current?.focus()
        }
    }

    return (
        <div className="flex flex-col h-full bg-white relative">

            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0 z-10 shadow-sm">
                <button onClick={onBack} className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 focus:bg-gray-100 rounded-full transition-colors">
                    <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                </button>

                <div className="flex-shrink-0 w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {partner?.name?.charAt(0)?.toUpperCase() || partner?.email?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex flex-col justify-center flex-1">
                    <h2 className="text-[15px] font-semibold text-gray-800 leading-tight">
                        {partner?.name || partner?.email || 'Unknown User'}
                    </h2>
                    <p className={`text-[12px] font-medium mt-0.5 flex items-center gap-1 ${partnerOnline ? 'text-green-500' : 'text-gray-400'}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${partnerOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
                        {partnerTyping ? 'typing...' : partnerOnline ? 'Online' : 'Offline'}
                    </p>
                </div>

                {/* Video Call button */}
                <button
                    type="button"
                    onClick={callState === 'idle' ? startCall : endCall}
                    title={callState === 'idle' ? 'Start video call' : 'End call'}
                    className={`ml-auto p-2 rounded-full transition flex items-center justify-center ${callState !== 'idle'
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'text-gray-500 hover:bg-gray-100'
                        }`}
                >
                    {callState !== 'idle' ? (
                        // End-call icon
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1V21a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.01l-2.2 2.21z" transform="rotate(135 12 12)" />
                        </svg>
                    ) : (
                        // Video camera icon
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-5 bg-gradient-to-br from-gray-50 to-gray-200 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-gray-300">

                {/* Loading spinner */}
                {loadingMessages && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-green-400 border-t-transparent animate-spin" />
                    </div>
                )}

                {/* Empty state */}
                {!loadingMessages && messages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 select-none">
                        <span className="text-5xl">🚀</span>
                        <p className="text-gray-500 font-medium text-sm">Start chatting!</p>
                        <p className="text-gray-400 text-xs">Say hello to {partner?.name || partner?.email}</p>
                    </div>
                )}

                {!loadingMessages && messages.map((msg) => {
                    const isSent = msg.sender_id === currentUserId;
                    const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    return (
                        <div
                            key={msg.id}
                            className={`flex group ${isSent ? 'justify-end' : 'justify-start'}`}
                            style={{ animation: 'msgFadeIn 0.2s ease-out' }}
                        >
                            <div className={`relative max-w-[75%] sm:max-w-[65%] px-4 py-2 rounded-2xl shadow-md flex flex-col transition-all duration-200 hover:scale-[1.01] ${isSent
                                ? 'bg-gradient-to-r from-green-300 to-green-400 text-gray-800 rounded-tr-none shadow-lg'
                                : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                                }`}>

                                {/* Delete icon on hover for sent messages */}
                                {isSent && !msg.is_deleted && (
                                    <button
                                        onClick={() => handleDeleteMessage(msg.id)}
                                        className="absolute top-1 -left-8 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-400 hover:text-red-500 rounded-full bg-white shadow-sm border border-gray-100"
                                        title="Delete message"
                                    >
                                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                )}

                                {/* Content or Deleted placeholder */}
                                {msg.is_deleted ? (
                                    <p className="text-[13px] italic text-red-400 opacity-80 pr-2 pb-0.5 mt-0.5">🚫 This message was deleted</p>
                                ) : (
                                    <>
                                        {msg.image_url && (
                                            <img
                                                src={msg.image_url}
                                                alt="Attachment"
                                                onClick={() => setLightboxImg(msg.image_url)}
                                                className="max-w-full rounded-xl mb-1 mt-1 cursor-zoom-in object-cover bg-gray-100 min-h-[100px] shadow-md hover:brightness-110 transition-all duration-200"
                                                style={{ maxHeight: '280px' }}
                                            />
                                        )}
                                        {msg.content && <p className="text-[15px] leading-relaxed break-words pr-2">{msg.content}</p>}
                                    </>
                                )}
                                <span className={`text-[10px] mt-1 self-end flex items-center gap-0.5 ${isSent ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {time}
                                    {isSent && (
                                        <span className={`ml-1 font-bold tracking-tighter leading-none ${msg.status === 'seen' ? 'text-blue-500' : 'text-gray-400'
                                            }`}>
                                            {msg.status === 'sent' ? '✔' : '✔✔'}
                                        </span>
                                    )}
                                </span>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input Bar */}
            <div className="px-3 py-3 bg-white/70 backdrop-blur-md border-t border-gray-200 shadow-lg flex flex-col flex-shrink-0 z-10 w-full relative">

                {/* Image Preview Area */}
                {image && (
                    <div className="relative mb-3 flex items-center bg-white p-2 border border-gray-200 rounded-xl shadow-sm self-start w-max animate-fadeIn">
                        <img src={URL.createObjectURL(image)} alt="Preview" className="h-16 w-16 object-cover rounded-lg shadow-sm bg-gray-100" />
                        <button
                            type="button"
                            onClick={() => setImage(null)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold shadow hover:bg-red-600 transition border-2 border-white"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* 😀 Emoji Picker popup */}
                {emojiOpen && (
                    <div ref={emojiRef} className="absolute bottom-[72px] left-3 z-50">
                        <EmojiPicker
                            onEmojiClick={(emojiData) => {
                                setInput(prev => prev + emojiData.emoji)
                                inputRef.current?.focus()
                            }}
                            height={380}
                            width={300}
                            searchDisabled={false}
                            skinTonesDisabled
                            previewConfig={{ showPreview: false }}
                        />
                    </div>
                )}

                <form onSubmit={handleSend} className="flex items-end gap-2 w-full">

                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={(e) => setImage(e.target.files[0])}
                        className="hidden"
                    />

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 text-gray-500 bg-white/80 shadow-sm hover:text-green-600 hover:bg-green-50 hover:scale-110 rounded-full transition-all duration-200 flex-shrink-0 h-[44px] w-[44px] flex items-center justify-center"
                        title="Attach image"
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                    </button>

                    {/* 📸 Camera capture button */}
                    <button
                        type="button"
                        onClick={openCamera}
                        className="p-2.5 text-gray-500 bg-white/80 shadow-sm hover:text-green-600 hover:bg-green-50 hover:scale-110 rounded-full transition-all duration-200 flex-shrink-0 h-[44px] w-[44px] flex items-center justify-center"
                        title="Take photo"
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                            <circle cx="12" cy="13" r="4" />
                        </svg>
                    </button>

                    <div className="flex-1 bg-white/90 border border-gray-200 shadow-sm rounded-3xl min-h-[44px] flex items-center px-4 relative focus-within:ring-2 focus-within:ring-green-400 transition-all duration-200">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value)
                                // Broadcast typing event (no DB write)
                                if (presenceChannelRef.current) {
                                    presenceChannelRef.current.send({
                                        type: 'broadcast',
                                        event: 'typing',
                                        payload: { userId: currentUserId },
                                    })
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder="Type a message"
                            className="flex-1 w-full bg-transparent border-none py-2.5 text-[15px] focus:outline-none text-gray-700 placeholder-gray-400"
                        />
                        {/* 😀 Emoji toggle button */}
                        <button
                            type="button"
                            onClick={() => setEmojiOpen(o => !o)}
                            className="text-gray-400 hover:text-yellow-500 transition-all text-xl flex-shrink-0 ml-1"
                            title="Emoji"
                        >
                            {emojiOpen ? '🙂' : '😀'}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={sending || (!input.trim() && !image)}
                        className={`h-[44px] w-[44px] rounded-full flex-shrink-0 transition-all duration-200 flex items-center justify-center shadow-md
                            ${(input.trim() || image) && !sending
                                ? 'bg-green-500 text-white hover:bg-green-600 hover:scale-110 hover:shadow-lg'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        {sending ? (
                            <svg className="animate-spin h-[22px] w-[22px] text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="ml-1">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        )}
                    </button>
                </form>
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm transition-opacity animate-fadeIn z-50">
                    {toast}
                </div>
            )}

            {/* 🖼️ Image lightbox */}
            {lightboxImg && (
                <div
                    className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
                    onClick={() => setLightboxImg(null)}
                >
                    <img
                        src={lightboxImg}
                        alt="Full size"
                        className="max-w-[95vw] max-h-[90vh] rounded-xl shadow-2xl object-contain"
                    />
                    <button
                        className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300 transition"
                        onClick={() => setLightboxImg(null)}
                    >✕</button>
                </div>
            )}

            {/* CSS animation keyframe injected inline */}
            <style>{`
                @keyframes msgFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* 📸 Camera capture modal */}
            {cameraOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl p-4 flex flex-col items-center gap-4 w-[340px] max-w-[95vw]">
                        <p className="text-white font-semibold text-sm tracking-wide">
                            {capturedPreview ? 'Photo Preview' : 'Camera'}
                        </p>

                        {/* Live feed OR captured preview */}
                        {capturedPreview ? (
                            <img src={capturedPreview} alt="Captured" className="w-full rounded-xl object-cover" style={{ maxHeight: 260 }} />
                        ) : (
                            <video
                                ref={cameraVideoRef}
                                autoPlay playsInline muted
                                className="w-full rounded-xl object-cover bg-black"
                                style={{ maxHeight: 260 }}
                            />
                        )}

                        {/* Hidden canvas for snapshot */}
                        <canvas ref={canvasRef} className="hidden" />

                        <div className="flex gap-3 w-full">
                            <button
                                type="button"
                                onClick={closeCamera}
                                className="flex-1 py-2 rounded-xl bg-gray-700 text-white text-sm font-semibold hover:bg-gray-600 transition"
                            >
                                Cancel
                            </button>

                            {capturedPreview ? (
                                // After capture: close modal and let existing preview + send handle it
                                <button
                                    type="button"
                                    onClick={() => { setCapturedPreview(null); setCameraOpen(false) }}
                                    className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition"
                                >
                                    Use Photo ✓
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={capturePhoto}
                                    className="flex-1 py-2 rounded-xl bg-[#00a884] text-white text-sm font-semibold hover:bg-[#008f6f] transition"
                                >
                                    📸 Capture
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 📹 Incoming call */}
            {callState === 'incoming' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="bg-gray-900 rounded-3xl shadow-2xl px-10 py-9 flex flex-col items-center gap-5 min-w-[300px] border border-gray-700">
                        {/* Pulsing ring */}
                        <div className="relative">
                            <span className="absolute inset-0 rounded-full bg-green-500 opacity-30 animate-ping" />
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                                {partner?.name?.charAt(0)?.toUpperCase() || partner?.email?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-white text-lg">{partner?.name || partner?.email}</p>
                            <p className="text-green-400 text-sm mt-1 animate-pulse">Incoming video call…</p>
                        </div>
                        <div className="flex gap-5 mt-1">
                            <button onClick={() => endCall(true)}
                                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-all hover:scale-110">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.22.4 2.53.6 3.87.6a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.34.2 2.65.6 3.87a1 1 0 01-.24 1.01l-2.24 2.21z" transform="rotate(135 12 12)" /></svg>
                            </button>
                            <button onClick={acceptCall}
                                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg transition-all hover:scale-110">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.22.4 2.53.6 3.87.6a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.34.2 2.65.6 3.87a1 1 0 01-.24 1.01l-2.24 2.21z" /></svg>
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">Tap accept to join the call</p>
                    </div>
                </div>
            )}

            {/* 📹 Video call modal */}
            {(callState === 'calling' || callState === 'active') && (
                <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center">

                    {/* ── Calling screen (no remote video yet) ── */}
                    {callState === 'calling' && (
                        <div className="flex flex-col items-center gap-6 select-none">
                            {/* pulsing avatar */}
                            <div className="relative">
                                <span className="absolute inset-[-12px] rounded-full border-4 border-green-500/40 animate-ping" />
                                <span className="absolute inset-[-24px] rounded-full border-2 border-green-500/20 animate-ping" style={{ animationDelay: '0.3s' }} />
                                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-5xl font-bold shadow-2xl">
                                    {partner?.name?.charAt(0)?.toUpperCase() || partner?.email?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-white text-xl font-bold">{partner?.name || partner?.email}</p>
                                <p className="text-green-400 text-sm mt-1 animate-pulse">Calling…</p>
                            </div>
                        </div>
                    )}

                    {/* ── Active call: show remote video full screen ── */}
                    {callState === 'active' && (
                        <>
                            <video
                                ref={remoteVideoRef}
                                autoPlay playsInline
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{ background: '#111' }}
                            />
                            {/* Partner name overlay */}
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white px-5 py-1.5 rounded-full text-sm font-medium">
                                {partner?.name || partner?.email}
                            </div>
                        </>
                    )}

                    {/* ── Local video PiP (always shown) ── */}
                    <video
                        ref={localVideoRef}
                        autoPlay playsInline muted
                        className={`absolute bottom-28 right-4 w-28 h-40 object-cover rounded-2xl border-2 border-white/60 shadow-2xl transition-all ${camOff ? 'opacity-30' : 'opacity-100'}`}
                    />

                    {/* ── Control bar ── */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
                        {/* Mute */}
                        <button
                            onClick={toggleMute}
                            title={muted ? 'Unmute' : 'Mute'}
                            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 ${muted ? 'bg-red-600' : 'bg-white/20 backdrop-blur-sm border border-white/30'
                                }`}
                        >
                            {muted ? (
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M19 11a7 7 0 01-14 0M12 1v10M8 21h8M12 17v4" /><line x1="2" y1="2" x2="22" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
                            ) : (
                                <svg viewBox="0 0 24 24" width="22" height="22" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"><path d="M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10a7 7 0 01-14 0M12 19v4M8 23h8" /></svg>
                            )}
                        </button>

                        {/* End call */}
                        <button
                            onClick={() => endCall(true)}
                            title="End call"
                            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-xl transition-all hover:scale-110"
                        >
                            <svg viewBox="0 0 24 24" width="26" height="26" fill="white"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.22.4 2.53.6 3.87.6a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.34.2 2.65.6 3.87a1 1 0 01-.24 1.01l-2.24 2.21z" transform="rotate(135 12 12)" /></svg>
                        </button>

                        {/* Camera toggle */}
                        <button
                            onClick={toggleCam}
                            title={camOff ? 'Turn camera on' : 'Turn camera off'}
                            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 ${camOff ? 'bg-red-600' : 'bg-white/20 backdrop-blur-sm border border-white/30'
                                }`}
                        >
                            {camOff ? (
                                <svg viewBox="0 0 24 24" width="22" height="22" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"><line x1="2" y1="2" x2="22" y2="22" /><path d="M16 16H3a1 1 0 01-1-1V7a1 1 0 011-1h1M23 7l-7 5 7 5V7z" /></svg>
                            ) : (
                                <svg viewBox="0 0 24 24" width="22" height="22" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}