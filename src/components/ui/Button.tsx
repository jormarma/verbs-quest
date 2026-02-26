import { forwardRef } from "react"
import type { ButtonHTMLAttributes } from "react"
import { cn } from "../../lib/utils/cn"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
    size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex w-fit items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 disabled:-translate-y-0",
                    {
                        "bg-blue-600 text-white hover:bg-blue-500 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/50": variant === 'default',
                        "bg-red-500 text-white hover:bg-red-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-500/50": variant === 'destructive',
                        "border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-100": variant === 'outline',
                        "bg-slate-800 text-slate-100 hover:bg-slate-700 hover:-translate-y-0.5 hover:shadow-md": variant === 'secondary',
                        "hover:bg-slate-800 text-slate-300 hover:text-slate-100": variant === 'ghost',
                        "text-slate-300 underline-offset-4 hover:underline": variant === 'link',
                        "h-10 px-4 py-2": size === 'default',
                        "h-9 px-3": size === 'sm',
                        "h-11 px-8": size === 'lg',
                        "h-10 w-10": size === 'icon',
                    },
                    className
                )}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
