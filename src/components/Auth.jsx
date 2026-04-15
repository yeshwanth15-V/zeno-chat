import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth() {
    const [mode, setMode] = useState('login')      // 'login' | 'register'
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    const reset = () => { setError(''); setSuccess('') }

    const handleSubmit = async (e) => {
        e.preventDefault()
        reset()

        // Basic client-side validation
        if (!email.trim()) return setError('Email is required.')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Please enter a valid email.')
        if (!password) return setError('Password is required.')
        if (password.length < 6) return setError('Password must be at least 6 characters.')
        if (mode === 'register' && !name.trim()) return setError('Please enter your display name.')

        setLoading(true)

        try {
            if (mode === 'register') {
                const { data, error } = await supabase.auth.signUp({ email, password })
                if (error) throw error

                if (data.user) {
                    await supabase.from('profiles').insert([{
                        id: data.user.id,
                        email: data.user.email,
                        name: name.trim() || email.split('@')[0],
                    }])
                }

                setSuccess('Account created! You can now sign in.')
                setMode('login')
                setName(''); setEmail(''); setPassword('')
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-purple-100 to-gray-100 px-4">
            <div className="bg-white w-full max-w-[380px] rounded-2xl shadow-xl border border-gray-200 p-8 transition-all duration-300">

                {/* Logo */}
                <div className="text-center mb-7">
                    <div className="text-4xl mb-2">💬</div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
                        Zeno Chat
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">Simple real-time messaging</p>
                </div>

                {/* Tabs */}
                <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
                    <button
                        onClick={() => { setMode('login'); reset() }}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${mode === 'login'
                            ? 'bg-white text-gray-800 shadow'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >Sign In</button>
                    <button
                        onClick={() => { setMode('register'); reset() }}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${mode === 'register'
                            ? 'bg-white text-gray-800 shadow'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >Create Account</button>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                        ⚠ {error}
                    </div>
                )}
                {success && (
                    <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-lg px-4 py-3 mb-4">
                        ✓ {success}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'register' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                            <input
                                type="text" placeholder="John Doe"
                                value={name} onChange={e => setName(e.target.value)} required
                                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email" placeholder="you@example.com"
                            value={email} onChange={e => setEmail(e.target.value)} required
                            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                                value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                                className="w-full px-4 py-2.5 pr-11 rounded-lg border border-gray-300 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                                tabIndex={-1}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-2.5 rounded-lg text-white text-sm font-semibold bg-gradient-to-r from-blue-500 to-violet-500 hover:scale-[1.02] hover:shadow-md transition-all duration-200 mt-1 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
                    </button>
                </form>

                {/* Footer */}
                <p className="text-center text-sm text-gray-400 mt-6">
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    <button
                        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); reset() }}
                        className="text-violet-500 font-medium hover:underline transition-all"
                    >
                        {mode === 'login' ? 'Sign up' : 'Sign in'}
                    </button>
                </p>
            </div>
        </div>
    )
}
