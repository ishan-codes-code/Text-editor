# Test font fixtures

`TestFont.ttf` is a copy of DejaVu Sans (free license) whose `name` table was
rewritten to the family **TestFont** (`scripts` one-off, checksum-fixed), so
automated tests never collide with a system font. It stands in for the user's
Kruti Dev file: same code path (upload validation → IndexedDB → `FontFace`
from `ArrayBuffer`), but freely committable.

The real Kruti Dev font is commercial: never committed, never bundled, used
only for manual device checks.
