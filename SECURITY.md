# Security

If you find a vulnerability, please do not open a public issue.

Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). You will get an answer within a week.

What is in scope: the web app, the worker, the analyzer service and the database schema in this repository. Out of scope: the game's own servers and third-party services (Steam, OpenRouter).

The project stores: Steam ids, public game profile data (aliases, ratings, match history) and, for people who log in, a session cookie. It does not store passwords or payment data.
