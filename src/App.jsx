import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Chat from './components/Chat'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid #e5e7eb', borderTopColor: '#a78bfa',
            animation: 'spin 0.7s linear infinite', margin: '0 auto 12px'
          }} />
          <p style={{ fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    )
  }

  return session ? <Chat session={session} /> : <Auth />
}