import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '加班规划助手',
  description: '根据月度目标、双休需求和实际完成时间，智能分配每月加班计划。',
  openGraph: { title: '加班规划助手', description: '面向中国大陆节假日的月度加班时间智能分配工具。', type: 'website' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
