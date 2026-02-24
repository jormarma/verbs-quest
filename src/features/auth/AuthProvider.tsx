import { ClerkProvider } from '@clerk/clerk-react'
import type { ReactNode } from 'react'

// Read the publishable key from env variables
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
    console.warn("Missing Clerk Publishable Key")
}

export function AuthProvider({ children }: { children: ReactNode }) {
    if (!publishableKey) {
        return (
            <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 z-[100] relative">
                <div className="max-w-md w-full bg-slate-800 p-8 rounded-xl border border-red-500/50 shadow-2xl text-center space-y-4 relative z-[100]">
                    <h2 className="text-2xl font-bold text-red-400">Missing Clerk Key</h2>
                    <p className="text-slate-300">
                        You must add your <code className="bg-slate-900 px-2 py-1 rounded text-red-300">VITE_CLERK_PUBLISHABLE_KEY</code> to your <code className="bg-slate-900 px-2 py-1 rounded text-blue-300">.env.local</code> file to continue.
                    </p>
                    <p className="text-sm text-slate-400 mt-4 leading-relaxed">
                        If you don't have one, go to <a href="https://dashboard.clerk.com" className="text-blue-400 hover:underline" target="_blank" rel="noreferrer">Clerk Dashboard</a> to create an app.<br />
                        Don't forget to restart your development server after adding it!
                    </p>
                </div>
            </div>
        )
    }

    return (
        <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
            {children}
        </ClerkProvider>
    )
}
