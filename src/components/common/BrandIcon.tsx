import { useState } from 'react'
import { cn } from '@/lib/utils'

interface BrandIconProps {
  /** 图标 URL（本地路径） */
  src: string
  /** 显示名称（用于 alt 和 fallback） */
  name: string
  /** 尺寸 */
  size?: number
  /** 额外 className */
  className?: string
  /** 圆形背景 */
  rounded?: boolean
  /** 背景色（默认透明） */
  bgColor?: string
}

/**
 * 品牌图标组件
 * 使用本地 SVG 文件，加载失败时显示首字母 fallback
 */
export default function BrandIcon({
  src,
  name,
  size = 24,
  className,
  rounded = false,
  bgColor,
}: BrandIconProps) {
  const [error, setError] = useState(false)

  // 无 URL 或加载失败 → 首字母 fallback
  if (!src || error) {
    return (
      <div
        className={cn(
          'flex items-center justify-center shrink-0 text-white font-bold',
          rounded && 'rounded-full',
          className
        )}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.45,
          backgroundColor: bgColor || '#9C8E7C',
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      className={cn('shrink-0', rounded && 'rounded-full', className)}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  )
}
