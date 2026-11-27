#!/usr/bin/env python3
"""Disposable, loopback-only buyer QA. Never prints raw browser/server errors."""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
import datetime as dt
import hashlib
import hmac
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import secrets
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlsplit


class QaFailure(Exception):
    """Only static, public check identifiers belong in this exception."""


def require(condition, code):
    if not condition:
        raise QaFailure(code)


def safe_environment():
    # Do not inherit deployment secrets, NODE_OPTIONS, Python paths or browser state.
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"}
    return {key: value for key, value in os.environ.items() if key.upper() in allowed}


@contextmanager
def selected_playwright_node(executable):
    # Playwright's pinned Python wheel otherwise selects its bundled Node binary.
    # Restore the caller's environment when this module is used in-process.
    previous = os.environ.get("PLAYWRIGHT_NODEJS_PATH")
    os.environ["PLAYWRIGHT_NODEJS_PATH"] = str(executable)
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("PLAYWRIGHT_NODEJS_PATH", None)
        else:
            os.environ["PLAYWRIGHT_NODEJS_PATH"] = previous


def require_clean_source(root):
    # Inspect only path/directory-entry metadata, never private file contents.
    env_file = root / ".env"
    require(not env_file.is_symlink() and not env_file.exists(), "source-must-not-contain-dotenv")
    for relative in ("data", ".venv", "public/uploads"):
        private = root / relative
        require(not private.is_symlink(), "source-private-path-symlink")
        if private.exists():
            require(private.is_dir(), "source-private-path-not-directory")
            with os.scandir(private) as entries:
                require(all(entry.name == ".gitkeep" and entry.is_file(follow_symlinks=False) for entry in entries), "source-private-path-not-empty")


class Fixture:
    def __init__(self, args):
        self.args = args
        self.process = None
        self.temporary = None
        self.messages = queue.Queue()

    def __enter__(self):
        try:
            require_clean_source(self.args.app_root)
            self.temporary = tempfile.TemporaryDirectory(prefix="shopeasy-buyer-qa-")
            self.private = Path(self.temporary.name)
            self.private.chmod(0o700)
            (self.private / ".qa-owner").write_text(secrets.token_hex(32), encoding="utf-8")
            runtime = self.private / "runtime"
            runtime.mkdir()

            def ignore(directory, names):
                require(not any(Path(directory, name).is_symlink() for name in names), "runtime-source-symlink-not-permitted")
                return [name for name in names if name.startswith(".env") or name in {".venv", ".git", "node_modules", "data", "uploads", "__pycache__"}]

            # Deliberately never traverse .env, data/, .venv, qa/ or user uploads.
            for name in ("src", "views", "public", "generated"):
                require(not (self.args.app_root / name).is_symlink(), "runtime-source-directory-symlink")
                shutil.copytree(self.args.app_root / name, runtime / name, ignore=ignore)
            require(not (self.args.app_root / "package.json").is_symlink(), "runtime-package-symlink")
            shutil.copyfile(self.args.app_root / "package.json", runtime / "package.json")
            source_files = sorted(path for path in runtime.rglob("*") if path.is_file())
            self.source_manifest = [{"path": path.relative_to(runtime).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in source_files]
            manifest = "\n".join(entry["path"] + ":" + entry["sha256"] for entry in self.source_manifest)
            self.source_fingerprint = {"sha256": hashlib.sha256(manifest.encode()).hexdigest(), "files": len(source_files), "scope": "Copied src, views, public excluding uploads, generated and package.json"}
            env = safe_environment()
            env.update({"NODE_ENV": "test", "HOME": str(self.private), "USERPROFILE": str(self.private)})
            self.process = subprocess.Popen(
                [self.args.node, str(Path(__file__).with_name("fixture-server.mjs")), str(runtime), str(self.args.app_root), str(self.private), "simulated-email" if self.args.simulated_email else "disabled-email", "enabled-cart-drawer" if getattr(self.args, "cart_drawer", False) else "default-cart-drawer"],
                cwd=self.private, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1,
            )

            def read_protocol():
                for line in self.process.stdout:
                    try:
                        self.messages.put(json.loads(line))
                    except (ValueError, TypeError):
                        self.messages.put({"event": "protocol-error"})
                self.messages.put({"event": "closed"})

            self.reader = threading.Thread(target=read_protocol, daemon=True)
            self.reader.start()
            self.metadata = self.receive(90)
            require(self.metadata.get("event") == "ready", "fixture-startup-" + self.metadata.get("stage", "unknown") + "-" + self.metadata.get("kind", "unknown"))
            self.base = "http://127.0.0.1:" + str(self.metadata["port"])
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def receive(self, timeout=10):
        try:
            return self.messages.get(timeout=timeout)
        except queue.Empty:
            raise QaFailure("fixture-protocol-timeout") from None

    def mail(self, recipient, kind):
        for _ in range(40):
            self.process.stdin.write(json.dumps({"command": "mail", "recipient": recipient, "kind": kind}) + "\n")
            self.process.stdin.flush()
            response = self.receive()
            require(response.get("event") == "mail", "simulated-mail-protocol")
            if response.get("message"):
                return response["message"]
            time.sleep(0.1)
        raise QaFailure("simulated-mail-not-produced")

    def __exit__(self, *_):
        if self.process:
            if self.process.poll() is None:
                try:
                    self.process.stdin.write('{"command":"stop"}\n')
                    self.process.stdin.flush()
                    self.process.wait(timeout=10)
                except (OSError, subprocess.TimeoutExpired):
                    self.process.kill()
                    self.process.wait(timeout=10)
            for stream in (self.process.stdin, self.process.stdout):
                if stream:
                    stream.close()
        if self.temporary:
            self.temporary.cleanup()


def totp(seed):
    key = base64.b32decode(seed + "=" * ((8 - len(seed) % 8) % 8))
    digest = hmac.new(key, struct.pack(">Q", int(time.time() // 30)), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1000000).zfill(6)


_oracle_spec = importlib.util.spec_from_file_location("shopeasy_qa_login_oracle", Path(__file__).with_name("login_oracle.py"))
_oracle = importlib.util.module_from_spec(_oracle_spec)
_oracle_spec.loader.exec_module(_oracle)
LOGIN_HEADINGS = _oracle.LOGIN_HEADINGS


def nojs_login_oracle(page, response, locale):
    try:
        _oracle.assert_login_page(page, response, locale)
    except AssertionError:
        raise QaFailure("nojs-login-shared-oracle-rejected") from None
    require(page.locator("[data-password-toggle]").is_hidden(), "nojs-login-hidden-js-control")


class Audit:
    def __init__(self, args):
        self.args = args
        self.phase = "setup"
        self.secret_values = set()
        self.results = {"started_utc": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "RUNNING", "runtime": {"python": sys.version.split()[0], "platform": sys.platform}, "configuration": {"suite": args.suite, "locales": args.locales, "widths": args.widths, "screenshots": args.screenshots, "email": "SIMULATED local intercepted provider; no actual delivery" if args.simulated_email else "DISABLED; delivery NOT TESTED"}, "checks": [], "limitations": ["Actual Windows PowerShell 5.1 execution NOT TESTED in Linux audit", "Source ownership UNKNOWN", "No live inbox delivery, provider payment/settlement/refunds, Peppol delivery, full manual WCAG review or screen-reader/device matrix tested", "Axe incomplete items require manual disposition; automated checks are not WCAG certification"]}
        self.results["configuration"]["cart_drawer"] = bool(getattr(args, "cart_drawer", False))

    def redact(self, value):
        if isinstance(value, str):
            for secret in self.secret_values:
                if secret:
                    value = value.replace(secret, "[REDACTED]")
            value = re.sub(r"([?&](?:token|code|key|session|csrf)=)[^&\s\"']+", r"\1[REDACTED]", value, flags=re.I)
            return re.sub(r"\[value=[^\]]*\]", "[value=REDACTED]", value, flags=re.I)
        if isinstance(value, dict):
            return {key: self.redact(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self.redact(item) for item in value]
        return value

    def save(self):
        report = self.args.output / "browser-results.json"
        temporary = report.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.redact(self.results), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(report)

    def record(self, name, **details):
        self.results["checks"].append({"check": name, "status": "PASS", **details})
        self.save()

    def run(self, name, function):
        self.phase = name
        try:
            function()
            return True
        except Exception as error:
            # Raw Playwright exceptions contain locator values, URLs and source excerpts.
            self.results["checks"].append({"check": name, "status": "FAIL", "reason": str(error) if isinstance(error, QaFailure) else type(error).__name__})
            self.save()
            print(f"FAIL: {name}", flush=True)
            return False

    def goto(self, page, route):
        response = page.goto(self.fixture.base + route, wait_until="domcontentloaded")
        # Preserve actual rate limiting; allow one window to expire, never weaken the app.
        for _ in range(8):
            if response.status != 429:
                break
            page.wait_for_timeout(10000)
            response = page.goto(self.fixture.base + route, wait_until="domcontentloaded")
        return response

    def context(self, **options):
        context = self.browser.new_context(**options)
        # Block all non-fixture browser traffic, including remote images and analytics.
        base = self.fixture.base
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
        context.set_default_timeout(15000)
        return context

    @staticmethod
    def dismiss(page):
        button = page.locator("[data-cookie-reject]").first
        if button.is_visible():
            button.click()

    def submit(self, page, form):
        with page.expect_navigation(wait_until="domcontentloaded"):
            form.locator('button[type="submit"]').click()

    def login(self, page, credentials):
        require(self.goto(page, "/login").status == 200, "login-form-status")
        self.dismiss(page)
        form = page.locator('form[action="/login"]')
        form.locator('[name="email"]').fill(credentials["email"])
        form.locator('[name="password"]').fill(credentials["password"])
        self.submit(page, form)

    def logout(self, page, context):
        prior_cookies = context.cookies(self.fixture.base)
        token = page.locator('meta[name="csrf-token"]').get_attribute("content")
        response = context.request.post(self.fixture.base + "/logout", form={"_csrf": token}, max_redirects=0)
        require(response.status in (302, 303), "logout-redirect")
        require(context.request.get(self.fixture.base + "/account", max_redirects=0).status in (302, 303), "logout-session-revoked")
        replay = self.context()
        try:
            replay.add_cookies(prior_cookies)
            require(replay.request.get(self.fixture.base + "/account", max_redirects=0).status in (302, 303), "logout-prior-cookie-replay-rejected")
        finally:
            replay.close()

    def customer_auth(self):
        self.customer = self.context()
        self.customer_page = page = self.customer.new_page()
        self.credentials = {"email": "customer-" + secrets.token_hex(8) + "@example.test", "password": secrets.token_urlsafe(24)}
        self.secret_values.update(self.credentials.values())
        require(self.goto(page, "/register").status == 200, "signup-form-status")
        self.dismiss(page)
        form = page.locator('form[action="/register"]')
        for key, value in {"fullName": "Synthetic QA Customer", "email": self.credentials["email"], "password": self.credentials["password"], "confirmPassword": self.credentials["password"]}.items():
            form.locator(f'[name="{key}"]').fill(value)
        form.locator('[name="termsAccepted"]').check()
        self.submit(page, form)
        require(urlsplit(page.url).path == "/register" and page.locator('.auth-next-step[role="status"]').is_visible(), "signup-generic-pending-notice")
        require(self.customer.request.get(self.fixture.base + "/account", max_redirects=0).status in (302, 303), "signup-remains-anonymous")
        if self.args.simulated_email:
            mail = self.fixture.mail(self.credentials["email"], "verify")
            self.secret_values.add(mail["token"])
            require(self.goto(page, "/verify-email?token=" + mail["token"]).status == 200, "simulated-verification-password-form")
            require(self.customer.request.get(self.fixture.base + "/account", max_redirects=0).status in (302, 303), "verification-get-remains-anonymous")
            verification = page.locator('form[action="/verify-email"]')
            verification.locator('[name="password"]').fill(self.credentials["password"])
            self.submit(page, verification)
            require(urlsplit(page.url).path == "/login" and parse_qs(urlsplit(page.url).query).get("verified") == ["1"], "simulated-verification-token-and-original-password-completed")
            require(self.customer.request.get(self.fixture.base + "/verify-email?token=" + mail["token"]).status == 400, "verification-token-replay-rejected")
            self.login(page, self.credentials)
            require(urlsplit(page.url).path == "/account", "email-verified-customer-login")
            self.record("SIMULATED local verification", read_only_get=True, token_and_original_password_required=True, first_use_accepted=True, token_replay_rejected=True, actual_inbox_delivery="NOT TESTED")
        else:
            self.login(page, self.credentials)
            require(urlsplit(page.url).path == "/login" and page.locator('#auth-error[role="alert"]').is_visible(), "pending-signup-login-rejected")
            # Reuse the Manager context authenticated by real TOTP and recovery
            # codes. Activation must go through the guarded form, never a fixture
            # database write that would bypass the shipped ownership policy.
            manager_page = self.manager_page
            require(self.goto(manager_page, "/admin/customers?search=" + self.credentials["email"]).status == 200, "pending-customer-manager-page")
            row = manager_page.locator("tbody tr").filter(has=manager_page.get_by_text(self.credentials["email"], exact=True))
            require(row.count() == 1, "pending-customer-exact-row")
            row.locator("details > summary").click()
            approval = row.locator('form[action$="/approve-registration"]')
            fresh_password = secrets.token_urlsafe(24)
            self.secret_values.add(fresh_password)
            approval.locator('[name="password"]').fill(fresh_password)
            approval.locator('[name="confirmPassword"]').fill(fresh_password)
            approval.locator('[name="identityConfirmed"]').check()
            self.submit(manager_page, approval)
            require(urlsplit(manager_page.url).path == "/admin/customers" and parse_qs(urlsplit(manager_page.url).query).get("registration") == ["approved"], "offline-manager-approval-completed")
            self.login(page, self.credentials)
            require(urlsplit(page.url).path == "/login" and page.locator('#auth-error[role="alert"]').is_visible(), "original-pending-password-rejected-after-approval")
            self.credentials["password"] = fresh_password
            self.login(page, self.credentials)
            require(urlsplit(page.url).path == "/account", "approved-customer-fresh-password-login")
            self.record("Offline Manager ownership approval", original_password_rejected=True, fresh_password_login=True, identity_confirmation="SYNTHETIC fixture customer")
        require(urlsplit(page.url).path == "/account", "verified-customer-login-account")
        self.record("Customer signup and verified login", registration_pending=True, signed_in_after_verification=True)
        self.goto(page, "/account/security")
        form = page.locator('form[action="/account/security"]')
        changed = secrets.token_urlsafe(24)
        self.secret_values.add(changed)
        for key, value in {"currentPassword": self.credentials["password"], "newPassword": changed, "confirmPassword": changed}.items():
            form.locator(f'[name="{key}"]').fill(value)
        self.submit(page, form)
        require(page.locator('.auth-card .success-alert[role="status"]').is_visible(), "password-change-confirmed")
        require(all(not value for value in page.locator('input[type="password"]').evaluate_all("els=>els.map(e=>e.value)")), "password-fields-cleared")
        self.credentials["password"] = changed
        self.logout(page, self.customer)
        self.login(page, self.credentials)
        require(urlsplit(page.url).path == "/account", "changed-password-login")
        self.record("Customer password change, logout revocation and changed-password login", password_fields_cleared=True, logout_revoked_session=True)
        if self.args.simulated_email:
            self.logout(page, self.customer)
            self.goto(page, "/forgot-password")
            form = page.locator('form[action="/forgot-password"]').first
            form.locator('[name="email"]').fill(self.credentials["email"])
            self.submit(page, form)
            require(page.locator(".auth-next-step").is_visible(), "reset-generic-notice")
            mail = self.fixture.mail(self.credentials["email"], "reset")
            self.secret_values.add(mail["code"])
            reset = secrets.token_urlsafe(24)
            self.secret_values.add(reset)
            form = page.locator('form[action="/forgot-password"]').filter(has=page.locator('input[name="action"][value="reset"]'))
            for key, value in {"code": mail["code"], "password": reset, "confirmPassword": reset}.items():
                form.locator(f'[name="{key}"]').fill(value)
            self.submit(page, form)
            require(urlsplit(page.url).path == "/login" and "reset=1" in page.url, "simulated-reset-completed")
            self.credentials["password"] = reset
            self.login(page, self.credentials)
            require(urlsplit(page.url).path == "/account", "reset-password-login")
            self.record("SIMULATED local reset and new-password login", actual_inbox_delivery="NOT TESTED")

    def manager_auth(self):
        self.manager = self.context()
        self.manager_page = page = self.manager.new_page()
        self.manager_errors = []
        page.on("pageerror", lambda _: self.manager_errors.append(True))
        self.login(page, self.fixture.metadata["manager"])
        require(urlsplit(page.url).path == "/mfa/setup", "manager-mfa-enrollment-required")
        seed = page.locator("#manual-secret").inner_text().replace(" ", "")
        self.secret_values.add(seed)
        # Avoid a code expiring between calculation and browser submission.
        if time.time() % 30 > 27:
            page.wait_for_timeout(3100)
        form = page.locator('form[action="/mfa/verify"]')
        form.locator('[name="code"]').fill(totp(seed))
        self.submit(page, form)
        codes = page.locator(".mfa-recovery-codes code").all_text_contents()
        require(len(codes) >= 2, "manager-recovery-codes-created")
        self.secret_values.update(codes)
        require(self.goto(page, "/admin").status == 200, "manager-dashboard-after-totp")
        self.record("Manager password and real TOTP enrollment", dashboard_access=True, recovery_codes_displayed=True)
        for code, accepted in ((codes[0], True), (codes[0], False), (codes[1], True)):
            if accepted or code == codes[0] and urlsplit(page.url).path != "/mfa/verify":
                self.logout(page, self.manager)
                self.login(page, self.fixture.metadata["manager"])
            require(urlsplit(page.url).path == "/mfa/verify", "manager-mfa-challenge")
            form = page.locator('form[action="/mfa/verify"]')
            form.locator('[name="code"]').fill(code)
            self.submit(page, form)
            if accepted:
                require(urlsplit(page.url).path == "/admin", "manager-recovery-first-use")
            else:
                require(urlsplit(page.url).path == "/mfa/verify" and page.locator('[role="alert"]').is_visible(), "manager-recovery-replay-rejected")
        self.record("Manager recovery-code replay", first_use_accepted=True, replay_rejected=True, another_code_accepted=True)

    def fill_checkout(self, page):
        form = page.locator('form[action="/checkout"]')
        values = {"customerEmail": self.credentials["email"], "customerPhone": "+442079460000", "shippingName": "Synthetic QA Customer", "shippingAddress": "1 Test Street", "shippingCity": "London", "shippingPostalCode": "SW1A 1AA"}
        for key, value in values.items():
            form.locator(f'[name="{key}"]').fill(value)
        form.locator('[name="shippingCountry"]').select_option(label="United Kingdom")
        form.locator('[name="paymentMethod"][value="cash_on_delivery"]').check()
        form.locator('[name="termsAccepted"]').check()
        require(form.evaluate("form=>form.checkValidity()"), "checkout-valid-form")
        return form

    def commerce(self):
        page = self.customer_page
        require(self.goto(page, "/product/qa-product-11").status == 200, "variant-product-status")
        page.locator("[data-option-one-select]").select_option(label="Small")
        self.submit(page, page.locator('form[action="/cart/add"]'))
        require(self.goto(page, "/cart").status == 200, "cart-status")
        require("QA product 11" in page.locator("main").inner_text() and "Small" in page.locator("main").inner_text(), "cart-selected-variant")
        if self.axe_source:
            self.axe(page, "axe filled cart")
        self.goto(page, "/checkout")
        form = self.fill_checkout(page)
        if self.axe_source:
            self.axe(page, "axe filled checkout")
        # This is explicitly a lifecycle-event simulation, not actual BFCache restoration.
        submitted_requests = []
        def observed_request(request):
            if request.method == "POST" and urlsplit(request.url).path == "/checkout":
                submitted_requests.append(True)
        page.on("request", observed_request)
        # dispatchEvent invokes listeners; it does not invoke native form submission.
        form.evaluate('form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))')
        require(form.locator('button[type="submit"]').is_disabled(), "checkout-submit-once-disabled")
        page.evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))')
        restored = not form.locator('button[type="submit"]').is_disabled()
        page.remove_listener("request", observed_request)
        require(not submitted_requests, "checkout-simulation-no-order-post")
        self.results["checks"].append({"check": "Checkout persisted pageshow simulation", "status": "PASS" if restored else "FAIL", "button_restored": restored, "order_posts_during_simulation": 0, "actual_history_restoration": "NOT TESTED"})
        self.save()
        page.reload(wait_until="domcontentloaded")
        self.submit(page, self.fill_checkout(page))
        require(urlsplit(page.url).path == "/checkout/success", "cod-order-success")
        self.order_id = parse_qs(urlsplit(page.url).query)["order"][0]
        require(self.order_id.isdigit(), "cod-order-id")
        if self.axe_source:
            self.axe(page, "axe COD success")
        require(self.customer.request.get(self.fixture.base + "/account/order/" + self.order_id).status == 200, "owned-order-access")
        require(self.customer.request.get(self.fixture.base + "/admin", max_redirects=0).status == 403, "customer-manager-access-denied")
        self.record("Variant cart, COD order and owner access", owner_order_status=200, customer_manager_status=403, live_payment="NOT TESTED")
        if self.axe_source:
            require(self.goto(page, "/account/order/" + self.order_id).status == 200, "owned-order-page-status")
            self.axe(page, "axe customer owned order")
        guest = self.context()
        guest_page = guest.new_page()
        self.goto(guest_page, "/account/order/" + self.order_id)
        require(urlsplit(guest_page.url).path == "/login", "guest-order-login-required")
        require(guest.request.get(self.fixture.base + "/checkout/success?order=" + self.order_id, max_redirects=0).status in (302, 303, 403, 404), "guest-success-denied")
        guest.close()
        other = self.context()
        other_page = other.new_page()
        self.login(other_page, self.fixture.metadata["other"])
        require(urlsplit(other_page.url).path == "/account", "other-customer-login")
        require(other.request.get(self.fixture.base + "/account/order/" + self.order_id, max_redirects=0).status in (403, 404), "other-customer-order-denied")
        require(other.request.get(self.fixture.base + "/checkout/success?order=" + self.order_id, max_redirects=0).status in (302, 303, 403, 404), "other-customer-success-denied")
        other.close()
        self.record("Order access boundaries", guest_login_required=True, other_customer_denied=True)

    def axe(self, page, name):
        # CDP evaluation instruments axe; normal contexts retain CSP enforcement.
        page.evaluate(self.axe_source)
        result = page.evaluate(r"""async()=>{
          const tags=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'];
          const ids=axe.getRules().filter(rule=>rule.tags.some(tag=>tags.includes(tag))).map(rule=>rule.ruleId);
          if(!ids.includes('label-content-name-mismatch'))ids.push('label-content-name-mismatch');
          const result=await axe.run(document,{runOnly:{type:'rule',values:ids}});
          const map=items=>items.map(item=>({id:item.id,impact:item.impact,help:item.help,helpUrl:item.helpUrl,nodes:item.nodes.map(node=>{
            let element;try{element=document.querySelector(node.target[0]);}catch{}
            const labelledBy=(element?.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();
            return {target:node.target,visible_text:(element?.innerText||'').trim().slice(0,240),aria_label:element?.getAttribute('aria-label')||null,labelled_by_text:labelledBy||null};
          })}));
          return {version:axe.version,rule_count:ids.length,label_content_name_mismatch_included:ids.includes('label-content-name-mismatch'),violations:map(result.violations),incomplete:map(result.incomplete)};
        }""")
        require(result["version"] == "4.11.0", "axe-pinned-version")
        self.record(name, status="FAIL" if result["violations"] else "PASS", axe=result, manual_review="PENDING" if result["incomplete"] else "No incomplete items returned; manual conformance NOT TESTED")

    def responsive(self, page):
        for width in self.args.widths:
            page.set_viewport_size({"width": width, "height": 900})
            require(not page.evaluate("document.documentElement.scrollWidth>innerWidth"), "responsive-no-horizontal-overflow")

    def navigation_keyboard(self, page, locale, width):
        require(self.goto(page, "/shop").status == 200, "navigation-shop-http-200")
        self.dismiss(page)
        page.set_viewport_size({"width": width, "height": 900})
        filter_toggle = page.locator("[data-shop-filter-toggle]")
        if filter_toggle.is_visible() and filter_toggle.get_attribute("aria-expanded") == "false":
            filter_toggle.focus()
            page.keyboard.press("Enter")
            drawer = page.locator("#shop-filter-form")
            require(drawer.is_visible() and drawer.get_attribute("aria-modal") == "true", "filter-drawer-modal")
            require(drawer.locator("[data-filter-close]").evaluate("e=>document.activeElement===e"), "filter-drawer-focus")
            require(page.locator("header.site-header").evaluate("e=>e.inert||Boolean(e.closest('[inert]'))"), "filter-drawer-background-inert")
            page.keyboard.press("Escape")
            require(not drawer.is_visible() and filter_toggle.evaluate("e=>document.activeElement===e"), "filter-drawer-escape-focus")
            self.record("Filter drawer keyboard regression", route="/shop", locale=locale, width=width, modal=True, focus_restored=True)
        menu = page.locator("[data-menu-toggle]")
        nav = page.locator("#site-navigation")
        mobile = width <= 1023
        if mobile:
            require(menu.is_visible(), "navigation-mobile-toggle-visible")
            menu.focus()
            page.keyboard.press("Enter")
            require(nav.is_visible() and menu.get_attribute("aria-expanded") == "true", "navigation-mobile-visible-after-enter")
            require(nav.locator("a[href]").first.evaluate("e=>document.activeElement===e"), "navigation-open-focus-first-link")
        else:
            require(not menu.is_visible() and nav.is_visible(), "navigation-desktop-visible-without-toggle")
        category = nav.locator(".nav-category-trigger")
        panel = nav.locator(".nav-category-panel")
        require(category.count() == 1 and panel.count() == 1, "navigation-seeded-category-disclosure-present")
        category.focus()
        category.hover()
        require(category.get_attribute("aria-expanded") == "false" and not panel.is_visible(), "navigation-category-closed-despite-focus-hover")
        page.keyboard.press("Enter")
        require(category.get_attribute("aria-expanded") == "true" and panel.is_visible(), "navigation-category-enter-opens")
        page.keyboard.press("Enter")
        require(category.get_attribute("aria-expanded") == "false" and not panel.is_visible(), "navigation-category-enter-closes")
        page.keyboard.press("Space")
        require(category.get_attribute("aria-expanded") == "true" and panel.is_visible(), "navigation-category-space-opens")
        panel.locator("a[href]").first.focus()
        page.keyboard.press("Escape")
        require(category.get_attribute("aria-expanded") == "false" and not panel.is_visible(), "navigation-category-escape-closes")
        require(category.evaluate("e=>document.activeElement===e"), "navigation-category-escape-returns-trigger")
        if mobile:
            require(nav.is_visible() and menu.get_attribute("aria-expanded") == "true", "navigation-category-escape-keeps-outer-menu")
            page.keyboard.press("Escape")
            require(not nav.is_visible() and menu.get_attribute("aria-expanded") == "false", "navigation-outer-escape-closes")
            require(menu.evaluate("e=>document.activeElement===e"), "navigation-outer-escape-returns-toggle")
            menu.focus()
            page.keyboard.press("Enter")
            outside = page.locator("#sort-filter")
            outside.focus()
            page.keyboard.press("Escape")
            require(nav.is_visible() and outside.evaluate("e=>document.activeElement===e"), "navigation-escape-outside-does-not-steal-focus")
            outside.evaluate("e=>e.scrollIntoView({block:'end',behavior:'instant'})")
            outside.click()
            require(not nav.is_visible() and menu.get_attribute("aria-expanded") == "false", "navigation-outside-click-closes")
            require(outside.evaluate("e=>document.activeElement===e"), "navigation-outside-click-preserves-focus")
        self.record("Navigation keyboard regression", route="/shop", locale=locale, width=width, mobile_menu=mobile, category_explicit_disclosure=True, category_escape_returns_focus=True, outer_escape_returns_focus=True if mobile else "NOT APPLICABLE (desktop)", outside_focus_preserved=True if mobile else "NOT APPLICABLE (desktop)", screen_reader="NOT TESTED")

    def cookie_keyboard(self, page, locale, width):
        require(self.goto(page, "/login").status == 200, "cookie-keyboard-login-http-200")
        page.set_viewport_size({"width": width, "height": 900})
        overlay = page.locator("[data-cookie-preferences]")
        dialog = overlay.locator('[role="dialog"]')
        banner = page.locator("[data-cookie-banner]")
        footer_opener = page.locator("[data-cookie-open]")
        if not banner.is_visible():
            footer_opener.focus()
            page.keyboard.press("Enter")
            dialog.locator("[data-cookie-reset]").focus()
            page.keyboard.press("Enter")
            require(banner.is_visible() and not overlay.is_visible(), "cookie-reset-reopens-choice")
        opener = banner.locator("[data-cookie-customize]")
        opener.focus()
        page.keyboard.press("Enter")
        require(overlay.is_visible() and dialog.evaluate("e=>document.activeElement===e"), "cookie-initial-dialog-focus")
        focusable = dialog.locator('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])').filter(visible=True)
        require(focusable.count() >= 2, "cookie-dialog-tabbable-controls")
        first, last = focusable.first, focusable.last
        page.keyboard.press("Shift+Tab")
        require(last.evaluate("e=>document.activeElement===e"), "cookie-initial-reverse-tab-stays-modal")
        dialog.focus()
        page.keyboard.press("Tab")
        require(first.evaluate("e=>document.activeElement===e"), "cookie-initial-forward-tab-first-control")
        first.focus()
        page.keyboard.press("Shift+Tab")
        require(last.evaluate("e=>document.activeElement===e"), "cookie-first-reverse-tab-last-control")
        last.focus()
        page.keyboard.press("Tab")
        require(first.evaluate("e=>document.activeElement===e"), "cookie-last-forward-tab-first-control")
        page.keyboard.press("Escape")
        require(not overlay.is_visible() and opener.evaluate("e=>document.activeElement===e"), "cookie-escape-restores-banner-opener")
        opener.focus()
        page.keyboard.press("Enter")
        dialog.locator("[data-cookie-save]").focus()
        page.keyboard.press("Enter")
        require(not overlay.is_visible() and not banner.is_visible(), "cookie-keyboard-save-closes-choice")
        require(page.evaluate("()=>document.activeElement!==document.body&&document.activeElement.tabIndex>=0&&document.activeElement.getClientRects().length>0&&!!document.activeElement.closest('main')"), "cookie-save-focuses-visible-main-control-when-banner-opener-hides")
        footer_opener.focus()
        page.keyboard.press("Enter")
        require(overlay.is_visible() and dialog.evaluate("e=>document.activeElement===e"), "cookie-saved-choice-footer-reopen")
        page.keyboard.press("Escape")
        require(not overlay.is_visible() and footer_opener.evaluate("e=>document.activeElement===e"), "cookie-escape-restores-footer-opener")
        self.record("Cookie dialog keyboard regression", route="/login", locale=locale, width=width,
                    initial_container_forward_reverse_tab=True, boundary_tab_wrap=True,
                    escape_and_focus_return=True, keyboard_save_and_footer_reopen=True, save_focuses_visible_main_control=True,
                    actual_screen_reader="NOT TESTED")

    def cart_drawer_keyboard(self, page, locale, width):
        page.set_viewport_size({"width": width, "height": 900})
        require(self.goto(page, "/shop").status == 200, "drawer-keyboard-shop-http200")
        self.dismiss(page)
        nav = page.locator("[data-nav]")
        menu = page.locator("[data-menu-toggle]")
        mobile = menu.is_visible()
        if mobile:
            menu.focus()
            page.keyboard.press("Enter")
            require(nav.is_visible(), "drawer-mobile-menu-open")
        opener = nav.locator("[data-cart-drawer-trigger]").filter(visible=True).first
        require(opener.count() == 1, "drawer-enabled-visible-opener")
        opener.focus()
        page.keyboard.press("Enter")
        drawer = page.locator("[data-cart-drawer]")
        drawer.wait_for(state="visible")
        require(drawer.evaluate("e=>e.open&&e.contains(document.activeElement)"), "drawer-open-focus-contained")
        if mobile:
            require(not nav.is_visible(), "drawer-mobile-nav-closed-behind-modal")
        page.keyboard.press("Escape")
        drawer.wait_for(state="hidden")
        target = menu if mobile else opener
        require(target.evaluate("e=>document.activeElement===e&&e.getClientRects().length>0"), "drawer-close-returns-visible-opener")
        self.record("Cart drawer keyboard regression", route="/shop", locale=locale, width=width,
                    mobile_menu=mobile, focus_contained=True, escape_returns_visible_control=True)

    def public(self):
        routes = ["/", "/shop", "/category/qa-collection", "/product/qa-product-1", "/product/qa-product-11", "/cart", "/login", "/register", "/forgot-password", "/order-lookup", "/stories", "/contact", "/faq", "/privacy", "/terms", "/shipping-returns", "/imprint", "/cookies", "/withdrawal-form"]
        axe_routes = {"/", "/shop", "/product/qa-product-11", "/login", "/register", "/contact", "/faq"}
        for locale in self.args.locales:
            context = self.context()
            context.add_cookies([{"name": "shop_lang", "value": locale, "url": self.fixture.base}])
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda _: errors.append(True))
            for route in routes:
                def check(route=route):
                    errors.clear()
                    response = self.goto(page, route)
                    self.dismiss(page)
                    require(response.status == 200, "public-route-http-200")
                    require(page.locator("h1").count() == 1, "public-route-one-heading")
                    require((page.locator("html").get_attribute("lang") or "").split("-")[0] == locale, "public-route-locale")
                    require(page.locator("html").get_attribute("dir") == ("rtl" if locale in ("ckb", "ar") else "ltr"), "public-route-direction")
                    self.responsive(page)
                    require(not errors, "public-route-no-javascript-errors")
                    self.record("Public route responsive smoke", route=route, locale=locale, widths=self.args.widths, http_status=200, javascript_errors=0)
                    if route in axe_routes:
                        page.set_viewport_size({"width": min(self.args.widths), "height": 900})
                        self.axe(page, f"axe public {locale} {route}")
                    if self.args.screenshots and route in ("/shop", "/product/qa-product-11"):
                        page.screenshot(path=str(self.args.output / f"public-{locale}-{route.strip('/').replace('/', '-')}.png"), full_page=True)
                    if route == "/shop":
                        def seller_preview():
                            page.locator('[data-quick-url="/product/qa-product-2"]').first.click()
                            page.wait_for_timeout(150)
                            try:
                                require(page.locator("[data-quick-title]").inner_text() == "Featured", "seller-name-preserved-in-quick-preview")
                                self.record("Seller name in quick preview", locale=locale, seller_name_preserved=True)
                            finally:
                                page.locator("[data-quick-close]").first.click()
                        self.run(f"Seller quick preview {locale}", seller_preview)
                    if route == "/shop" and locale in ("en", "ckb"):
                        navigation_widths = sorted({min(self.args.widths), max(self.args.widths), min(self.args.widths, key=lambda width: abs(width - 768))})
                        for width in navigation_widths:
                            self.run(f"Navigation keyboard {locale} {width}", lambda width=width: self.navigation_keyboard(page, locale, width))
                    if route == "/shop" and getattr(self.args, "cart_drawer", False):
                        for width in sorted({min(self.args.widths), max(self.args.widths)}):
                            self.run(f"Cart drawer keyboard {locale} {width}", lambda width=width: self.cart_drawer_keyboard(page, locale, width))
                    if route == "/login":
                        for width in sorted({min(self.args.widths), max(self.args.widths)}):
                            self.run(f"Cookie keyboard {locale} {width}", lambda width=width: self.cookie_keyboard(page, locale, width))
                self.run(f"Public {locale} {route}", check)
            context.close()
            context = self.context(java_script_enabled=False)
            context.add_cookies([{"name": "shop_lang", "value": locale, "url": self.fixture.base}])
            page = context.new_page()

            def nojs():
                response = self.goto(page, "/login")
                nojs_login_oracle(page, response, locale)
                require("no-store" in response.headers.get("cache-control", ""), "nojs-login-private-no-store")
                require("noindex" in response.headers.get("x-robots-tag", ""), "nojs-login-noindex-header")
                require("noindex" in (page.locator('meta[name="robots"]').get_attribute("content") or ""), "nojs-login-noindex-meta")
                self.record("No-JavaScript localized Login", locale=locale, http_status=200, expected_heading=True, required_form_controls=True, no_store=True, noindex_meta=True, noindex_header=True)
            self.run(f"No-JavaScript Login {locale}", nojs)
            def nojs_catalogue():
                for route in ("/shop", "/category/qa-collection"):
                    response = self.goto(page, route)
                    require(response.status == 200, "nojs-catalogue-http")
                    require(page.locator("#shop-filter-form").is_visible(), "nojs-filters-visible")
                    require(page.locator("#category-filter").is_visible(), "nojs-category-select-visible")
                    require(page.locator("#shop-search").is_visible(), "nojs-search-visible")
                    require(page.locator(".newsletter-section").count() == 0, "no-newsletter-block")
                    require(page.locator(".category-context-image").count() == 0, "no-oversized-category-banner")
                self.record("No-JavaScript catalogue and category controls", locale=locale, routes=2)
            self.run(f"No-JavaScript catalogue {locale}", nojs_catalogue)
            context.close()

    def manager_smoke(self):
        page = self.manager_page
        routes = ["/admin", "/admin/products", "/admin/products/new", f'/admin/products/{self.fixture.metadata["products"][0]}/edit', "/admin/categories", "/admin/stories", "/admin/stories/new", "/admin/orders", "/admin/returns", "/admin/coupons", "/admin/bundles", "/admin/gift-cards", "/admin/customers", "/admin/reviews", "/admin/newsletter", "/admin/e-invoicing", "/admin/audit", "/admin/gdpr", "/admin/license", "/admin/staff", "/admin/appearance", "/admin/branding", "/admin/settings"]
        if hasattr(self, "order_id"):
            routes.append("/admin/orders/" + self.order_id)
        for route in routes:
            def check(route=route):
                self.manager_errors.clear()
                require(self.goto(page, route).status == 200, "manager-route-http-200")
                require(page.locator("h1").count() == 1, "manager-route-one-heading")
                self.responsive(page)
                require(not self.manager_errors, "manager-route-no-javascript-errors")
                self.record("Manager route responsive smoke", route=route if not route.startswith("/admin/orders/") else "/admin/orders/:synthetic-id", widths=self.args.widths, http_status=200, javascript_errors=0)
                if route in ("/admin/products", "/admin/gift-cards", "/admin/settings") or route.startswith("/admin/orders/"):
                    self.axe(page, "axe Manager " + ("/admin/orders/:synthetic-id" if route.startswith("/admin/orders/") else route))
            self.run("Manager smoke " + route, check)

    def security(self):
        context = self.context(bypass_csp=False)
        page = context.new_page()
        response = self.goto(page, "/login")
        require(response.status == 200, "csp-page-http-200")
        policy = response.headers.get("content-security-policy", "")
        require("script-src 'self'" in policy and "'unsafe-inline'" not in policy, "csp-header-strict-script-source")
        page.evaluate("""()=>{
          window.__qaCspEvents=[];
          document.addEventListener('securitypolicyviolation',event=>window.__qaCspEvents.push({directive:event.effectiveDirective,blocked:event.blockedURI==='inline'?'inline':'external'}));
          const script=document.createElement('script');script.textContent='window.__qaInlineExecuted=true';document.head.append(script);
          const remote=document.createElement('script');remote.src='https://csp-probe.invalid/never-contact.js';document.head.append(remote);
        }""")
        page.wait_for_timeout(300)
        result = page.evaluate("({executed:window.__qaInlineExecuted===true,events:window.__qaCspEvents})")
        require(not result["executed"], "csp-inline-execution-blocked")
        require(any(item["blocked"] == "inline" and item["directive"].startswith("script-src") for item in result["events"]), "csp-browser-inline-violation-event")
        require(any(item["blocked"] == "external" and item["directive"].startswith("script-src") for item in result["events"]), "csp-browser-external-violation-event")
        self.record("Browser CSP enforcement", bypass_csp=False, inline_execution_blocked=True, external_script_blocked=True, violation_events=result["events"])
        response = context.request.post(self.fixture.base + "/register", form={"email": "missing@example.test", "password": "synthetic-invalid"}, max_redirects=0)
        require(response.status == 403, "csrf-missing-token-rejected")
        require("no-store" in response.headers.get("cache-control", ""), "csrf-error-page-no-store")
        from html.parser import HTMLParser

        class CsrfParser(HTMLParser):
            value = ""

            def handle_starttag(self, tag, attributes):
                fields = dict(attributes)
                if tag == "meta" and fields.get("name") == "csrf-token":
                    self.value = fields.get("content", "")

        parser = CsrfParser()
        parser.feed(response.text())
        require(isinstance(parser.value, str) and len(parser.value) >= 16, "csrf-error-fresh-token-present")
        self.record("Registration CSRF boundary", missing_token_http_status=403, error_no_store=True, fresh_token_present=True)
        stale = context.request.post(self.fixture.base + "/login", form={"_csrf": "stale-synthetic-csrf", "email": "missing@example.test", "password": "synthetic-invalid", "next": "/checkout"}, max_redirects=0)
        require(stale.status == 303 and "notice=security-refresh" in stale.headers.get("location", ""), "stale-login-safe-recovery-redirect")
        self.goto(page, stale.headers["location"])
        form = page.locator('form[action="/login"]')
        require(form.locator('[name="password"]').input_value() == "", "stale-login-password-cleared")
        fresh_token = form.locator('[name="_csrf"]').input_value()
        require(len(fresh_token) >= 16 and fresh_token != "stale-synthetic-csrf", "stale-login-fresh-csrf")
        require(form.locator('[name="next"]').input_value() == "/checkout", "stale-login-safe-next-preserved")
        self.record("Stale Login form recovery", redirect_status=303, fresh_token=True, password_cleared=True, safe_next_preserved=True)
        # Prove the no-JS oracle rejects both historic false-positive shapes.
        for mutant in ("<h1>Server error</h1>", '<h1>Welkom terug</h1><form method="post" action="/login"><input name="email" type="email" required><input name="password" type="password" required><input name="_csrf"><button type="submit">Sign in</button></form>'):
            page.set_content(mutant)
            rejected = False
            try:
                nojs_login_oracle(page, type("Response", (), {"status": 200})(), "fr")
            except QaFailure:
                rejected = True
            require(rejected, "nojs-oracle-rejects-mutant")
        self.record("No-JavaScript oracle negative controls", error_page_rejected=True, wrong_language_rejected=True)
        context.close()

    def execute(self):
        selected_node = shutil.which(self.args.node)
        require(selected_node is not None, "selected-node-executable-not-found")
        self.args.node = str(Path(selected_node).resolve())
        node = subprocess.run([self.args.node, "--version"], env=safe_environment(), capture_output=True, text=True, timeout=10)
        require(node.returncode == 0 and node.stdout.strip() == "v24.22.2", "required-node-24.22.2")
        self.results["runtime"]["node"] = node.stdout.strip()
        for package, expected in {"playwright": "1.62.0", "pyee": "13.0.1", "greenlet": "3.5.6", "typing_extensions": "4.16.0"}.items():
            require(importlib.metadata.version(package) == expected, "required-pinned-qa-dependencies")
        self.results["runtime"]["playwright"] = "1.62.0"
        self.results["runtime"]["qa_runner_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        self.results["runtime"]["fixture_server_sha256"] = hashlib.sha256(Path(__file__).with_name("fixture-server.mjs").read_bytes()).hexdigest()
        self.results["runtime"]["login_oracle_sha256"] = hashlib.sha256(Path(__file__).with_name("login_oracle.py").read_bytes()).hexdigest()
        self.axe_source = self.args.axe_path.read_text(encoding="utf-8") if self.args.axe_path else ""
        if self.axe_source:
            self.results["runtime"]["axe_sha256"] = hashlib.sha256(self.axe_source.encode()).hexdigest()
        self.fixture = Fixture(self.args)
        with self.fixture as fixture, selected_playwright_node(self.args.node):
            self.results["runtime"]["application_runtime"] = fixture.source_fingerprint
            (self.args.output / "application-runtime-manifest.json").write_text(json.dumps({"fingerprint": fixture.source_fingerprint, "files": fixture.source_manifest}, indent=2) + "\n", encoding="utf-8")
            self.results["runtime"]["application_runtime"]["manifest_file"] = "application-runtime-manifest.json"
            for role in ("manager", "other"):
                self.secret_values.update(fixture.metadata[role].values())
            from playwright.sync_api import sync_playwright
            from playwright._impl import _driver
            resolved_driver_node, _ = _driver.compute_driver_executable()
            require(Path(resolved_driver_node).resolve() == Path(self.args.node), "playwright-selected-node-resolver")
            with sync_playwright() as playwright:
                # Inspect the actual asyncio child process created by the pinned
                # SDK. Record only its executable identity, never args/env data.
                driver_process = playwright._impl_obj._connection._transport._proc
                actual_process = driver_process._transport.get_extra_info("subprocess")
                actual_arguments = actual_process.args
                require(isinstance(actual_arguments, (list, tuple)) and bool(actual_arguments), "playwright-driver-start-arguments-observed")
                require(Path(actual_arguments[0]).resolve() == Path(self.args.node), "playwright-driver-used-selected-node")
                require(driver_process.returncode is None and driver_process.pid > 0, "playwright-driver-process-running")
                self.results["runtime"]["playwright_driver"] = {
                    "selection": "validated --node through PLAYWRIGHT_NODEJS_PATH",
                    "node": node.stdout.strip(),
                    "node_sha256": hashlib.sha256(Path(self.args.node).read_bytes()).hexdigest(),
                    "sdk_driver_source_sha256": hashlib.sha256(Path(_driver.__file__).read_bytes()).hexdigest(),
                    "sdk_resolved_node_matches_selected": True,
                    "spawned_node_matches_selected": True,
                    "process_running_observed": True,
                    "evidence_method": "Pinned SDK resolver and actual asyncio child-process executable; no subprocess arguments or environment retained"
                }
                options = {"headless": True}
                if self.args.browser_executable:
                    options["executable_path"] = str(self.args.browser_executable)
                self.browser = playwright.chromium.launch(**options)
                self.results["runtime"]["browser"] = self.browser.version
                self.results["runtime"]["browser_selection"] = "explicit executable" if self.args.browser_executable else "Playwright bundled Chromium"
                try:
                    suite = self.args.suite
                    customer_ok = False
                    manager_ok = False
                    needs_customer = suite in ("all", "auth", "commerce")
                    needs_manager = suite in ("all", "auth", "manager") or (needs_customer and not self.args.simulated_email)
                    if needs_manager:
                        manager_ok = self.run("Manager authentication workflow", self.manager_auth)
                    if suite in ("all", "auth", "commerce"):
                        if self.args.simulated_email or manager_ok:
                            customer_ok = self.run("Customer authentication workflow", self.customer_auth)
                        else:
                            self.results["checks"].append({"check": "Customer authentication workflow", "status": "NOT RUN", "reason": "Offline Manager approval prerequisite failed"})
                    if suite in ("all", "commerce"):
                        if customer_ok:
                            self.run("Variant COD commerce workflow", self.commerce)
                        else:
                            self.results["checks"].append({"check": "Variant COD commerce workflow", "status": "NOT RUN", "reason": "Customer prerequisite failed"})
                    if manager_ok and suite in ("all", "manager"):
                        self.manager_smoke()
                    if suite in ("all", "public"):
                        self.public()
                    if suite in ("all", "security"):
                        self.run("Security browser workflow", self.security)
                finally:
                    self.browser.close()


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="node", help="Node.js 24.22.2 executable")
    parser.add_argument("--app-root", type=Path, default=Path(__file__).resolve().parent.parent, help="Shipped application root; only runtime source/asset directories are copied")
    parser.add_argument("--browser-executable", type=Path, help="Optional Chromium; default is Playwright's matching installed browser")
    parser.add_argument("--axe-path", type=Path, help="axe-core 4.11.0 axe.min.js; required for public/manager/all")
    parser.add_argument("--output", type=Path, default=Path("qa-output") / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"), help="New public output directory (must not already exist)")
    parser.add_argument("--suite", choices=("all", "auth", "commerce", "public", "manager", "security"), default="all")
    parser.add_argument("--locales", default="en,ckb,fr")
    parser.add_argument("--widths", default="390,768,1440")
    parser.add_argument("--screenshots", action="store_true")
    parser.add_argument("--simulated-email", action="store_true", help="SIMULATED local intercepted provider; no actual delivery")
    parser.add_argument("--cart-drawer", action="store_true", help="Enable the synthetic cart-drawer appearance option and exercise its keyboard paths")
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 13):
        parser.error("Python 3.13 is required")
    args.locales = args.locales.split(",")
    if not args.locales or any(locale not in LOGIN_HEADINGS for locale in args.locales):
        parser.error("--locales must contain supported comma-separated locale codes")
    try:
        args.widths = [int(width) for width in args.widths.split(",")]
        if not args.widths or any(width < 320 or width > 3840 for width in args.widths):
            raise ValueError()
    except ValueError:
        parser.error("--widths must contain comma-separated integers from 320 to 3840")
    if args.app_root.is_symlink():
        parser.error("--app-root must not be a symlink; installed node_modules is the only allowed dependency alias")
    args.app_root = args.app_root.resolve()
    if args.suite in ("all", "public", "manager") and not args.axe_path:
        parser.error("--axe-path is required for accessibility matrix suites; see qa/README.md")
    if args.axe_path:
        args.axe_path = args.axe_path.resolve()
        if not args.axe_path.is_file():
            parser.error("--axe-path must name an installed axe.min.js")
    if args.browser_executable:
        args.browser_executable = args.browser_executable.resolve()
    args.output = args.output.resolve()
    try:
        args.output.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        parser.error("--output must be a new directory; retain each run separately")
    return args


def main():
    audit = Audit(arguments())
    completed = audit.run("QA execution", audit.execute)
    checks = audit.results["checks"]
    violations = sum(len(check.get("axe", {}).get("violations", [])) for check in checks)
    incomplete = sum(len(check.get("axe", {}).get("incomplete", [])) for check in checks)
    failed = sum(check["status"] in ("FAIL", "NOT RUN") for check in checks)
    removed = not audit.fixture.private.exists() if hasattr(audit, "fixture") and hasattr(audit.fixture, "private") else "NOT CREATED"
    audit.results.update({"finished_utc": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "FAIL" if failed or violations or not completed else "PASS", "summary": {"passed_checks": sum(check["status"] == "PASS" for check in checks), "failed_or_not_run": failed, "axe_violation_items": violations, "axe_incomplete_items_pending_manual_review": incomplete}, "temporary_fixture_removed": removed})
    audit.save()
    print(f'{audit.results["status"]}: {audit.results["summary"]["passed_checks"]} checks passed; {failed} failed/not run; {violations} axe violations; {incomplete} axe incomplete items. Report: {audit.args.output / "browser-results.json"}')
    return 1 if audit.results["status"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
