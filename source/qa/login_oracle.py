"""Shared strict Login-page assertions; also used by no-JavaScript browser QA."""

LOGIN_HEADINGS = {
    "en": "Welcome back",
    "fr": "Bon retour !",
    "nl": "Welkom terug",
    "ar": "مرحبًا بعودتك",
    "ckb": "بەخێربێیتەوە",
}


def assert_login_page(page, response, locale):
    """Keep failures static and enforce checks even under Python's -O option."""
    def check(condition, code):
        if not condition:
            raise AssertionError(code)

    check(response is not None and response.status == 200, "Login HTTP status")
    check(page.locator("h1").count() == 1, "Login heading count")
    check(page.locator("h1").inner_text().strip() == LOGIN_HEADINGS[locale], "Login heading language")
    form = page.locator('form[action="/login"][method="post"]')
    check(form.count() == 1, "Login form")
    check(form.locator('input[name="email"][type="email"][required]').count() == 1, "Required email field")
    check(form.locator('input[name="password"][type="password"][required]').count() == 1, "Required password field")
    check(form.locator('input[name="_csrf"]').count() == 1, "CSRF field")
    check(len(form.locator('input[name="_csrf"]').input_value()) >= 16, "Nonempty CSRF token")
    check(form.locator('button[type="submit"]').count() == 1, "Login submit")
