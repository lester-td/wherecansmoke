import type { ReactNode } from 'react';
export function Window({title,meta,children,className=''}:{title:string;meta?:string;children:ReactNode;className?:string}){return <section className={`window ${className}`}><header className="titlebar"><span>{title}</span>{meta&&<span className="titlebar-meta">{meta}</span>}</header>{children}</section>}
