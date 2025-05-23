'use client' // 标记为客户端组件

import mermaid from 'mermaid'
import { useEffect, useRef } from 'react'

// 初始化 Mermaid.js
mermaid.initialize({ startOnLoad: false })

const Mermaid: React.FC<{ children: string }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      mermaid.init(undefined, ref.current)
    }
  }, [children])

  return <div ref={ref} className="mermaid">{children}</div>
}

export default Mermaid