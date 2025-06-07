import { setTrack } from '@/app/config/api';
//网站通过?ref=reddit...来追踪来源,这里获取来源,样例https://yourdomain.com?ref=producthunt
export const trackReferrer = async () => {
    // 获取 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    let ref = urlParams.get('ref');
    if (process.env.NEXT_PUBLIC_development === 'false'){
      ref = urlParams.get('ref') || 'noRef';//生产环境，统计日活，没有ref记录为noRef
    }
    const path = window.location.pathname;
    if (ref) {
      try {
        setTrack(ref,path);
        // 可选：将来源存储在 localStorage 中，用于后续追踪
        // localStorage.setItem('initial_ref', ref);
      } catch (error) {
        console.error('Failed to track referrer:', error);
      }
    }
  };