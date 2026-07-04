/**
 * 编程语言列表
 * 图标使用本地 SVG 文件 (public/icons/languages/)
 */

export interface LanguageInfo {
  id: string
  name: string
  /** 本地 SVG 图标路径 */
  iconUrl: string
  /** 品牌主色 */
  color: string
}

function iconUrl(id: string): string {
  return `/icons/languages/${id}.svg`
}

export const LANGUAGES: LanguageInfo[] = [
  { id: 'python', name: 'Python', iconUrl: iconUrl('python'), color: '#3776AB' },
  { id: 'javascript', name: 'JavaScript', iconUrl: iconUrl('javascript'), color: '#F7DF1E' },
  { id: 'typescript', name: 'TypeScript', iconUrl: iconUrl('typescript'), color: '#3178C6' },
  { id: 'java', name: 'Java', iconUrl: iconUrl('java'), color: '#ED8B00' },
  { id: 'go', name: 'Go', iconUrl: iconUrl('go'), color: '#00ADD8' },
  { id: 'rust', name: 'Rust', iconUrl: iconUrl('rust'), color: '#CE422B' },
  { id: 'c', name: 'C', iconUrl: iconUrl('c'), color: '#A8B9CC' },
  { id: 'cpp', name: 'C++', iconUrl: iconUrl('cpp'), color: '#00599C' },
  { id: 'csharp', name: 'C#', iconUrl: iconUrl('csharp'), color: '#512BD4' },
  { id: 'swift', name: 'Swift', iconUrl: iconUrl('swift'), color: '#F05138' },
  { id: 'kotlin', name: 'Kotlin', iconUrl: iconUrl('kotlin'), color: '#7F52FF' },
  { id: 'ruby', name: 'Ruby', iconUrl: iconUrl('ruby'), color: '#CC342D' },
  { id: 'php', name: 'PHP', iconUrl: iconUrl('php'), color: '#777BB4' },
  { id: 'sql', name: 'SQL', iconUrl: iconUrl('sql'), color: '#003B57' },
  { id: 'other', name: '其他', iconUrl: iconUrl('other'), color: '#6B5D4D' },
]

export function getLanguageById(id: string): LanguageInfo {
  return LANGUAGES.find((l) => l.id === id) || { id, name: id, iconUrl: iconUrl(id), color: '#6B5D4D' }
}
