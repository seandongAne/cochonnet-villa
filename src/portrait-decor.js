import { birthdayPreview, watchBirthday } from './birthday.js';

// The shared calendar is the only timing source. Preview overrides are local.
export function mountPortraitDecor({ root, location, window, document, onChange = () => {} }) {
  const previewLocation = {
    hostname: location.hostname,
    search: new URLSearchParams({ birthday: new URLSearchParams(location.search).get('decor') ?? '' }).toString(),
  };
  const stop = watchBirthday(active => {
    root.toggleAttribute('data-portrait-decor', active);
    onChange(active);
  }, {
    preview: birthdayPreview(previewLocation),
    subscribeWake(check) {
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check);
      window.addEventListener('pageshow', check);
      return () => {
        document.removeEventListener('visibilitychange', check);
        window.removeEventListener('focus', check);
        window.removeEventListener('pageshow', check);
      };
    },
  });
  return () => { stop(); root.removeAttribute('data-portrait-decor'); };
}
