'use strict';

const PD_LANGUAGE_KEY = 'paradoxDoctorLanguageV1';

function pdText(english, korean) {
  return document.documentElement.lang.toLowerCase().startsWith('ko') ? korean : english;
}

function pdGetLanguagePreference() {
  try { return localStorage.getItem(PD_LANGUAGE_KEY); } catch { return null; }
}

function pdSetLanguagePreference(language) {
  try { localStorage.setItem(PD_LANGUAGE_KEY, language); } catch {}
}

(() => {
  const pairs = new Map([
    ['/paradox-doctor/', '/paradox-doctor/ko/'],
    ['/paradox-doctor/index.html', '/paradox-doctor/ko/'],
    ['/paradox-doctor/errors/hoi4-error-log-guide.html', '/paradox-doctor/ko/errors/hoi4-error-log-guide.html'],
    ['/paradox-doctor/errors/hoi4-focus-tree-not-showing.html', '/paradox-doctor/ko/errors/hoi4-focus-tree-not-showing.html'],
    ['/paradox-doctor/errors/hoi4-crash-same-date.html', '/paradox-doctor/ko/errors/hoi4-crash-same-date.html'],
    ['/paradox-doctor/errors/hoi4-mod-crash-after-adding-state.html', '/paradox-doctor/ko/errors/hoi4-mod-crash-after-adding-state.html']
  ]);
  const localizedKoreanGuides = new Set([
    'errors/hoi4-error-log-guide.html',
    'errors/hoi4-focus-tree-not-showing.html',
    'errors/hoi4-crash-same-date.html',
    'errors/hoi4-mod-crash-after-adding-state.html'
  ]);

  const saved = pdGetLanguagePreference();
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  const browserPrefersKorean = browserLanguages.some(language => String(language).toLowerCase().startsWith('ko'));
  const koreanTarget = pairs.get(location.pathname);

  if (koreanTarget && (saved === 'ko' || (!saved && browserPrefersKorean))) {
    location.replace(`${koreanTarget}${location.search}${location.hash}`);
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-language-choice]').forEach(link => {
      link.addEventListener('click', () => pdSetLanguagePreference(link.dataset.languageChoice));
    });
  });

  document.addEventListener('click', event => {
    if (!document.documentElement.lang.toLowerCase().startsWith('ko')) return;
    const link = event.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('errors/') || localizedKoreanGuides.has(href)) return;
    event.preventDefault();
    location.href = `../${href}`;
  });
})();
