import { useState, useEffect, useCallback, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Hook that registers the service worker with the 'prompt' strategy.
 * Exposes state and actions for showing an update banner when a new
 * version of the app is available.
 */
export function useAppUpdate() {
    const [needRefresh, setNeedRefresh] = useState(false)
    const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)

    useEffect(() => {
        const updateSW = registerSW({
            immediate: true,
            onNeedRefresh() {
                setNeedRefresh(true)
            },
            onOfflineReady() {
                // App is cached and ready for offline use — no action needed
            },
        })

        updateSWRef.current = updateSW
    }, [])

    const updateApp = useCallback(() => {
        if (updateSWRef.current) {
            // Passing true tells the SW to skipWaiting + reloads the page
            updateSWRef.current(true)
        }
    }, [])

    const dismissUpdate = useCallback(() => {
        setNeedRefresh(false)
    }, [])

    return { needRefresh, updateApp, dismissUpdate }
}
