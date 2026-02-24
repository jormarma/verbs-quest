import { ClerkProvider } from '@clerk/clerk-react'
import { ReactNode } from 'react'

// Read the publishable key from env variables
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
    console.warn("Missing Clerk Publishable Key")
}

export function AuthProvider({ children }: { children: ReactNode }) {
    return (
        <ClerkProvider publishableKey={publishableKey || "pk_test_dummy"} afterSignOutUrl="/">
            {children}
        </ClerkProvider>
    )
}
