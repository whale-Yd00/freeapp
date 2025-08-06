const announcementManager = (() => {
    const STORAGE_KEY = 'whale-llt-seen-announcements';
    const OLD_STORAGE_KEY = 'update-20250805-seen';
    const ANNOUNCEMENT_DIR = 'announcements/';

    // To add a new announcement:
    // 1. Create a new .md file in the /announcements/ directory.
    // 2. Add the filename (without .md) to the TOP of this list.
    const ANNOUNCEMENT_IDS = [
        '20250806',
        '20250805'
    ];

    function getSeenIds() {
        let seenIds = [];
        try {
            const storedValue = localStorage.getItem(STORAGE_KEY);
            if (storedValue) {
                seenIds = JSON.parse(storedValue);
            }
        } catch (e) {
            console.error("Failed to parse seen announcements:", e);
            seenIds = [];
        }

        // Migration from old system for existing users
        if (localStorage.getItem(OLD_STORAGE_KEY) === 'true') {
            if (!seenIds.includes('20250805')) {
                seenIds.push('20250805');
            }
            localStorage.removeItem(OLD_STORAGE_KEY);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(seenIds));
        }
        
        return seenIds;
    }

    async function getUnread() {
        const seenIds = getSeenIds();
        const unreadIds = ANNOUNCEMENT_IDS.filter(id => !seenIds.includes(id));

        if (unreadIds.length === 0) {
            return [];
        }

        try {
            const fetchPromises = unreadIds.map(id => 
                fetch(`${ANNOUNCEMENT_DIR}${id}.md`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Announcement ${id}.md not found.`);
                        }
                        return response.text();
                    })
                    .then(text => ({ id, content: text }))
            );
            
            const unreadAnnouncements = await Promise.all(fetchPromises);
            return unreadAnnouncements;

        } catch (error) {
            console.error("Failed to fetch announcements:", error);
            return []; // Return empty if any fetch fails
        }
    }

    function markAsSeen(idsToMark) {
        const seenIds = getSeenIds();
        const newSeenIds = [...new Set([...seenIds, ...idsToMark])]; 
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSeenIds));
    }

    return {
        getUnread,
        markAsSeen
    };
})();
