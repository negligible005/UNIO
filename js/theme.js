/**
 * Initialize the application theme based on user preference or system settings.
 * Runs immediately before the DOM is fully rendered to prevent "theme flickering".
 */
(function () {
    /**
     * getInitialTheme: Determines the starting theme state.
     * @returns {string} 'dark' or 'light'
     */
    function getInitialTheme() {
        // Check for a explicitly saved preference in the browser's local storage
        const persistedColorPreference = window.localStorage.getItem('theme');
        const hasPersistedPreference = typeof persistedColorPreference === 'string';

        // prioritize the user's manual choice if it exists
        if (hasPersistedPreference) {
            return persistedColorPreference;
        }

        // Check the operating system's color scheme preference (prefers-color-scheme)
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const hasMediaQueryPreference = typeof mql.matches === 'boolean';

        // Use the system preference if the user hasn't made a manual choice
        if (hasMediaQueryPreference) {
            return mql.matches ? 'dark' : 'light';
        }

        // Fallback to light mode as the default experience
        return 'light';
    }

    // Apply the identified theme to the root HTML element
    const theme = getInitialTheme();
    if (theme === 'dark') {
        // Add the 'dark' utility class for Tailwind CSS dark mode activation
        document.documentElement.classList.add('dark');
    } else {
        // Ensure no dark class is present for standard light mode
        document.documentElement.classList.remove('dark');
    }
})();

/**
 * toggleTheme: Public globally accessible function to switch between modes.
 * Usually triggered by a button in the UI.
 */
window.toggleTheme = function () {
    // Toggle the 'dark' class on the HTML tag and store the new state
    const isDark = document.documentElement.classList.toggle('dark');
    const theme = isDark ? 'dark' : 'light';
    // Persist the new choice for future sessions
    window.localStorage.setItem('theme', theme);
    // Dispatch a custom event so other components (like charts) can react to theme changes
    document.dispatchEvent(new Event('themeChanged'));
};


