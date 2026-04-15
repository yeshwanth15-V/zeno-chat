/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'Poppins', 'sans-serif'],
            },
            colors: {
                bg: '#F7F9FC',
                surface: '#FFFFFF',
                border: '#E2E8F0',
                muted: '#94A3B8',
                primary: '#6366F1',
                primaryLight: '#818CF8',
                accent: '#8B5CF6',
                high: '#EF4444',
                medium: '#F59E0B',
                low: '#94A3B8',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideIn: {
                    '0%': { opacity: '0', transform: 'translateX(-10px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                pulse2: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '.5' },
                },
                glow: {
                    '0%, 100%': { boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)' },
                    '50%': { boxShadow: '0 0 18px rgba(239, 68, 68, 0.6)' },
                },
            },
            animation: {
                fadeIn: 'fadeIn 0.25s ease-out forwards',
                slideIn: 'slideIn 0.2s ease-out forwards',
                pulse2: 'pulse2 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                glow: 'glow 2s ease-in-out infinite',
            },
            backgroundImage: {
                'gradient-primary': 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                'gradient-sent': 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            },
        },
    },
    plugins: [],
}
