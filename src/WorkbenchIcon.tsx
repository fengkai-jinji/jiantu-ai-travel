export type WorkbenchIconName='walk'|'bus'|'metro'|'transit'|'pin'|'search'|'camera'|'photo'|'chair'|'bottle'|'door'|'voice'|'stop'|'check'|'compass'|'all';

/** 路线方案模式 → 图标。后端只会返回 步行 / 公交 / 地铁 / 公交＋地铁 四种。 */
export function modeIcon(mode:string):WorkbenchIconName{
  if(mode.includes('步行'))return 'walk';
  if(mode.includes('公交')&&mode.includes('地铁'))return 'transit';
  if(mode.includes('地铁'))return 'metro';
  return 'bus';
}

/** 分段指引里的一句文案 → 图标。先判地铁，再判公交，避免「乘坐」把两者混为一谈。 */
export function stepIcon(text:string):WorkbenchIconName{
  if(/地铁|号线|站台/.test(text))return 'metro';
  if(/公交|乘车|乘坐|巴士/.test(text))return 'bus';
  if(/到达|终点|目的地/.test(text))return 'pin';
  return 'walk';
}

export default function WorkbenchIcon({name,className=''}:{name:WorkbenchIconName;className?:string}){
  const paths={
    walk:<><circle cx="14" cy="4" r="2"/><path d="m7 12 4-5 4 3 4 1M11 7l-1 8-5 5m5-5 5 5m-3-9 3 4"/></>,
    // 公交：正面车厢，两扇窗 + 前灯，与侧面地铁形成明显对比
    bus:<><rect x="5" y="3" width="14" height="17" rx="3"/><path d="M5 12h14M12 3v9M7 20v2m10-2v2M8 16h1m6 0h1"/></>,
    // 地铁：圆形标志 + M 折线，全球通用的地铁识别符号
    metro:<><circle cx="12" cy="12" r="8.6"/><path d="M7.6 16.2V9l4.4 5 4.4-5v7.2"/></>,
    // 公交＋地铁：双向换乘箭头，表示需要换乘的组合方案
    transit:<><path d="M5 9h12"/><path d="m14.2 6.2 2.8 2.8-2.8 2.8"/><path d="M19 15H7"/><path d="m9.8 12.2-2.8 2.8 2.8 2.8"/></>,
    pin:<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
    search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    camera:<><path d="M4.2 8h3.1l1.6-2.6h6.2L16.7 8h3.1a1.2 1.2 0 0 1 1.2 1.2v9.4a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 18.6V9.2A1.2 1.2 0 0 1 4.2 8Z"/><circle cx="12" cy="13.4" r="3.4"/></>,
    photo:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
    chair:<><path d="M6.5 12V4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V12"/><path d="M4 12.6h16"/><path d="M6.2 13v6.2m11.6-6.2v6.2"/><path d="M6.2 16.4h11.6"/></>,
    bottle:<><path d="M9 3h6v4l3 4v10H6V11l3-4ZM9 3V1h6v2M6 14h12"/></>,
    door:<><path d="M4 21V4.2A1.2 1.2 0 0 1 5.2 3h13.6A1.2 1.2 0 0 1 20 4.2V21"/><path d="M7.6 21V6.8h8.8V21"/><path d="M2 21h20"/><circle cx="14.4" cy="13.6" r=".85"/></>,
    voice:<><path d="m11 4-6 5H2v6h3l6 5ZM15 8c3 2 3 6 0 8m3-11c6 4 6 10 0 14"/></>,
    stop:<rect x="5" y="5" width="14" height="14" rx="3"/>,
    check:<path d="m5 12 5 5L20 6"/>,
    compass:<><circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/></>,
    // 全部目标：四角取景框 + 中心十字，表示"把整个画面都看一遍"
    all:<><path d="M4 8.6V5.8A1.8 1.8 0 0 1 5.8 4h2.8M15.4 4h2.8A1.8 1.8 0 0 1 20 5.8v2.8M20 15.4v2.8a1.8 1.8 0 0 1-1.8 1.8h-2.8M8.6 20H5.8A1.8 1.8 0 0 1 4 18.2v-2.8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 7.6v1.2M12 15.2v1.2M7.6 12h1.2M15.2 12h1.2"/></>,
  };
  return <svg className={`workbench-icon ${className}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
