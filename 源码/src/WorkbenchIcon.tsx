export type WorkbenchIconName='walk'|'bus'|'pin'|'search'|'camera'|'photo'|'chair'|'bottle'|'door'|'voice'|'stop'|'check'|'compass';
export default function WorkbenchIcon({name,className=''}:{name:WorkbenchIconName;className?:string}){
  const paths={
    walk:<><circle cx="14" cy="4" r="2"/><path d="m7 12 4-5 4 3 4 1M11 7l-1 8-5 5m5-5 5 5m-3-9 3 4"/></>,
    bus:<><rect x="5" y="3" width="14" height="17" rx="3"/><path d="M5 12h14M12 3v9M7 20v2m10-2v2M8 16h1m6 0h1"/></>,
    pin:<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
    search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    camera:<><path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/></>,
    photo:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
    chair:<><path d="M6 12V3h12v9M4 13h16M6 13v8m12-8v8"/></>,
    bottle:<><path d="M9 3h6v4l3 4v10H6V11l3-4ZM9 3V1h6v2M6 14h12"/></>,
    door:<><path d="M4 22V2h16v20M8 22V6h8v16M2 22h20m-9-9h1"/></>,
    voice:<><path d="m11 4-6 5H2v6h3l6 5ZM15 8c3 2 3 6 0 8m3-11c6 4 6 10 0 14"/></>,
    stop:<rect x="5" y="5" width="14" height="14" rx="3"/>,
    check:<path d="m5 12 5 5L20 6"/>,
    compass:<><circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/></>,
  };
  return <svg className={`workbench-icon ${className}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
