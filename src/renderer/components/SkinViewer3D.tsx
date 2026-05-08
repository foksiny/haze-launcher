import { useEffect, useRef } from 'react'
import { SkinViewer, IdleAnimation } from 'skinview3d'

export default function SkinViewer3D({ 
  skinUrl, 
  model = 'default',
  width = 150, 
  height = 250 
}: { 
  skinUrl: string
  model?: 'default' | 'slim'
  width?: number
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    viewerRef.current = new SkinViewer({
      canvas: containerRef.current.appendChild(document.createElement('canvas')),
      width,
      height,
      skin: skinUrl,
      model,
    })

    viewerRef.current.animation = new IdleAnimation()
    viewerRef.current.autoRotate = true
    viewerRef.current.autoRotateSpeed = 0.5

    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose()
        viewerRef.current = null
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [width, height])

  useEffect(() => {
    if (viewerRef.current && skinUrl) {
      viewerRef.current.loadSkin(skinUrl, { model })
    }
  }, [skinUrl, model])

  return (
    <div ref={containerRef} style={{ width, height, pointerEvents: 'none' }} />
  )
}
