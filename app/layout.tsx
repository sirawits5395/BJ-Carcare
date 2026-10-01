import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'BJ Carcare · ดูแลลูกค้า',description:'ทะเบียนรถ ประวัติบริการ และรอบดูแลเคลือบเซรามิก BJ Carcare',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>}
