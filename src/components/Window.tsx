import type { ReactNode } from 'react';
export function Window({title,meta,children,className='',as='section'}:{title:string;meta?:string;children:ReactNode;className?:string;as?:'section'|'footer'}){const Element=as;return <Element className={`window ${className}`}><header className="titlebar"><span>{title}</span>{meta&&<span className="titlebar-meta">{meta}</span>}</header>{children}</Element>}
