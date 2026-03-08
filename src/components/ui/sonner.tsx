import { Toaster as Sonner } from 'sonner'
import type { ComponentProps } from 'react'

type ToasterProps = ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return <Sonner theme="system" richColors closeButton {...props} />
}

export { Toaster }
