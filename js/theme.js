(function () {
    function getInitialTheme() {
        const persistedColorPreference = window.localStorage.getItem('theme');
        const hasPersistedPreference = typeof persistedColorPreference === 'string';

        if (hasPersistedPreference) {
            return persistedColorPreference;
        }

        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const hasMediaQueryPreference = typeof mql.matches === 'boolean';

        if (hasMediaQueryPreference) {
            return mql.matches ? 'dark' : 'light';
        }

        return 'light';
    }

    const theme = getInitialTheme();
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
})();

window.toggleTheme = function () {
    const isDark = document.documentElement.classList.toggle('dark');
    const theme = isDark ? 'dark' : 'light';
    window.localStorage.setItem('theme', theme);
    document.dispatchEvent(new Event('themeChanged'));
};


