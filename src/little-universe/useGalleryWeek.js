import { useEffect, useState } from 'react';
import { galleryWeekKey, watchGalleryWeek } from './gallery.js';

export function useGalleryWeek() {
  const [week, setWeek] = useState(() => galleryWeekKey());
  useEffect(() => watchGalleryWeek(setWeek, {
    subscribeWake(check) {
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', check);
      return () => {
        window.removeEventListener('focus', check);
        document.removeEventListener('visibilitychange', check);
      };
    },
  }), []);
  return week;
}
