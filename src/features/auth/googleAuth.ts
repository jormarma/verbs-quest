// Thin wrapper around Google Identity Services (GIS) for the ID-token flow.
//
// We use the "Sign in with Google" button which returns an OpenID Connect ID
// token (a JWT). That token is handed to SpacetimeDB via `.withToken(...)`, and
// SpacetimeDB derives a stable Identity from its `iss` + `sub` claims. The
// Google client *secret* is never involved in this browser flow, so nothing
// secret ships in the bundle.

const GSI_SRC = 'https://accounts.google.com/gsi/client'

interface GoogleCredentialResponse {
    credential?: string
}

interface GoogleIdConfig {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
}

interface GoogleButtonOptions {
    type?: 'standard' | 'icon'
    theme?: 'outline' | 'filled_blue' | 'filled_black'
    size?: 'large' | 'medium' | 'small'
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
    shape?: 'rectangular' | 'pill' | 'circle' | 'square'
    width?: number
    logo_alignment?: 'left' | 'center'
}

interface GoogleAccountsId {
    initialize: (config: GoogleIdConfig) => void
    renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void
    disableAutoSelect: () => void
}

declare global {
    interface Window {
        google?: { accounts?: { id?: GoogleAccountsId } }
    }
}

let scriptPromise: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
    if (window.google?.accounts?.id) return Promise.resolve()
    if (scriptPromise) return scriptPromise

    scriptPromise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
        if (existing) {
            existing.addEventListener('load', () => resolve())
            existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')))
            return
        }
        const script = document.createElement('script')
        script.src = GSI_SRC
        script.async = true
        script.defer = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
        document.head.appendChild(script)
    })
    return scriptPromise
}

/** Loads GIS, initializes it, and renders the official button into `container`. */
export async function renderGoogleButton(
    container: HTMLElement,
    clientId: string,
    onCredential: (idToken: string) => void,
    options?: GoogleButtonOptions,
): Promise<void> {
    await loadGoogleScript()
    const id = window.google?.accounts?.id
    if (!id) throw new Error('Google Identity Services unavailable')

    id.initialize({
        client_id: clientId,
        callback: (response) => {
            if (response.credential) onCredential(response.credential)
        },
        auto_select: false,
        cancel_on_tap_outside: true,
    })

    container.innerHTML = ''
    id.renderButton(container, {
        type: 'standard',
        theme: 'filled_blue',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'center',
        ...options,
    })
}

/** Prevents One Tap auto sign-in after the user explicitly signs out. */
export function googleSignOut(): void {
    try {
        window.google?.accounts?.id?.disableAutoSelect()
    } catch {
        // ignore — GIS may not be loaded
    }
}
