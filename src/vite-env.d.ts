/// <reference types="vite/client" />

// 扩展 React InputHTMLAttributes 以支持 webkitdirectory 和 directory 属性
declare namespace React {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: boolean
    directory?: boolean
  }
}
