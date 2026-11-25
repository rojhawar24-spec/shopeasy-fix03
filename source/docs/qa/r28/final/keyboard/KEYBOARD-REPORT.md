# R28 keyboard proposal — three reproduced focus defects

VERIFIED — Four source files are changed only in this private proposal. Main R28 and delivered R27 were not edited. [Merge manifest](merge-manifest.json), [portable patch](keyboard.patch), [actual four-file patch rehearsal](evidence/patch-rehearsal.json), [actual Node syntax commands](evidence/syntax-checks.json).

| Defect | Before evidence | Resulting behavior and source |
| --- | --- | --- |
| Initial Cookie preferences container loses focus on Shift+Tab | [Before](evidence/before/keyboard-results.json):60 successful assertions,10 failures; all five locales at390/1440. The initial dialog is tabindex=-1; old wrap logic handled only its first/last controls. | `public/js/app.js:1067`: initial Tab reaches the first visible tabbable control and Shift+Tab reaches the last. Hidden/inert/non-tabbable controls are excluded. |
| Cookie Save hides the banner opener and leaves focus on BODY | Earlier [corrected broad probe](evidence/after-corrected/keyboard-results.json) recorded BODY after all10 saves but asserted only closure. A new actual shipped-method negative control [fails10 cookie groups](evidence/cookie-save-before/browser-results.json) specifically on the focus requirement, while all10 drawer groups pass. | `public/js/app.js:988`: closing an actually open modal restores a usable original control; if Save removed that banner control, focus continues at a visible main-content control. Footer opener return remains intact. Automatic/non-modal banner changes do not steal focus. |
| Mobile cart drawer closes navigation, then Escape cannot return to the now-hidden cart link | [Before](evidence/mobile-drawer-before/mobile-drawer-results.json):20 assertions succeed,5 fail in en/ckb/ar/nl/fr; active element is BODY after Escape. | `public/js/retail-2027.js:204`: return to the visible opener on desktop; when the mobile navigation opener is hidden, return to the visible menu toggle. [After](evidence/mobile-drawer-after/mobile-drawer-results.json):25/25 assertions succeed. |

VERIFIED — Final **actual shipped regression methods** ran in all five locales at390/1440: **20 method groups succeeded, zero failed**, and the disposable fixture was removed. [Summary](evidence/shipped-methods-final/summary.json), [full records and runtime/runner/fixture hashes](evidence/shipped-methods-final/browser-results.json). These groups include initial forward/reverse Tab, both boundary wraps, Escape/opener return, Save focus, footer reopen, mobile/desktop enabled drawer and its focus return. This is a focused invocation of the real methods, not a claim that the complete buyer suite ran on the final proposal.

VERIFIED — Earlier proposal broad keyboard/reflow probe: [260 assertions succeeded](evidence/after-corrected/keyboard-results.json), zero failures, five locales,390/1440 plus60 fresh320-CSS-pixel route/locale reflow checks. It covered quick preview, compare, story and desktop drawer native-modal behavior plus required form validation. It predates the later Save/drawer focus-return refinement; its runtime fingerprint is explicitly retained as earlier evidence. Mobile drawer was subsequently covered by its dedicated negative/positive control above.

VERIFIED — The earlier [prototype probe](evidence/after/keyboard-results.json) retained40 unsuccessful assertions. Native modal boundary expectations were corrected after an independent [native Chromium control](evidence/native-control.json) showed Tab can visit browser chrome: BODY becomes active while document.hasFocus() is false, and the next Tab returns inside the native modal. The corrected test also attempts programmatic background focus and requires that it be refused. This does not permit focus on background controls. Ten earlier generic group exceptions retain only Error as their type; their original detailed cause is UNKNOWN, not represented as ten independently proved application bugs.

## Shipped QA option

`qa/fixture-server.mjs:53` can explicitly enable the synthetic appearance_cartDrawer setting. The normal appearance default is preserved. `qa/run-browser-qa.py` adds `--cart-drawer`, records the configuration flag, and executes enabled-drawer keyboard groups for all selected locales at the minimum/maximum selected widths. Its normal public suite now includes cookie keyboard groups for all selected locales at those widths. The fixture accepts the extra argument compatibly; old callers without it retain their previous configuration.

Example after parent integration, from a fresh source extraction with the documented QA tools installed:

```powershell
& .\.qa-venv\Scripts\python.exe .\qa\run-browser-qa.py --suite all --cart-drawer --simulated-email --locales en,ckb,ar,nl,fr --widths 320,390,768,1440 --axe-path .\.qa-tools\node_modules\axe-core\axe.min.js --output .\qa-output-r28-all
```

NOT TESTED — Actual Windows/PowerShell execution of that command. Linux Python3.13.5 and Chromium156.0.8078.79 executed the retained focused evidence. Intercepted email remains a simulation. The parent must run the complete product suite and full browser workflow after integrating all proposal branches; generated templates/minified styles must be regenerated then.

## Limits and merge details

NOT TESTED — Real screen-reader output, voice control, physical devices, actual browser desktop400% zoom and full WCAG2.2AA conformance. A320-CSS-pixel layout is equivalent reflow geometry for1280px at400%, not an actual zoom action. [Read-only executable discovery](evidence/assistive-availability.json) found none of the listed Orca/speech/voice executables on PATH; that does not establish that every possible assistive tool is unavailable. Chromium accessibility data and native dialog controls are not a screen reader.

VERIFIED — The retail drawer-close patch is independent of the accessibility branch's theme-SVG changes near the beginning of retail-2027.js. Merge hunks and preserve both changes. The QA public-loop additions should also be preserved when adding fresh-page viewport checks. Manifest after hashes describe this proposal, not a future integrated runtime; all future acceptance claims need new integrated evidence.

Audit-only helper commands used the installed Python3.13 interpreter at `/workspace/presale-r27/tools/qa-python313/bin/python` with `probe-keyboard.py`, `probe-mobile-drawer.py` and `probe-shipped-methods.py`. Those helpers have retained audit-workspace paths and are not buyer setup commands. All fixtures use random synthetic credentials, intercept/block external traffic and remove temporary state; secret/cookie values are not included in these records.
