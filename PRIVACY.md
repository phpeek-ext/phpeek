# PHPeek Privacy Policy

*Last updated: October 2026*

**Short version: PHPeek collects nothing. Ever.**

- PHPeek does not collect, store, transmit, sell or share any personal or browsing data.
- PHPeek makes no network requests. It never contacts the sites you visit, analytics services, or any server run by its authors — there isn't one.
- To do its job, PHPeek reads the HTTP response headers and a few HTML markers of the page in your current tab. This happens entirely inside your browser.
- The result is kept in your browser's session storage for that tab only, and is deleted when the tab closes or the browser exits.
- No cookies, no trackers, no ads, no third-party code.

## Why each permission is needed

| Permission | Used for |
|---|---|
| `webRequest` + access to all sites | Reading the response headers of the page you open (read-only — nothing is blocked, changed or sent). |
| `tabs` | Showing the result for the tab you're looking at. |
| `storage` | Keeping that result in session storage while the tab is open. |

Questions? Open an issue on the GitHub repository.
